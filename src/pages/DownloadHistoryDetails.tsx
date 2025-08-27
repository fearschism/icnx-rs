import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { convertFileSrc } from '@tauri-apps/api/tauri';

type RecordView = {
  id: string;
  url: string;
  filename: string;
  path: string;
  size?: number;
  status: string;
  file_type?: string;
};

export default function DownloadHistoryDetails({ sessionId, onBack, onRetryFailed }: { sessionId: string; onBack: () => void; onRetryFailed: (failed: RecordView[]) => void }) {
  const [records, setRecords] = useState<RecordView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all'|'completed'|'failed'|'incomplete'>('all');
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const recs = await invoke<RecordView[]>('get_download_session_details', { sessionId });
        setRecords(recs);
      } catch (e) {
        setStatus(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'completed': return records.filter(r => r.status === 'Completed');
      case 'failed': return records.filter(r => r.status === 'Failed');
      case 'incomplete': return records.filter(r => r.status !== 'Completed' && r.status !== 'Failed');
      default: return records;
    }
  }, [records, filter]);

  const failedOnes = records.filter(r => r.status === 'Failed');

  const preview = (path: string) => invoke('open_file_in_system', { path }).catch(() => setStatus('Failed to open file'));
  const deleteFile = async (path: string) => {
    try {
      await invoke('delete_file_at_path', { path });
      setRecords(prev => prev.map(r => r.path === path ? { ...r, status: 'Deleted' } : r));
    } catch (e) {
      setStatus(String(e));
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-6"><h1 className="text-3xl font-bold text-white">Download History Details</h1></div>
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Download History Details</h1>
        <button className="btn-ghost" onClick={onBack}>Back</button>
      </div>
      {status && <div className="mb-3 text-sm text-red-300">{status}</div>}
      <div className="mb-3 flex items-center gap-3">
        <label className="text-sm text-gray-400">Filter:</label>
        <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">All</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="incomplete">Incomplete</option>
        </select>
        {failedOnes.length > 0 && (
          <button className="btn-primary ml-auto" onClick={() => onRetryFailed(failedOnes)}>Retry failed tasks</button>
        )}
      </div>
      <div className="overflow-auto rounded border border-gray-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-800">
            <tr>
              <th className="p-2 text-left">Preview</th>
              <th className="p-2 text-left">Filename</th>
              <th className="p-2 text-left">Size</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(r.filename);
              return (
                <tr key={r.id} className="border-t border-gray-700">
                  <td className="p-2">
                    {isImage ? (
                      <img src={convertFileSrc(r.path)} onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} className="w-16 h-16 object-cover rounded" />
                    ) : (
                      <div className="w-16 h-16 rounded bg-gray-700 text-gray-400 text-xs flex items-center justify-center">no preview</div>
                    )}
                  </td>
                  <td className="p-2 text-gray-200">{r.filename}</td>
                  <td className="p-2 text-gray-300">{typeof r.size === 'number' ? `${(r.size/1024/1024).toFixed(2)} MB` : '-'}</td>
                  <td className="p-2 text-gray-300">{r.status}</td>
                  <td className="p-2 flex items-center gap-2">
                    <button className="btn-secondary" onClick={() => preview(r.path)}>Open</button>
                    <button className="btn-ghost text-red-300" onClick={() => deleteFile(r.path)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


