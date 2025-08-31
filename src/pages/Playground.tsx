import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import Editor, { OnMount, loader } from '@monaco-editor/react';
// Force ESM Monaco instance to avoid legacy loader issues
import * as monacoApi from 'monaco-editor/esm/vs/editor/editor.api';
try { loader.config({ monaco: monacoApi as any }); } catch {}
import { Save, Play } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import SaveScriptDialog from '../components/SaveScriptDialog';
import { pythonTheme, configurePythonLanguage, validatePythonCode } from '../lib/pythonLanguage';
// Workers are pre-bundled and registered in src/main.tsx

const DEFAULT_PY_CODE = `# Playground (Python)
# Write Python code here. Use icnx.emit(payload) to send results.
# The icnx module is automatically imported and available.

__meta__ = {
    "name": "playground-script",
    "description": "A playground Python script",
    "version": "1.0.0",
    "author": "User",
    "options": []
}

def onResolve(url, ctx):
    items = [
        {
            "url": "https://httpbin.org/json",
            "filename": "example.json",
            "title": "Example JSON",
            "type": "document",
            "headers": {"User-Agent": "ICNX-Playground/1.0"}
        }
    ]
    icnx.emit({"dir": "playground", "items": items})
`;

export default function Playground() {
  const [code, setCode] = useState<string>(DEFAULT_PY_CODE);
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

  const PY_EXAMPLES: Array<{ id: string; label: string; code: string }> = [
    {
      id: 'basic-emit',
      label: 'Basic emit example',
      code: `# Basic Python emit example\n\n__meta__ = {\n    "name": "basic-demo",\n    "description": "A basic demo script",\n    "version": "1.0.0",\n    "author": "User",\n    "options": []\n}\n\ndef onResolve(url, ctx):\n    items = [{\n        "url": "https://picsum.photos/seed/1/800/600",\n        "filename": "image1.jpg",\n        "title": "Demo 1",\n        "type": "image"\n    }]\n    icnx.emit({"dir": "demo", "items": items})\n`,
    },
    {
      id: 'with-options',
      label: 'Script with options',
      code: `# Python script with options\n\n__meta__ = {\n    "name": "options-demo",\n    "description": "Demo script with options",\n    "version": "1.0.0",\n    "author": "User",\n    "options": [\n        {\n            "id": "quality",\n            "type": "select",\n            "label": "Image Quality",\n            "description": "Select image quality",\n            "default": "medium",\n            "options": [\n                {"label": "Low", "value": "low"},\n                {"label": "Medium", "value": "medium"},\n                {"label": "High", "value": "high"}\n            ]\n        },\n        {\n            "id": "count",\n            "type": "number",\n            "label": "Image Count",\n            "description": "Number of images to download",\n            "default": 5,\n            "min": 1,\n            "max": 20\n        }\n    ]\n}\n\ndef onResolve(url, ctx):\n    # Options are available via icnx.get_option()\n    quality = icnx.get_option("quality", "medium")\n    count = icnx.get_option("count", 5)\n    \n    items = []\n    for i in range(1, count + 1):\n        items.append({\n            "url": f"https://picsum.photos/seed/{i}/800/600",\n            "filename": f"image_{i}_{quality}.jpg",\n            "title": f"Image {i} ({quality})",\n            "type": "image"\n        })\n    \n    icnx.emit({"dir": f"demo_{quality}", "items": items})\n`,
    },
    {
      id: 'web-scraping',
      label: 'Web scraping example',
      code: `# Python web scraping example\n\n__meta__ = {\n    "name": "scraper-demo",\n    "description": "Web scraping demo",\n    "version": "1.0.0",\n    "author": "User",\n    "options": [\n        {\n            "id": "target_url",\n            "type": "url",\n            "label": "Target URL",\n            "description": "URL to scrape",\n            "default": "https://example.org",\n            "required": True\n        }\n    ]\n}\n\ndef onResolve(url, ctx):\n    target_url = icnx.get_option("target_url", "https://example.org")\n    \n    # Fetch the page\n    html = icnx.fetch(target_url)\n    \n    # Select links\n    links = icnx.select(html, "a")\n    \n    items = []\n    for i, link in enumerate(links[:5]):\n        href = link.get("href", "")\n        text = link.get_text().strip()\n        \n        if href:\n            # Make absolute URL\n            if href.startswith("/"):\n                href = target_url.rstrip("/") + href\n            elif not href.startswith("http"):\n                href = target_url.rstrip("/") + "/" + href\n            \n            items.append({\n                "url": href,\n                "filename": f"link_{i}.txt",\n                "title": text or f"Link {i}",\n                "type": "document"\n            })\n    \n    icnx.emit({"dir": "scraped_links", "items": items})\n`,
    },
  ];

  const [selectedExample, setSelectedExample] = useState<string>(PY_EXAMPLES[0].id);

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
          setIsEditMode(true);
          const resp = await invoke<any>('get_script', { scriptNameOrDir: pending.dirOrName });
          setCode(resp.code || DEFAULT_PY_CODE);
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
          setCode(resp.code || DEFAULT_PY_CODE);
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
    
    // Register enhanced Python language support
    const disposePythonLang = configurePythonLanguage(monaco);
    
    // Editor options similar to VSCode feel
    editor.updateOptions({
      fontSize: 14,
      minimap: { enabled: false },
      wordWrap: 'on',
      quickSuggestions: { other: true, comments: false, strings: true },
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'allDocuments',
      tabSize: 4, // Python uses 4 spaces
      insertSpaces: true,
      detectIndentation: false,
      folding: true,
      foldingHighlight: true,
      bracketPairColorization: { enabled: true },
      guides: {
        indentation: true,
        bracketPairs: true,
        bracketPairsHorizontal: true,
      },
      cursorBlinking: 'smooth',
      renderLineHighlight: 'all',
      scrollBeyondLastLine: false,
      smoothScrolling: true,
    });

    // Apply enhanced Python theme
    monaco.editor.defineTheme('icnx-python', pythonTheme);
    monaco.editor.setTheme('icnx-python');

    // Ensure model is Python for script file
    const existing = editor.getModel();
    let language = 'python';
    if (activeFile === 'manifest') {
      language = 'json';
    }
    const model = monaco.editor.createModel(activeFile === 'script' ? code : manifestCode, language);
    if (existing && existing !== model) existing.dispose();
    editor.setModel(model);

    // Set up Python linting
    let lintTimeoutId: NodeJS.Timeout;
    const updateLinting = () => {
      if (activeFile === 'script' && model.getLanguageId() === 'python') {
        const currentCode = model.getValue();
        const markers = validatePythonCode(currentCode);
        monaco.editor.setModelMarkers(model, 'python-lint', markers);
      }
    };

    // Initial linting
    updateLinting();

    // Lint on content change with debouncing
    const contentChangeDisposable = model.onDidChangeContent(() => {
      clearTimeout(lintTimeoutId);
      lintTimeoutId = setTimeout(updateLinting, 500);
    });

    editor.onDidDispose(() => {
      disposePythonLang();
      contentChangeDisposable.dispose();
      clearTimeout(lintTimeoutId);
    });
  };

  const runCode = async () => {
    if (isRunning || globalScriptLock) return;
    setIsRunning(true);
    (window as any).__icnxScriptRunning = true;
    window.dispatchEvent(new CustomEvent('icnx:script-running-changed', { detail: { running: true } }));
    setError(null);
    setOutput(null);
    try {
      // For Python scripts, use the backend to execute
      const result = await invoke('run_script_playground', { code });
      setOutput(result);
      setShowOutput(true);
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
        <h1 className="text-3xl font-bold text-white mb-2">{isEditMode ? 'Edit Script' : 'Python Playground'}</h1>
        {!isEditMode && <p className="text-gray-400">Test Python code with an ICNX-like environment. Use icnx.emit(payload) to preview results.</p>}
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <button className="btn-primary inline-flex items-center gap-2 disabled:opacity-50" onClick={runCode} disabled={isRunning || globalScriptLock}>
          <Play size={16} />
          <span>{(isRunning || globalScriptLock) ? 'Running…' : 'Run Python'}</span>
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
              const ex = PY_EXAMPLES.find(e => e.id === v);
              if (ex) setCode(ex.code);
            }}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Examples" />
              </SelectTrigger>
              <SelectContent>
                {PY_EXAMPLES.map(ex => (
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
              script.py
            </button>
            <button className={`px-4 py-2 text-sm ${activeFile === 'manifest' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-300'}`} onClick={() => { setActiveFile('manifest'); }}>
              manifest.json
            </button>
          </div>
        )}
        {!fallback ? (
          <Editor
            height="70vh"
            language={activeFile === 'manifest' ? 'json' : 'python'}
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


