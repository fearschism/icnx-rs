import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Button } from '../components/ui/button';
import { Check, Pause, Play, FolderOpen, X } from 'lucide-react';
import { DownloadProgress, IcnxProgressSystem } from '../types';

type Props = {
  id?: string;
  url: string;
  filename?: string;
  destination: string;
  sessionId?: string | null;
  scriptName?: string | null;
  isScrape?: boolean;
  progressData?: DownloadProgress;
};

// Add types to Window
declare global {
  interface Window {
    __icnxProgressSystem?: IcnxProgressSystem;
    __icnxProgress?: Record<string, DownloadProgress>;
  }
}

export default function DownloadCard({ 
  id, 
  url, 
  filename, 
  destination, 
  sessionId, 
  scriptName, 
  isScrape,
  progressData
}: Props) {
  const [status, setStatus] = useState<string>(isScrape ? 'Scraping' : 'Queued');
  const [progress, setProgress] = useState<number | null>(null);
  const [statistics, setStatistics] = useState<{
    downloaded: number;
    skipped: number;
    failed: number;
  }>({ downloaded: 0, skipped: 0, failed: 0 });
  
  // Connect to global progress system
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    let unsubscribe: (() => void) | undefined;
    
    // Connect to global progress system if available
    if (window.__icnxProgressSystem) {
      // Get initial progress data
      const initialData = window.__icnxProgressSystem.getProgress(url);
      if (initialData) {
        setStatus(initialData.status || 'Downloading');
        setProgress(typeof initialData.progress === 'number' 
          ? Math.round((initialData.progress || 0) * 100) 
          : null);
        setStatistics({
          downloaded: initialData.items_downloaded || 0,
          skipped: initialData.items_skipped || 0,
          failed: initialData.items_failed || 0
        });
      }
      
      // Subscribe to progress updates
      unsubscribe = window.__icnxProgressSystem.addSubscriber((updatedUrl, data) => {
        if (updatedUrl === url) {
          setStatus(data.status || 'Downloading');
          setProgress(typeof data.progress === 'number' 
            ? Math.round((data.progress || 0) * 100) 
            : null);
          setStatistics({
            downloaded: data.items_downloaded || 0,
            skipped: data.items_skipped || 0,
            failed: data.items_failed || 0
          });
        }
      });
    } else {
      // Legacy fallback - check for DOM stored progress
      try {
        const progressEl = document.getElementById(`icnx-progress-${btoa(url).replace(/=/g, '')}`);
        if (progressEl && progressEl.dataset.progress) {
          const data = JSON.parse(progressEl.dataset.progress);
          setStatus(data.status || 'Downloading');
          setProgress(typeof data.progress === 'number' 
            ? Math.round((data.progress || 0) * 100) 
            : null);
        }
      } catch (e) {
        console.error('Error reading progress from DOM', e);
      }
    }
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [url]);

  // Handle progress data updates from parent component
  useEffect(() => {
    if (progressData && progressData.url === url) {
      setStatus(progressData.status || 'Downloading');
      setProgress(typeof progressData.progress === 'number' 
        ? Math.round((progressData.progress || 0) * 100) 
        : null);
      setStatistics({
        downloaded: progressData.items_downloaded || 0,
        skipped: progressData.items_skipped || 0,
        failed: progressData.items_failed || 0
      });
    }
  }, [progressData, url]);

  useEffect(() => {
    // If a global progress feeder/system exists, rely on it; do not attach per-card Tauri listeners
    if (typeof window !== 'undefined' && (window as any).__icnxProgressSystem) {
      return;
    }
    let mounted = true;
    (async () => {
      // On mount, hydrate status from the global in-memory scrape store if present.
      try {
        const g: any = window as any;
        const myKey = scriptName && url ? `${scriptName}::${url}` : undefined;
        const store = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
        if (myKey && store[myKey]) {
          const entry = store[myKey];
          if (entry.done) setStatus('Ready');
          else if (entry.status) {
            const count = Array.isArray(entry.items) ? entry.items.length : 0;
            setStatus(`${entry.status} · ${count} items`);
          }
        }
        
        // Also check global progress system if it wasn't checked in the other effect
        if (!window.__icnxProgressSystem && window.__icnxProgress && window.__icnxProgress[url]) {
          const data = window.__icnxProgress[url];
          setStatus(data.status || 'Downloading');
          setProgress(typeof data.progress === 'number' 
            ? Math.round((data.progress || 0) * 100) 
            : null);
        }
      } catch (_) {}

      // Set up event listeners for status updates
      const { listen } = await import('@tauri-apps/api/event');
      const unProgress = await listen<any>('download_progress', (e) => {
        try {
          if (!mounted) return;
          const p = e.payload as any;
          if (p.url === url) {
            // Use same status/progress update logic
            const isCompleted = p.status === 'completed' || p.progress === 1;
            setStatus(isCompleted ? 'Completed' : (p.status || 'Downloading'));
            setProgress(isCompleted ? 100 : (typeof p.progress === 'number' ? Math.round((p.progress || 0) * 100) : null));
            
            // Update the global progress system if available
            if (window.__icnxProgressSystem) {
              const current = window.__icnxProgressSystem.getProgress(url);
              window.__icnxProgressSystem.updateProgress(url, {
                progress: isCompleted ? 1 : (p.progress || 0),
                downloaded: p.downloaded || 0,
                total: p.total || null,
                speed: p.speed || 0,
                eta: p.eta || null,
                status: isCompleted ? 'completed' : (p.status || 'downloading'),
                url: url,
                filename: p.filename || filename || '',
                error: p.error,
                items_downloaded: p.items_downloaded || current?.items_downloaded || 0,
                items_skipped: p.items_skipped || current?.items_skipped || 0,
                items_failed: p.items_failed || current?.items_failed || 0
              });
            }
          }
        } catch (_) {}
      });

      const unStarted = await listen<any>('download_item_started', (e) => { 
        if (mounted && e.payload?.url === url) {
          setStatus('Downloading');
          
          try {
            // Show info toast
            window.dispatchEvent(new CustomEvent('icnx:toast', { 
              detail: { 
                type: 'info', 
                message: `Starting download: ${filename || new URL(url).pathname.split('/').pop() || 'file'}` 
              } 
            }));
          } catch (_) {}
          
          // Update global progress system
          if (window.__icnxProgressSystem) {
            const current = window.__icnxProgressSystem.getProgress(url) || {
              progress: 0,
              downloaded: 0,
              total: undefined,
              speed: 0,
              eta: undefined,
              status: 'downloading',
              url: url,
              filename: filename || '',
              items_downloaded: 0,
              items_skipped: 0,
              items_failed: 0
            };
            
            window.__icnxProgressSystem.updateProgress(url, {
              ...current,
              status: 'downloading'
            });
          }
        } 
      });
      
      const unCompleted = await listen<any>('download_item_completed', (e) => { 
        if (mounted && e.payload?.url === url) { 
          setStatus('Completed'); 
          setProgress(100);
          try {
            // Show success toast
            window.dispatchEvent(new CustomEvent('icnx:toast', { 
              detail: { 
                type: 'success', 
                message: `Downloaded: ${filename || new URL(url).pathname.split('/').pop() || 'file'}` 
              } 
            }));
            
            // notify parent lists so they can auto-close cards if desired
            const ev = new CustomEvent('icnx:download-card-completed', { detail: { id, url } });
            window.dispatchEvent(ev);
            // also dispatch a simple URL-based completion event
            window.dispatchEvent(new CustomEvent('icnx:download-url-completed', { detail: { url } }));
          } catch (_) {}
          
          // Update global progress system
          if (window.__icnxProgressSystem) {
            const current = window.__icnxProgressSystem.getProgress(url) || {
              progress: 1,
              downloaded: e.payload?.downloaded || 0,
              total: e.payload?.total || undefined,
              speed: 0,
              eta: undefined,
              status: 'completed',
              url: url,
              filename: filename || e.payload?.filename || '',
              items_downloaded: 0,
              items_skipped: 0,
              items_failed: 0
            };
            
            window.__icnxProgressSystem.updateProgress(url, {
              ...current,
              progress: 1,
              status: 'completed',
              items_downloaded: e.payload?.items_downloaded || current.items_downloaded || 1,
              items_skipped: e.payload?.items_skipped || current.items_skipped || 0,
              items_failed: e.payload?.items_failed || current.items_failed || 0
            });
          }
        } 
      });
      
      const unError = await listen<any>('download_item_error', (e) => { 
        if (mounted && e.payload?.url === url) {
          setStatus('Failed');
          
          try {
            // Show error toast
            window.dispatchEvent(new CustomEvent('icnx:toast', { 
              detail: { 
                type: 'error', 
                message: `Download failed: ${filename || new URL(url).pathname.split('/').pop() || 'file'} - ${e.payload?.error || 'Unknown error'}` 
              } 
            }));
          } catch (_) {}
          
          // Update global progress system
          if (window.__icnxProgressSystem) {
            const current = window.__icnxProgressSystem.getProgress(url) || {
              progress: 0,
              downloaded: 0,
              total: undefined,
              speed: 0,
              eta: undefined,
              status: 'failed',
              url: url,
              filename: filename || '',
              error: e.payload?.error || 'Unknown error',
              items_downloaded: 0,
              items_skipped: 0,
              items_failed: 0
            };
            
            window.__icnxProgressSystem.updateProgress(url, {
              ...current,
              status: 'failed',
              error: e.payload?.error || 'Unknown error',
              items_failed: (current.items_failed || 0) + 1
            });
          }
        }
      });

      // Listen for scrape-store updates which App.tsx uses to buffer scrape results while pages mount/unmount
      const unScrapeStore = await listen<any>('icnx:scrape-store-updated', (e) => {
        try {
          if (!mounted) return;
          const key = e.payload && e.payload.key ? e.payload.key : undefined;
          if (!isScrape || !scriptName || !key) return;
          const myKey = `${scriptName}::${url}`;
          if (String(key) !== myKey) return;
          const g: any = window as any;
          const store = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
          const entry = store[myKey] || {};
          if (entry.done) {
            setStatus('Ready');
          } else if (entry.status) {
            setStatus(entry.status);
          } else {
            setStatus('Scraping');
          }
        } catch (_) {}
      });

      // App.tsx dispatches a DOM CustomEvent 'icnx:scrape-store-updated' when it updates the in-memory scrape store.
      // The Tauri `listen` above listens to backend events; add a DOM listener so overview cards update promptly.
      const domHandler = (ev: any) => {
        try {
          if (!mounted) return;
          const detail = ev && ev.detail ? ev.detail : undefined;
          const key = detail && detail.key ? detail.key : undefined;
          if (!isScrape || !scriptName || !key) return;
          const myKey = `${scriptName}::${url}`;
          if (String(key) !== myKey) return;
          const g: any = window as any;
          const store = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
          const entry = store[myKey] || {};
          const count = Array.isArray(entry.items) ? entry.items.length : 0;
          if (entry.done) {
            setStatus('Ready');
          } else if (entry.status) {
            setStatus(`${entry.status} · ${count} items`);
          } else {
            setStatus(`Scraping · ${count} items`);
          }
        } catch (_) {}
      };
      try { window.addEventListener('icnx:scrape-store-updated', domHandler as any); } catch(_) {}

      return () => {
        mounted = false;
        try { (unProgress as any)(); } catch(_) {}
        try { (unStarted as any)(); } catch(_) {}
        try { (unCompleted as any)(); } catch(_) {}
        try { (unError as any)(); } catch(_) {}
  try { (unScrapeStore as any)(); } catch(_) {}
  try { window.removeEventListener('icnx:scrape-store-updated', domHandler as any); } catch(_) {}
      };
    })();
  }, [url, isScrape, scriptName]);

  // keep overview cards in sync so QuickDownload can reload them when remounted
  useEffect(() => {
    const upd = () => {
      try {
        const g: any = window as any;
        const arr = (g.__icnxOverviewCards = g.__icnxOverviewCards || []);
        if (!id) return;
        const idx = arr.findIndex((x: any) => x.id === id);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], status, progress, sessionId };
        }
      } catch (_) {}
    };
    upd();
  }, [id, status, progress, sessionId]);

  const handleClick = async () => {
    if (isScrape && scriptName) {
      // If this scrape is already Ready (or persisted as done), perform the same
      // safe hydration that handleContinue does so ScrapeSession won't re-run.
      try {
        const g: any = window as any;
        const myKey = `${scriptName}::${url}`;
        const store = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
        const entry = store[myKey] || {};
        if (entry.done || status === 'Ready') {
          (window as any).__icnxSkipScrapeStart = true;
          (window as any).__icnxCurrentScrapeKey = myKey;
          // ensure we have items; if not, try to read persisted session
          if (!Array.isArray(entry.items) || entry.items.length === 0) {
            try {
              const resp: any = await invoke('read_scrape_session', { session_key: myKey } as any);
              if (resp && Array.isArray(resp.items) && resp.items.length > 0) {
                store[myKey] = { ...(entry || {}), items: resp.items, selected: resp.selected || [], dir: resp.dir, done: !!resp.done, status: resp.status || 'Ready' };
              } else {
                store[myKey] = { ...(entry || {}), items: entry.items || [], done: true, status: entry.status || 'Ready' };
              }
            } catch (_) {
              store[myKey] = { ...(entry || {}), items: entry.items || [], done: true, status: entry.status || 'Ready' };
            }
          }
          // Write snapshot to temp store that ScrapeSession will check on mount
          try {
            const gAny: any = window as any;
            const snap = { ...(store[myKey] || {}), done: true, status: 'Ready' };
            const tempStore = (gAny.__icnxTempScrapeSnapshots = gAny.__icnxTempScrapeSnapshots || {});
            tempStore[myKey] = snap;
            console.debug('DownloadCard: wrote temp snapshot before navigation', { key: myKey, items: Array.isArray(snap?.items) ? snap.items.length : 0 });
          } catch (_) {}
          
          (window as any).__icnxActive = { kind: 'scrape', url };
          window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
          window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'scrape-session', scriptName, inputUrl: url } }));
          return;
        }
      } catch (_) {}

      // otherwise navigate into a live scrape session (will start if not started)
      const g2: any = window as any;
      g2.__icnxCurrentScrapeKey = `${scriptName}::${url}`;
      g2.__icnxHasActiveSession = true;
      g2.__icnxActive = { kind: 'scrape', url };
      window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'scrape-session', scriptName, inputUrl: url } }));
      return;
    }

    if (sessionId) {
      try { (window as any).__icnxCurrentSessionId = sessionId; (window as any).__icnxHasActiveSession = true; } catch(_) {}
      // Instead of navigating to the download-session page, surface a toast and keep overview card state.
      window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: 'Resumed download session' } }));
      return;
    }

    try {
      // Start a download session immediately for this single item
      const payload = { items: [{ url, filename }], destination } as any;
      const sid = await invoke<string>('start_download_session', payload as any);
      try { (window as any).__icnxCurrentSessionId = sid; (window as any).__icnxHasActiveSession = true; } catch(_) {}
      // update overview card if present
      try { const g: any = window as any; const arr = (g.__icnxOverviewCards = g.__icnxOverviewCards || []); const idx = arr.findIndex((x: any) => x.url === url || x.id === sessionId); if (idx >= 0) arr[idx] = { ...arr[idx], sessionId: sid, status: 'Queued' }; } catch(_) {}
      window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'success', message: 'Download started' } }));
    } catch (err) {
      console.error('Failed to open download session for', url, err);
      window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'error', message: 'Failed to start download' } }));
    }
  };

  const handleContinue = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isScrape || !scriptName) return;
    try {
      // signal to the ScrapeSession that it should NOT start a new run on mount
      // because we're resuming an existing scrape that is already Ready.
      (window as any).__icnxSkipScrapeStart = true;
      (window as any).__icnxCurrentScrapeKey = `${scriptName}::${url}`;
      const g: any = window as any;
      const myKey = `${scriptName}::${url}`;
      const store = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
      let entry = store[myKey] || {};
      // If there are no items in the in-memory store, try to load the persisted scrape from the backend
      if (!Array.isArray(entry.items) || entry.items.length === 0) {
        try {
          const resp: any = await invoke('read_scrape_session', { session_key: myKey } as any);
          if (resp && Array.isArray(resp.items) && resp.items.length > 0) {
            entry = { ...(entry || {}), items: resp.items, selected: resp.selected || [], dir: resp.dir, done: !!resp.done, status: resp.status || 'Ready' };
            store[myKey] = entry;
          } else {
            // ensure we still mark done so ScrapeSession won't attempt to run
            entry = { ...(entry || {}), items: entry.items || [], done: true, status: entry.status || 'Ready' };
            store[myKey] = entry;
          }
        } catch (err) {
          // if backend read fails, fall back to marking done (best-effort)
          entry = { ...(entry || {}), items: entry.items || [], done: true, status: entry.status || 'Ready' };
          store[myKey] = entry;
        }
      } else {
        // ensure mark done/status
        entry.done = true;
        entry.status = entry.status || 'Ready';
        store[myKey] = entry;
      }
      // debug: record store snapshot size so ScrapeSession can validate
      try { console.debug('DownloadCard: handleContinue store snapshot', { key: myKey, items: Array.isArray(store[myKey]?.items) ? store[myKey].items.length : 0 }); } catch (_) {}
      // Write snapshot to temp store that ScrapeSession will check on mount
      try {
        const gAny: any = window as any;
        const snap = { ...(store[myKey] || {}), done: true, status: 'Ready' };
        const tempStore = (gAny.__icnxTempScrapeSnapshots = gAny.__icnxTempScrapeSnapshots || {});
        tempStore[myKey] = snap;
        console.debug('DownloadCard: wrote temp snapshot before navigation', { key: myKey, items: Array.isArray(snap?.items) ? snap.items.length : 0 });
      } catch (_) {}

      (window as any).__icnxActive = { kind: 'scrape', url };
      window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
      window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'scrape-session', scriptName, inputUrl: url } }));
    } catch (_) {}
  };

  const badgeColor = status === 'Failed' ? 'text-red-400' : status === 'Completed' ? 'text-emerald-300' : 'text-yellow-300';
  const [justReady, setJustReady] = useState(false);

  useEffect(() => {
    if (status === 'Ready') {
      setJustReady(true);
      const t = setTimeout(() => setJustReady(false), 900);
      return () => clearTimeout(t);
    }
    return;
  }, [status]);

  // Defensive labels to avoid runtime errors if props are missing during HMR/mount
  const displayTitle = (typeof filename === 'string' && filename.trim().length > 0)
    ? filename
    : (typeof url === 'string' && url.trim().length > 0 ? url : '');
  const displayInitial = (displayTitle || '•').toString().slice(0, 1).toUpperCase();

  return (
    <div onClick={handleClick} className="relative cursor-pointer rounded-md glass hover:shadow-lg transition-shadow w-full">
      {/* Tiny controls bar (icon-only) */}
      <div className="absolute top-1 right-1 flex items-center gap-1 bg-black/30 backdrop-blur-sm rounded-md px-1 py-0.5 z-10">
        {/* Pause/Resume toggle */}
        <button
          title={(status || '').toLowerCase() === 'paused' ? 'Resume' : 'Pause'}
          onClick={(e) => {
            e.stopPropagation();
            if (!sessionId) return;
            const s = (status || '').toLowerCase();
            const isPaused = s === 'paused';
            if (isPaused) {
              invoke('resume_download_session', { sessionId });
              setStatus('Downloading');
            } else if (!['completed','failed','cancelled'].includes(s)) {
              invoke('pause_download_session', { sessionId });
              setStatus('Paused'); // use capitalized for UI; backend may emit lowercase
            }
          }}
          className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded transition-colors"
        >
          {(status || '').toLowerCase() === 'paused' ? <Play size={12} /> : <Pause size={12} />}
        </button>
        {/* Open folder */}
        <button
          title="Open folder"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              // Prefer opening the destination directory; if a filename exists, ensure directory path
              let target = destination;
              try {
                if (filename && destination) {
                  // If destination already ends with filename, strip it
                  if (destination.endsWith(filename)) {
                    target = destination.slice(0, destination.length - filename.length).replace(/\/$/, '');
                  }
                }
              } catch(_) {}
              const { open } = await import('@tauri-apps/api/shell');
              await open(target);
            } catch (_) {}
          }}
          className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/10 rounded transition-colors"
        >
          <FolderOpen size={12} />
        </button>
        {/* Cancel / Delete */}
        <button
          title="Cancel"
          onClick={(e) => {
            e.stopPropagation();
            if (!sessionId) return; // only cancel started sessions
            // Prefer force cancel (stronger logging & cleanup) with graceful fallback
            const doCancel = async () => {
              try {
                await invoke('force_cancel_download_session', { sessionId });
              } catch (_) {
                try { await invoke('cancel_download_session', { sessionId }); } catch(_) {}
              }
            };
            doCancel().then(() => {
              setStatus('Cancelled');
              
              try {
                // Show cancellation toast
                window.dispatchEvent(new CustomEvent('icnx:toast', { 
                  detail: { 
                    type: 'info', 
                    message: `Download cancelled: ${filename || new URL(url).pathname.split('/').pop() || 'file'}` 
                  } 
                }));
              } catch (_) {}
              
              // Update global progress system so other components reflect cancellation
              try {
                if (window.__icnxProgressSystem) {
                  const cur = window.__icnxProgressSystem.getProgress(url) || { url, filename: filename || '', progress: 0, downloaded: 0, total: undefined, speed: 0, eta: undefined, status: 'cancelled' } as any;
                  window.__icnxProgressSystem.updateProgress(url, { ...cur, status: 'cancelled' });
                }
              } catch(_) {}
              // If this session was the globally tracked active session, clear it so Sidebar updates
              try {
                const g: any = window as any;
                if (g.__icnxCurrentSessionId === sessionId) {
                  g.__icnxHasActiveSession = false;
                  g.__icnxCurrentSessionId = undefined;
                  g.__icnxActive = undefined;
                  window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
                }
              } catch(_) {}
              // Dispatch a removal event so parent lists (QuickDownload/sidebar) can prune the card
              try { window.dispatchEvent(new CustomEvent('icnx:download-card-remove', { detail: { sessionId, url } })); } catch(_) {}
            });
          }}
          className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      <div className="flex items-start w-full">
        <div className="w-10 h-10 m-3 rounded-md bg-gradient-to-br from-sky-600 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold">{displayInitial}</div>
        <div className="flex-1 min-w-0 py-3 pr-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center min-w-0 gap-2">
              <div className="text-sm text-white truncate font-medium">{displayTitle || 'Download'}</div>
              <div className={`text-xs ${badgeColor} flex items-center gap-1 shrink-0`}>
                <span className="opacity-70">•</span>
                <span className="truncate max-w-[6rem] sm:max-w-[10rem]" title={status}>{status}</span>
                {justReady && (
                  <span className="inline-flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full shadow-md animate-pop">
                    <Check size={10} color="white" />
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isScrape && (
                <Button size="sm" variant="secondary" onClick={handleContinue} className="h-6 text-xs py-0">Continue</Button>
              )}
            </div>
          </div>
          <div className="text-xs text-gray-400 truncate">{destination}</div>
          {/* Download Statistics */}
          {(statistics.downloaded > 0 || statistics.skipped > 0 || statistics.failed > 0) && (
            <div className="flex items-center gap-3 mt-1 text-xs">
              {statistics.downloaded > 0 && (
                <span className="text-green-400">
                  ✓ {statistics.downloaded} downloaded
                </span>
              )}
              {statistics.skipped > 0 && (
                <span className="text-yellow-400">
                  ⊘ {statistics.skipped} skipped
                </span>
              )}
              {statistics.failed > 0 && (
                <span className="text-red-400">
                  ✗ {statistics.failed} failed
                </span>
              )}
            </div>
          )}
          <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden w-full">
            <div className="h-full bg-green-500" style={{ width: progress ? `${progress}%` : '4%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
