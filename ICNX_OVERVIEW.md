# ICNX — Overview, Features, Issues, and How It Works

Date: 2025-08-15

This document summarizes the codebase in this workspace, highlights features, calls out likely errors or misunderstandings, and concludes with how the application operates end-to-end.

---

## High-level summary

ICNX is a desktop downloader/scraper application built with:
- A Rust backend (Tauri) providing native commands, script execution, and a downloader engine.
- A React + TypeScript frontend (Vite + Monaco) running inside Tauri for UI, script playground, and management.
- An embedded JavaScript runtime (boa_engine) used server-side for running user scripts in Rust.

Primary use-case: run small JavaScript "scraper" scripts that `emit(...)` download payloads (directory + items) and queue downloads handled by the Rust downloader.

---

## Key components (files / folders of interest)

- `src/main.rs` — Tauri app entry, registers command handlers (quick_download, run_script, get_installed_scripts, etc) and creates data directories.
- `src/core/runtime.rs` — JavaScript engine wrapper using `boa_engine`, injects `emit`, `emitPartial`, and a minimal `icnx` object; pumps JS promises and applies host DOM helpers (`icnx.dom.fetch`, `icnx.dom.select`) via synchronous Rust HTTP calls (`ureq`).
- `src/core/model.rs` — `EmitPayload` and `DownloadItem` types used as canonical payloads between script and host.
- `src/App.tsx` — React app shell + global event bridges for progress, scrape events, and navigation.
- `src/pages/Playground.tsx` — Web playground to author/run scripts in-browser (different runtime than Rust engine) using a promise-based `emit` shim.
- `scripts/` — example scripts (manifests + `script.js`) that the app can run.
- `package.json` / `Cargo.toml` — frontend & backend dependencies (Tauri, boa_engine, reqwest, ureq, iced-like libs in frontend ecosystem). 

---

## How scripts are expected to behave

- Scripts should call `emit(payload)` with JSON-compatible payload matching `EmitPayload`:
  - payload.dir (optional)
  - payload.items: array of `DownloadItem` (url, optional filename, optional headers, etc.)
- Optionally scripts can call `emitPartial(item)` repeatedly to send streaming items.
- Two entry patterns supported by the injected prelude:
  - `onResolve(inputUrl, ctx)` — run when resolving a single input URL (used by `onResolve`-style scrapers)
  - `main(options)` — generic entrypoint
- The Rust runtime runs the script, pumps microtasks/promises, collects `__emit_str` (the final emit() JSON) and `__emit_str_partial` values and emits Tauri events `scrape_item` and `scrape_done` for the frontend to consume.

Note: The frontend Playground executes code in the browser (real JS environment) and uses a different `emit` shim (local promise) to capture the payload; behavior and available globals differ from the Rust/boa runtime.

---

## Notable features

- Two execution environments:
  - Browser playground (fast edit/run cycle, uses native JS APIs like fetch)
  - Rust/boa engine (no Node, polyfilled icnx.dom backed by `ureq`/`scraper`)
- Streaming support via `emitPartial` and incremental `scrape_item` events.
- DOM helpers (`icnx.dom.fetch` and `icnx.dom.select`) implemented server-side so scripts can scrape HTML without a full browser.
- Frontend uses Monaco editor with custom types and snippets for good DX.
- Downloader uses robust Rust tooling (async tokio, reqwest, retries) and Tauri exposes commands for download control.

---

## Potential issues, pitfalls and misunderstandings

1. Two different execution runtimes (browser vs Rust/boa)
   - Misunderstanding: a script that works in the Playground (browser) may fail or behave differently in the Rust engine.
   - Reason: Playground runs in a full JS environment (real fetch, real DOM in browser if allowed) while `boa_engine` is an embeddable JS parser/interpreter with a prelude polyfill and synchronous host helpers via `ureq`.

2. Emit payload parsing is strict
   - The Rust runtime expects `__emit_str` to be valid JSON that deserializes to `EmitPayload`. If a script emits different shape or includes circular refs, the Rust side will return "Script did not emit any data" or a deserialization error.
   - The frontend Playground awaits a call to `emit(...)` (with a 30s timeout) — if the script never calls `emit`, it times out with a user-visible error.

