import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
// Vite worker imports for Monaco
// eslint-disable-next-line import/no-duplicates
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// eslint-disable-next-line import/no-duplicates
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (code: string) => void;
  initialCode?: string;
  title?: string;
};

const DEFAULT_CODE = `// Option Playground (JavaScript)
// You can prepare an options object and pass it to your script.
// Example structure matching your manifest-driven options:

const options = {
  quality: '720p',
  format: 'mp4',
  includeAudio: true,
  downloadSubtitles: false,
  outputDirectory: 'videos/example',
  filenameTemplate: '{title} - {quality}',
  maxConcurrent: 3,
  skipExisting: true,
  downloadType: 'single',
  userAgent: 'default',
  customUserAgent: ''
};

// Return this object from the playground
options;`;

export default function OptionPlaygroundDialog({ isOpen, onClose, onApply, initialCode, title = 'Option Playground' }: Props) {
  const [code, setCode] = useState<string>(initialCode || DEFAULT_CODE);
  const [editorReady, setEditorReady] = useState(false);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (isOpen && initialCode) {
      setCode(initialCode);
    }
  }, [isOpen, initialCode]);

  useEffect(() => {
    if (!isOpen) return;
    setEditorReady(false);
    setFallback(false);
    const t = setTimeout(() => {
      if (!editorReady) setFallback(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [isOpen, editorReady]);

  // Configure Monaco workers for Vite/Tauri
  const handleBeforeMount = () => {
    const anyGlobal = globalThis as unknown as { MonacoEnvironment?: any };
    anyGlobal.MonacoEnvironment = {
      getWorker(_: string, label: string) {
        switch (label) {
          case 'json':
            return new JsonWorker();
          case 'css':
          case 'scss':
          case 'less':
            return new CssWorker();
          case 'html':
          case 'handlebars':
          case 'razor':
            return new HtmlWorker();
          case 'typescript':
          case 'javascript':
            return new TsWorker();
          default:
            return new EditorWorker();
        }
      },
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 border border-gray-700 rounded-lg w-[90vw] max-w-5xl h-[80vh] shadow-xl flex flex-col">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-white font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost">Close</button>
        </div>
        <div className="flex-1">
          {fallback ? (
            <textarea
              className="w-full h-full bg-gray-900 text-gray-100 p-3 outline-none"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          ) : (
            <Editor
              height="100%"
              defaultLanguage="javascript"
              theme="vs-dark"
              beforeMount={handleBeforeMount}
              onMount={() => setEditorReady(true)}
              loading={<div className="h-full flex items-center justify-center text-gray-300">Loading editor…</div>}
              value={code}
              onChange={(value) => setCode(value ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                tabSize: 2,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
              }}
            />
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => onApply(code)}
          >
            Apply Options
          </button>
        </div>
      </div>
    </div>
  );
}


