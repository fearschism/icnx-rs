use anyhow::{anyhow, Result};
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use std::process::Command;

use super::model::{EmitPayload, DownloadItem};

pub struct PythonEngine {
    result: Arc<Mutex<Option<EmitPayload>>>,
    app: Option<AppHandle>,
}

// Python library management
pub struct PythonLibraryManager;

impl PythonLibraryManager {
    /// Install Python packages using pip
    pub fn install_packages(packages: &[&str]) -> Result<()> {
        let python_exe = Self::get_python_executable()?;
        
        for package in packages {
            println!("Installing Python package: {}", package);
            let output = Command::new(&python_exe)
                .args(&["-m", "pip", "install", package])
                .output()
                .map_err(|e| anyhow!("Failed to execute pip install: {}", e))?;
            
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(anyhow!("Failed to install package {}: {}", package, stderr));
            }
            
            println!("Successfully installed: {}", package);
        }
        
        Ok(())
    }
    
    /// Check if packages are installed
    pub fn check_packages(packages: &[&str]) -> Result<Vec<(String, bool)>> {
        let python_exe = Self::get_python_executable()?;
        let mut results = Vec::new();
        
        for package in packages {
            let output = Command::new(&python_exe)
                .args(&["-c", &format!("import {}; print('OK')", package)])
                .output()
                .map_err(|e| anyhow!("Failed to check package {}: {}", package, e))?;
            
            let is_installed = output.status.success();
            results.push((package.to_string(), is_installed));
        }
        
        Ok(results)
    }
    
    /// Get the Python executable path
    fn get_python_executable() -> Result<String> {
        // Try different Python executable names
        let candidates = vec!["python3", "python", "py"];
        
        for candidate in candidates {
            if let Ok(output) = Command::new(candidate).arg("--version").output() {
                if output.status.success() {
                    return Ok(candidate.to_string());
                }
            }
        }
        
        Err(anyhow!("Could not find Python executable"))
    }
    
    /// Install essential web scraping libraries
    pub fn install_essentials() -> Result<()> {
        let essential_packages = vec![
            "requests",
            "beautifulsoup4", 
            "lxml",
            "pandas",
            "numpy",
            "urllib3",
            "certifi",
            "charset-normalizer",
            "soupsieve",
        ];
        
        Self::install_packages(&essential_packages)
    }
    
    /// Setup Python environment for ICNX
    pub fn setup_environment() -> Result<()> {
        println!("Setting up Python environment for ICNX...");
        
        // Check if essential packages are installed
        let essential_packages = vec!["requests", "bs4", "lxml", "pandas", "numpy"];
        let check_results = Self::check_packages(&essential_packages)?;
        
        let missing_packages: Vec<&str> = check_results.iter()
            .filter(|(_, installed)| !installed)
            .map(|(name, _)| {
                match name.as_str() {
                    "bs4" => "beautifulsoup4",
                    other => other,
                }
            })
            .collect();
        
        if !missing_packages.is_empty() {
            println!("Installing missing Python packages: {:?}", missing_packages);
            Self::install_packages(&missing_packages)?;
        } else {
            println!("All essential Python packages are already installed");
        }
        
        Ok(())
    }
}

#[pyclass]
struct IcnxApi {
    emitted_items: Arc<Mutex<Vec<DownloadItem>>>,
    result: Arc<Mutex<Option<EmitPayload>>>,
    app: Option<AppHandle>,
    pending_requests: Arc<Mutex<std::collections::HashMap<String, String>>>,
    options: std::collections::HashMap<String, serde_json::Value>,
}

#[pymethods]
impl IcnxApi {
    #[new]
    fn new() -> Self {
        Self {
            emitted_items: Arc::new(Mutex::new(Vec::new())),
            result: Arc::new(Mutex::new(None)),
            app: None,
            pending_requests: Arc::new(Mutex::new(std::collections::HashMap::new())),
            options: std::collections::HashMap::new(),
        }
    }

    /// Emit a single item immediately
    fn emit_partial(&self, item: &PyDict) -> PyResult<()> {
        let download_item = self.dict_to_download_item(item)?;
        
        // Add to collection
        if let Ok(mut items) = self.emitted_items.lock() {
            items.push(download_item.clone());
        }

        // Emit to frontend if app is available
        if let Some(app) = &self.app {
            let _ = app.emit_all("scrape_item", &download_item);
            
            // Store in session DB (same logic as JS engine)
            self.store_in_session_db(&download_item);
        }

        Ok(())
    }

