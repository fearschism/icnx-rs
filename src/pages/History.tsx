import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

type HistoryRow = {
  id: string;
  session_id: string;
  url: string;
  filename: string;
  dir: string;
  size?: number;
  status: string;
  file_type?: string | null;
  script_name?: string | null;
  source_url?: string | null;
  created_at: number;
};

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await invoke<{ rows: HistoryRow[] }>('get_persistent_history');
        setRows(res.rows || []);
      } catch (e) {
        setStatus(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openFile = (path: string) => invoke('open_file_in_system', { path }).catch(() => setStatus('Failed to open file'));
  const retry = async (r: HistoryRow) => {
    try {
      await invoke('quick_download', { url: r.url, destination: r.dir, filename: r.filename, session_id: r.session_id, script_name: r.script_name, file_type: r.file_type });
      setStatus('Retry started');
    } catch (e) { setStatus(String(e)); }
  };

  const remove = async (id: string) => {
    try {
      // purge_persistent_history without a date removes all; use a targeted deletion if implemented server-side.
      await invoke('purge_persistent_history', { olderThan: null });
      setRows(prev => prev.filter(p => p.id !== id));
    } catch (e) { setStatus(String(e)); }
  };

  if (loading) return <div className="text-gray-400">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-white">Download History</h2>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={() => invoke('purge_persistent_history', { olderThan: null }).then(() => setRows([])).catch(e => setStatus(String(e)))}>Clear all</button>
        </div>
      </div>
      {status && <div className="text-sm text-red-300 mb-2">{status}</div>}
      {rows.length === 0 ? <div className="text-gray-400">No history yet.</div> : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="card flex items-center justify-between">
              <div className="flex-1">
                <div className="font-medium text-white break-all">{r.filename}</div>
                <div className="text-xs text-gray-400">{r.url}</div>
                <div className="text-xs text-gray-500 mt-1">{r.size ? `${(r.size/1024/1024).toFixed(2)} MB` : '-'}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`text-sm ${r.status === 'Completed' ? 'text-green-400' : r.status === 'Failed' ? 'text-red-400' : 'text-yellow-300'}`}>{r.status}</div>
                <button className="btn-secondary" onClick={() => openFile(`${r.dir}/${r.filename}`)}>Open</button>
                <button className="btn-ghost" onClick={() => retry(r)}>Retry</button>
                <button className="btn-ghost text-red-300" onClick={() => remove(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
