// ScrapeSession: shows items as they stream in via events, then auto-navigates to download session
import { useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import type { EmitPayload, DownloadItem } from '../types';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';

type Props = {
  scriptName: string;
  inputUrl: string;
  onDone: (payload: EmitPayload) => void;
  onBack: () => void;
};

export default function ScrapeSession({ scriptName, inputUrl, onDone, onBack }: Props) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [status, setStatus] = useState('Starting scraper...');
  const [done, setDone] = useState(false);
  const [dir, setDir] = useState<string | undefined>(undefined);
  const startedRef = useRef(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(true);
  const seenRef = useRef<Set<string>>(new Set());
  const sessionKey = `${scriptName}::${inputUrl}`;

  useEffect(() => {
    const g: any = window as any;
    g.__icnxHasActiveSession = true;
    // hydrate from global if exists
    const store = (g.__icnxScrapeStore || {}) as Record<string, any>;
    const existing = store[sessionKey];
    const forceNew = !!g.__icnxForceNewScrape;
    if (existing && !forceNew) {
      if (Array.isArray(existing.items)) {
        seenRef.current = new Set(existing.items.map((x: any) => x.url));
        setItems(existing.items as DownloadItem[]);
        if (existing.selected && Array.isArray(existing.selected)) {
          setSelectedUrls(new Set(existing.selected));
        } else if (selectAll) {
          setSelectedUrls(new Set((existing.items as DownloadItem[]).map(i => i.url)));
        }
      }
      if (existing.status) setStatus(existing.status);
      if (existing.dir) setDir(existing.dir);
      if (existing.done) setDone(true);
      if (existing.started) startedRef.current = true; // prevent re-run
    }
    if (forceNew) {
      // clear previous data for this session key to ensure fresh run
      const st = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
      delete st[sessionKey];
      g.__icnxForceNewScrape = false;
    }

    const unsubs: Array<() => void> = [];
    const onStoreUpdate = () => {
      const g: any = window as any;
      const store = (g.__icnxScrapeStore || {}) as Record<string, any>;
      const snap = store[sessionKey];
      if (!snap) return;
      if (Array.isArray(snap.items)) {
        // ensure dedupe
        const seen = new Set<string>();
        const merged: DownloadItem[] = [] as any;
        for (const it of snap.items as DownloadItem[]) {
          if (!seen.has(it.url)) { seen.add(it.url); merged.push(it); }
        }
        setItems(merged);
        if (selectAll) {
          // keep selection in sync with new items when selectAll is on
          setSelectedUrls(new Set(merged.map(i => i.url)));
        }
      }
      if (typeof snap.status === 'string') setStatus(snap.status);
      if (snap.dir) setDir(snap.dir);
      if (snap.done) setDone(true);
    };
    window.addEventListener('icnx:scrape-store-updated', onStoreUpdate as any);
    listen<DownloadItem>('scrape_item', (e) => {
      const it = e.payload;
      if (seenRef.current.has(it.url)) return;
      seenRef.current.add(it.url);
      setItems((prev) => {
        const next = [...prev, it];
        // persist to global
        const st = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
        const dynamicStatus = `Running ${scriptName}...`;
        st[sessionKey] = { ...(st[sessionKey] || {}), items: next, status: dynamicStatus };
        setStatus(dynamicStatus);
        if (selectAll) {
          setSelectedUrls((prevSel) => {
            const sel = new Set(prevSel).add(it.url);
            st[sessionKey].selected = Array.from(sel);
            return sel;
          });
        }
        return next;
      });
    }).then((un) => unsubs.push(un));
    listen<EmitPayload>('scrape_done', (e) => {
      setDir(e.payload.dir);
      setDone(true);
      const finalCount = (() => {
        const seen = new Set(items.map(i => i.url));
        for (const it of e.payload.items) { seen.add(it.url); }
        return seen.size;
      })();
      const msg = `Scrape completed. ${finalCount} items found.`;
      setStatus(msg);
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.url));
        const merged = [...prev];
        for (const it of e.payload.items) {
          if (!seen.has(it.url)) { seen.add(it.url); merged.push(it); }
        }
        const st = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
        st[sessionKey] = { ...(st[sessionKey] || {}), items: merged, dir: e.payload.dir, done: true, status: msg };
        return merged;
      });
      setSelectedUrls((prevSel) => {
        const next = new Set(prevSel);
        if (selectAll || prevSel.size === 0) {
          for (const it of e.payload.items) next.add(it.url);
        }
        const st = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
        st[sessionKey] = { ...(st[sessionKey] || {}), selected: Array.from(next) };
        return next;
      });
      onDone(e.payload);
      g.__icnxSessionBadge = 'done';
      g.__icnxActive = { kind: 'scrape', url: inputUrl };
      g.__icnxHasActiveSession = true;
      window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
    }).then((un) => unsubs.push(un));
    return () => { unsubs.forEach((u) => u()); window.removeEventListener('icnx:scrape-store-updated', onStoreUpdate as any); };
  }, [onDone, selectAll, inputUrl, sessionKey, status]);

  useEffect(() => {
    const g: any = window as any;
    const store = (g.__icnxScrapeStore || {}) as Record<string, any>;
    const existing = store[sessionKey];
    if (existing && (existing.started || existing.done) && !g.__icnxForceNewScrape) {
      // Already running or finished: do not start again
      startedRef.current = true;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus(`Running ${scriptName}...`);
    // mark started in global store
    const st = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
    st[sessionKey] = { ...(st[sessionKey] || {}), started: true, status: `Running ${scriptName}...` };
    invoke('run_script', { scriptName, options: { inputUrl, maxPages: 10 } })
      .catch((err) => {
        const msg = `Failed: ${String(err)}`;
        setStatus(msg);
        const st2 = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
        st2[sessionKey] = { ...(st2[sessionKey] || {}), started: false, status: msg };
      });
  }, [scriptName, inputUrl, sessionKey]);

  const rows = useMemo(() => items.map((it, idx) => ({ idx, it })), [items]);
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

  const allSelected = items.length > 0 && items.every((it) => selectedUrls.has(it.url));
  const selectedCount = items.filter((it) => selectedUrls.has(it.url)).length;

  const toggleOne = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const toggleAll = () => {
    const g: any = window as any;
    const st = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
    if (allSelected) {
      const cleared = new Set<string>();
      setSelectedUrls(cleared);
      setSelectAll(false);
      st[sessionKey] = { ...(st[sessionKey] || {}), selected: [] };
    } else {
      const next = new Set<string>();
      items.forEach((it) => next.add(it.url));
      setSelectedUrls(next);
      setSelectAll(true);
      st[sessionKey] = { ...(st[sessionKey] || {}), selected: Array.from(next) };
    }
  };

  const handleContinue = () => {
    const chosen = items.filter((it) => selectedUrls.has(it.url));
    if (chosen.length === 0) return;
    const destination = (window as any).__icnxDestination || '';
    // Switch active session to download phase
    (window as any).__icnxActive = { kind: 'download', url: chosen[0]?.url || inputUrl };
    (window as any).__icnxHasActiveSession = true;
    // pass meta for history
    (window as any).__icnxCurrentDownloadSessionMeta = { scriptName, sourceUrl: inputUrl };
    // Persist the upcoming session so it restores if user navigates away and back before it starts
    (window as any).__icnxSession = { items: chosen, destination, started: false };
    window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
    window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'download-session', items: chosen, destination } }));
  };

  // Clear any pending/active download session metadata so the download session no longer appears
  const handleClearDownloadSession = () => {
    try {
      const g: any = window as any;
      g.__icnxHasActiveSession = false;
      g.__icnxCurrentSessionId = undefined;
      g.__icnxSession = undefined;
      g.__icnxSessionFinished = false;
      g.__icnxActive = undefined;
      g.__icnxSessionBadge = undefined;
    } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('icnx:active-session-updated')); } catch(_) {}
    try { window.dispatchEvent(new CustomEvent('icnx:toast', { detail: { type: 'info', message: 'Cleared current download session.' } })); } catch(_) {}
  };

  // When user wants to leave this page (Back) or cancel: attempt to cancel a backend session if present,
  // clear globals and navigate to the overview.
  const handleAbortAndNavigate = async () => {
    try {
      const g: any = window as any;
      const sid = g.__icnxCurrentSessionId;
      if (sid) {
        try {
          // attempt backend cancellation (best-effort)
          await invoke<boolean>('cancel_download_session', { session_id: sid } as any);
        } catch (err) {
          // ignore backend cancel errors but log for debug
          console.error('backend cancel failed', err);
        }
      }
    } catch (err) {
      console.error('abort check failed', err);
    }
    // clear client-side session markers and notify UI
    handleClearDownloadSession();
    // navigate to overview
    try { window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'quick' } })); } catch(_) {}
    // call onBack if provided (preserve caller semantics)
    try { if (onBack) onBack(); } catch(_) {}
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Scrape Session</h1>
        <button className="btn-ghost" onClick={onBack}>Back</button>
      </div>

      <div className={`p-4 rounded-lg mb-4 ${
        status.toLowerCase().startsWith('failed') ? 'bg-red-900/50 border border-red-700 text-red-200' : 'bg-blue-900/50 border border-blue-700 text-blue-200'
      }`}>
        <p className="text-sm">{status}</p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-400">
            {status.toLowerCase().startsWith('scrape completed') ? 'Completed' : 'Scraping in progress...'} · {items.length} found · {selectedCount} selected
          </div>
          <div className="flex items-center gap-4">
            {dir && <div className="text-sm text-gray-400">Suggested dir: <span className="text-gray-200">{dir}</span></div>}
            <div className="inline-flex items-center gap-2 text-sm text-gray-300">
              <Checkbox checked={allSelected} onCheckedChange={() => toggleAll()} />
              <button type="button" className="hover:text-white" onClick={toggleAll}>Select all</button>
            </div>
          </div>
        </div>
        <div className="overflow-auto">
          <div className="flex flex-col gap-1">
            {pagedRows.length === 0 ? (
              <div className="py-2 text-center text-gray-500 text-sm">Waiting for items...</div>
            ) : (
              pagedRows.map(({ idx, it }) => {
                const isSelected = selectedUrls.has(it.url);
                const isImage = (it.type || '').toLowerCase().includes('image') || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(it.url);
                const kindEmoji = isImage ? '🖼' : ((it.type||'').toLowerCase().includes('video') || /\.(mp4|webm|mkv)$/i.test(it.filename||'')) ? '🎬' : ((it.type||'').toLowerCase().includes('pdf') || /\.(pdf)$/i.test(it.filename||'')) ? '📄' : '📦';
                let shortFile = it.filename;
                if (!shortFile) {
                  try { shortFile = (new URL(it.url)).pathname.split('/').pop() || it.url; } catch { shortFile = it.url; }
                }
                return (
                  <div key={idx} className="flex items-center justify-between gap-2 py-1 px-1 rounded hover:bg-gray-800/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-shrink-0"><Checkbox checked={isSelected} onCheckedChange={() => toggleOne(it.url)} /></div>
                      <div className="inline-flex items-center justify-center w-5 h-5 rounded bg-[var(--panel-border)] text-gray-200 text-[11px] flex-shrink-0">{kindEmoji}</div>
                      <div className="min-w-0">
                        <div className="text-[12px] text-gray-200 truncate max-w-[48ch]" title={it.title || shortFile || it.url}>{it.title || shortFile || it.url}</div>
                        <div className="text-[11px] text-gray-400 truncate max-w-[48ch]" title={it.url}>{it.url}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-400 ml-1 flex-shrink-0">{it.type || ''}</div>
                  </div>
                );
              })
             )}
           </div>
         </div>
        {/* Pagination controls */}
        <div className="mt-3 flex items-center justify-between text-sm text-gray-300">
          <div>
            Showing {total === 0 ? 0 : startIdx + 1}–{endIdx} of {total}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-gray-400">Rows per page:</label>
            <select className="bg-[var(--panel)] border border-[var(--panel-border)] rounded px-2 py-1"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}>
              {[5,10,20,50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn-ghost px-3 py-1" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>Prev</button>
            <span className="text-gray-400">Page {currentPage + 1} / {totalPages}</span>
            <button className="btn-ghost px-3 py-1" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>Next</button>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => { void handleAbortAndNavigate(); }}>Back</Button>
          <Button variant="ghost" onClick={() => { void handleAbortAndNavigate(); }}>Cancel</Button>
          <Button onClick={handleContinue} disabled={!done || selectedCount === 0}>Continue</Button>
        </div>
      </div>
    </div>
  );
}


