import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import Editor, { OnMount, loader } from '@monaco-editor/react';
// Force ESM Monaco instance to avoid legacy loader issues
import * as monacoApi from 'monaco-editor/esm/vs/editor/editor.api';
try { loader.config({ monaco: monacoApi as any }); } catch {}
import { Save, Play } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import SaveScriptDialog from '../components/SaveScriptDialog';
// Workers are pre-bundled and registered in src/main.tsx

const DEFAULT_CODE = `// Playground (JavaScript)
// Write any JS here. We provide a global emit(payload) function.
// Return value is ignored; use emit({ dir, items: [...] }) like in scripts.

function main() {
  const items = [
    {
      url: 'https://httpbin.org/json',
      filename: 'example.json',
      title: 'Example JSON',
      type: 'document',
      headers: { 'User-Agent': 'ICNX-Playground/1.0' },
    },
  ];
  emit({ dir: 'playground', items });
}

main();
`;

export default function Playground() {
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const editorRef = useRef<any>(null);
  const [output, setOutput] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [globalScriptLock, setGlobalScriptLock] = useState<boolean>(() => (window as any).__icnxScriptRunning === true);

  // Configure monaco-react to use our ESM Monaco
  useEffect(() => {
    try { loader.config({ monaco: monacoApi as any }); } catch {}
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const anyE = e as CustomEvent<{ running: boolean }>;
      setGlobalScriptLock(!!anyE.detail?.running);
    };
    window.addEventListener('icnx:script-running-changed', handler as any);
    return () => window.removeEventListener('icnx:script-running-changed', handler as any);
  }, []);

  const [editing, setEditing] = useState<{ dir: string; manifest: any } | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [activeFile, setActiveFile] = useState<'script'|'manifest'>('script');
  const [manifestCode, setManifestCode] = useState<string>('');
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const EXAMPLES: Array<{ id: string; label: string; code: string }> = [
    {
      id: 'emit-basic',
      label: 'Emit basic payload',
      code: `// Basic emit example\nfunction main(){\n  emit({ dir: 'demo', items: [{ url: 'https://picsum.photos/seed/1/800/600', filename: 'image1.jpg', title: 'Demo 1', type: 'image' }] });\n}\nmain();\n`,
    },
    {
      id: 'onresolve-partial',
      label: 'onResolve + emitPartial',
      code: `// onResolve with streaming items\nasync function onResolve(url, ctx){\n  for(let i=1;i<=5;i++){\n    const it = { url: 'https://picsum.photos/seed/'+i+'/800/600', filename: 'img_'+i+'.jpg', title: 'Item '+i, type: 'image' };\n    icnx.emitPartial(it);\n    await new Promise(r=>setTimeout(r,150));\n  }\n  emit({ dir: 'onresolve-demo', items: [] });\n}\n`,
    },
    {
      id: 'dom-fetch-select',
      label: 'icnx.dom.fetch/select',
      code: `// DOM scraping example\nasync function onResolve(url, ctx){\n  const html = await icnx.dom.fetch('https://example.org');\n  const links = await icnx.dom.select(html, 'a');\n  const items = links.slice(0,5).map((a,idx)=>({ url: new URL(a.attrs.href, 'https://example.org').toString(), filename: 'link_'+idx+'.txt', title: (a.text||'').trim(), type: 'document' }));\n  for(const it of items) icnx.emitPartial(it);\n  emit({ dir: 'links', items });\n}\n`,
    },
  ];
  const [selectedExample, setSelectedExample] = useState<string>(EXAMPLES[0].id);

  // Fallback safety: if editor doesn't mount within 8s, use textarea
  useEffect(() => {
    if (mounted) return; 
    const id = setTimeout(() => {
      if (!mounted) setFallback(true);
    }, 8000);
    return () => clearTimeout(id);
  }, [mounted]);

  useEffect(() => {
    // Check if there is a pending edit request set before navigation
    const pending = (window as any).__icnxPendingEdit as { dirOrName: string } | undefined;
    if (pending?.dirOrName) {
      setIsEditMode(true);
      (async () => {
        try {
          const resp = await invoke<any>('get_script', { scriptNameOrDir: pending.dirOrName });
          setCode(resp.code || DEFAULT_CODE);
          setEditing({ dir: resp.dir, manifest: resp.manifest });
          setManifestCode(JSON.stringify(resp.manifest || {}, null, 2));
          // force-update editor content if mounted
          if (editorRef.current && resp.code) {
            try { editorRef.current.setValue(resp.code); } catch {}
          }
        } catch (e) {
          console.error('Failed to load script (pending)', e);
        } finally {
          (window as any).__icnxPendingEdit = undefined;
        }
      })();
    }

    // Open for editing a script when triggered by event
    const handler = (e: Event) => {
      const anyE = e as CustomEvent<{ dirOrName: string }>;
      if (!anyE.detail?.dirOrName) return;
      (async () => {
        try {
          setIsEditMode(true);
          const resp = await invoke<any>('get_script', { scriptNameOrDir: anyE.detail.dirOrName });
          setCode(resp.code || DEFAULT_CODE);
          setEditing({ dir: resp.dir, manifest: resp.manifest });
          setManifestCode(JSON.stringify(resp.manifest || {}, null, 2));
          if (editorRef.current && resp.code) {
            try { editorRef.current.setValue(resp.code); } catch {}
          }
        } catch (e) {
          console.error('Failed to load script', e);
        }
      })();
    };
    window.addEventListener('icnx:edit-script', handler as any);
    return () => window.removeEventListener('icnx:edit-script', handler as any);
  }, []);

  const onMount: OnMount = (editor, monaco) => {
    setMounted(true);
    setFallback(false);
    editor.focus();
    editorRef.current = editor;
    // Editor options similar to VSCode feel
    editor.updateOptions({
      fontSize: 14,
      minimap: { enabled: false },
      wordWrap: 'on',
      quickSuggestions: { other: true, comments: false, strings: true },
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'allDocuments',
      tabSize: 2,
    });

    // Define and apply a theme that matches app colors
    monaco.editor.defineTheme('icnx-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1A0F0D',
        'editor.foreground': '#FFFFFF',
        'editor.lineHighlightBackground': '#22100eAA',
        'editorLineNumber.foreground': '#B0BEC5',
        'editor.selectionBackground': '#A44436AA',
        'editorCursor.foreground': '#B95140',
        'editorWidget.background': '#1A0F0D',
        'editorSuggestWidget.background': '#1A0F0D',
        'editorSuggestWidget.border': '#22100e',
        'editorSuggestWidget.selectedBackground': '#22100e',
      },
    });
    monaco.editor.setTheme('icnx-dark');

    // Ensure model is explicitly JavaScript / JSON depending on active file
    const existing = editor.getModel();
    const model = monaco.editor.createModel(activeFile === 'script' ? code : manifestCode, activeFile === 'script' ? 'javascript' : 'json');
    if (existing && existing !== model) existing.dispose();
    editor.setModel(model);

    // Strong JS language features and DOM libs
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      allowNonTsExtensions: true,
      checkJs: false,
      target: monaco.languages.typescript.ScriptTarget.Latest,
      lib: ['es2020', 'dom'],
    });

    // ICNX global typings for better IntelliSense
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      `
      declare const icnx: {
        emit(payload: any): void;
        emitPartial(value: any): void;
        logger: { info(msg: string): void; error(msg: string): void };
        settings: { get(k: string): any; set(k: string, v: any): void };
        storage: { get(k: string): any; set(k: string, v: any): void };
        dom: {
          fetch(url: string): Promise<string>;
          select(html: string, selector: string): Promise<Array<{ text?: string; attrs: Record<string,string> }>>;
        };
      };
      declare function emit(payload: any): void;
      `,
      'file:///icnx.d.ts'
    );

    // Custom completions (keywords, helpers)
    const disposable = monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['.', '"', '\'', '/'],
      provideCompletionItems: () => {
        const suggestions: any[] = [
          {
            label: 'emit',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'emit(${1:payload});',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Send results back to ICNX (EmitPayload)'
          },
          {
            label: 'main()',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'function main() {\n  ${1:// code}\n}\n\nmain();',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Entry point pattern',
          },
          {
            label: 'EmitPayload template',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: '{\n  dir: "videos/example",\n  items: [\n    { url: "https://...", filename: "file.mp4", title: "Title", type: "video", headers: { "User-Agent": "ICNX/1.0" } }\n  ]\n}',
            documentation: 'Payload structure sent via emit(...)',
          },
          {
            label: 'options example',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: 'const options = { quality: "720p", format: "mp4", includeAudio: true, downloadSubtitles: false };',
            documentation: 'Typical options object used by scripts',
          },
          {
            label: 'fetch()',
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: 'const res = await fetch("https://example.com");\nconst text = await res.text();',
            documentation: 'Standard fetch example',
          },
        ];
        return { suggestions };
      },
    });

    editor.onDidDispose(() => disposable.dispose());
  };

  const runCode = async () => {
    if (isRunning || globalScriptLock) return;
    setIsRunning(true);
    (window as any).__icnxScriptRunning = true;
    window.dispatchEvent(new CustomEvent('icnx:script-running-changed', { detail: { running: true } }));
    setError(null);
    setOutput(null);
    try {
      let resolveEmit: (v: any)=>void = () => {};
      const emittedPromise = new Promise<any>((res) => { resolveEmit = res; });
      const emit = (payload: any) => { resolveEmit(payload); };
      const emitPartial = (_: any) => {};
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor as any;
      // Wrap in async to allow top-level await in user code
      const fn = new AsyncFunction('emit', 'emitPartial', code);
      // Start execution but primarily wait for emit()
      const exec = fn(emit, emitPartial);
      const timeoutMs = 30000;
      const timeoutPromise = new Promise((_res, rej) => setTimeout(() => rej(new Error('Timeout waiting for emit(payload).')), timeoutMs));
      const payload = await Promise.race([emittedPromise, timeoutPromise]);
      setOutput(payload);
      setShowOutput(true);
      // Ensure any unhandled rejection in exec surfaces to console
      Promise.resolve(exec).catch((e: any) => console.error('Script error (async):', e));
    } catch (e: any) {
      setError(String(e?.message || e));
      setShowOutput(true);
    } finally {
      setIsRunning(false);
      (window as any).__icnxScriptRunning = false;
      window.dispatchEvent(new CustomEvent('icnx:script-running-changed', { detail: { running: false } }));
    }
  };

  // Save behavior: when editing an existing script we save both manifest and code inline
  const saveEditedScript = async () => {
    if (!isEditMode || !editing) return;
    // parse manifest JSON
    let manifestObj: any = {};
    try {
      manifestObj = JSON.parse(manifestCode || '{}');
    } catch (e) {
      setError('Manifest JSON is invalid');
      return;
    }
    // build request similar to SaveScriptDialog
    const req: any = {
      name: manifestObj.name || manifestObj.title || manifestObj.dir || editing.dir,
      description: manifestObj.description || '',
      version: manifestObj.version || '0.1.0',
      author: manifestObj.author || '',
      category: manifestObj.category || undefined,
      tags: Array.isArray(manifestObj.tags) ? manifestObj.tags : (typeof manifestObj.tags === 'string' ? manifestObj.tags.split(',').map((s:string)=>s.trim()).filter(Boolean) : []),
      icon: manifestObj.icon || undefined,
      website: manifestObj.website || undefined,
      supported_domains: Array.isArray(manifestObj.supportedDomains) ? manifestObj.supportedDomains : [],
      options: manifestObj.options || [],
      code,
      existing_dir: editing.dir,
    };
    try {
      await invoke('save_script', { req });
      setUnsavedChanges(false);
      window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'success', message: 'Script saved.' } }));
      setIsEditMode(false);
    } catch (e) {
      setError(String(e));
    }
  };

  // prevent accidental exit when editing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isEditMode && unsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
      return undefined;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isEditMode, unsavedChanges]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">{isEditMode ? 'Edit Script' : 'Playground'}</h1>
        {!isEditMode && <p className="text-gray-400">Test JavaScript code with an ICNX-like environment. Use emit(payload) to preview results.</p>}
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <button className="btn-primary inline-flex items-center gap-2 disabled:opacity-50" onClick={runCode} disabled={isRunning || globalScriptLock}>
          <Play size={16} />
          <span>{(isRunning || globalScriptLock) ? 'Running…' : 'Run Script'}</span>
        </button>
        {isEditMode ? (
          <button className="btn-secondary inline-flex items-center gap-2" onClick={saveEditedScript}>
            <Save size={16} />
            <span>Save Script</span>
          </button>
        ) : (
          <button className="btn-secondary inline-flex items-center gap-2" onClick={() => setShowSave(true)}>
            <Save size={16} />
            <span>Save Script</span>
          </button>
        )}
        {!isEditMode && (
          <div className="min-w-[220px]">
            <Select value={selectedExample} onValueChange={(v) => {
              setSelectedExample(v);
              const ex = EXAMPLES.find(e => e.id === v);
              if (ex) setCode(ex.code);
            }}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Examples" />
              </SelectTrigger>
              <SelectContent>
                {EXAMPLES.map(ex => (
                  <SelectItem key={ex.id} value={ex.id}>{ex.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="min-h-[70vh] border border-gray-700 rounded-lg overflow-hidden bg-gray-800">
        {isEditMode && (
          <div className="flex border-b border-gray-700 bg-gray-900">
            <button className={`px-4 py-2 text-sm ${activeFile === 'script' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-300'}`} onClick={() => { setActiveFile('script'); }}>
              script.js
            </button>
            <button className={`px-4 py-2 text-sm ${activeFile === 'manifest' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-300'}`} onClick={() => { setActiveFile('manifest'); }}>
              manifest.json
            </button>
          </div>
        )}
        {!fallback ? (
          <Editor
            height="70vh"
            language={activeFile === 'manifest' ? 'json' : 'javascript'}
            theme="icnx-dark"
            value={activeFile === 'manifest' ? manifestCode : code}
            onChange={(v) => {
              if (activeFile === 'manifest') { setManifestCode(v ?? ''); setUnsavedChanges(true); }
              else { setCode(v ?? ''); setUnsavedChanges(true); }
            }}
            onMount={onMount}
            loading={<div className="p-4 text-sm text-gray-300">Loading editor…</div>}
          />
        ) : (
          <textarea
            className="w-full h-[70vh] p-3 bg-gray-900 text-gray-100 font-mono text-sm outline-none"
            value={activeFile === 'manifest' ? manifestCode : code}
            onChange={(e) => { if (activeFile === 'manifest') { setManifestCode(e.target.value); setUnsavedChanges(true); } else { setCode(e.target.value); setUnsavedChanges(true); } }}
          />
        )}
      </div>

      {showSave && (
        <SaveScriptDialog
          isOpen={showSave}
          onClose={() => setShowSave(false)}
          code={code}
          editing={editing || undefined}
        />
      )}

      {showOutput && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-gray-850 border border-gray-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Output</h2>
              <button className="btn-ghost" onClick={() => setShowOutput(false)}>Close</button>
            </div>
            {error ? (
              <div className="text-red-300 text-sm whitespace-pre-wrap">{error}</div>
            ) : (
              <pre className="text-sm whitespace-pre-wrap bg-gray-900 p-3 rounded-md max-h-[60vh] overflow-auto">{JSON.stringify(output, null, 2)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


