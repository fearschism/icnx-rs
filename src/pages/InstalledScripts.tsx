import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Play, Edit, Trash2, Plus, Settings as SettingsIcon, Code } from 'lucide-react';
import type { ScriptInfo, ScriptConfig, EmitPayload, DownloadProgress, Settings as AppSettings } from '../types';
import ScriptConfigDialog from '../components/ScriptConfigDialog';
import ScrapeResultsDialog from '../components/ScrapeResultsDialog';
import InstallScriptDialog from '../components/InstallScriptDialog';

function InstalledScripts() {
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [configDialog, setConfigDialog] = useState<{
    isOpen: boolean;
    script: ScriptInfo | null;
  }>({ isOpen: false, script: null });
  const [status, setStatus] = useState('');
  const [scrapeItems, setScrapeItems] = useState<any[] | null>(null);
  const [showScrapeDialog, setShowScrapeDialog] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    loadScripts();
  }, []);

  const loadScripts = async () => {
    try {
      console.log('Loading scripts...');
      const installedScripts = await invoke<ScriptInfo[]>('get_installed_scripts');
      console.log('Loaded scripts:', installedScripts);
      setScripts(installedScripts);
      if (installedScripts.length === 0) {
        console.log('No scripts found');
      }
    } catch (error) {
      console.error('Failed to load scripts:', error);
      setStatus(`Failed to load scripts: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const openConfigDialog = (script: ScriptInfo) => {
    setConfigDialog({ isOpen: true, script });
  };

  const closeConfigDialog = () => {
    setConfigDialog({ isOpen: false, script: null });
  };

  const runScript = async (scriptName: string, config?: ScriptConfig) => {
    if ((window as any).__icnxScriptRunning) {
      setStatus('Another script is currently running. Please wait for it to finish.');
      return;
    }
    (window as any).__icnxScriptRunning = true;
    window.dispatchEvent(new CustomEvent('icnx:script-running-changed', { detail: { running: true } }));
    setRunningScript(scriptName);
    setStatus(`Running ${scriptName}...`);

    try {
      const result = await invoke<EmitPayload>('run_script', { 
        scriptName, 
        options: config || {} 
      });
      setStatus(`Script completed! Found ${result.items.length} items.`);
      setScrapeItems(result.items);
      setShowScrapeDialog(true);
    } catch (error) {
      setStatus(`Script failed: ${error}`);
    } finally {
      setRunningScript(null);
      (window as any).__icnxScriptRunning = false;
      window.dispatchEvent(new CustomEvent('icnx:script-running-changed', { detail: { running: false } }));
    }
  };

  const downloadAllFromEmit = async (emit: EmitPayload) => {
    try {
      const settings = await invoke<AppSettings>('get_settings');
      const baseDir = settings.default_download_dir;
      const destination = emit.dir ? `${baseDir}/${emit.dir}` : baseDir;
      let success = 0;
      let failed = 0;
      for (let i = 0; i < emit.items.length; i++) {
        const item = emit.items[i];
        const label = item.title || item.filename || item.url;
        setStatus(`Downloading ${i + 1}/${emit.items.length}: ${label}`);
        try {
          await invoke<DownloadProgress>('download_with_progress', {
            request: { url: item.url, destination }
          });
          success++;
        } catch (e) {
          console.error('Download failed', e);
          failed++;
        }
      }
      setStatus(`Finished. Success: ${success}, Failed: ${failed}. Saved to: ${destination}`);
    } catch (e) {
      setStatus(`Failed to download items: ${e}`);
    }
  };

  const handleScriptRun = (script: ScriptInfo) => {
    if (script.options && script.options.length > 0) {
      // Open configuration dialog if script has options
      openConfigDialog(script);
    } else {
      // Run directly if no options
      runScript(script.name);
    }
  };

  const handleConfiguredRun = (config: ScriptConfig) => {
    if (configDialog.script) {
      runScript(configDialog.script.name, config);
    }
  };

  const getScriptIcon = (tags?: string[]) => {
    if (!tags) return '📄';
    if (tags.includes('video')) return '🎥';
    if (tags.includes('image')) return '🖼️';
    if (tags.includes('social')) return '📱';
    return '📄';
  };

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Installed Scripts</h1>
          <p className="text-gray-400">Loading scripts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Installed Scripts</h1>
        <p className="text-gray-400">Manage and run your Python and JavaScript scraper scripts</p>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-sm text-gray-400">
          {scripts.length} script{scripts.length !== 1 ? 's' : ''} installed
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center space-x-2" onClick={() => {
            window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'playground' } }));
          }}>
            <Code size={16} />
            <span>Playground</span>
          </button>
          <button className="btn-primary flex items-center space-x-2" onClick={() => setInstallOpen(true)}>
          <Plus size={16} />
          <span>Install Script</span>
          </button>
        </div>
      </div>

      <InstallScriptDialog isOpen={installOpen} onClose={() => { setInstallOpen(false); loadScripts(); }} onSaved={() => { setInstallOpen(false); loadScripts(); }} />

      {/* Scripts Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {scripts.map((script) => (
          <div key={script.name} className="card hover:bg-gray-750 transition-colors duration-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="text-2xl">{script.icon || getScriptIcon(script.tags)}</div>
                <div>
                  <h3 className="font-semibold text-white">{script.name}</h3>
                  <p className="text-xs text-gray-400">v{script.version}</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-300 mb-4 line-clamp-2">
              {script.description}
            </p>

            {/* Tags */}
            {script.tags && script.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-4">
                {script.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-2">
              <button
                onClick={() => handleScriptRun(script)}
                disabled={runningScript === script.name}
                className="btn-primary flex-1 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Play size={14} />
                <span>{runningScript === script.name ? 'Running...' : 'Run'}</span>
              </button>
              {script.options && script.options.length > 0 && (
                <button 
                  onClick={() => openConfigDialog(script)}
                  className="btn-ghost p-2"
                  title="Configure Script"
                >
                  <SettingsIcon size={14} />
                </button>
              )}
              <button className="btn-ghost p-2" onClick={() => {
                (window as any).__icnxPendingEdit = { dirOrName: script.name };
                window.dispatchEvent(new CustomEvent('icnx:navigate', { detail: { tab: 'playground', edit: script.name } }));
                // Fallback event in case Playground is already mounted
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('icnx:edit-script', { detail: { dirOrName: script.name } }));
                }, 200);
              }}>
                <Edit size={14} />
              </button>
              <button className="btn-ghost p-2 text-red-400 hover:text-red-300" onClick={async () => {
                if (!confirm(`Delete script "${script.name}"? This cannot be undone.`)) return;
                try {
                  await invoke('delete_script', { scriptNameOrDir: script.name });
                  setStatus(`Deleted ${script.name}`);
                  loadScripts();
                } catch (e) {
                  setStatus(`Delete failed: ${e}`);
                }
              }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {scripts.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📄</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Scripts Installed</h3>
          <p className="text-gray-400 mb-6">
            Install scripts from the Community tab or create your own
          </p>
          <button className="btn-primary">
            Browse Community Scripts
          </button>
        </div>
      )}

      {/* Status */}
      {status && (
        <div className={`mt-6 p-4 rounded-lg ${
          status.includes('failed') || status.includes('Failed') 
            ? 'bg-red-900/50 border border-red-700 text-red-200'
            : status.includes('completed') || status.includes('Found')
            ? 'bg-green-900/50 border border-green-700 text-green-200'
            : 'bg-blue-900/50 border border-blue-700 text-blue-200'
        }`}>
          <p className="text-sm">{status}</p>
        </div>
      )}

      {/* Scrape Results selection */}
      {showScrapeDialog && scrapeItems && (
        <ScrapeResultsDialog
          isOpen={showScrapeDialog}
          onClose={() => setShowScrapeDialog(false)}
          items={scrapeItems}
          onConfirm={async (selected) => {
            setShowScrapeDialog(false);
            // download only selected items
            await downloadAllFromEmit({ dir: undefined, items: selected } as any);
          }}
        />
      )}

      {/* Script Configuration Dialog */}
      {configDialog.script && (
        <ScriptConfigDialog
          script={configDialog.script}
          isOpen={configDialog.isOpen}
          onClose={closeConfigDialog}
          onRun={handleConfiguredRun}
        />
      )}

      {/* Playground moved to its own page */}
    </div>
  );
}

export default InstalledScripts;
