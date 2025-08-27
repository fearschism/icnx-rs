import { useState } from 'react';
import { Search, Star, Download, ExternalLink } from 'lucide-react';

interface CommunityScript {
  id: string;
  name: string;
  description: string;
  author: string;
  rating: number;
  downloads: number;
  tags: string[];
  icon: string;
  version: string;
}

const mockScripts: CommunityScript[] = [
  {
    id: '1',
    name: 'YouTube Downloader',
    description: 'Download videos from YouTube with multiple quality options and metadata extraction',
    author: 'community',
    rating: 4.8,
    downloads: 142,
    tags: ['video', 'youtube', 'social'],
    icon: '🎥',
    version: '2.1.0'
  },
  {
    id: '2',
    name: 'Instagram Media',
    description: 'Save photos, videos, and stories from Instagram posts and profiles',
    author: 'community',
    rating: 4.6,
    downloads: 89,
    tags: ['image', 'video', 'instagram', 'social'],
    icon: '📷',
    version: '1.4.2'
  },
  {
    id: '3',
    name: 'Reddit Scraper',
    description: 'Download Reddit posts, images, and comments with full thread support',
    author: 'community',
    rating: 4.7,
    downloads: 76,
    tags: ['reddit', 'social', 'text'],
    icon: '📱',
    version: '1.3.1'
  },
  {
    id: '4',
    name: 'Twitter Media',
    description: 'Download Twitter images, videos, and GIFs from tweets and threads',
    author: 'community',
    rating: 4.5,
    downloads: 54,
    tags: ['twitter', 'social', 'image', 'video'],
    icon: '🐦',
    version: '1.2.0'
  },
  {
    id: '5',
    name: 'Pinterest Images',
    description: 'Bulk download images from Pinterest boards and pins',
    author: 'community',
    rating: 4.4,
    downloads: 38,
    tags: ['pinterest', 'image', 'bulk'],
    icon: '📌',
    version: '1.1.0'
  },
  {
    id: '6',
    name: 'TikTok Downloader',
    description: 'Download TikTok videos without watermarks',
    author: 'community',
    rating: 4.9,
    downloads: 203,
    tags: ['tiktok', 'video', 'social'],
    icon: '🎵',
    version: '1.0.5'
  }
];

const categories = ['All', 'Social Media', 'Video', 'Images', 'Documents'];

function Community() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isInstalling, setIsInstalling] = useState<string | null>(null);

  const filteredScripts = mockScripts.filter(script => {
    const matchesSearch = script.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         script.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         script.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'All' || 
                           script.tags.some(tag => {
                             if (selectedCategory === 'Social Media') return ['social', 'youtube', 'instagram', 'twitter', 'tiktok', 'reddit', 'pinterest'].includes(tag);
                             if (selectedCategory === 'Video') return tag === 'video';
                             if (selectedCategory === 'Images') return tag === 'image';
                             if (selectedCategory === 'Documents') return tag === 'document';
                             return true;
                           });
    
    return matchesSearch && matchesCategory;
  });

  const handleInstall = async (script: CommunityScript) => {
    setIsInstalling(script.id);
    
    // Simulate installation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsInstalling(null);
    // TODO: Actually install the script
    console.log('Installing script:', script.name);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Community</h1>
        <p className="text-gray-400">Browse and install scripts created by the community</p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search community scripts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex space-x-2 mb-8 overflow-x-auto">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
              selectedCategory === category
                ? 'bg-primary-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Scripts Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredScripts.map((script) => (
          <div key={script.id} className="card hover:bg-gray-750 transition-colors duration-200">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="text-2xl">{script.icon}</div>
                <div>
                  <h3 className="font-semibold text-white">{script.name}</h3>
                  <p className="text-xs text-gray-400">v{script.version} by {script.author}</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-300 mb-4 line-clamp-3">
              {script.description}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1 mb-4">
              {script.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded-full"
                >
                  {tag}
                </span>
              ))}
              {script.tags.length > 3 && (
                <span className="px-2 py-1 text-xs text-gray-400">
                  +{script.tags.length - 3} more
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
              <div className="flex items-center space-x-1">
                <Star size={12} className="text-yellow-400 fill-current" />
                <span>{script.rating}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Download size={12} />
                <span>{script.downloads} downloads</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-2">
              <button
                onClick={() => handleInstall(script)}
                disabled={isInstalling === script.id}
                className="btn-primary flex-1 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                <Download size={14} />
                <span>{isInstalling === script.id ? 'Installing...' : 'Install'}</span>
              </button>
              <button className="btn-ghost p-2">
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredScripts.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-white mb-2">No Scripts Found</h3>
          <p className="text-gray-400 mb-6">
            Try adjusting your search or category filters
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
            className="btn-secondary"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}

export default Community;
