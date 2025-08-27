use anyhow::{anyhow, Result};
use std::sync::{Arc, Mutex};
use boa_engine::{Context, Source};
use serde_json::json;
use tauri::{AppHandle, Manager};

use super::model::EmitPayload;

pub struct JsEngine {
    result: Arc<Mutex<Option<EmitPayload>>>,
    app: Option<AppHandle>,
}

impl JsEngine {
    pub fn new(_sender: crossbeam_channel::Sender<EmitPayload>, app: Option<AppHandle>) -> Result<Self> {
        Ok(Self {
            result: Arc::new(Mutex::new(None)),
            app,
        })
    }

    pub fn execute_script(&self, _script_name: &str, source: &str) -> Result<()> {
        self.execute_script_with_options(_script_name, source, None)
    }

    pub fn execute_script_with_options(&self, _script_name: &str, source: &str, options: Option<serde_json::Value>) -> Result<()> {
        let mut ctx = Context::default();

        // Inject emit, emitPartial and a minimal `icnx` API for testing onResolve
        let prelude = r#"
            var __emit_str = null;
            var __emit_str_partial = null;
            function emit(obj) {
              try { __emit_str = JSON.stringify(obj); } catch (e) { __emit_str = null; }
            }
            function emitPartial(obj) {
              try { __emit_str_partial = JSON.stringify(obj); } catch (e) { __emit_str_partial = null; }
            }
            // Minimal icnx object
            if (typeof icnx === 'undefined') {
              var __icnx_store = {};
              var __icnx_req = null; // JSON string request envelope from JS to host
              var __host_pending = {}; // id -> {resolve, reject}
              function __registerPromise(id, resolve, reject){ __host_pending[id] = {resolve: resolve, reject: reject}; }
              function __deliverHostResp(jsonStr){
                try {
                  var r = JSON.parse(jsonStr);
                  var p = __host_pending[r.id];
                  if (p) { delete __host_pending[r.id]; p.resolve(r.result); }
                } catch(e) {}
              }
              var icnx = {
                emit: emit,
                emitPartial: emitPartial,
                logger: {
                  debug: function(){ try { console.debug.apply(console, arguments); } catch(_){} },
                  info: function(){ try { console.info.apply(console, arguments); } catch(_){} },
                  warn: function(){ try { console.warn.apply(console, arguments); } catch(_){} },
                  error: function(){ try { console.error.apply(console, arguments); } catch(_){} }
                },
                settings: {
                  get: function(key){ try { return (typeof options !== 'undefined' && options && key in options) ? options[key] : undefined; } catch(_) { return undefined; } },
                  set: function(_k, _v){ /* no-op in test mode */ }
                },
                storage: {
                  get: function(key){ return __icnx_store[key]; },
                  set: function(key, val){ __icnx_store[key] = val; },
                  remove: function(key){ delete __icnx_store[key]; }
                },
                dom: {
                  fetch: function(url){
                    var id = Math.random().toString(36).slice(2);
                    __icnx_req = JSON.stringify({ id: id, type: 'dom.fetch', url: String(url) });
                    return new Promise(function(resolve, reject){ __registerPromise(id, resolve, reject); });
                  },
                  select: function(html, selector){
                    var id = Math.random().toString(36).slice(2);
                    __icnx_req = JSON.stringify({ id: id, type: 'dom.select', html: String(html), selector: String(selector) });
                    return new Promise(function(resolve, reject){ __registerPromise(id, resolve, reject); });
                  }
                }
              };
              try { globalThis.icnx = icnx; } catch(_) {}
              try { globalThis.__deliverHostResp = __deliverHostResp; } catch(_) {}
              try { globalThis.__icnx_req = __icnx_req; } catch(_) {}
            }
        "#;
        ctx.eval(Source::from_bytes(prelude.as_bytes())).map_err(|e| anyhow!("inject prelude failed: {:?}", e))?;

        // Inject options as a global variable `options`
        let options_value = options.unwrap_or(serde_json::json!({}));
        let options_js = serde_json::to_string(&options_value).map_err(|e| anyhow!("options json: {}", e))?;
        let options_script = format!("var options = {};", options_js);
        ctx.eval(Source::from_bytes(options_script.as_bytes())).map_err(|e| anyhow!("inject options failed: {:?}", e))?;

        // Evaluate the script (defines main, helpers, etc.)
        ctx.eval(Source::from_bytes(source.as_bytes())).map_err(|e| anyhow!("script error: {:?}", e))?;

        // Run onResolve(url, ctx) if present; otherwise fallback to main(options)
        let async_wrapper = r#"
            var __icnx_done = false; var __icnx_err = null;
            (async () => {
                try {
                    const __opts = (typeof options !== 'undefined' && options) ? options : {};
                    const __url = (typeof __opts.inputUrl === 'string') ? __opts.inputUrl : '';
                    if (typeof onResolve === 'function') {
                        await onResolve(__url, {});
                    } else if (typeof main === 'function') {
                        await main(__opts);
                    }
                } catch (e) {
                    try { __icnx_err = String(e); } catch(_) { __icnx_err = 'Unknown error'; }
                } finally {
                    __icnx_done = true;
                }
            })();
        "#;
        ctx.eval(Source::from_bytes(async_wrapper.as_bytes())).map_err(|e| anyhow!("main async wrapper error: {:?}", e))?;

        // Pump the job queue until done or timeout
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(15);
        loop {
            // Run any pending microtasks/promises
            ctx.run_jobs();

            // Check completion flag
            let done = ctx
                .eval(Source::from_bytes(b"__icnx_done === true"))
                .ok()
                .map(|v| v.to_boolean())
                .unwrap_or(false);

            // Drain partial emits
            if let Ok(val) = ctx.eval(Source::from_bytes(b"(function(){var s=__emit_str_partial; __emit_str_partial=null; return s;})()")) {
                if let Some(s) = val.as_string() {
                    let rust_str = s.to_std_string_escaped();
                    if !rust_str.is_empty() {
                        if let Ok(item) = serde_json::from_str::<crate::core::model::DownloadItem>(&rust_str) {
                            if let Some(app) = &self.app {
                                let _ = app.emit_all("scrape_item", &item);

                                // Persist scrape item to DB: use app data dir/.icnx/scrape.db and session_key = "<script>::<inputUrl>"
                                let session_key = {
                                    let input_url = options_value.get("inputUrl").and_then(|v| v.as_str()).unwrap_or("");
                                    format!("{}::{}", _script_name, input_url)
                                };
                                if let Some(data_dir) = app.path_resolver().app_data_dir() {
                                    let mut dbp = data_dir;
                                    dbp.push(".icnx");
                                    dbp.push("scrape.db");
                                    eprintln!("ICNX: enqueue scrape item to {} -> {}", dbp.display(), item.url);
                                    let _ = crate::downloader::session_db::enqueue_scrape_item(dbp, session_key, item.url.clone(), item.filename.clone(), item.title.clone(), item.r#type.clone(), None);
                                }
                            }
                        }
                    }
                }
            }

            // Handle host requests from JS (icnx.dom)
            if let Ok(req_val) = ctx.eval(Source::from_bytes(b"(function(){var s=__icnx_req; __icnx_req=null; return s;})()")) {
                if let Some(s) = req_val.as_string() {
                    let req_str = s.to_std_string_escaped();
                    if !req_str.is_empty() {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&req_str) {
                            let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                            let r#type = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
                            if !id.is_empty() {
                                let resp_json = match r#type {
                                     "dom.fetch" => {
                                        let url = v.get("url").and_then(|x| x.as_str()).unwrap_or("");
                                        let result = if !url.is_empty() {
                                            match ureq::get(url).call() {
                                                Ok(resp) => match resp.into_string() {
                                                    Ok(t) => json!({"id": id, "result": t}),
                                                    Err(_) => json!({"id": id, "result": null})
                                                },
                                                Err(_) => json!({"id": id, "result": null}),
                                            }
                                        } else { json!({"id": id, "result": null}) };
                                        result
                                     },
                                    "dom.select" => {
                                        let html_s = v.get("html").and_then(|x| x.as_str()).unwrap_or("");
                                        let sel_s = v.get("selector").and_then(|x| x.as_str()).unwrap_or("");
                                        let result_array = if !html_s.is_empty() && !sel_s.is_empty() {
                                            let mut arr: Vec<serde_json::Value> = Vec::new();
                                            if let Ok(selector) = scraper::Selector::parse(sel_s) {
                                                let document = scraper::Html::parse_document(html_s);
                                                for element in document.select(&selector) {
                                                    let text: String = element.text().collect();
                                                    let inner_html = element.inner_html();
                                                    let mut attrs_obj = serde_json::Map::new();
                                                    for (name, value) in element.value().attrs() {
                                                        attrs_obj.insert(name.to_string(), serde_json::Value::String(value.to_string()));
                                                    }
                                                    arr.push(json!({
                                                        "html": inner_html,
                                                        "text": text,
                                                        "attrs": attrs_obj
                                                    }));
                                                }
                                            }
                                            arr
                                        } else { Vec::new() };
                                        json!({"id": id, "result": result_array})
                                    },
                                    _ => json!({"id": id, "result": serde_json::Value::Null})
                                };
                                // deliver back into JS to resolve the Promise
                                if let Ok(resp_str) = serde_json::to_string(&resp_json) {
                                    let deliver = format!("__deliverHostResp({});", serde_json::to_string(&resp_str).unwrap_or_else(|_| "\"\"".to_string()));
                                    let _ = ctx.eval(Source::from_bytes(deliver.as_bytes()));
                                }
                            }
                        }
                    }
                }
            }
            if done { break; }
            if start.elapsed() > timeout { break; }
        }

