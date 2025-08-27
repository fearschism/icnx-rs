import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  editing?: { dir: string; manifest: any };
};

export default function SaveScriptDialog({ isOpen, onClose, code, editing }: Props) {
  const [name, setName] = useState('My Script');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('0.1.0');
  const [author, setAuthor] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [icon, setIcon] = useState('');
  const [website, setWebsite] = useState('');
  const [supportedDomains, setSupportedDomains] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStatus(null);
    if (editing?.manifest) {
      const m = editing.manifest;
      setName(m.name || '');
      setDescription(m.description || '');
      setVersion(m.version || '0.1.0');
      setAuthor(m.author || '');
      setCategory(m.category || '');
      setTags(Array.isArray(m.tags) ? m.tags.join(',') : '');
      setIcon(m.icon || '');
      setWebsite(m.website || '');
      setSupportedDomains(Array.isArray(m.supportedDomains) ? m.supportedDomains.join(',') : '');
    }
  }, [isOpen, editing]);

  const handleSave = async () => {
    if (!name.trim() || !version.trim() || !author.trim()) {
      setStatus('Name, Version and Author are required.');
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
        category: category.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        icon: icon.trim() || undefined,
        website: website.trim() || undefined,
        supported_domains: supportedDomains
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        options: [] as any[],
        code,
        existing_dir: editing?.dir || undefined,
      };
      await invoke('save_script', { req });
      setStatus('Saved! You can find it under Scripts.');
    } catch (e) {
      setStatus(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-gray-850 border border-gray-700 rounded-lg p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">{editing ? 'Save Changes' : 'Save Script'}</h2>
          <p className="text-gray-400 text-sm">Fill manifest details. Files will be written to scripts/&lt;slug&gt;/</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-300">Name*</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-300">Version*</span>
            <input className="input" value={version} onChange={(e) => setVersion(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-sm text-gray-300">Description</span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-300">Author*</span>
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-300">Category</span>
            <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-300">Tags (comma separated)</span>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-300">Icon URL</span>
            <input className="input" value={icon} onChange={(e) => setIcon(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-300">Website</span>
            <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-sm text-gray-300">Supported Domains (comma separated)</span>
            <input className="input" value={supportedDomains} onChange={(e) => setSupportedDomains(e.target.value)} />
          </label>
        </div>

        {status && <div className="mt-4 text-sm text-gray-300">{status}</div>}

        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{editing ? 'Save Changes' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}


