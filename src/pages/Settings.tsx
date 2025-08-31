import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { FolderOpen, Save, RotateCcw, Download, Check, X, RefreshCw, Package } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { NumberField } from '../components/ui/number-field';
import type { Settings as SettingsType } from '../types';

function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const currentSettings = await invoke<SettingsType>('get_settings');
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setStatus('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      await invoke('save_settings_cmd', { settings });
      setStatus('Settings saved successfully');
    } catch (error) {
      setStatus(`Failed to save settings: ${error}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickDirectory = async () => {
    try {
      const selected = await invoke<string | null>('pick_directory');
      if (selected && settings) {
        setSettings({ ...settings, default_download_dir: selected });
      }
    } catch (error) {
      console.error('Failed to pick directory:', error);
      setStatus('Failed to pick directory');
    }
  };

  const resetSettings = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      loadSettings();
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Preferences</h1>
          <p className="text-gray-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Preferences</h1>
        <p className="text-gray-400">Configure app settings and behavior</p>
      </div>

      <div className="max-w-2xl space-y-8">
        {/* General Settings */}
        <Card>
          <h2 className="text-xl font-semibold text-white mb-6">General</h2>
          
          <div className="space-y-6">
            {/* Download Directory */}
            <div>
              <Label className="mb-2">
                Default Download Directory
              </Label>
              <div className="flex space-x-3">
                <Input
                  type="text"
                  value={settings.default_download_dir}
                  onChange={(e) => setSettings({ ...settings, default_download_dir: e.target.value })}
                  className="flex-1"
                />
                <Button
                  onClick={handlePickDirectory}
                  variant="secondary"
                >
                  <FolderOpen size={16} />
                  <span className="ml-2">Browse</span>
                </Button>
              </div>
            </div>

            {/* Max Concurrent Downloads */}
            <div>
              <Label className="mb-2">
                Max Concurrent Downloads
              </Label>
              <Select value={String(settings.max_concurrent)} onValueChange={(v) => setSettings({ ...settings, max_concurrent: parseInt(v) })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Max concurrent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Retry Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-2">
                  Retry Attempts
                </Label>
                <NumberField value={settings.retries} onChange={(v) => setSettings({ ...settings, retries: Number.isFinite(v) ? v : 0 })} min={0} max={10} step={1} />
              </div>
              <div>
                <Label className="mb-2">
                  Retry Delay (ms)
                </Label>
                <NumberField value={settings.backoff_ms} onChange={(v) => setSettings({ ...settings, backoff_ms: Number.isFinite(v) ? v : 1000 })} min={100} step={100} />
              </div>
            </div>

            {/* User Agent */}
            <div>
              <Label className="mb-2">
                User Agent
              </Label>
              <Input
                type="text"
                value={settings.user_agent}
                onChange={(e) => setSettings({ ...settings, user_agent: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* Appearance */}
        <Card>
          <h2 className="text-xl font-semibold text-white mb-6">Appearance</h2>
          
          <div className="space-y-6">
            {/* Theme */}
            <div>
              <Label className="mb-2">
                Theme
              </Label>
              <div className="flex flex-wrap gap-2">
                {(['Light', 'Dark'] as const).map((theme) => (
                  <Button
                    key={theme}
                    onClick={() => {
                      // Update state first
                      setSettings((prev) => {
                        const next = { ...(prev as SettingsType), theme };
                        // apply immediately and deterministically
                        const classes = ['theme-Light','theme-Dark'];
                        document.body.classList.remove(...classes);
                        document.body.classList.add(`theme-${next.theme}`);
                        return next;
                      });
                    }}
                    variant={settings.theme === theme ? 'default' : 'secondary'}
                  >
                    {theme}
                  </Button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <Label className="mb-2">
                Language
              </Label>
              <Select value={settings.language} onValueChange={(v) => setSettings({ ...settings, language: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Privacy & Security */}
        <Card>
          <h2 className="text-xl font-semibold text-white mb-6">Privacy & Security</h2>
          
          <div className="space-y-6">
            {/* Crash Reports */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-300">Enable Crash Reports</h3>
                <p className="text-xs text-gray-400">Help improve ICNX by sending crash reports</p>
              </div>
              <Switch checked={settings.enable_crash_reports} onCheckedChange={(v) => setSettings({ ...settings, enable_crash_reports: !!v })} />
            </div>

            {/* Logging */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-300">Enable Logging</h3>
                <p className="text-xs text-gray-400">Log application events for debugging</p>
              </div>
              <Switch checked={settings.enable_logging} onCheckedChange={(v) => setSettings({ ...settings, enable_logging: !!v })} />
            </div>
          </div>
        </Card>

        {/* Python Packages Management */}
        <PythonPackagesCard />

        {/* Actions */}
        <div className="flex justify-between items-center">
          <Button
            onClick={resetSettings}
            variant="ghost"
          >
            <RotateCcw size={16} />
            <span className="ml-2">Reset to Defaults</span>
          </Button>

          <Button
            onClick={saveSettings}
            disabled={isSaving}
            className="disabled:opacity-50"
          >
            <Save size={16} />
            <span className="ml-2">{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </Button>
        </div>

        {/* Status */}
        {status && (
          <div className={`p-4 rounded-lg ${
            status.includes('Failed') || status.includes('failed')
              ? 'bg-red-900/50 border border-red-700 text-red-200'
              : 'bg-green-900/50 border border-green-700 text-green-200'
          }`}>
            <p className="text-sm">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Python Packages Management Component
function PythonPackagesCard() {
  const [packages, setPackages] = useState<Array<{name: string, installed: boolean}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [installStatus, setInstallStatus] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);

  const essentialPackages = [
    'requests',
    'beautifulsoup4', 
    'lxml',
    'pandas',
    'numpy',
    'urllib3',
    'certifi'
  ];

  useEffect(() => {
    checkPackages();
  }, []);

  const checkPackages = async () => {
    setIsLoading(true);
    try {
      // Map BS4 import name to package name
      const checkNames = essentialPackages.map(pkg => 
        pkg === 'beautifulsoup4' ? 'bs4' : pkg
      );
      
      const results = await invoke<Array<[string, boolean]>>('check_python_packages', {
        packages: checkNames
      });
      
      const packageStatus = essentialPackages.map((pkg, index) => ({
        name: pkg,
        installed: results[index] ? results[index][1] : false
      }));
      
      setPackages(packageStatus);
    } catch (error) {
      console.error('Failed to check packages:', error);
      setInstallStatus(`Failed to check packages: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const installEssentials = async () => {
    setIsInstalling(true);
    setInstallStatus('Installing essential Python packages...');
    
    try {
      const result = await invoke<string>('install_python_essentials');
      setInstallStatus(result);
      // Refresh package status
      await checkPackages();
    } catch (error) {
      setInstallStatus(`Installation failed: ${error}`);
    } finally {
      setIsInstalling(false);
    }
  };

  const setupEnvironment = async () => {
    setIsInstalling(true);
    setInstallStatus('Setting up Python environment...');
    
    try {
      const result = await invoke<string>('setup_python_environment');
      setInstallStatus(result);
      // Refresh package status
      await checkPackages();
    } catch (error) {
      setInstallStatus(`Setup failed: ${error}`);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Card className="p-6 bg-gray-900 border-gray-800">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-100 flex items-center">
              <Package className="mr-2" size={20} />
              Python Packages
            </h2>
            <p className="text-sm text-gray-400">Manage Python libraries for enhanced scripting</p>
          </div>
          <Button
            onClick={checkPackages}
            disabled={isLoading}
            variant="secondary"
            size="sm"
          >
            <RefreshCw className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} size={16} />
            {isLoading ? 'Checking...' : 'Refresh'}
          </Button>
        </div>

        {/* Package Status */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-300">Essential Packages</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {packages.map((pkg) => (
              <div
                key={pkg.name}
                className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
              >
                <span className="text-sm text-gray-300">{pkg.name}</span>
                <div className="flex items-center">
                  {pkg.installed ? (
                    <Check className="text-green-400" size={16} />
                  ) : (
                    <X className="text-red-400" size={16} />
                  )}
                  <span className={`ml-2 text-xs ${
                    pkg.installed ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {pkg.installed ? 'Installed' : 'Missing'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={setupEnvironment}
            disabled={isInstalling}
            className="flex-1"
          >
            <Download className="mr-2" size={16} />
            {isInstalling ? 'Setting up...' : 'Setup Environment'}
          </Button>
          
          <Button
            onClick={installEssentials}
            disabled={isInstalling}
            variant="secondary"
            className="flex-1"
          >
            <Package className="mr-2" size={16} />
            {isInstalling ? 'Installing...' : 'Install Essentials'}
          </Button>
        </div>

        {/* Status */}
        {installStatus && (
          <div className={`p-4 rounded-lg ${
            installStatus.includes('failed') || installStatus.includes('Failed')
              ? 'bg-red-900/50 border border-red-700 text-red-200'
              : installStatus.includes('Installing') || installStatus.includes('Setting up')
              ? 'bg-blue-900/50 border border-blue-700 text-blue-200'
              : 'bg-green-900/50 border border-green-700 text-green-200'
          }`}>
            <p className="text-sm">{installStatus}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

export default Settings;