    /// Emit final payload with all items
    fn emit(&self, payload: &PyDict) -> PyResult<()> {
        let dir = payload.get_item("dir")?
            .map(|d| d.extract::<String>())
            .transpose()?
            .unwrap_or_default();
            
        let items_py = payload.get_item("items")?
            .and_then(|i| i.downcast::<PyList>().ok());

        let mut items = Vec::new();
        
        if let Some(items_list) = items_py {
            for item in items_list.iter() {
                if let Ok(item_dict) = item.downcast::<PyDict>() {
                    if let Ok(download_item) = self.dict_to_download_item(item_dict) {
                        items.push(download_item);
                    }
                }
            }
        }

        // Include previously emitted items
        if let Ok(partial_items) = self.emitted_items.lock() {
            items.extend(partial_items.clone());
        }

        let emit_payload = EmitPayload { dir: Some(dir), items };
        
        if let Ok(mut result) = self.result.lock() {
            *result = Some(emit_payload);
        }

        Ok(())
    }

    /// HTTP fetch functionality
    fn fetch(&self, url: String, headers: Option<&PyDict>) -> PyResult<String> {
        // Use ureq for HTTP requests (same as JS engine)
        let mut request = ureq::get(&url);
        
        // Add headers if provided
        if let Some(headers_dict) = headers {
            for (key, value) in headers_dict.iter() {
                if let (Ok(k), Ok(v)) = (key.extract::<String>(), value.extract::<String>()) {
                    request = request.set(&k, &v);
                }
            }
        }

        match request.call() {
            Ok(response) => match response.into_string() {
                Ok(text) => Ok(text),
                Err(_) => Err(PyErr::new::<pyo3::exceptions::PyIOError, _>("Failed to read response text")),
            },
            Err(_) => Err(PyErr::new::<pyo3::exceptions::PyIOError, _>("HTTP request failed")),
        }
    }

    /// HTML parsing with CSS selectors
    fn select(&self, html: String, selector: String) -> PyResult<Vec<PyObject>> {
        use scraper::{Html, Selector};
        
        let document = Html::parse_document(&html);
        let css_selector = Selector::parse(&selector)
            .map_err(|_| PyErr::new::<pyo3::exceptions::PyValueError, _>("Invalid CSS selector"))?;

        let mut results = Vec::new();
        
        Python::with_gil(|py| {
            for element in document.select(&css_selector) {
                let element_dict = PyDict::new(py);
                
                // Text content
                let text: String = element.text().collect();
                element_dict.set_item("text", text)?;
                
                // Inner HTML
                element_dict.set_item("html", element.inner_html())?;
                
                // Attributes
                let attrs_dict = PyDict::new(py);
                for (name, value) in element.value().attrs() {
                    attrs_dict.set_item(name, value)?;
                }
                element_dict.set_item("attrs", attrs_dict)?;
                
                results.push(element_dict.into());
            }
            Ok::<(), PyErr>(())
        })?;

        Ok(results)
    }

    /// Logging functions
    fn log_debug(&self, message: String) {
        eprintln!("[DEBUG] {}", message);
    }

    fn log_info(&self, message: String) {
        eprintln!("[INFO] {}", message);
    }

    fn log_warn(&self, message: String) {
        eprintln!("[WARN] {}", message);
    }

    fn log_error(&self, message: String) {
        eprintln!("[ERROR] {}", message);
    }

    /// Sleep/delay function for rate limiting
    fn sleep(&self, seconds: f64) -> PyResult<()> {
        let duration = std::time::Duration::from_secs_f64(seconds);
        std::thread::sleep(duration);
        Ok(())
    }

    /// Get an option value by key with default fallback
    fn get_option(&self, key: String, default: PyObject) -> PyResult<PyObject> {
        Python::with_gil(|py| {
            if let Some(value) = self.options.get(&key) {
                let json_str = serde_json::to_string(value).unwrap();
                let result = py.import("json")?.getattr("loads")?.call1((json_str,))?;
                Ok(result.to_object(py))
            } else {
                Ok(default)
            }
        })
    }

    /// Base64 encode a string
    fn base64_encode(&self, data: String) -> PyResult<String> {
        use base64::Engine;
        Ok(base64::engine::general_purpose::STANDARD.encode(data.as_bytes()))
    }

