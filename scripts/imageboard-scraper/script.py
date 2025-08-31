# ICNX Script Metadata
__meta__ = {
    "name": "Image Board Scraper",
    "author": "ICNX Team",
    "version": "1.0.0", 
    "description": "Scrapes images from imageboards and galleries",
    "entry": "main",
    "options": {
        "inputUrl": {
            "type": "string",
            "required": True,
            "description": "URL to scrape (gallery, imageboard, etc.)",
            "placeholder": "https://example.com/gallery"
        },
        "outputDir": {
            "type": "string", 
            "required": False,
            "default": "downloads",
            "description": "Output directory for downloads"
        },
        "includeVideos": {
            "type": "bool",
            "required": False,
            "default": True,
            "description": "Include video files in scraping"
        },
        "maxItems": {
            "type": "number",
            "required": False,
            "default": 100,
            "min": 1,
            "max": 1000,
            "description": "Maximum number of items to download"
        },
        "fileTypes": {
            "type": "select",
            "required": False,
            "default": "all",
            "options": ["all", "images_only", "videos_only"],
            "description": "Types of files to download"
        },
        "useProxy": {
            "type": "bool",
            "required": False,
            "default": False,
            "description": "Use proxy for requests"
        },
        "proxyUrl": {
            "type": "string",
            "required": False,
            "description": "Proxy URL (if useProxy is enabled)",
            "placeholder": "http://proxy:8080",
            "depends_on": "useProxy"
        },
        "delayBetweenRequests": {
            "type": "number",
            "required": False,
            "default": 1.0,
            "min": 0.1,
            "max": 10.0,
            "step": 0.1,
            "description": "Delay between requests (seconds)"
        }
    }
}

import re
from urllib.parse import urljoin, urlparse

def main(options=None):
    """Main scraping function"""
    if not options:
        options = {}
        
    url = options.get('inputUrl', '')
    
    # Basic validation
    if not url:
        raise ValueError("inputUrl is required")
    
    # Get option values with defaults from __meta__
    include_videos = options.get('includeVideos', True)
    max_items = options.get('maxItems', 100)
    file_types = options.get('fileTypes', 'all')
    use_proxy = options.get('useProxy', False)
    proxy_url = options.get('proxyUrl', '') if use_proxy else None
    delay = options.get('delayBetweenRequests', 1.0)
    
    icnx.logger.info(f"Scraping: {url}")
    icnx.logger.info(f"Config: videos={include_videos}, max={max_items}, type={file_types}")
    
    # Setup request headers (with proxy if needed)
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; ICNX/1.0)'}
    
    # Fetch page content
    html = icnx.fetch(url, headers)
    
    # Build selectors based on file type preference
    if file_types == 'images_only':
        media_selectors = [
            'img[src]',
            'a[href*=".jpg"]',
            'a[href*=".jpeg"]', 
            'a[href*=".png"]',
            'a[href*=".gif"]',
            'a[href*=".webp"]'
        ]
    elif file_types == 'videos_only':
        media_selectors = [
            'video[src]',
            'a[href*=".mp4"]',
            'a[href*=".webm"]',
            'a[href*=".avi"]'
        ]
    else:  # all
        media_selectors = [
            'img[src]',
            'video[src]' if include_videos else None,
            'a[href*=".jpg"]',
            'a[href*=".jpeg"]',
            'a[href*=".png"]',
            'a[href*=".gif"]',
            'a[href*=".webp"]',
            'a[href*=".mp4"]' if include_videos else None,
            'a[href*=".webm"]' if include_videos else None,
            'a[href*=".avi"]' if include_videos else None
        ]
    
    # Remove None selectors
    media_selectors = [s for s in media_selectors if s is not None]
    
    items = []
    item_count = 0
    
    for selector in media_selectors:
        if item_count >= max_items:
            break
            
        elements = icnx.select(html, selector)
        
        for element in elements:
            if item_count >= max_items:
                break
                
            media_url = element['attrs'].get('src') or element['attrs'].get('href')
            
            if media_url:
                # Convert to absolute URL
                media_url = urljoin(url, media_url)
                
                # Extract filename
                parsed = urlparse(media_url)
                filename = parsed.path.split('/')[-1]
                
                # Get file extension
                ext = filename.split('.')[-1].lower() if '.' in filename else ''
                
                # Determine type
                img_exts = ['jpg', 'jpeg', 'png', 'gif', 'webp']
                vid_exts = ['mp4', 'webm', 'avi', 'mov']
                
                file_type = 'image' if ext in img_exts else 'video' if ext in vid_exts else 'media'
                
                item = {
                    'url': media_url,
                    'filename': filename,
                    'title': element.get('text', '').strip() or filename,
                    'type': file_type
                }
                
                items.append(item)
                icnx.emit_partial(item)
                item_count += 1
                
                # Apply delay between requests
                if delay > 0:
                    icnx.sleep(delay)
    
    # Emit final collection
    icnx.emit({
        'dir': options.get('outputDir', 'downloads'),
        'items': items
    })
    
    icnx.logger.info(f"Collected {len(items)} media files (max: {max_items})")


def on_resolve(url, ctx=None):
    """URL resolution handler"""
    main({'inputUrl': url, **(ctx or {})})
