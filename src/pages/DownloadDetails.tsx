import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ArrowLeft, Download, Clock, HardDrive, Zap, AlertCircle, CheckCircle } from 'lucide-react';
import type { DownloadProgress } from '../types';

interface DownloadInfo {
  id: string;
  url: string;
  filename: string;
  destination: string;
}



interface DownloadDetailsProps {
  downloadInfo: DownloadInfo | null;
  onBack: () => void;
}

function DownloadDetails({ downloadInfo, onBack }: DownloadDetailsProps) {
  const [progress, setProgress] = useState<DownloadProgress>({
    progress: 0,
    downloaded: 0,
    speed: 0,
    status: 'downloading',
    url: '',
    filename: ''
  });
  const [startTime, setStartTime] = useState<Date | null>(null);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
  };

  const startDownload = useCallback(async () => {
    if (!downloadInfo) return;

    setStartTime(new Date());
    setProgress(prev => ({ ...prev, status: 'downloading' }));

    try {
      const result = await invoke<DownloadProgress>('download_with_progress', {
        request: {
          url: downloadInfo.url,
          destination: downloadInfo.destination
        }
      });

      setProgress({
        ...result,
        status: 'completed'
      });
    } catch (error) {
      setProgress(prev => ({
        ...prev,
        status: 'failed',
        error: String(error)
      }));
    }
  }, [downloadInfo]);

  useEffect(() => {
    if (downloadInfo) {
      startDownload();
    }
  }, [downloadInfo, startDownload]);



  if (!downloadInfo) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={onBack}
          className="btn-ghost flex items-center space-x-2 mb-6"
        >
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📥</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Download Selected</h3>
          <p className="text-gray-400">Go back to start a download</p>
        </div>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'downloading':
        return <Download className="animate-pulse text-blue-400" size={24} />;
      case 'completed':
        return <CheckCircle className="text-green-400" size={24} />;
      case 'failed':
        return <AlertCircle className="text-red-400" size={24} />;
      case 'cancelled':
        return <AlertCircle className="text-yellow-400" size={24} />;
      default:
        return <Download className="text-gray-400" size={24} />;
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case 'downloading':
        return 'Downloading...';
      case 'completed':
        return 'Download Complete';
      case 'failed':
        return 'Download Failed';
      case 'cancelled':
        return 'Download Cancelled';
      default:
        return progress.status || 'Unknown Status';
    }
  };

  const getStatusColor = () => {
    switch (progress.status) {
      case 'downloading':
        return 'text-blue-400';
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'cancelled':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="animate-fade-in">
      <button
        onClick={onBack}
        className="btn-ghost flex items-center space-x-2 mb-6"
      >
        <ArrowLeft size={18} />
        <span>Back to Downloads</span>
      </button>

      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-white mb-8">Download Progress</h1>

        {/* File Info Card */}
        <div className="card mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              {getStatusIcon()}
              <div>
                <h3 className="font-semibold text-white text-lg">
                  {progress.filename || downloadInfo.filename}
                </h3>
                <p className={`text-sm ${getStatusColor()}`}>{getStatusText()}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-400">
            <div className="flex justify-between">
              <span>URL:</span>
              <span className="text-gray-300 truncate ml-4 max-w-md">{downloadInfo.url}</span>
            </div>
            <div className="flex justify-between">
              <span>Destination:</span>
              <span className="text-gray-300">{downloadInfo.destination}</span>
            </div>
          </div>
        </div>

        {/* Progress Card */}
        <div className="card mb-6">
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-300">Progress</span>
              <span className="text-sm text-gray-400">
                {Math.round(progress.progress * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className="bg-blue-500 h-3 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress.progress * 100}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <HardDrive size={16} className="text-gray-400" />
              <div>
                <div className="text-gray-400">Downloaded</div>
                <div className="text-white font-mono">
                  {formatBytes(progress.downloaded)}
                  {progress.total && ` / ${formatBytes(progress.total)}`}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Zap size={16} className="text-gray-400" />
              <div>
                <div className="text-gray-400">Speed</div>
                <div className="text-white font-mono">{formatSpeed(progress.speed)}</div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Clock size={16} className="text-gray-400" />
              <div>
                <div className="text-gray-400">Time Remaining</div>
                <div className="text-white font-mono">
                  {progress.eta ? formatTime(progress.eta) : '--'}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Download size={16} className="text-gray-400" />
              <div>
                <div className="text-gray-400">Elapsed</div>
                <div className="text-white font-mono">
                  {startTime ? formatTime((Date.now() - startTime.getTime()) / 1000) : '--'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {progress.status === 'failed' && progress.error && (
          <div className="card bg-red-900/20 border-red-700">
            <div className="flex items-start space-x-3">
              <AlertCircle className="text-red-400 flex-shrink-0 mt-1" size={20} />
              <div>
                <h4 className="font-semibold text-red-300 mb-2">Download Failed</h4>
                <p className="text-red-200 text-sm">{progress.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success Actions */}
        {progress.status === 'completed' && (
          <div className="card bg-green-900/20 border-green-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CheckCircle className="text-green-400" size={20} />
                <div>
                  <h4 className="font-semibold text-green-300">Download Complete!</h4>
                  <p className="text-green-200 text-sm">File saved successfully</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button className="btn-secondary">Open Folder</button>
                <button className="btn-primary">Open File</button>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {progress.status === 'downloading' && (
          <div className="flex space-x-3">
            <button 
              onClick={() => setProgress(prev => ({ ...prev, status: 'cancelled' }))}
              className="btn-secondary flex-1"
            >
              Cancel Download
            </button>
            <button className="btn-ghost">Pause</button>
          </div>
        )}

        {(progress.status === 'failed' || progress.status === 'cancelled') && (
          <div className="flex space-x-3">
            <button 
              onClick={() => startDownload()}
              className="btn-primary flex-1"
            >
              Retry Download
            </button>
            <button onClick={onBack} className="btn-secondary">
              Back to Downloads
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default DownloadDetails;
