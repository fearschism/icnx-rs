declare module '*?worker' {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}

declare module 'monaco-editor/esm/vs/editor/editor.worker?worker';
declare module 'monaco-editor/esm/vs/language/json/json.worker?worker';
declare module 'monaco-editor/esm/vs/language/css/css.worker?worker';
declare module 'monaco-editor/esm/vs/language/html/html.worker?worker';
declare module 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';