        // If there was a script error, surface it
        if let Ok(err_val) = ctx.eval(Source::from_bytes(b"__icnx_err")) {
            if !err_val.is_undefined() && !err_val.is_null() {
                if let Some(s) = err_val.as_string() {
                    return Err(anyhow!("{}", s.to_std_string_escaped()));
                }
            }
        }

        // Read __emit_str back and parse
        let emitted = ctx.eval(Source::from_bytes(b"__emit_str")).map_err(|e| anyhow!("read emit failed: {:?}", e))?;
        if let Some(s) = emitted.as_string() {
            let rust_str = s.to_std_string_escaped();
            if !rust_str.is_empty() {
                match serde_json::from_str::<EmitPayload>(&rust_str) {
                    Ok(p) => { *self.result.lock().unwrap() = Some(p); }
                    Err(e) => {
                        // Truncate the raw payload for logging to avoid extremely large messages
                        let raw_for_log = if rust_str.len() > 16_384 {
                            format!("{}... [truncated {} bytes]", &rust_str[..16_384], rust_str.len() - 16_384)
                        } else {
                            rust_str.clone()
                        };

                        // Emit a diagnostic event to the frontend / host if available
                        if let Some(app) = &self.app {
                            let _ = app.emit_all("icnx:emit_parse_error", &json!({
                                "script": _script_name,
                                "error": e.to_string(),
                            }));
                        }
                    }
                }
            }
        }