3. Timeouts and long-running scripts
   - Rust-side: the engine pumps promises until `__icnx_done === true` or a hard timeout of 15s. Long scrapes that need more time will be cut off.
   - Frontend: `runCode` enforces a ~30s timeout waiting for `emit`.
   - Recommendation: expose configurable timeouts or use streaming (`emitPartial`) + events for larger jobs.

4. Partial emit handling and JSON serialization
   - `emitPartial` stores a JSON string in `__emit_str_partial` and Rust parses it per-loop into a single `DownloadItem`. Large or non-JSON data may silently be dropped or fail parsing.
   - The host/JS bridging performs multiple serializations (stringifying JSON then embedding it into JS again) — this is an easy source of escaping/encoding bugs when payloads contain unusual characters.

5. icnx.dom.* is synchronous from script perspective
   - `icnx.dom.fetch` / `icnx.dom.select` are implemented as Promise-based functions in JS but use `__icnx_req` to pass a request to Rust; Rust calls `ureq` synchronously and resolves the Promise by calling `__deliverHostResp(...)`. Edge cases (errors, timeouts) map to `null` or empty results, which may be surprising.

6. Concurrency & global script lock
   - The frontend prevents concurrent script runs with a global `window.__icnxScriptRunning` flag. Ensure the backend also respects concurrent script execution if multiple requests can be received.

7. Security considerations
   - Scripts can cause the host to fetch arbitrary URLs (Rust uses `ureq` and Tauri features allow `http-all`). If scripts are untrusted, they can be used to scan internal networks or exfiltrate data. Consider sandboxing policies and domain restrictions for untrusted scripts.

8. Error surfacing can be opaque
   - Errors inside the embedded engine are gathered in `__icnx_err` but may be surfaced as a single string; stack traces and context can be limited. Improving logging and returning structured errors will help debugging.

9. Differences in DOM selection result shape
   - The Rust `dom.select` returns objects of { html, text, attrs } — the Playground types try to match this, but small differences in attribute names or structure will be a source of confusion.

10. DeliverHostResp double serialization risk
   - The runtime constructs a JSON value and then calls `__deliverHostResp(<json-string-as-string>)` which means JS receives a string that is then parsed — this double wrapping can break when payloads contain embedded quotes or binary-like contents.

---

## Quick recommendations

- Make the script runtime contract explicit in documentation (examples, required `emit(...)` shape, allowed globals, timeouts).
- Increase or make configurable the Rust engine timeout (15s) for long scrapes; rely on `emitPartial` for streaming.
- Add stronger validation and helpful errors when emit payload deserialization fails (include the original JSON text in logs when safe).
- Normalize behavior between Playground and Rust runtime; add a compatibility section in docs describing differences.
- Consider limiting or sandboxing `icnx.dom.fetch` for untrusted scripts (allowlist hosts, rate limits).
- Replace double-serialization patterns with a single well-defined FFI call if possible (e.g., directly calling a host function from the engine to resolve promises rather than passing JSON through globals).

---

## Conclusion — how the application works end-to-end

User writes or installs a JS script (in `scripts/*`). When asked to run a script (from UI or via command):

1. Tauri invokes the Rust command `run_script` which loads the script source and calls `JsEngine::execute_script` (boa_engine).
2. The runtime pre-injects a small `icnx` API and `emit` / `emitPartial` helpers into the JS context. Scripts call `emit(...)` to return an `EmitPayload` or call `emitPartial(item)` repeatedly to stream items.
3. For DOM helper calls, the runtime translates JS host requests (`__icnx_req`) into synchronous Rust HTTP calls (using `ureq`) and returns results to the JS Promise resolver.
4. The Rust runtime collects partial items and the final emitted payload, then emits Tauri events (`scrape_item` and `scrape_done`) so the frontend can show streaming results and finalize a download session.
5. The downloader subsystem (Rust) then queues and executes downloads (reqwest/tokio), while the frontend displays progress via global events and pages (DownloadSession, DownloadDetails).

In addition, the frontend Playground provides a fast developer loop for authoring scripts, but it is not identical to the Rust runtime — it is meant for previewing behavior and authoring only.

---

If you want, I can:
- Add this file to the repository (already created as ICNX_OVERVIEW.md).
- Create a short `DOCS.md` with a script authoring quickstart and examples.
- Implement improved error logging in `src/core/runtime.rs` to include the raw `__emit_str` when deserialization fails.

