import { useEffect, useState } from 'react';
import { Download, FileText, Settings as SettingsIcon, Link as LinkIcon, LucideIcon } from 'lucide-react';
import clsx from 'clsx';

type Tab = 'quick' | 'scripts' | 'history' | 'settings' | 'download-details' | 'playground' | 'download-session' | 'scrape-session' | 'active-session' | 'download-history-details';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

interface NavItem {
  id: Tab;
  label: string;
  icon: LucideIcon;
  category?: 'navigation' | 'settings';
}

const navItems: NavItem[] = [
  { id: 'quick', label: 'Overview', icon: Download, category: 'navigation' },
  { id: 'scripts', label: 'Scripts', icon: FileText, category: 'navigation' },
  { id: 'settings', label: 'Preferences', icon: SettingsIcon, category: 'settings' },
];

function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  // tick forces re-render when global active-session state changes
  const [, setTick] = useState(0);

  useEffect(() => {
    let unTauri: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unTauri = await listen<any>('download_session_finished', () => {
          try {
            const g: any = window as any;
            g.__icnxHasActiveSession = false;
            g.__icnxCurrentSessionId = undefined;
            g.__icnxActive = undefined;
          } catch (_) {}
          try { window.dispatchEvent(new CustomEvent('icnx:active-session-updated')); } catch (_) {}
          setTick((n) => n + 1);
        });
      } catch (_) {}
    })();

    const onActive = () => setTick((n) => n + 1);
    const onItemCompleted = (e: any) => {
      // If there is no more active progress left, hide the active session chip
      try {
        const g: any = window as any;
        const hasActive = !!g.__icnxHasActiveSession;
        if (!hasActive) {
          setTick((n) => n + 1);
          return;
        }
        // If we were tracking a single item by URL and it finished, also trigger re-render
        const url = e?.detail?.url;
        if (url && g.__icnxActive && g.__icnxActive.url === url) {
          // This is a heuristic; final authoritative clear comes from download_session_finished
          setTick((n) => n + 1);
        }
      } catch (_) {}
    };
    try { window.addEventListener('icnx:active-session-updated', onActive as any); } catch (_) {}
    try { window.addEventListener('icnx:download-card-completed', onItemCompleted as any); } catch (_) {}
    try { window.addEventListener('icnx:download-url-completed', onItemCompleted as any); } catch (_) {}
    // Handle cancellation removal so the Active Session section disappears promptly
    const onRemoved = (e: any) => {
      try {
        const detail = e?.detail || {};
        const g: any = window as any;
        if (detail?.sessionId && g.__icnxCurrentSessionId === detail.sessionId) {
          g.__icnxHasActiveSession = false;
          g.__icnxCurrentSessionId = undefined;
          g.__icnxActive = undefined;
          window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
          setTick((n) => n + 1);
        } else if (detail?.url && g.__icnxActive?.url === detail.url) {
          g.__icnxHasActiveSession = false;
          g.__icnxCurrentSessionId = undefined;
          g.__icnxActive = undefined;
          window.dispatchEvent(new CustomEvent('icnx:active-session-updated'));
          setTick((n) => n + 1);
        }
      } catch (_) {}
    };
    try { window.addEventListener('icnx:download-card-remove', onRemoved as any); } catch (_) {}
    return () => {
      try { (unTauri as any)(); } catch (_) {}
      try { window.removeEventListener('icnx:active-session-updated', onActive as any); } catch (_) {}
      try { window.removeEventListener('icnx:download-card-completed', onItemCompleted as any); } catch (_) {}
      try { window.removeEventListener('icnx:download-url-completed', onItemCompleted as any); } catch (_) {}
      try { window.removeEventListener('icnx:download-card-remove', onRemoved as any); } catch (_) {}
    };
  }, []);

  const navigationItems = navItems.filter(item => item.category === 'navigation');
  const active = (window as any).__icnxActive as { kind: 'scrape'|'download'; url: string } | undefined;
  const settingsItems = navItems.filter(item => item.category === 'settings');

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;

    return (
      <button
        key={item.id}
        onClick={() => onTabChange(item.id)}
        className={clsx(
          'sidebar-item w-full justify-start space-x-2 py-2 text-xs',
          isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'
        )}
      >
        <Icon size={16} />
        <span className="flex-1 min-w-0 flex items-center gap-1 md:text-[9px] lg:text-sm">
          <span className="truncate">{item.label}</span>
          {item.id === 'active-session' && (window as any).__icnxSessionBadge === 'done' && (
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="sidebar w-64 border-r flex flex-col">
      <div className="flex-1 overflow-y-auto bg-gray-800/30 backdrop-blur-lg my-6 rounded-lg shadow-lg mx-2">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-8">ICNX</h1>
        <nav className="space-y-1">
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Navigation
            </h2>
            <div className="space-y-1">
              {navigationItems.map(renderNavItem)}
            </div>
          </div>
          
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Settings
            </h2>
            <div className="space-y-1">
              {settingsItems.map(renderNavItem)}
            </div>
            {(window as any).__icnxHasActiveSession && (
              <div className="mt-6">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Currently Active
                </h2>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      try {
                        // Access the current session data directly
                        const g = window as any;
                        
                        // Determine which session type to navigate to
                        let tabToNavigate = 'download-session';
                        
                        if (g.__icnxActive?.kind === 'scrape') {
                          tabToNavigate = 'scrape-session';
                        }
                        
                        // Force the navigation
                        window.dispatchEvent(new CustomEvent('icnx:navigate', { 
                          detail: { 
                            tab: tabToNavigate,
                            // Include necessary data for the navigation
                            sessionId: g.__icnxCurrentSessionId,
                            scriptName: g.__icnxCurrentScrapeKey?.split('::')?.[0],
                            inputUrl: g.__icnxActive?.url
                          } 
                        }));
                        
                        console.log("Navigating to active session:", tabToNavigate);
                      } catch (err) {
                        console.error("Error navigating to active session:", err);
                      }
                    }}
                    className={clsx(
                      'sidebar-item w-full justify-start space-x-3 py-2 px-4',
                      activeTab === 'download-session' || activeTab === 'scrape-session' 
                        ? 'sidebar-item-active' 
                        : 'sidebar-item-inactive'
                    )}
                  >
                    <LinkIcon size={16} />
                    <span className="flex-1 min-w-0 flex items-center gap-2 text-sm">
                      <span className="truncate block">{active?.url || 'Active session'}</span>
                      {(window as any).__icnxSessionBadge === 'done' && (
                        <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                      )}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </nav>
      </div>
      
      <div className="mt-auto p-6 border-t border-gray-700">
        <div className="text-xs text-gray-400">
          Version 0.1.0
        </div>
      </div>
      </div>
    </div>
  );
}

export default Sidebar;
