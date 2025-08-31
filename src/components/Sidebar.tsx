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
  { id: 'quick', label: 'Quick Download', icon: Download, category: 'navigation' },
  { id: 'scripts', label: 'Scripts', icon: FileText, category: 'navigation' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, category: 'settings' },
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
      <div key={item.id} className="relative group">
        <button
          onClick={() => onTabChange(item.id)}
          className={clsx(
            'w-12 h-12 flex items-center justify-center rounded-lg transition-all duration-200 relative glass',
            isActive 
              ? 'text-white shadow-lg border-orange-400/30' 
              : 'text-gray-400 hover:text-white hover:border-orange-400/20'
          )}
          style={isActive ? { backgroundColor: '#B95140' } : {}}
          onMouseEnter={(e) => {
            if (!isActive) {
              e.currentTarget.style.backgroundColor = '#B9514020';
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              e.currentTarget.style.backgroundColor = '';
            }
          }}
          title={item.label}
        >
          <Icon size={20} />
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full" style={{ backgroundColor: '#D98A7F' }} />
          )}
        </button>
        {/* Tooltip */}
        <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-gray-900/95 backdrop-blur-sm text-white text-sm px-3 py-2 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-gray-600/20">
          {item.label}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 rotate-45 border-l border-b border-gray-600/20" />
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-16 glass border-r border-gray-600/20 flex flex-col shadow-xl">
      {/* VS Code style sidebar - icons only */}
      <div className="flex-1 p-3">
        {/* Navigation items */}
        <div className="space-y-2 mb-6">
          {navigationItems.map(renderNavItem)}
        </div>
        
        {/* Active session indicator */}
        {(window as any).__icnxHasActiveSession && (
          <div className="relative group">
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
                'w-12 h-12 flex items-center justify-center rounded-lg transition-all duration-200 relative glass',
                activeTab === 'download-session' || activeTab === 'scrape-session'
                  ? 'text-white shadow-lg border-orange-400/30' 
                  : 'text-orange-400 hover:text-white hover:border-orange-400/20'
              )}
              style={(activeTab === 'download-session' || activeTab === 'scrape-session') 
                ? { backgroundColor: '#B95140' } 
                : {}}
              onMouseEnter={(e) => {
                if (!(activeTab === 'download-session' || activeTab === 'scrape-session')) {
                  e.currentTarget.style.backgroundColor = '#B9514020';
                }
              }}
              onMouseLeave={(e) => {
                if (!(activeTab === 'download-session' || activeTab === 'scrape-session')) {
                  e.currentTarget.style.backgroundColor = '';
                }
              }}
              title={`Active: ${active?.url || 'Session'}`}
            >
              <LinkIcon size={20} />
              {/* Active indicator dot */}
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-gray-800" style={{ backgroundColor: '#D98A7F' }} />
              {/* Status badge */}
              {(window as any).__icnxSessionBadge === 'done' && (
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-gray-800" />
              )}
              {(activeTab === 'download-session' || activeTab === 'scrape-session') && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full" style={{ backgroundColor: '#D98A7F' }} />
              )}
            </button>
            {/* Tooltip */}
            <div className="absolute left-16 top-1/2 -translate-y-1/2 bg-gray-900/95 backdrop-blur-sm text-white text-sm px-3 py-2 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 max-w-xs border border-gray-600/20">
              <div className="font-medium">Active Session</div>
              <div className="text-xs text-gray-300 truncate">{active?.url || 'Session running'}</div>
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 rotate-45 border-l border-b border-gray-600/20" />
            </div>
          </div>
        )}
      </div>

      {/* Settings at bottom */}
      <div className="p-3 border-t border-gray-600/20">
        <div className="space-y-2">
          {settingsItems.map(renderNavItem)}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
