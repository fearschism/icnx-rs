import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import JSZip from 'jszip';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export default function InstallScriptDialog({ isOpen, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('0.1.0');
  const [author, setAuthor] = useState('');
  const [tags, setTags] = useState('');
  const [icon, setIcon] = useState('');
  const [website, setWebsite] = useState('');
  const [supportedDomains, setSupportedDomains] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    // reset fields when opened
    setName(''); setDescription(''); setVersion('0.1.0'); setAuthor(''); setTags(''); setIcon(''); setWebsite(''); setSupportedDomains(''); setCode(''); setStatus(null);
  }, [isOpen]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.name.toLowerCase().endsWith('.zip')) {
        const r = new FileReader();
        r.onload = async () => {
          try {
            const data = r.result as ArrayBuffer;
            const zip = await JSZip.loadAsync(data);
            // look for manifest.json and script.js
            const manifestFile = Object.keys(zip.files).find(k => k.toLowerCase().endsWith('manifest.json'));
            const scriptFile = Object.keys(zip.files).find(k => k.toLowerCase().endsWith('script.js'));
            if (manifestFile) {
              const txt = await zip.file(manifestFile)!.async('string');
              const m = JSON.parse(txt);
              if (m.name) setName(m.name);
              if (m.description) setDescription(m.description);
              if (m.version) setVersion(m.version);
              if (m.author) setAuthor(m.author);
              if (Array.isArray(m.tags)) setTags(m.tags.join(','));
              if (m.icon) setIcon(m.icon);
              if (m.website) setWebsite(m.website);
              if (Array.isArray(m.supportedDomains)) setSupportedDomains(m.supportedDomains.join(','));
            }
            if (scriptFile) {
              const txt = await zip.file(scriptFile)!.async('string');
              setCode(txt);
            }
          } catch (e) { setStatus('Failed to read zip'); }
        };
        r.readAsArrayBuffer(f);
      } else if (f.name.toLowerCase().endsWith('.json')) {
        const r = new FileReader();
        r.onload = () => {
          try {
            const txt = String(r.result || '');
            const m = JSON.parse(txt);
            if (m.name) setName(m.name);
            if (m.description) setDescription(m.description);
            if (m.version) setVersion(m.version);
            if (m.author) setAuthor(m.author);
            if (Array.isArray(m.tags)) setTags(m.tags.join(','));
            if (m.icon) setIcon(m.icon);
            if (m.website) setWebsite(m.website);
            if (Array.isArray(m.supportedDomains)) setSupportedDomains(m.supportedDomains.join(','));
          } catch (e) {
            setStatus('Failed to parse manifest.json');
          }
        };
        r.readAsText(f);
      } else if (f.name.toLowerCase().endsWith('.js')) {
        const r = new FileReader();
        r.onload = () => { setCode(String(r.result || '')); };
        r.readAsText(f);
      }
    }
  };

  const importFromGithub = async () => {
    if (!githubUrl.trim()) { setStatus('GitHub URL required'); return; }
    try {
      setStatus('Fetching from GitHub...');
      // Support repo zip URLs or raw file urls; if user provides repo URL, try to fetch master/main zip
      let url = githubUrl.trim();
      if (url.includes('github.com') && !url.endsWith('.zip')) {
        // convert https://github.com/user/repo -> https://github.com/user/repo/archive/refs/heads/main.zip
        const parts = url.replace(/https?:\/\//, '').split('/');
        if (parts.length >= 2) {
          const user = parts[1];
          const repo = parts[2];
          url = `https://github.com/${user}/${repo}/archive/refs/heads/main.zip`;
        }
      }
      const resp = await fetch(url);
      if (!resp.ok) { setStatus(`Failed to fetch: ${resp.status}`); return; }
      const ab = await resp.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifestFile = Object.keys(zip.files).find(k => k.toLowerCase().endsWith('manifest.json'));
      const scriptFile = Object.keys(zip.files).find(k => k.toLowerCase().endsWith('script.js'));
      if (manifestFile) {
        const txt = await zip.file(manifestFile)!.async('string');
        const m = JSON.parse(txt);
        if (m.name) setName(m.name);
        if (m.description) setDescription(m.description);
        if (m.version) setVersion(m.version);
        if (m.author) setAuthor(m.author);
        if (Array.isArray(m.tags)) setTags(m.tags.join(','));
        if (m.icon) setIcon(m.icon);
        if (m.website) setWebsite(m.website);
        if (Array.isArray(m.supportedDomains)) setSupportedDomains(m.supportedDomains.join(','));
      }
      if (scriptFile) {
        const txt = await zip.file(scriptFile)!.async('string');
        setCode(txt);
      }
      setStatus('Imported from GitHub');
    } catch (e) {
      console.error(e);
      setStatus('Failed to import from GitHub');
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !version.trim() || !author.trim()) {
      setStatus('Name, Version and Author are required.');
      return;
    }
    if (!code.trim()) {
      setStatus('Script code is required.');
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const req = {
        name: name.trim(),
        description: description.trim(),
        version: version.trim() || '0.1.0',
        author: author.trim(),
        category: undefined,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        icon: icon.trim() || undefined,
        website: website.trim() || undefined,
        supported_domains: supportedDomains.split(',').map(d => d.trim()).filter(Boolean),
        options: [] as any[],
        code,
        existing_dir: undefined,
      };
      // backend expects req param (same shape as SaveScriptDialog)
      await invoke('save_script', { req } as any);
      setStatus('Saved! Script installed.');
      onSaved && onSaved();
      onClose();
    } catch (e) {
      setStatus(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-lg p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Install Script</h2>
            <p className="text-sm text-gray-400">Upload a ZIP or script files, or import a repository from GitHub.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Upload files</label>
            <label className="w-full flex flex-col items-center px-4 py-6 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors">
              <div className="text-sm text-gray-300">Click to choose files or drop a ZIP with manifest/script</div>
              <input type="file" accept=".json,.js,.zip" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
            </label>
            <p className="mt-2 text-xs text-gray-500">Supports .zip (manifest.json + script.js) or individual files.</p>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">Import from GitHub</label>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="https://github.com/user/repo" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
              <button className="btn-primary" onClick={importFromGithub}>Import</button>
            </div>
            <p className="mt-2 text-xs text-gray-500">Paste a repository URL (will attempt to fetch default branch zip) or a direct zip/raw URL.</p>
          </div>
        </div>

        {status && <div className="mt-4 p-3 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200">{status}</div>}

        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>Install</button>
        </div>
      </div>
    </div>
  );
}
