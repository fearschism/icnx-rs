import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
// Prebundle Monaco workers globally so they load reliably
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// @ts-ignore
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
// @ts-ignore
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
// @ts-ignore
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
// @ts-ignore
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Ensure language contributions are registered (tokenizers, language services)
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';

// Attach MonacoEnvironment early
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).MonacoEnvironment = {
  getWorker(_: string, label: string) {
    switch (label) {
      case 'json': return new JsonWorker();
      case 'css': return new CssWorker();
      case 'html': return new HtmlWorker();
      case 'typescript':
      case 'javascript': return new TsWorker();
      default: return new EditorWorker();
    }
  }
};
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
