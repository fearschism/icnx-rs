export interface DownloadItem {
  url: string;
  filename?: string;
  title?: string;
  type?: string;
  headers?: Record<string, string>;
}

export interface EmitPayload {
  dir?: string;
  items: DownloadItem[];
}

export interface ScriptInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  category?: string;
  tags?: string[];
  icon?: string;
  website?: string;
  supportedDomains?: string[];
  options?: ScriptOption[];
}

export interface ScriptOption {
  id: string;
  type: 'text' | 'number' | 'select' | 'radio' | 'checkbox';
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: { label: string; value: string }[];
  depends_on?: {
    option: string;
    value: string;
  };
}

export interface ScriptConfig {
  [optionId: string]: any;
}

export interface Settings {
  default_download_dir: string;
  max_concurrent: number;
  retries: number;
  backoff_ms: number;
  user_agent: string;
  theme: 'Light' | 'Dark';
  language: string;
  enable_crash_reports: boolean;
  enable_logging: boolean;
}

export interface DownloadHistoryItem {
  id: string;
  filename: string;
  url: string;
  size: string;
  date: string;
  file_type: string;
  status: string;
}

export interface QuickDownloadRequest {
  url: string;
  destination: string;
}

export interface DownloadProgress {
  progress: number;
  downloaded: number;
  total?: number;
  speed: number;
  eta?: number; // seconds
  status: string;
  url: string;
  filename: string;
  error?: string;
}

// Progress system interface used by components like DownloadCard / QuickDownload.
// The actual implementation is attached to window.__icnxProgressSystem at runtime.
export interface IcnxProgressSystem {
  getProgress(url: string): DownloadProgress | undefined;
  getAllProgress(): Record<string, DownloadProgress>;
  updateProgress(url: string, data: Partial<DownloadProgress> & { url: string }): void;
  addSubscriber(cb: (url: string, data: DownloadProgress, all: Record<string, DownloadProgress>) => void): () => void;
}