    /// Base64 decode a string  
    fn base64_decode(&self, data: String) -> PyResult<String> {
        use base64::Engine;
        let decoded = base64::engine::general_purpose::STANDARD.decode(data)
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyValueError, _>(format!("Base64 decode error: {}", e)))?;
        String::from_utf8(decoded)
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyValueError, _>(format!("UTF-8 decode error: {}", e)))
    }

    /// Storage functions
    fn storage_get(&self, _key: String) -> PyResult<Option<String>> {
        // TODO: Implement persistent storage
        Ok(None)
    }

    fn storage_set(&self, _key: String, _value: String) -> PyResult<()> {
        // TODO: Implement persistent storage
        Ok(())
    }

    /// Import and return a Python module (for library access)
    fn import_module(&self, module_name: String) -> PyResult<PyObject> {
        Python::with_gil(|py| {
            let module = py.import(module_name.as_str())
                .map_err(|e| PyErr::new::<pyo3::exceptions::PyImportError, _>(
                    format!("Failed to import module '{}': {}. Make sure the package is installed.", module_name, e)
                ))?;
            Ok(module.into())
        })
    }

    /// Execute Python code with access to libraries
    fn execute_code(&self, code: String) -> PyResult<PyObject> {
        Python::with_gil(|py| {
            let result = py.eval(code.as_str(), None, None)
                .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(
                    format!("Code execution failed: {}", e)
                ))?;
            Ok(result.into())
        })
    }

    /// Helper method to create a requests session with common settings
    fn create_requests_session(&self) -> PyResult<PyObject> {
        Python::with_gil(|py| {
            let requests = py.import("requests")
                .map_err(|_| PyErr::new::<pyo3::exceptions::PyImportError, _>(
                    "requests library not available. Install with: pip install requests"
                ))?;
            
            let session = requests.call_method0("Session")?;
            
            // Set common headers
            let headers = session.getattr("headers")?;
            headers.call_method1("update", (py.eval(
                "{'User-Agent': 'ICNX-Python/1.0', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}",
                None, None
            )?,))?;
            
            Ok(session.into())
        })
    }

    /// Helper method to parse HTML with BeautifulSoup
    fn parse_html(&self, html: String, parser: Option<String>) -> PyResult<PyObject> {
        Python::with_gil(|py| {
            let bs4 = py.import("bs4")
                .map_err(|_| PyErr::new::<pyo3::exceptions::PyImportError, _>(
                    "BeautifulSoup4 library not available. Install with: pip install beautifulsoup4"
                ))?;
            
            let parser_name = parser.unwrap_or_else(|| "html.parser".to_string());
            let soup = bs4.call_method1("BeautifulSoup", (html, parser_name))?;
            
            Ok(soup.into())
        })
    }

    /// Helper method to create pandas DataFrame
    fn create_dataframe(&self, data: PyObject) -> PyResult<PyObject> {
        Python::with_gil(|py| {
            let pandas = py.import("pandas")
                .map_err(|_| PyErr::new::<pyo3::exceptions::PyImportError, _>(
                    "pandas library not available. Install with: pip install pandas"
                ))?;
            
            let dataframe = pandas.call_method1("DataFrame", (data,))?;
            Ok(dataframe.into())
        })
    }
}

impl IcnxApi {
    fn new_with_options(options: std::collections::HashMap<String, serde_json::Value>) -> Self {
        Self {
            emitted_items: Arc::new(Mutex::new(Vec::new())),
            result: Arc::new(Mutex::new(None)),
            app: None,
            pending_requests: Arc::new(Mutex::new(std::collections::HashMap::new())),
            options,
        }
    }

    fn dict_to_download_item(&self, dict: &PyDict) -> PyResult<DownloadItem> {
        let url = dict.get_item("url")?
            .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyKeyError, _>("Missing 'url' field"))?
            .extract::<String>()?;

        let filename = dict.get_item("filename")?
            .map(|f| f.extract::<String>())
            .transpose()?;

        let title = dict.get_item("title")?
            .map(|t| t.extract::<String>())
            .transpose()?;

        let r#type = dict.get_item("type")?
            .map(|t| t.extract::<String>())
            .transpose()?;

        // Handle headers
        let headers = dict.get_item("headers")?
            .and_then(|h| h.downcast::<PyDict>().ok())
            .map(|headers_dict| {
                let mut result = std::collections::HashMap::new();
                for (key, value) in headers_dict.iter() {
                    if let (Ok(k), Ok(v)) = (key.extract::<String>(), value.extract::<String>()) {
                        result.insert(k, v);
                    }
                }
                result
            });

