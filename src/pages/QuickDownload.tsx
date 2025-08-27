// Full replacement: QuickDownload page with updated layout (input + tips horizontally above emphasized list)
import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Download, History, Clock, Check, X, RefreshCw, HelpCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import ScrapeResultsDialog from '../components/ScrapeResultsDialog';
import ScriptPickerDialog from '../components/ScriptPickerDialog';
import type { ScriptInfo } from '../types';
import DownloadCard from '../components/DownloadCard';
import DownloadDetailsDialog from '../components/DownloadDetailsDialog';
import useDownloadProgress from '../hooks/useDownloadProgress';

interface DownloadInfo {
  id: string;
  url: string;
  filename: string;
  destination: string;
}

type DownloadSessionSummary = {
  session_id: string;
  title: string;
  subtitle: string;
  total_size: string;
  status: string;
  created_at: number;
};

export default function QuickDownload() {
  const [url, setUrl] = useState('');
  const [destination, setDestination] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [status, setStatus] = useState('');
  const [globalScriptLock, setGlobalScriptLock] = useState<boolean>(() => (window as any).__icnxScriptRunning === true);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [historyItems, setHistoryItems] = useState<DownloadSessionSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const progressMap = useDownloadProgress();

  useEffect(() => {
    const handler = (e: Event) => {
      const anyE = e as CustomEvent<{ running: boolean }>;
      setGlobalScriptLock(!!anyE.detail?.running);
    };
    window.addEventListener('icnx:script-running-changed', handler as any);
    return () => window.removeEventListener('icnx:script-running-changed', handler as any);
  }, []);

  const [scrapeItems] = useState<any[] | null>(null);
  const [showScrapeDialog, setShowScrapeDialog] = useState(false);
  const [scriptChoices, setScriptChoices] = useState<ScriptInfo[] | null>(null);
  const [showScriptPicker, setShowScriptPicker] = useState(false);
  const [cards, setCards] = useState<Array<any>>([]);

  useEffect(() => {
    try {
      const g: any = window as any;
      const known = (g.__icnxOverviewCards as any[]) || [];
      if (known && known.length) setCards(known as any[]);
    } catch (_) {}
    
    // Listen for card removal (cancellation)
    const removeHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const { sessionId, url: u } = detail;
      setCards(prev => {
        const next = prev.filter(c => (sessionId ? c.sessionId !== sessionId : true) && (u ? c.url !== u : true));
        try { (window as any).__icnxOverviewCards = next; } catch(_) {}
        return next;
      });
  // Re-enable download form if we were waiting
  setIsDownloading(false);
  // If no active cards remain, clear transient status unless it's an error
  setStatus((s) => s && !/error|failed/i.test(s) ? '' : s);
    };
    window.addEventListener('icnx:download-card-remove', removeHandler as any);
    return () => {
      try { window.removeEventListener('icnx:download-card-remove', removeHandler as any); } catch(_) {}
    };
  }, []);

  // Normalize any legacy/malformed cards and de-duplicate by URL on first mount
  useEffect(() => {
    try {
      const g: any = window as any;
      const arr = (g.__icnxOverviewCards as any[]) || [];
      if (!Array.isArray(arr) || arr.length === 0) return;
      const fixed = arr.map((c: any) => {
        const out = { ...c };
        // promote subtitle->url if url missing (legacy ScrapeSession card shape)
        if (!out.url && typeof out.subtitle === 'string') out.url = out.subtitle;
        if (out.isScrape && !out.scriptName && typeof out.title === 'string') out.scriptName = out.title;
        return out;
      }).filter((c: any) => typeof c.url === 'string' && c.url.length > 0);
      const byUrl = new Map<string, any>();
      for (const c of fixed) byUrl.set(c.url, c);
      const next = Array.from(byUrl.values());
      if (next.length !== arr.length) {
        g.__icnxOverviewCards = next;
        setCards(next);
      }
    } catch (_) {}
  }, []);

  // Auto-close download cards when they complete
  useEffect(() => {
    const onCompleted = (e: any) => {
      const id = e?.detail?.id as string | undefined;
      const doneUrl = e?.detail?.url as string | undefined;
      setCards((prev) => {
        let next = prev;
        if (id) next = next.filter((c) => c.id !== id);
        if (doneUrl) next = next.filter((c) => c.url !== doneUrl);
        if (next.length !== prev.length) {
          try { (window as any).__icnxOverviewCards = next; } catch (_) {}
        }
        return next;
      });
    };
    try { window.addEventListener('icnx:download-card-completed', onCompleted as any); } catch (_) {}
    return () => { try { window.removeEventListener('icnx:download-card-completed', onCompleted as any); } catch (_) {} };
  }, []);

  // Also prune completed downloads using the global progress snapshot (feeder)
  useEffect(() => {
    if (!progressMap || Object.keys(progressMap).length === 0) return;
    setCards((prev) => {
      const next = prev.filter((c) => {
        const p = progressMap[c.url];
        // Only auto-remove real download cards (not scrape preview cards)
        if (c.isScrape) return true;
        if (!p) return true;
        return !(p.status === 'completed' || p.progress === 1);
      });
      if (next.length !== prev.length) {
        try { (window as any).__icnxOverviewCards = next; } catch (_) {}
      }
      return next;
    });
  }, [progressMap]);

  const loadHistory = useCallback(async () => {
    if (activeTab !== 'history') return;
    setHistoryLoading(true);
    try {
      const history = await invoke<DownloadSessionSummary[]>('get_download_history');
      setHistoryItems(history || []);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }, [activeTab]);

  // Load history when switching to history tab
  useEffect(() => {
    loadHistory();
  }, [activeTab]);

  useEffect(() => {
    // Load default destination from settings
    (async () => {
      try {
        const settings = await invoke<any>('get_settings');
        if (settings?.default_download_dir) setDestination(settings.default_download_dir);
      } catch {}
    })();
  }, []);

  const handleDownload = async () => {
    if (!url.trim()) {
      setStatus('Please enter a URL');
      return;
    }

    setIsDownloading(true);
    setStatus('Preparing...');

    try {
      const matches = await detectMatchingScripts(url.trim());
      if (!matches || matches.length === 0) {
        // Fallback to direct file download
        const urlObj = new URL(url.trim());
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop() || 'download';
        const downloadInfo: DownloadInfo = {
          id: crypto.randomUUID(),
          url: url.trim(),
          filename: filename.includes('.') ? filename : `${filename}.bin`,
          destination,
        };
        setStatus('No scraper matched. Downloading directly...');
        // create an overview card and start backend download session
        const id = crypto.randomUUID();
        const newCard = { id, url: downloadInfo.url, filename: downloadInfo.filename, destination, isScrape: false };
        // de-duplicate by URL before adding
        setCards((prev) => { 
          const filtered = prev.filter((c) => c.url !== newCard.url);
          const next = [...filtered, newCard]; 
          try { (window as any).__icnxOverviewCards = next; } catch(_){}
          return next; 
        });
        // start backend session so progress events are emitted
        (async () => {
          try {
            const sid = await invoke<string>('start_download_session', { items: [{ url: downloadInfo.url, filename: downloadInfo.filename }], destination } as any);
            setCards((prev) => prev.map(c => c.id === id ? { ...c, sessionId: sid } : c));
            // Mark active session so Sidebar shows it; App/Sidebar clear on session finish
            try {
              const g: any = window as any;
              g.__icnxHasActiveSession = true;
              g.__icnxCurrentSessionId = sid;
              g.__icnxActive = { kind: 'download', url: downloadInfo.url };
              window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
            } catch (_) {}
          } catch (err) {
            console.error('failed to start download session for quick download', err);
      // If start fails, allow user to retry
      setIsDownloading(false);
      setStatus('Failed to start download');
          }
        })();
        // clear url field
        setUrl('');
    // Immediately allow another URL entry; we don't have to wait for session id
    setIsDownloading(false);
        return;
      }

      let picked: ScriptInfo;
      if (matches.length === 1) {
        picked = matches[0];
      } else {
        setScriptChoices(matches);
        setShowScriptPicker(true);
        setIsDownloading(false);
        return;
      }

      // Start a background scrape and show a card in the overview (do not navigate)
      ;(window as any).__icnxDestination = destination;
      ;(window as any).__icnxForceNewScrape = true;
      ;(window as any).__icnxHasActiveSession = true;
      ;(window as any).__icnxActive = { kind: 'scrape', url: url.trim() };
      window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
      // create an overview card representing the scrape
      const cardId = crypto.randomUUID();
      const newCard = { id: cardId, url: url.trim(), filename: undefined, destination, isScrape: true, scriptName: picked.name };
      // de-duplicate any existing scrape card for the same URL before adding
      setCards((prev) => { 
        const filtered = prev.filter((c) => !(c.isScrape && c.url === newCard.url));
        const next = [...filtered, newCard]; 
        try { (window as any).__icnxOverviewCards = next; } catch(_){}
        return next; 
      });
      (async () => {
        try {
          (window as any).__icnxCurrentScrapeKey = `${picked.name}::${url.trim()}`;
          await invoke('run_script', { scriptName: picked.name, options: { inputUrl: url.trim(), maxPages: 10 } });
        } catch (err) {
          console.error('failed to start scraper', err);
        }
      })();
      // clear the url field and reset status
      setUrl('');
      setStatus('');
      setIsDownloading(false);
    } catch (e) {
      setStatus(`Error: ${e}`);
      setIsDownloading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleDownload();
    }
  };

  async function detectMatchingScripts(url: string) {
    try {
      return await invoke<ScriptInfo[]>('detect_scripts_for_url', { url });
    } catch (e) {
      console.error('Error detecting scripts:', e);
      return [];
    }
  }

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleString();
  }


  return (
    <div className="animate-fade-in">
      {/* Tab navigation with themed tabs */}
            <div className="flex space-x-1 bg-gray-800/30 backdrop-blur-sm p-1 rounded-lg mb-6 max-w-sm">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md ${
            activeTab === 'current'
              ? 'bg-[#B95140] text-white shadow-sm'
              : 'text-gray-300 hover:text-white hover:bg-gray-700/30'
          }`}
          onClick={() => setActiveTab('current')}
        >
          Quick Download
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md ${
            activeTab === 'history'
              ? 'bg-[#B95140] text-white shadow-sm'
              : 'text-gray-300 hover:text-white hover:bg-gray-700/30'
          }`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      {activeTab === 'current' ? (
        <div className="flex flex-col gap-6 w-full">
          <div className="flex items-start gap-6">
            <div className="flex-1 max-w-2xl">
              <Card className="p-3 bg-gray-800/50 backdrop-blur-lg">
                <div className="flex items-center gap-3">
                  <Input
                    id="url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
                    onKeyPress={handleKeyPress}
                    placeholder="https://example.com/file.zip"
                    disabled={isDownloading}
                    className="text-sm h-9 pr-2 bg-gray-700/50 border-gray-600/40"
                  />
                  <div className="flex items-center gap-2">
                    <Button onClick={handleDownload} disabled={isDownloading || !url.trim() || globalScriptLock} className="h-9 px-4 whitespace-nowrap">
                      <Download size={16} />
                      <span className="ml-1.5">{isDownloading ? 'Downloading...' : 'Download'}</span>
                    </Button>

                    <div className="relative inline-block">
                      <div className="group">
                        <button type="button" aria-label="Tips" className="w-9 h-9 rounded-md flex items-center justify-center bg-gray-700/50 text-gray-200 hover:bg-gray-600/60 focus:outline-none">
                          <HelpCircle size={16} />
                        </button>
                        <div className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-150 absolute right-0 mt-2 w-64 bg-gray-900/90 border border-gray-700 rounded p-3 text-sm text-gray-200 z-50">
                          <h4 className="text-white font-medium mb-1">Tips</h4>
                          <ul className="text-gray-300 space-y-2">
                            <li className="flex items-start"><span className="text-yellow-400 mr-2">•</span><span>For videos or images, specialized scrapers will automatically be used when available.</span></li>
                            <li className="flex items-start"><span className="text-yellow-400 mr-2">•</span><span>For direct file links, paste the URL and download.</span></li>
                            <li className="flex items-start"><span className="text-yellow-400 mr-2">•</span><span>Downloads are saved to the destination shown below the input.</span></li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-2 flex items-center">
                  <span className="opacity-70 mr-1">Saving to:</span>
                  <span className="text-gray-300 font-medium truncate">{destination || '...'}</span>
                </div>
                {status && (
                  <div className={`mt-3 px-3 py-2 text-xs rounded-md ${
                    status.toLowerCase().includes('failed') || status.toLowerCase().includes('error')
                      ? 'bg-red-900/25 border border-red-700/40 text-red-200'
                      : status.toLowerCase().includes('completed') || status.toLowerCase().includes('success')
                      ? 'bg-green-900/25 border border-green-700/40 text-green-200'
                      : 'bg-blue-900/25 border border-blue-700/40 text-blue-200'
                  }`}>
                    <div className="flex items-center text-xs">
                      {status.toLowerCase().includes('failed') || status.toLowerCase().includes('error') ? (
                        <X size={14} className="mr-2 flex-shrink-0" />
                      ) : status.toLowerCase().includes('completed') || status.toLowerCase().includes('success') ? (
                        <Check size={14} className="mr-2 flex-shrink-0" />
                      ) : (
                        <Clock size={14} className="mr-2 flex-shrink-0" />
                      )}
                      <span>{status}</span>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* tips moved into compact hover tooltip next to Download button */}
          </div>

          <div className="bg-gray-800/50 backdrop-blur-lg rounded-lg shadow-xl p-4 h-full">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
              <Download size={18} className="mr-2 text-primary" />
              Active Downloads
            </h3>
            {cards.length === 0 ? (
              <div className="text-sm text-gray-400 p-6 border border-dashed border-gray-600/60 rounded-lg bg-gray-900/30 backdrop-blur-sm text-center shadow-inner">
                No active downloads yet — started downloads will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {cards.map(c => (
                  <DownloadCard 
                    key={c.id}
                    id={c.id}
                    url={c.url} 
                    filename={c.filename} 
                    destination={c.destination} 
                    sessionId={c.sessionId} 
                    scriptName={c.scriptName} 
                    isScrape={c.isScrape}
                    progressData={progressMap[c.url]} 
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* History tab content */
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-white flex items-center">
              <History size={18} className="mr-2 text-primary" />
              Download History
            </h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={loadHistory}
              disabled={historyLoading}
            >
              <RefreshCw size={14} className="mr-2" />
              Refresh
            </Button>
          </div>
          
          {historyLoading ? (
            <div className="text-gray-400 p-4 text-center">Loading history...</div>
          ) : historyItems.length === 0 ? (
            <div className="text-gray-400 p-4 border border-dashed border-gray-600/60 rounded-lg glass text-center shadow-inner">
              No download history yet.
            </div>
          ) : (
            <div className="space-y-3">
              {historyItems.map((h) => (
                <div key={h.session_id} className="glass p-4 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white break-all">{h.title}</div>
                    <div className="text-xs text-gray-400">{h.subtitle}</div>
                    <div className="text-xs text-gray-500 mt-1">{h.total_size} • {formatDate(h.created_at)}</div>
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
                        setHistoryItems(prev => prev.filter(x => x.session_id !== h.session_id));
                      } catch (e) {
                        // ignore
                      }
                    }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showScriptPicker && scriptChoices && (
        <ScriptPickerDialog
          isOpen={showScriptPicker}
          onClose={() => { setShowScriptPicker(false); setScriptChoices(null); }}
          scripts={scriptChoices}
          inputUrl={url}
          onPick={async (script) => {
            setShowScriptPicker(false);
            ;(window as any).__icnxDestination = destination;
            ;(window as any).__icnxHasActiveSession = true;
            ;(window as any).__icnxForceNewScrape = true;
            ;(window as any).__icnxActive = { kind: 'scrape', url: url.trim() };
            window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
            // create an overview card for the scrape and start the scraper in background
              const cardId = crypto.randomUUID();
              const newCard = { id: cardId, url: url.trim(), filename: undefined, destination, isScrape: true, scriptName: script.name };
              setCards((prev) => { 
                const filtered = prev.filter((c) => !(c.isScrape && c.url === newCard.url));
                const next = [...filtered, newCard]; 
                try { (window as any).__icnxOverviewCards = next; } catch(_){}
                return next; 
              });
              (async () => {
              try {
                (window as any).__icnxCurrentScrapeKey = `${script.name}::${url.trim()}`;
                await invoke('run_script', { scriptName: script.name, options: { inputUrl: url.trim(), maxPages: 10 } });
              } catch (err) {
                console.error('failed to start scraper', err);
              }
            })();
          }}
        />
      )}
      
      {showScrapeDialog && scrapeItems && (
        <ScrapeResultsDialog
          isOpen={showScrapeDialog}
          onClose={() => setShowScrapeDialog(false)}
          items={scrapeItems}
          onConfirm={async (selected) => {
            setShowScrapeDialog(false);
            if (!selected || selected.length === 0) return;
            // create an overview card and start a backend download session for the selected items
            const cardId = crypto.randomUUID();
            setCards((prev) => [...prev, { id: cardId, url: selected[0].url, filename: selected[0].filename, destination, isScrape: false }]);
            (async () => {
              try {
                const sid = await invoke<string>('start_download_session', { items: selected.map(s => ({ url: s.url, filename: s.filename, title: s.title, type: s.type })), destination } as any);
                setCards((prev) => prev.map(c => c.id === cardId ? { ...c, sessionId: sid } : c));
                // Mark active session so Sidebar shows it
                try {
                  const g: any = window as any;
                  g.__icnxHasActiveSession = true;
                  g.__icnxCurrentSessionId = sid;
                  g.__icnxActive = { kind: 'download', url: selected[0].url };
                  window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
                } catch (_) {}
              } catch (err) {
                console.error('failed to start download session from scrape selection', err);
              }
            })();
          }}
        />
      )}

  {/* Download details dialog placeholder (stub implementation) */}
  <DownloadDetailsDialog isOpen={false} onClose={() => {}} />
    </div>
  );
}