        // If there was a final emitted payload (the final emit()), also persist scrape items if present
        if let Some(app) = &self.app {
            if let Ok(final_items_val) = ctx.eval(Source::from_bytes(b"(function(){var s=__emit_str; return s;})()")) {
                if let Some(s2) = final_items_val.as_string() {
                    let final_str = s2.to_std_string_escaped();
                    if !final_str.is_empty() {
                        if let Ok(p) = serde_json::from_str::<EmitPayload>(&final_str) {
                            // persist each item in the final payload to the scrape DB
                            let session_key = {
                                let input_url = options_value.get("inputUrl").and_then(|v| v.as_str()).unwrap_or("");
                                format!("{}::{}", _script_name, input_url)
                            };
                            if let Some(data_dir) = app.path_resolver().app_data_dir() {
                                let mut dbp = data_dir;
                                dbp.push(".icnx");
                                dbp.push("scrape.db");
                                for it in p.items.iter() {
                                    eprintln!("ICNX: enqueue final scrape item to {} -> {}", dbp.display(), it.url);
                                    let _ = crate::downloader::session_db::enqueue_scrape_item(dbp.clone(), session_key.clone(), it.url.clone(), it.filename.clone(), it.title.clone(), it.r#type.clone(), None);
                                }
                            }
                            let _ = app.emit_all("scrape_done", &p);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    pub fn get_result(&self) -> Option<EmitPayload> {
        self.result.lock().unwrap().clone()
    }
}