        Ok(DownloadItem {
            url,
            filename,
            title,
            r#type,
            headers: headers.unwrap_or_default(),
        })
    }

    fn store_in_session_db(&self, item: &DownloadItem) {
        // Same logic as JS engine for storing in session DB
        if let Some(app) = &self.app {
            if let Some(data_dir) = app.path_resolver().app_data_dir() {
                let mut dbp = data_dir;
                dbp.push(".icnx");
                dbp.push("scrape.db");
                
                // TODO: Get session_key from context
                let session_key = "python_script::unknown";
                let _ = crate::downloader::session_db::enqueue_scrape_item(
                    dbp,
                    session_key.to_string(),
                    item.url.clone(),
                    item.filename.clone(),
                    item.title.clone(),
                    item.r#type.clone(),
                    None,
                );
            }
        }
    }
}

impl PythonEngine {
    pub fn new(_sender: crossbeam_channel::Sender<EmitPayload>, app: Option<AppHandle>) -> Result<Self> {
        // Initialize Python interpreter
        pyo3::prepare_freethreaded_python();
        
        Ok(Self {
            result: Arc::new(Mutex::new(None)),
            app,
        })
    }

    pub fn execute_script(&self, script_name: &str, source: &str) -> Result<()> {
        self.execute_script_with_options(script_name, source, None)
    }

