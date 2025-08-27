import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import type { Settings as AppSettings } from './types';
import Sidebar from './components/Sidebar';
import QuickDownload from './pages/QuickDownload';
import InstalledScripts from './pages/InstalledScripts';
import HistoryPage from './pages/History';
import DownloadHistoryDetails from './pages/DownloadHistoryDetails';
import SettingsPage from './pages/Settings';
import DownloadDetails from './pages/DownloadDetails';
import DownloadSession from './pages/DownloadSession';
import ScrapeSession from './pages/ScrapeSession';
import Playground from './pages/Playground';
type Tab = 'quick' | 'scripts' | 'history' | 'settings' | 'download-details' | 'playground' | 'download-session' | 'scrape-session' | 'active-session' | 'download-history-details';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('quick');
  const [currentDownload] = useState<any | null>(null);
  const [session, setSession] = useState<{ items: any[]; destination: string; started: boolean } | null>(null);
  const [scrapeSession, setScrapeSession] = useState<{ scriptName: string; inputUrl: string } | null>(null);
  // Provide a synchronous helper so other components can atomically persist
  // scrape snapshots into the in-memory store and dispatch the update event.
  // This is intentionally assigned on each render so child components can
  // call it synchronously during event handlers before navigation.
  try {
    const gAny: any = window as any;
    gAny.__icnxPersistScrapeSnapshot = (key: string, snap: any) => {
      try {
        const g: any = window as any;
        const store = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
        store[key] = { ...(store[key] || {}), ...(snap || {}) };
        try { window.dispatchEvent(new CustomEvent('icnx:scrape-store-updated', { detail: { key, type: snap && snap.done ? 'done' : 'item' } })); } catch (_) {}
        return true;
      } catch (_) { return false; }
    };
  } catch (_) {}
  // theme is applied to body via CSS classes

  // quick download now renders inline cards on the overview page; keep currentDownload for compatibility

  // allow programmatic navigation via CustomEvent
  // window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'playground' }}))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e: Event) => {
      const anyE = e as CustomEvent<{ tab?: Tab; items?: any[]; destination?: string; scriptName?: string; inputUrl?: string; sessionId?: string }>;
      if (!anyE.detail?.tab) return;

      if (anyE.detail.tab === 'download-session') {
        // For active session navigation from sidebar using a known sessionId, just restore
        if (anyE.detail.sessionId) {
          const g: any = window as any;
          g.__icnxCurrentSessionId = anyE.detail.sessionId;
          if (g.__icnxSession) setSession({ items: g.__icnxSession.items, destination: g.__icnxSession.destination, started: !!g.__icnxSession.started });
        }
        // If the navigation request contains items and a destination, start the download session immediately
        else if (anyE.detail.items && anyE.detail.destination) {
          const items = anyE.detail.items;
          const destination = anyE.detail.destination;
          const sess = { items, destination, started: false };
          (window as any).__icnxSession = sess;
          setSession(sess);
          (async () => {
            try {
              const sid = await invoke<string>('start_download_session', { items: items.map((i: any) => ({ url: i.url, filename: i.filename })), destination } as any);
              try { (window as any).__icnxCurrentSessionId = sid; (window as any).__icnxHasActiveSession = true; } catch(_) {}
              try { const g: any = window as any; const arr = (g.__icnxOverviewCards = g.__icnxOverviewCards || []); const card = { id: `card-${Date.now()}`, title: 'Downloads', subtitle: destination || '', status: 'Queued', progress: null, sessionId: sid }; arr.push(card); } catch(_) {}
            } catch (err) { console.error('Failed to auto-start download session from navigation', err); }
          })();
        }
        else {
          const persisted = (window as any).__icnxSession as { items: any[]; destination: string; started?: boolean } | undefined;
          if (persisted && Array.isArray(persisted.items)) setSession({ items: persisted.items, destination: persisted.destination, started: !!persisted.started });
        }
      }
      else if (anyE.detail.tab === 'scrape-session') {
        // For active scrape session navigation from sidebar
        if (anyE.detail.sessionId) {
          const g: any = window as any;
          g.__icnxCurrentSessionId = anyE.detail.sessionId;
          if (anyE.detail.scriptName && anyE.detail.inputUrl) {
            setScrapeSession({ scriptName: anyE.detail.scriptName, inputUrl: anyE.detail.inputUrl });
            g.__icnxCurrentScrapeKey = `${anyE.detail.scriptName}::${anyE.detail.inputUrl}`;
          } else if (g.__icnxCurrentScrapeKey) {
            const parts = g.__icnxCurrentScrapeKey.split('::');
            if (parts.length === 2) setScrapeSession({ scriptName: parts[0], inputUrl: parts[1] });
          }
        }
        // Regular scrape session navigation with explicit scriptName/inputUrl
        else if (anyE.detail.scriptName && anyE.detail.inputUrl) {
          try {
            const snap = (anyE.detail as any).snapshot;
            if (snap) {
              const key = `${anyE.detail.scriptName}::${anyE.detail.inputUrl}`;
              const g: any = window as any;
              const store = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
              store[key] = { ...(store[key] || {}), ...(snap || {}) };
              try { window.dispatchEvent(new CustomEvent('icnx:scrape-store-updated', { detail: { key, type: 'done' } })); } catch (_) {}
            }
          } catch (_) {}
          setScrapeSession({ scriptName: anyE.detail.scriptName, inputUrl: anyE.detail.inputUrl });
          (window as any).__icnxCurrentScrapeKey = `${anyE.detail.scriptName}::${anyE.detail.inputUrl}`;
          const g: any = window as any;
          g.__icnxHasActiveSession = true;
          g.__icnxActive = { kind: 'scrape', url: anyE.detail.inputUrl };
        }
      }

      setActiveTab(anyE.detail.tab);
    };
    window.addEventListener('icnx:navigate', handler as EventListener);
    return () => window.removeEventListener('icnx:navigate', handler as EventListener);
  }, []);

  // Global scrape event buffer so scraping continues and results persist when the page is unmounted
  useEffect(() => {
    let unItem: any; let unDone: any;
    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unItem = await listen<any>('scrape_item', (e) => {
        const g: any = window as any;
        const key = g.__icnxCurrentScrapeKey;
        if (!key) return;
        const store = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
        const prev = (store[key]?.items as any[]) || [];
        const exists = prev.find((x) => x.url === e.payload.url);
        const next = exists ? prev : [...prev, e.payload];
        // derive script name from key "script::url"
        const scriptName = String(key).split('::')[0];
        store[key] = { ...(store[key] || {}), items: next, status: `Running ${scriptName}...` };
        window.dispatchEvent(new CustomEvent('icnx:scrape-store-updated', { detail: { key, type: 'item' } }));
      });
      unDone = await listen<any>('scrape_done', (e) => {
        const g: any = window as any;
        const key = g.__icnxCurrentScrapeKey;
        if (!key) return;
        const store = (g.__icnxScrapeStore = g.__icnxScrapeStore || {});
        const prev = (store[key]?.items as any[]) || [];
        const seen = new Set(prev.map((x) => x.url));
        const merged = [...prev];
        for (const it of e.payload.items || []) { if (!seen.has(it.url)) { seen.add(it.url); merged.push(it); } }
        store[key] = { ...(store[key] || {}), items: merged, dir: e.payload.dir, done: true, status: `Scrape completed. ${merged.length} items found.` };
        window.dispatchEvent(new CustomEvent('icnx:scrape-store-updated', { detail: { key, type: 'done' } }));
      });
    })();
    return () => { if (typeof unItem === 'function') unItem(); if (typeof unDone === 'function') unDone(); };
  }, []);

  // Top-level Download Feeder: listen to backend once, batch updates (500ms), and feed children via a global progress system
  useEffect(() => {
    // Ensure a global progress system exists
    try {
      const g: any = window as any;
      if (!g.__icnxProgressSystem) {
        const subs: any[] = [];
        const progress: Record<string, any> = {};
        g.__icnxProgressSystem = {
          progress,
          subscribers: subs,
          addSubscriber: (cb: any) => {
            subs.push(cb);
            return () => {
              const i = subs.indexOf(cb);
              if (i >= 0) subs.splice(i, 1);
            };
          },
          updateProgress: (url: string, data: any) => {
            const prev = progress[url] || {};
            progress[url] = { ...prev, ...data, url };
            // notify all with snapshot
            const snap = { ...progress };
            for (const cb of subs) {
              try { cb(url, progress[url], snap); } catch (_) {}
            }
          },
          getProgress: (url: string) => progress[url],
          getAllProgress: () => ({ ...progress }),
        } as any;
      }
      // Provide a simple feeder facade children can subscribe to
      if (!g.__icnxDownloadFeeder) {
        g.__icnxDownloadFeeder = {
          subscribe: (cb: (all: Record<string, any>) => void) => g.__icnxProgressSystem.addSubscriber((_: string, __: any, all: any) => cb(all)),
          getAll: () => g.__icnxProgressSystem.getAllProgress(),
        };
      }
    } catch (_) {}

    let disposed = false as boolean;
    let timer: any = null;
    const buffer = new Map<string, any>();
    const scheduleFlush = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (disposed) return;
        const g: any = window as any;
        const sys = g.__icnxProgressSystem;
        const entries = Array.from(buffer.entries());
        buffer.clear();
        for (const [url, data] of entries) {
          try { sys.updateProgress(url, data); } catch (_) {}
        }
      }, 500);
    };

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const un1 = await listen<any>('download_progress', (e) => {
          try {
            const p: any = e.payload || {};
            const url = String(p.url || '');
            if (!url) return;
            const data = {
              progress: typeof p.progress === 'number' ? p.progress : undefined,
              downloaded: p.downloaded || 0,
              total: p.total || undefined,
              speed: p.speed || 0,
              eta: p.eta || undefined,
              status: p.status || (p.progress === 1 ? 'completed' : 'downloading'),
              filename: p.filename || '',
            };
            buffer.set(url, { ...(buffer.get(url) || {}), ...data });
            scheduleFlush();
          } catch (_) {}
        });
        const un2 = await listen<any>('download_item_started', (e) => {
          try {
            const p: any = e.payload || {};
            const url = String(p.url || '');
            if (!url) return;
            buffer.set(url, { progress: 0, downloaded: 0, total: undefined, speed: 0, status: 'downloading', filename: p.filename || '' });
            scheduleFlush();
          } catch (_) {}
        });
        const un3 = await listen<any>('download_item_completed', (e) => {
          try {
            const p: any = e.payload || {};
            const url = String(p.url || '');
            if (!url) return;
            buffer.set(url, { progress: 1, status: 'completed', filename: p.filename || '' });
            scheduleFlush();
            // Notify cards for optional auto-close flows
            try {
              const g: any = window as any;
              const arr = (g.__icnxOverviewCards as any[]) || [];
              const found = Array.isArray(arr) ? arr.find((c) => c && c.url === url) : undefined;
              const detail: any = { url };
              if (found?.id) detail.id = found.id;
              window.dispatchEvent(new CustomEvent('icnx:download-card-completed', { detail }));
              // Secondary signal for any consumer that only keys by URL
              window.dispatchEvent(new CustomEvent('icnx:download-url-completed', { detail: { url } }));
            } catch (_) {}
          } catch (_) {}
        });
        const un4 = await listen<any>('download_item_error', (e) => {
          try {
            const p: any = e.payload || {};
            const url = String(p.url || '');
            if (!url) return;
            buffer.set(url, { status: 'failed', error: p.error || 'Unknown error' });
            scheduleFlush();
          } catch (_) {}
        });

        // cleanup
        return () => { try { (un1 as any)(); (un2 as any)(); (un3 as any)(); (un4 as any)(); } catch (_) {} };
      } catch (_) { return () => {}; }
    })();

    return () => {
      disposed = true;
      if (timer) { try { clearTimeout(timer); } catch (_) {} timer = null; }
    };
  }, []);

  // Clear active session when backend signals completion (works regardless of current page)
  useEffect(() => {
    let un: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        un = await listen<any>('download_session_finished', () => {
          try {
            const g: any = window as any;
            g.__icnxHasActiveSession = false;
            g.__icnxCurrentSessionId = undefined;
            g.__icnxActive = undefined;
          } catch (_) {}
          try { window.dispatchEvent(new CustomEvent('icnx:active-session-updated')); } catch (_) {}
        });
      } catch (_) {}
    })();
    return () => { try { (un as any)(); } catch (_) {} };
  }, []);

  // Global progress listener so progress persists even when DownloadSession is unmounted
  useEffect(() => {
    const unlistenPromise = (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      return listen<any>('download_progress', (e) => {
        const p = e.payload as any;
        const g: any = window as any;
        const prev = (g.__icnxProgress && typeof g.__icnxProgress === 'object') ? g.__icnxProgress : {};
        g.__icnxProgress = { ...prev, [p.url]: p };
      });
    })();
    return () => { unlistenPromise.then((un) => { if (typeof un === 'function') un(); }); };
  }, []);

  // Apply theme on mount and when settings change
  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<AppSettings>('get_settings');
        const klass = `theme-${s.theme}`;
        document.body.classList.remove('theme-Light','theme-Dark');
        document.body.classList.add(klass);
        if (!s.theme || s.theme === 'Dark') {
          document.body.classList.add('theme-Dark');
        }
      } catch {}
    })();
  }, []);

  // Simple toast host driven by custom events
  function ToastHost() {
    const [toasts, setToasts] = useState<{ id: number; type: 'success'|'error'|'info'; message: string }[]>([]);
    useEffect(() => {
      const handler = (e: Event) => {
        const anyE = e as CustomEvent<{ type: 'success'|'error'|'info'; message: string }>;
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, type: anyE.detail.type, message: anyE.detail.message }]);
        setTimeout(() => setToasts((prev) => prev.filter(t => t.id !== id)), 3500);
      };
      window.addEventListener('icnx:toast', handler as EventListener);
      return () => window.removeEventListener('icnx:toast', handler as EventListener);
    }, []);
    return (
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded shadow border ${t.type === 'success' ? 'bg-green-900/60 border-green-700 text-green-100' : t.type === 'error' ? 'bg-red-900/60 border-red-700 text-red-100' : 'bg-blue-900/60 border-blue-700 text-blue-100'}`}>
            {t.message}
          </div>
        ))}
      </div>
    );
  }

  const [historyDetailsSessionId, setHistoryDetailsSessionId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const anyE = e as CustomEvent<{ tab?: Tab; sessionId?: string }>;
      if (anyE.detail?.tab === 'download-history-details' && anyE.detail.sessionId) {
        setHistoryDetailsSessionId(anyE.detail.sessionId);
      }
    };
    window.addEventListener('icnx:navigate', handler as any);
    return () => window.removeEventListener('icnx:navigate', handler as any);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'quick':
        return <QuickDownload />;
      case 'scripts':
        return <InstalledScripts />;
      case 'playground':
        return <Playground />;
      case 'history':
        return <HistoryPage />;
      case 'download-history-details':
        return historyDetailsSessionId ? (
          <DownloadHistoryDetails 
            sessionId={historyDetailsSessionId}
            onBack={() => setActiveTab('history')}
            onRetryFailed={(failed) => {
              const destination = (window as any).__icnxDestination || '';
              const items = failed.map(f => ({ url: f.url, filename: f.filename }));
              window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'download-session', items, destination } }));
            }}
          />
        ) : <HistoryPage />;
      case 'settings':
        return <SettingsPage />;
      case 'download-details':
        return <DownloadDetails 
          downloadInfo={currentDownload} 
          onBack={() => setActiveTab('quick')} 
        />;
      case 'download-session':
        return session ? (
          <DownloadSession
            items={session.items}
            destination={session.destination}
            started={session.started}
            onStarted={() => setSession((s) => (s ? { ...s, started: true } : s))}
            onBack={() => setActiveTab('quick')}
          />
        ) : (
          <QuickDownload />
        );
      case 'scrape-session':
        return scrapeSession ? (
          <ScrapeSession
            scriptName={scrapeSession.scriptName}
            inputUrl={scrapeSession.inputUrl}
            onDone={() => {
              // do not auto-navigate; ScrapeSession now shows Continue to proceed
              (window as any).__icnxSessionBadge = 'done';
            }}
            onBack={() => setActiveTab('quick')}
          />
        ) : (
          <QuickDownload />
        );
      default:
        return <QuickDownload />;
    }
  };

  // Sidebar has its own nav items; we only track activeTab here.

  return (
    <div className={`flex h-screen`}>
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto px-8 py-8 max-w-6xl">
          <ToastHost />
          {/* routing / tab rendering - centralized in renderContent() */}
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default App;
