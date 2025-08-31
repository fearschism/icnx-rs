import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import type { DownloadProgress } from '../types';

type Item = { url: string; filename?: string; title?: string; type?: string };

export default function DownloadSession({ items, destination, started, onStarted, onBack }: { items: Item[]; destination: string; started?: boolean; onStarted?: () => void; onBack: () => void }) {
  const [progressMap, setProgressMap] = useState<Record<string, DownloadProgress | undefined>>(() => {
    const g: any = window as any;
    return (g.__icnxProgress && typeof g.__icnxProgress === 'object') ? { ...(g.__icnxProgress as any) } : {};
  });
  // keep a stable map of seen URLs to prevent resetting rows to 0% on remount
  const seenUrlsRef = useRef<Set<string>>(new Set(Object.keys(progressMap)));
  const [status, setStatus] = useState('');
  // reactive session state (keep in React state instead of reading window directly in render)
  const [hasActiveSession, setHasActiveSession] = useState<boolean>(() => !!((window as any).__icnxHasActiveSession));
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(() => (window as any).__icnxCurrentSessionId);
  
  const syncSessionFromWindow = useCallback(() => {
    const g: any = window as any;
    setHasActiveSession(!!g.__icnxHasActiveSession);
    setCurrentSessionId(g.__icnxCurrentSessionId);
  }, []);
  const uniqueItems = useMemo(() => {
    const seen: Record<string, boolean> = {};
    const out: Item[] = [];
    for (const it of items) {
      if (!seen[it.url]) { seen[it.url] = true; out.push(it); }
    }
    return out;
  }, [items]);
  const queueRef = useRef(uniqueItems);
  useEffect(() => { queueRef.current = uniqueItems; }, [uniqueItems]);
  const runningRef = useRef(false);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    // listen for a few more session lifecycle events so the UI stays in sync
    const evs = [
      'download_item_queued',
      'download_item_started',
      'download_item_response',
      'download_item_error',
      'download_item_completed',
      'download_session_started',
      'download_session_finished',
      'download_session_cleanup',
      'download_session_purged',
      'download_session_paused',
      'download_session_resumed',
      'download_session_cancelled'
    ];

    (async () => {
      try {
        for (const ev of evs) {
          const un = await listen<any>(ev, (e) => {
            try {
              if (ev === 'download_item_queued') {
                setStatus(`Queued: ${e.payload.url}`);
              } else if (ev === 'download_item_started') {
                setStatus(`Started: ${e.payload.url}`);
              } else if (ev === 'download_item_response') {
                setStatus(`Response: ${e.payload.url} ${e.payload.status}`);
              } else if (ev === 'download_item_error') {
                setStatus(`Error: ${e.payload.url} ${e.payload.error}`);
                window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'error', message: `Download failed: ${e.payload.url}` } }));
              } else if (ev === 'download_item_completed') {
                setStatus(`Completed: ${e.payload.url}`);
              } else if (ev === 'download_session_started') {
                setStatus(`Session started (${e.payload.count} items)`);
                // mark active session and store session id
                const sid = e.payload && (e.payload.session_id || e.payload.sessionId || e.payload.session) ? (e.payload.session_id || e.payload.sessionId || e.payload.session) : undefined;
                try { (window as any).__icnxHasActiveSession = true; setHasActiveSession(true); } catch(_) {}
                if (sid) {
                  try { (window as any).__icnxCurrentSessionId = sid; } catch(_) {}
                  setCurrentSessionId(sid);
                }
              } else if (ev === 'download_session_finished') {
                setStatus(`Session finished`);
                // mark that the session finished and prevent closing until user reviews summary
                setSessionFinished(true);
                setCanCloseSession(false);
                try {
                  const g: any = window as any;
                  try { g.__icnxSessionFinished = true; } catch(_) {}
                  g.__icnxDownloadRunActive = false;
                  // show toast
                  window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'success', message: 'Download session finished.' } }));
                  // Hydrate authoritative progress from DB (read_download_session) with retries to catch last enqueued writes
                  (async () => {
                    try {
                      const sid = (e.payload && (e.payload.session_id || e.payload.sessionId || e.payload.session)) ? (e.payload.session_id || e.payload.sessionId || e.payload.session) : (window as any).__icnxCurrentSessionId || currentSessionId;
                      if (!sid) return;
                      let rows: any[] = [];
                      // retry loop: try up to 5 times with short delays to wait for writer to flush
                      for (let attempt = 0; attempt < 5; attempt++) {
                        try {
                          const res = await invoke('read_download_session', { session_id: sid, destination });
                          rows = (res as any)?.rows || [];
                          if (rows.length > 0) break;
                        } catch (_) {}
                        await new Promise(r => setTimeout(r, 120));
                      }

                      const store: Record<string, any> = {};
                      for (const r of rows) {
                        store[r.url] = {
                          progress: r.progress ?? 0,
                          downloaded: r.downloaded ?? 0,
                          total: r.total ?? null,
                          speed: r.speed ?? 0,
                          eta: r.eta ?? null,
                          status: r.status ?? 'unknown',
                          url: r.url,
                          filename: r.filename ?? undefined,
                          error: r.error ?? undefined,
                        };
                      }
                      // compute failed items from DB-derived store
                      const failed: Item[] = [];
                      for (const Ui of (items || [])) {
                        const p = store[Ui.url];
                        if (p && p.error) { failed.push({ url: Ui.url, filename: Ui.filename, title: Ui.title, type: Ui.type }); continue; }
                        const statusStr = p && p.status ? String(p.status).toLowerCase() : '';
                        if (statusStr && /(error|failed|cancel|cancelled)/.test(statusStr)) { failed.push({ url: Ui.url, filename: Ui.filename, title: Ui.title, type: Ui.type }); continue; }
                        if (!p) continue;
                        if ((p.progress || 0) < 1 && !/paused|queued|waiting|download/i.test(statusStr)) { failed.push({ url: Ui.url, filename: Ui.filename, title: Ui.title, type: Ui.type }); }
                      }
                      setFailedItems(failed);
                      // set authoritative progress map
                      setProgressMap(store);
                      // ensure seen urls updated
                      try { Object.keys(store).forEach(u => seenUrlsRef.current.add(u)); } catch(_) {}
                      setIsPaused(false);
                      setHasActiveSession(true);
                      setCurrentSessionId((window as any).__icnxCurrentSessionId || sid);
                    } catch (err) {
                      console.error('session finish handler DB hydrate error', err);
                    }
                  })();
                } catch (err) { console.error('session finish handler error', err); }
              } else if (ev === 'download_session_cleanup') {
                  // Backend signaled it's safe to clear shared caches for this session
                  try {
                    const sid = e.payload && (e.payload.session_id || e.payload.sessionId) ? (e.payload.session_id || e.payload.sessionId) : undefined;
                    if (sid && currentSessionId && sid !== currentSessionId) {
                      // not for this session
                    } else {
                      try { const g: any = window as any; delete g.__icnxProgress; } catch(_) {}
                      try { setProgressMap(prev => ({ ...prev })); } catch(_) {}
                      try { window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: 'Session cleanup completed' } })); } catch(_) {}
                    }
                  } catch (err) { console.error('cleanup handler error', err); }
              } else if (ev === 'download_session_purged') {
                  // Session was purged server-side; if it matches current session, clear UI and navigate away
                  try {
                    const sid = e.payload && (e.payload.session_id || e.payload.sessionId) ? (e.payload.session_id || e.payload.sessionId) : undefined;
                    if (!sid || (currentSessionId && sid === currentSessionId) || !currentSessionId) {
                      try {
                        const g: any = window as any;
                        g.__icnxHasActiveSession = false;
                        g.__icnxCurrentSessionId = undefined;
                        g.__icnxSession = undefined;
                        g.__icnxSessionFinished = false;
                        g.__icnxActive = undefined;
                        g.__icnxSessionBadge = undefined;
                      } catch(_) {}
                      try { setProgressMap({}); } catch(_) {}
                      try { setSummaryOpen(false); setCanCloseSession(true); setSessionFinished(false); } catch(_) {}
                      try { window.dispatchEvent(new CustomEvent('icnx:active-session-updated')); } catch(_) {}
                      try { window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: 'Session purged' } })); } catch(_) {}
                      try { window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'quick' } })); } catch(_) {}
                    }
                  } catch (err) { console.error('purged handler error', err); }
               } else if (ev === 'download_session_paused') {
                setIsPaused(true);
                setStatus('Session paused');
                setHasActiveSession(true);
                // clear pending pause timeout and flag
                try { if (pauseTimeoutRef.current) { window.clearTimeout(pauseTimeoutRef.current as any); pauseTimeoutRef.current = null; } } catch(_) {}
                setPauseRequestInFlight(false);
                // show a gentle info toast on actual paused event
                try { window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: 'Session paused' } })); } catch(_) {}
              } else if (ev === 'download_item_paused') {
                try {
                  const url = e.payload && (e.payload.url || e.payload.u || e.payload.item_url) ? (e.payload.url || e.payload.u || e.payload.item_url) : undefined;
                  if (url) {
                    setProgressMap(prev => {
                      const cur = prev || {};
                      const existing = cur[url] || {} as any;
                      return { ...cur, [url]: { ...existing, status: 'paused' } };
                    });
                  }
                } catch(_) {}
              } else if (ev === 'download_item_resumed') {
                try {
                  const url = e.payload && (e.payload.url || e.payload.u || e.payload.item_url) ? (e.payload.url || e.payload.u || e.payload.item_url) : undefined;
                  if (url) {
                    setProgressMap(prev => {
                      const cur = prev || {};
                      const existing = cur[url] || {} as any;
                      return { ...cur, [url]: { ...existing, status: 'downloading' } };
                    });
                  }
                } catch(_) {}
              } else if (ev === 'download_session_resumed') {
                setIsPaused(false);
                setStatus('Session resumed');
                setHasActiveSession(true);
                try { window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'success', message: 'Session resumed' } })); } catch(_) {}
              } else if (ev === 'download_session_cancelled') {
                setIsPaused(false);
                setHasActiveSession(false);
                setStatus('Session cancelled');
                setCurrentSessionId(undefined);
              }
            } catch (err) { console.error('event handler error', err); }
          });
          // `un` is an UnlistenFn
          unsubs.push(un as () => void);
        }
        // Mark listeners as ready so session starter won't race past event registration
        try { (window as any).__icnxListenersReady = true; } catch(_) {}
        // sync initial window session state into React
        syncSessionFromWindow();
      } catch (err) {
        console.error('Failed to register listeners', err);
      }
    })();

    return () => { for (const u of unsubs) { try { u(); } catch(_) {} } };
  }, [onBack, items, syncSessionFromWindow]);

  // Persist the session queue and destination globally so it restores when coming back
  useEffect(() => {
    (window as any).__icnxSession = { items, destination, started: !!started };
  }, [items, destination, started]);

  // Listen for download progress events and update local state so the progress bars render
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    (async () => {
      try {
        const un = await listen<any>('download_progress', (e) => {
          const payload = e.payload as any;
          setProgressMap((prev) => {
            const next = { ...(prev || {}), [payload.url]: payload };
            try { (window as any).__icnxProgress = next; } catch (_) {}
            try { (seenUrlsRef.current as Set<string>).add(payload.url); } catch(_) {}
            return next;
          });
        });
        unlistenFn = un as () => void;
      } catch (err) {
        console.error('failed to listen download_progress', err);
      }
    })();
    return () => { try { if (typeof unlistenFn === 'function') unlistenFn(); } catch(_) {} };
  }, []);

  useEffect(() => {
    let canceled = false;
    let pollHandle: any = null;
    const readDb = async () => {
      try {
        const sid = (window as any).__icnxCurrentSessionId || currentSessionId;
        if (!sid) return;
        console.log('ICNX: read DB for session', sid);
        const res = await invoke('read_download_session', { session_id: sid, destination });
        const rows = (res as any)?.rows || [];
        const next: Record<string, any> = {};
        for (const r of rows) {
          next[r.url] = {
            progress: r.progress ?? 0,
            downloaded: r.downloaded ?? 0,
            total: r.total ?? null,
            speed: r.speed ?? 0,
            eta: r.eta ?? null,
            status: r.status ?? 'unknown',
            url: r.url,
            filename: r.filename ?? undefined,
            error: r.error ?? undefined,
          };
        }
        if (!canceled) {
          // merge DB rows into existing progress so live events stay visible until DB catches up
          setProgressMap((prev) => {
            const merged = { ...(prev || {}), ...next };
            try { (window as any).__icnxProgress = merged; } catch (_) {}
            try { Object.keys(merged).forEach(u => (seenUrlsRef.current as Set<string>).add(u)); } catch(_) {}
            return merged;
          });
        }
      } catch (err) {
        console.error('failed to read_download_session', err);
      }
    };

    // initial read
    void readDb();
    // poll every 1s
    pollHandle = window.setInterval(() => void readDb(), 1000);

    return () => { canceled = true; try { if (pollHandle) window.clearInterval(pollHandle); } catch(_) {} };
  }, [destination, currentSessionId]);

  useEffect(() => {
    const run = async () => {
      const g: any = window as any;
      // Prevent duplicate runners across remounts/HMR
      if (g.__icnxDownloadRunActive) return;
      if (runningRef.current || started) return;
      // wait briefly for listeners to be ready to avoid missing finish events
      const waitStart = Date.now();
      while (!(window as any).__icnxListenersReady && (Date.now() - waitStart) < 1000) {
        await new Promise((r) => setTimeout(r, 25));
      }
      runningRef.current = true;
      g.__icnxDownloadRunActive = true;
      onStarted && onStarted();
      // persist started flag in session
      g.__icnxSession = { items, destination, started: true };

      // Start a backend session instead of sequentially invoking downloads
      try {
        const payload: any = { items: items.map(i => ({ url: i.url, filename: i.filename, title: i.title, type: i.type })), destination };
        // only include concurrency when explicitly provided
        if (typeof (undefined as any) !== 'undefined' && false) {
          // noop - keep shape stable when build-time value changes
        }
        const sessionId = await invoke<string>('start_download_session', payload as any);
        // store session id globally for pause/cancel controls and for other pages
        g.__icnxCurrentSessionId = sessionId;
        g.__icnxHasActiveSession = true;
        setCurrentSessionId(sessionId);
        setHasActiveSession(true);
        window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
      } catch (err) {
        console.error('Failed to start download session', err);
      }

      runningRef.current = false;
    };
    run();
  }, [destination, items, started]);

  const deriveFilename = (it: Item) => {
    if (it.filename && it.filename.trim().length > 0) return it.filename;
    try {
      const u = new URL(it.url);
      const name = u.pathname.split('/').pop() || 'download.bin';
      return name.includes('.') ? name : `${name}.bin`;
    } catch {
      return it.title || 'download.bin';
    }
  };

  // Pause / Resume / Cancel handlers
  const handlePause = async () => {
    const sid = currentSessionId;
    if (!sid) return;
    try {
      // invoke pause; UI will be updated via the download_session_paused event
      if (pauseRequestInFlight) return; // avoid duplicate
      setPauseRequestInFlight(true);
      // start a timeout to detect failure to pause (backend didn't emit paused)
      if (pauseTimeoutRef.current) { try { window.clearTimeout(pauseTimeoutRef.current as any); } catch(_) {} }
      pauseTimeoutRef.current = window.setTimeout(() => {
        // if still pending after 5s, consider pause failed and show a single error toast
        if (pauseRequestInFlight) {
          setPauseRequestInFlight(false);
          try { window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'error', message: 'Failed to pause session (no response)' } })); } catch(_) {}
        }
        pauseTimeoutRef.current = null;
      }, 5000);
      await invoke<boolean>('pause_download_session', { session_id: sid } as any);
    } catch (err) {
      console.error('pause failed', err);
      // clear pending and avoid immediate user-facing toast; let the timeout handler show an error if needed
      setPauseRequestInFlight(false);
      try { if (pauseTimeoutRef.current) { window.clearTimeout(pauseTimeoutRef.current as any); pauseTimeoutRef.current = null; } } catch(_) {}
    }
  };
  const handleResume = async () => {
    const sid = currentSessionId;
    if (!sid) return;
    try {
      // invoke resume; UI will be updated via the download_session_resumed event
      await invoke<boolean>('resume_download_session', { session_id: sid } as any);
    } catch (err) {
      console.error('resume failed', err);
      // suppress noisy error toast on resume; log for debugging
    }
  };
  const handleCancel = async () => {
    const sid = currentSessionId;
    if (!sid) return;
    try {
      const ok = await invoke<boolean>('cancel_download_session', { session_id: sid } as any);
      if (ok) {
        window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: 'Session cancelled' } }));
        // clear session id
        try { (window as any).__icnxCurrentSessionId = undefined; (window as any).__icnxHasActiveSession = false; } catch(_) {}
        setHasActiveSession(false);
        setCurrentSessionId(undefined);
      } else {
        window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'error', message: 'Failed to cancel session' } }));
      }
    } catch (err) {
      console.error('cancel failed', err);
      window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'error', message: 'Failed to cancel session' } }));
    }
  };

  // Retry helpers for single item or all failed items
  const retryItem = async (it: Item) => {
    try {
      await invoke<string>('start_download_session', { items: [{ url: it.url, filename: it.filename, title: it.title, type: it.type }], destination, concurrency: 1 } as any);
      window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: `Retry started for ${it.url}` } }));
    } catch (err) {
      console.error('retry failed', err);
      window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'error', message: 'Failed to start retry' } }));
    }
  };

  const retryFailedAll = async () => {
    if (!failedItems || failedItems.length === 0) return;
    try {
      await invoke<string>('start_download_session', { items: failedItems.map(f => ({ url: f.url, filename: f.filename, title: f.title, type: f.type })), destination, concurrency: 2 } as any);
      window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: `Retrying ${failedItems.length} failed items` } }));
      setSummaryOpen(false);
    } catch (err) {
      console.error('retry failed', err);
      window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'error', message: 'Failed to start retry for failed items' } }));
    }
  };

  const duplicateMap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items) {
      const name = deriveFilename(it);
      counts[name] = (counts[name] || 0) + 1;
    }
    return counts;
  }, [items]);

  // include the original items order but ensure stable keys by combining the item's url with its overall index
  const rows = useMemo(() => items.map((it, idx) => ({ it, idx, p: progressMap[it.url], isDuplicate: (duplicateMap[deriveFilename(it)] || 0) > 1, name: deriveFilename(it) })), [items, progressMap, duplicateMap]);
  
  // session stats and overall progress
  const sessionStats = useMemo(() => {
    const total = items.length;
    let completed = 0; let failed = 0; let downloading = 0; let knownProgressCount = 0; let progressSum = 0;
    for (const it of items) {
      const p = (progressMap[it.url] as DownloadProgress | undefined);
      if (p) {
        knownProgressCount += 1;
        progressSum += (p.progress || 0);
        if (p.error) failed += 1;
        if ((p.progress || 0) >= 1 || (p.status || '') === 'completed') completed += 1;
        if ((p.status || '').toLowerCase().includes('download')) downloading += 1;
      }
    }
    const overall = total > 0 && knownProgressCount > 0 ? (progressSum / total) : 0;
    const overallKnown = knownProgressCount > 0;
    return { total, completed, failed, downloading, overall, overallKnown };
  }, [items, progressMap]);

  const [isPaused, setIsPaused] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [failedItems, setFailedItems] = useState<Item[]>([]);
  // whether the session has finished and we should show the bottom banner
  const [sessionFinished, setSessionFinished] = useState(false);
  // prevent closing/navigating away until the user reviews the summary
  const [canCloseSession, setCanCloseSession] = useState(true);
  // track pause request in-flight to avoid immediate failure toasts
  const [pauseRequestInFlight, setPauseRequestInFlight] = useState(false);
  const pauseTimeoutRef = useRef<number | null>(null);

  // Debug state
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ paused?: boolean; has_token?: boolean; session_id?: string; raw?: any } | null>(null);
  const fetchDebugInfo = async (sid?: string) => {
    if (!sid) return;
    try {
      const info = await invoke<any>('debug_download_session', { session_id: sid } as any);
      setDebugInfo({ ...(info || {}), raw: (window as any).__icnxSession });
    } catch (err) {
      console.error('debug fetch failed', err);
      setDebugInfo({ session_id: sid, raw: (window as any).__icnxSession });
    }
  };

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const startIdx = currentPage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pagedRows = rows.slice(startIdx, endIdx);
  useEffect(() => { setPage(0); }, [pageSize, total]);

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return '--';
    if (bytes === 0) return '0 B';
    const units = ['B','KB','MB','GB','TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  };

  const formatSpeed = (bps?: number) => bps ? `${formatBytes(bps)}/s` : '--';

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-3xl font-bold text-white">Download Details</h1>
          <button className={`btn-ghost ${!canCloseSession ? 'opacity-50 pointer-events-none' : ''}`} onClick={() => { if (!canCloseSession) { window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: 'Please review the summary to close the session.' } })); return; } onBack(); }} aria-label="Back">Back</button>
        </div>
        {/* Modern control bar (top-only) */}
        <div className="flex items-center justify-between gap-4 bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-lg p-2 md:p-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-sm text-gray-300 font-medium">Session</div>
            <div className="text-xs text-gray-400 ml-2 truncate">Destination: <span className="font-mono text-gray-200 ml-2 truncate max-w-[28ch] inline-block align-middle">{destination}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium transition ${hasActiveSession && !isPaused && !pauseRequestInFlight ? 'bg-gray-800 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]' : 'bg-gray-800 text-gray-400 opacity-60 cursor-not-allowed'}`}
              onClick={handlePause}
              disabled={!hasActiveSession || isPaused || pauseRequestInFlight}
               aria-label="Pause session">
              <span aria-hidden>{pauseRequestInFlight ? '⏳' : '⏸'}</span>
              <span className="sr-only">Pause</span>
              <span className="hidden md:inline">Pause</span>
            </button>

            <button
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium transition ${hasActiveSession && isPaused ? 'btn-primary' : 'bg-gray-800 text-gray-400 opacity-60 cursor-not-allowed'}`}
              onClick={handleResume}
              disabled={!hasActiveSession || !isPaused}
              aria-label="Resume session">
              <span aria-hidden>▶️</span>
              <span className="sr-only">Resume</span>
              <span className="hidden md:inline">Resume</span>
            </button>

            <button
              className="inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium btn-ghost"
              onClick={handleCancel}
              disabled={!hasActiveSession}
              aria-label="Cancel session">
              <span aria-hidden>✖️</span>
              <span className="sr-only">Cancel</span>
            </button>

            <button
              className="inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium btn-primary"
              onClick={() => { setSummaryOpen(true); }}
              aria-label="Summary">
              <span aria-hidden>📋</span>
              <span className="sr-only">Summary</span>
            </button>

            {/* debug toggle */}
            <button className="inline-flex items-center gap-2 px-2 h-8 rounded-md text-xs btn-ghost" onClick={() => { setDebugOpen((d) => { const next = !d; if (next) fetchDebugInfo(currentSessionId); return next; }); }} aria-label="Session debug">🐞</button>
           </div>
         </div>
       </div>
      {/* Overall session progress */}
      <div className="mb-4">
        <div className="text-sm text-gray-300 mb-1">Overall: {sessionStats.overallKnown ? `${Math.round(sessionStats.overall * 100)}%` : '—'} — {sessionStats.completed}/{sessionStats.total} completed{sessionStats.failed ? `, ${sessionStats.failed} failed` : ''}</div>
        <div className="w-full bg-gray-700 rounded-full h-3">
          {sessionStats.overallKnown ? (
            <div className="bg-green-500 h-3 rounded-full" style={{ width: `${Math.round(sessionStats.overall * 100)}%` }} />
          ) : (
            <div className="bg-gray-600 h-3 rounded" />
          )}
        </div>
      </div>
      <div className="overflow-auto rounded border border-gray-700 p-2">
        <div className="flex flex-col gap-3">
          {pagedRows.length === 0 ? (
            <div className="py-6 text-center text-gray-500">No items</div>
          ) : (
            pagedRows.map((row, i) => {
              const { it, p } = row as any;
              const name = (row as any).name;
              const stored = p as DownloadProgress | undefined;
              const progress = stored ? stored : { progress: 0, downloaded: 0, speed: 0, filename: deriveFilename(it), status: 'pending', url: it.url } as DownloadProgress;
              const percent = Math.max(0, Math.min(100, Math.round((progress.progress || 0) * 100)));
              const isImage = ((it.type || '').toLowerCase().includes('image') || /\.(png|jpe?g|gif|webp)$/i.test(name));
              const kind = isImage ? '🖼' : ((it.type||'').toLowerCase().includes('video') || /\.(mp4|webm|mkv)$/i.test(name)) ? '🎬' : ((it.type||'').toLowerCase().includes('pdf') || /\.(pdf)$/i.test(name)) ? '📄' : '📦';
              const title = it.title || deriveFilename(it) || it.url;
              return (
                <div key={`${it.url}::${i}`} className="bg-[var(--panel)] border border-[var(--panel-border)] rounded overflow-hidden">
                  <div className="py-2 px-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="inline-flex items-center justify-center w-6 h-6 rounded bg-[var(--panel-border)] text-[var(--text)] text-xs flex-shrink-0">{kind}</div>
                      <div className="min-w-0">
                        <div className="text-xs text-[var(--text)] truncate max-w-[36ch]" title={title}>{title}</div>
                        <div className="text-[11px] text-[color:var(--muted)] mt-0.5">{formatBytes(progress.downloaded)}{progress.total ? ` / ${formatBytes(progress.total)}` : ''}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-[color:var(--muted)] ml-1">{formatSpeed(progress.speed)}</div>
                  </div>
                  {/* Progress bar flush with card bottom so next card doesn't look like just the bar */}
                  <div className="w-full h-1 bg-[var(--panel-border)]">
                    <div className="h-1" style={{ width: `${percent}%`, backgroundImage: `linear-gradient(90deg, var(--primary) 0%, var(--primary-strong) 100%)` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
       {/* Bottom finished banner: shown when session ends to prompt user to review summary */}
       {sessionFinished && !summaryOpen && (
         <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 w-[min(980px,95%)]">
           <div className="card flex items-center justify-between gap-4">
             <div className="text-sm text-[var(--text)]">Download has finished — review the summary.</div>
             <div className="flex items-center gap-2">
              <button className="btn-primary" onClick={() => setSummaryOpen(true)}>View summary</button>
              <button className="btn-ghost" onClick={() => {
                // clear global session markers so Sidebar and other UI stop showing an active session
                try {
                  const g: any = window as any;
                  g.__icnxHasActiveSession = false;
                  g.__icnxCurrentSessionId = undefined;
                  g.__icnxSession = undefined;
                  g.__icnxSessionFinished = false;
                  g.__icnxActive = undefined;
                  g.__icnxSessionBadge = undefined;
                  try { delete g.__icnxProgress; } catch(_) {}
                } catch (_) {}
                try { window.dispatchEvent(new CustomEvent('icnx:active-session-updated')); } catch(_) {}
                // navigate back to quick overview
                window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'quick' } }));
              }}>Close session</button>
             </div>
           </div>
         </div>
       )}
       {/* Summary modal shown when session finishes */}
       {summaryOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
           <div className="bg-gray-900 border border-gray-700 rounded p-6 w-[min(900px,95%)]">
             <h2 className="text-lg font-bold mb-2">Download session summary</h2>
             <div className="text-sm text-gray-300 mb-4">Completed: {sessionStats.completed} / {sessionStats.total}. Failed: {sessionStats.failed}.</div>
             <div className="max-h-64 overflow-auto mb-4">
               {failedItems.length === 0 ? (
                 <div className="text-sm text-gray-400">No failed items.</div>
               ) : (
                 <ul className="space-y-2">
                   {failedItems.map(f => (
                     <li key={f.url} className="flex items-center justify-between gap-2">
                       <div className="text-sm text-gray-200 truncate max-w-[70%]">{f.title || f.filename || f.url}</div>
                       <div className="flex items-center gap-2">
                        <button className="px-3 py-1 rounded btn-primary" onClick={() => retryItem(f)}>Retry</button>
                       </div>
                     </li>
                   ))}
                 </ul>
               )}
             </div>
            <div className="flex items-center justify-end gap-2">
              <button className="px-3 py-1 rounded btn-secondary" onClick={() => {
                  // close the summary and fully clear the global session markers so "Currently Active" updates
                  setSummaryOpen(false);
                  setCanCloseSession(true);
                  setSessionFinished(false);
                  try {
                    const g: any = window as any;
                    g.__icnxHasActiveSession = false;
                    g.__icnxCurrentSessionId = undefined;
                    g.__icnxSession = undefined;
                    g.__icnxSessionFinished = false;
                    g.__icnxActive = undefined;
                    g.__icnxSessionBadge = undefined;
                    try { delete g.__icnxProgress; } catch(_) {}
                  } catch (_) {}
                  // notify other parts of the UI (Sidebar) that there is no active session
                  try { window.dispatchEvent(new CustomEvent('icnx:active-session-updated')); } catch(_) {}
                  if (onBack) onBack();
                  window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'quick' } }));
                }}>Close</button>
              <button className="px-3 py-1 rounded btn-ghost" onClick={async () => {
                if (!currentSessionId) return;
                const ok = window.confirm('Permanently delete this session history and files? This cannot be undone.');
                if (!ok) return;
                try {
                  await invoke('purge_download_session', { session_id: currentSessionId, delete_files: true } as any);
                  // server will emit download_session_purged which we listen for; show an immediate toast
                  try { window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: 'Purge requested' } })); } catch(_) {}
                } catch (err) {
                  console.error('purge failed', err);
                  try { window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'error', message: 'Failed to purge session' } })); } catch(_) {}
                }
              }}>Purge</button>
               <button className="px-3 py-1 rounded btn-primary" onClick={retryFailedAll} disabled={failedItems.length === 0}>Retry Failed</button>
             </div>
           </div>
         </div>
       )}
      {/* Debug modal */}
      {debugOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="dialog-content">
            <h3 className="text-lg font-bold mb-2">Session debug</h3>
            <div className="text-sm text-gray-300 mb-4">
              <div>Session id: <span className="font-mono">{debugInfo?.session_id || currentSessionId || '—'}</span></div>
              <div>Paused: <strong>{String(debugInfo?.paused ?? '—')}</strong></div>
              <div>Has token: <strong>{String(debugInfo?.has_token ?? '—')}</strong></div>
              <div className="mt-2 text-xs text-gray-400">Raw session object (window.__icnxSession):</div>
              <pre className="text-xs p-2 bg-gray-800 rounded mt-1 overflow-auto max-h-40">{JSON.stringify(debugInfo?.raw || (window as any).__icnxSession || {}, null, 2)}</pre>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => { setDebugOpen(false); setDebugInfo(null); }}>Close</button>
              <button className="btn-ghost" onClick={() => fetchDebugInfo(currentSessionId)}>Refresh</button>
            </div>
          </div>
        </div>
      )}
      {/* controls removed from bottom — controls live in the top control bar */}
      
      {/* Pagination controls */}
      <div className="mt-3 flex items-center justify-between text-sm text-gray-300">
        <div>
          Showing {total === 0 ? 0 : startIdx + 1}–{endIdx} of {total}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-400">Rows per page:</label>
          <select className="bg-gray-800 border border-gray-700 rounded px-2 py-1"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}>
            {[5,10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn-ghost px-3 py-1" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>Prev</button>
          <span className="text-gray-400">Page {currentPage + 1} / {totalPages}</span>
          <button className="btn-ghost px-3 py-1" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>Next</button>
        </div>
      </div>
      {status && <div className="mt-4 text-sm text-gray-300" role="status">{status}</div>}
    </div>
  );
}


