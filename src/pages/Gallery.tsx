import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Search, MoreHorizontal, ExternalLink, Trash2, Download, Eye } from 'lucide-react';
import type { DownloadHistoryItem } from '../types';

function Gallery() {
  const [downloads, setDownloads] = useState<DownloadHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadDownloadHistory();
  }, []);

  const loadDownloadHistory = async () => {
    try {
      const history = await invoke<DownloadHistoryItem[]>('get_download_history');
      setDownloads(history);
    } catch (error) {
      console.error('Failed to load download history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'image': return '🖼️';
      case 'video': return '🎥';
      case 'audio': return '🎵';
      case 'document': return '📄';
      case 'archive': return '📦';
      default: return '📁';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'downloading': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const filteredDownloads = downloads.filter(download =>
    download.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    download.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSize = downloads.reduce((acc, download) => {
    const sizeMatch = download.size.match(/(\d+\.?\d*)\s*(MB|GB|KB)/);
    if (sizeMatch) {
      const value = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2];
      const mbValue = unit === 'GB' ? value * 1024 : unit === 'KB' ? value / 1024 : value;
      return acc + mbValue;
    }
    return acc;
  }, 0);

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Gallery</h1>
          <p className="text-gray-400">Loading download history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Gallery</h1>
        <p className="text-gray-400">View and manage your downloaded files</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card text-center">
          <div className="text-2xl font-bold text-white mb-1">{downloads.length}</div>
          <div className="text-sm text-gray-400">Total Downloads</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-white mb-1">{totalSize.toFixed(1)} MB</div>
          <div className="text-sm text-gray-400">Total Size</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-white mb-1">
            {downloads.filter(d => d.status === 'Completed').length}
          </div>
          <div className="text-sm text-gray-400">Completed</div>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="flex justify-between items-center mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search downloads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
        <button className="btn-secondary ml-4">
          <Trash2 size={16} className="mr-2" />
          Clear All
        </button>
      </div>

      {/* Downloads List */}
      <div className="space-y-3">
        {filteredDownloads.map((download) => (
          <div key={download.id} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 flex-1 min-w-0">
                <div className="text-2xl flex-shrink-0">
                  {getFileIcon(download.file_type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white truncate">{download.filename}</h3>
                  <div className="flex items-center space-x-4 text-sm text-gray-400">
                    <span>{download.size}</span>
                    <span>•</span>
                    <span>{download.date}</span>
                    <span>•</span>
                    <span className={getStatusColor(download.status)}>{download.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-1">
                    {download.url}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
                <button className="btn-ghost p-2" title="Open file">
                  <ExternalLink size={16} />
                </button>
                <button className="btn-ghost p-2" title="Show in folder">
                  <Eye size={16} />
                </button>
                <button className="btn-ghost p-2" title="Download again">
                  <Download size={16} />
                </button>
                <button className="btn-ghost p-2">
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {downloads.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📂</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Downloads Yet</h3>
          <p className="text-gray-400 mb-6">
            Your downloaded files will appear here
          </p>
          <button className="btn-primary">
            Start Downloading
          </button>
        </div>
      )}

      {/* No Search Results */}
      {downloads.length > 0 && filteredDownloads.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Results Found</h3>
          <p className="text-gray-400">
            Try adjusting your search query
          </p>
        </div>
      )}
    </div>
  );
}

export default Gallery;
