import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

type DownloadSessionSummary = {
  session_id: string;
  title: string;
  subtitle: string;
  total_size: string;
  status: string;
  created_at: number;
};

export default function DownloadHistory() {
  const [items, setItems] = useState<DownloadSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const history = await invoke<DownloadSessionSummary[]>('get_download_history');
        setItems(history);
      } catch (e) {
        setStatus(`Failed to load history: ${e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Download History</h1>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Download History</h1>
        <p className="text-gray-400">Your past downloads</p>
      </div>

      {status && (
        <div className="mb-4 text-sm text-red-300">{status}</div>
      )}

      {items.length === 0 ? (
        <div className="text-gray-400">No history yet.</div>
      ) : (
        <div className="space-y-3">
          {items.map((h) => (
            <div key={h.session_id} className="card flex items-center justify-between">
              <div>
                <div className="font-medium text-white break-all">{h.title}</div>
                <div className="text-xs text-gray-400">{h.subtitle}</div>
                <div className="text-xs text-gray-500 mt-1">{h.total_size}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-sm ${h.status === 'Completed' ? 'text-green-400' : h.status === 'Failed' ? 'text-red-400' : 'text-yellow-300'}`}>{h.status}</div>
                <button className="btn-secondary" onClick={() => {
                  window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'download-history-details', sessionId: h.session_id } } as any));
                }}>View details</button>
                <button className="btn-ghost text-red-300" onClick={async () => {
                  const ok = confirm('Delete this session? Files will also be deleted.');
                  if (!ok) return;
                  try {
                    await invoke('delete_download_session', { sessionId: h.session_id, deleteFiles: true });
                    setItems(prev => prev.filter(x => x.session_id !== h.session_id));
                  } catch (e) {
                    // ignore
                  }
                }}>Delete session</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