    pub fn execute_script_with_options(
        &self,
        _script_name: &str,
        source: &str,
        options: Option<serde_json::Value>,
    ) -> Result<()> {
        Python::with_gil(|py| {
            // Parse options into HashMap
            let options_map = if let Some(ref opts) = options {
                if let serde_json::Value::Object(map) = opts {
                    map.clone().into_iter().collect()
                } else {
                    std::collections::HashMap::new()
                }
            } else {
                std::collections::HashMap::new()
            };
            
            // Create ICNX API instance with options
            let icnx_api = Py::new(py, IcnxApi::new_with_options(options_map))?;
            
            // Create the icnx module and inject it into the script namespace
            let icnx_module = PyDict::new(py);
            icnx_module.set_item("emit_partial", icnx_api.getattr(py, "emit_partial")?)?;
            icnx_module.set_item("emit", icnx_api.getattr(py, "emit")?)?;
            icnx_module.set_item("fetch", icnx_api.getattr(py, "fetch")?)?;
            icnx_module.set_item("select", icnx_api.getattr(py, "select")?)?;
            icnx_module.set_item("sleep", icnx_api.getattr(py, "sleep")?)?;
            icnx_module.set_item("get_option", icnx_api.getattr(py, "get_option")?)?;
            icnx_module.set_item("base64_encode", icnx_api.getattr(py, "base64_encode")?)?;
            icnx_module.set_item("base64_decode", icnx_api.getattr(py, "base64_decode")?)?;
            icnx_module.set_item("storage_get", icnx_api.getattr(py, "storage_get")?)?;
            icnx_module.set_item("storage_set", icnx_api.getattr(py, "storage_set")?)?;
            
            // Add library access methods
            icnx_module.set_item("import_module", icnx_api.getattr(py, "import_module")?)?;
            icnx_module.set_item("execute_code", icnx_api.getattr(py, "execute_code")?)?;
            icnx_module.set_item("create_requests_session", icnx_api.getattr(py, "create_requests_session")?)?;
            icnx_module.set_item("parse_html", icnx_api.getattr(py, "parse_html")?)?;
            icnx_module.set_item("create_dataframe", icnx_api.getattr(py, "create_dataframe")?)?;
            
            // Create logger
            let logger = PyDict::new(py);
            logger.set_item("debug", icnx_api.getattr(py, "log_debug")?)?;
            logger.set_item("info", icnx_api.getattr(py, "log_info")?)?;
            logger.set_item("warn", icnx_api.getattr(py, "log_warn")?)?;
            logger.set_item("error", icnx_api.getattr(py, "log_error")?)?;
            icnx_module.set_item("logger", logger)?;

            // Set up globals
            let globals = PyDict::new(py);
            globals.set_item("icnx", icnx_module)?;
            
            // Add options if provided
            if let Some(ref opts) = options {
                let options_str = serde_json::to_string(&opts)
                    .map_err(|e| anyhow!("Failed to serialize options: {}", e))?;
                let options_py = py.eval(&format!("__import__('json').loads('{}')", options_str), None, None)?;
                globals.set_item("options", options_py)?;
            }

            // Add convenience imports and try to import common libraries
            py.run(
                r#"
import json
import re
import time
import sys
import os
from urllib.parse import urljoin, urlparse, parse_qs
from urllib.request import urlopen, Request
from html import unescape

# Try to import common web scraping libraries
try:
    import requests
    print("✓ requests library available")
except ImportError:
    print("✗ requests library not available - install with: pip install requests")

try:
    import bs4
    from bs4 import BeautifulSoup
    print("✓ BeautifulSoup library available")
except ImportError:
    print("✗ BeautifulSoup library not available - install with: pip install beautifulsoup4")

try:
    import pandas as pd
    import numpy as np
    print("✓ pandas and numpy libraries available")
except ImportError:
    print("✗ pandas/numpy libraries not available - install with: pip install pandas numpy")

try:
    import lxml
    print("✓ lxml library available")
except ImportError:
    print("✗ lxml library not available - install with: pip install lxml")
"#,
                Some(globals),
                None,
            )?;

            // Execute the user script
            py.run(source, Some(globals), None)
                .map_err(|e| anyhow!("Script execution failed: {}", e))?;

            // Extract metadata if available
            if let Ok(meta) = globals.get_item("__meta__") {
                if let Some(meta_obj) = meta {
                    if let Ok(meta_dict) = meta_obj.downcast::<PyDict>() {
                        eprintln!("[INFO] Script metadata found:");
                        
                        // Extract basic metadata
                        for (key, value) in meta_dict.iter() {
                            if let (Ok(k), Ok(v)) = (key.extract::<String>(), value.extract::<String>()) {
                                if k != "options" {  // Handle options separately
                                    eprintln!("  {}: {}", k, v);
                                }
                            }
                        }
                        
                        // Extract and validate options schema
                        if let Ok(Some(options_meta)) = meta_dict.get_item("options") {
                            if let Ok(options_dict) = options_meta.downcast::<PyDict>() {
                                eprintln!("  Options schema:");
                                for (opt_key, opt_schema) in options_dict.iter() {
                                    if let Ok(key_name) = opt_key.extract::<String>() {
                                        eprintln!("    {}: {}", key_name, self.format_option_schema(py, opt_schema)?);
                                        
                                        // Validate provided options against schema
                                        if let Some(ref opts) = options {
                                            if let Some(provided_value) = opts.get(&key_name) {
                                                self.validate_option_value(py, &key_name, provided_value, opt_schema)?;
                                            } else if let Ok(schema_dict) = opt_schema.downcast::<PyDict>() {
                                                // Check if required option is missing
                                                if let Ok(Some(required)) = schema_dict.get_item("required") {
                                                    if let Ok(true) = required.extract::<bool>() {
                                                        return Err(anyhow!("Required option '{}' is missing", key_name));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Try to call main function or on_resolve function
            if let Ok(Some(main_func)) = globals.get_item("main") {
                if let Some(ref opts) = options {
                    let options_str = serde_json::to_string(&opts)?;
                    let options_py = py.eval(&format!("__import__('json').loads('{}')", options_str), None, None)?;
                    main_func.call1((options_py,))?;
                } else {
                    main_func.call0()?;
                }
            } else if let Ok(Some(on_resolve_func)) = globals.get_item("on_resolve") {
                let url = options
                    .as_ref()
                    .and_then(|o| o.get("inputUrl"))
                    .and_then(|u| u.as_str())
                    .unwrap_or("");
                
                let ctx = options.clone().unwrap_or_default();
                let ctx_str = serde_json::to_string(&ctx)?;
                let ctx_py = py.eval(&format!("__import__('json').loads('{}')", ctx_str), None, None)?;
                
                on_resolve_func.call1((url, ctx_py))?;
            }

            // Get the result from the API instance
            let api_ref = icnx_api.borrow(py);
            if let Ok(result_guard) = api_ref.result.lock() {
                if let Some(result) = result_guard.clone() {
                    *self.result.lock().unwrap() = Some(result);
                }
            }

            Ok(())
        }).map_err(|e| anyhow!("Python execution failed: {}", e))
    }

    pub fn get_result(&self) -> Option<EmitPayload> {
        self.result.lock().unwrap().clone()
    }

    fn format_option_schema(&self, _py: Python, schema: &PyAny) -> Result<String> {
        if let Ok(schema_dict) = schema.downcast::<PyDict>() {
            let type_name = schema_dict.get_item("type")?
                .map(|t| t.extract::<String>())
                .transpose()?
                .unwrap_or_else(|| "unknown".to_string());
            
            let required = schema_dict.get_item("required")?
                .map(|r| r.extract::<bool>())
                .transpose()?
                .unwrap_or(false);
            
            let description = schema_dict.get_item("description")?
                .map(|d| d.extract::<String>())
                .transpose()?
                .unwrap_or_else(|| "No description".to_string());
            
            let required_str = if required { " (required)" } else { "" };
            
            Ok(format!("{}{} - {}", type_name, required_str, description))
        } else {
            Ok("Invalid schema".to_string())
        }
    }

    fn validate_option_value(&self, _py: Python, key: &str, value: &serde_json::Value, schema: &PyAny) -> Result<()> {
        if let Ok(schema_dict) = schema.downcast::<PyDict>() {
            let option_type = schema_dict.get_item("type")?
                .map(|t| t.extract::<String>())
                .transpose()?
                .unwrap_or_else(|| "string".to_string());

            match option_type.as_str() {
                "string" | "url" | "path" => {
                    if !value.is_string() {
                        return Err(anyhow!("Option '{}' must be a string", key));
                    }
                    
                    // Validate URL pattern
                    if option_type == "url" {
                        let url_str = value.as_str().unwrap();
                        if !url_str.starts_with("http://") && !url_str.starts_with("https://") {
                            return Err(anyhow!("Option '{}' must be a valid HTTP/HTTPS URL", key));
                        }
                    }
                    
                    // Check pattern if specified
                    if let Ok(Some(pattern)) = schema_dict.get_item("pattern") {
                        if let Ok(pattern_str) = pattern.extract::<String>() {
                            let regex = regex::Regex::new(&pattern_str)
                                .map_err(|_| anyhow!("Invalid regex pattern for option '{}'", key))?;
                            
                            if !regex.is_match(value.as_str().unwrap()) {
                                let validation_msg = schema_dict.get_item("validation")?
                                    .map(|v| v.extract::<String>())
                                    .transpose()?
                                    .unwrap_or_else(|| format!("must match pattern {}", pattern_str));
                                return Err(anyhow!("Option '{}' {}", key, validation_msg));
                            }
                        }
                    }
                }
                "number" | "int" | "float" | "range" => {
                    if !value.is_number() {
                        return Err(anyhow!("Option '{}' must be a number", key));
                    }
                    
                    let num_value = value.as_f64().unwrap();
                    
                    // Check min/max bounds
                    if let Ok(Some(min_val)) = schema_dict.get_item("min") {
                        if let Ok(min_num) = min_val.extract::<f64>() {
                            if num_value < min_num {
                                return Err(anyhow!("Option '{}' must be >= {}", key, min_num));
                            }
                        }
                    }
                    
                    if let Ok(Some(max_val)) = schema_dict.get_item("max") {
                        if let Ok(max_num) = max_val.extract::<f64>() {
                            if num_value > max_num {
                                return Err(anyhow!("Option '{}' must be <= {}", key, max_num));
                            }
                        }
                    }
                }
                "bool" | "flag" => {
                    if !value.is_boolean() {
                        return Err(anyhow!("Option '{}' must be a boolean", key));
                    }
                }
                "select" | "choice" | "radio" => {
                    if let Ok(Some(options)) = schema_dict.get_item("options") {
                        let valid_options = if let Ok(options_list) = options.downcast::<pyo3::types::PyList>() {
                            // Handle list of strings
                            options_list.iter()
                                .filter_map(|item| item.extract::<String>().ok())
                                .collect::<Vec<_>>()
                        } else {
                            // Handle list of objects with 'value' field
                            Vec::new() // TODO: Implement object parsing
                        };
                        
                        if let Some(value_str) = value.as_str() {
                            if !valid_options.contains(&value_str.to_string()) {
                                return Err(anyhow!("Option '{}' must be one of: {}", key, valid_options.join(", ")));
                            }
                        }
                    }
                }
                "multiselect" => {
                    if !value.is_array() {
                        return Err(anyhow!("Option '{}' must be an array", key));
                    }
                }
                _ => {
                    // Unknown type, skip validation
                }
            }
        }
        
        Ok(())
    }
}
