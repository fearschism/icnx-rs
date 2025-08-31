# ICNX Script Metadata with Advanced Options
__meta__ = {
    "name": "Advanced Gallery Scraper",
    "author": "ICNX Team",
    "version": "2.0.0",
    "description": "Advanced gallery scraper with comprehensive options",
    "supportedDomains": [],
    "options": [
        {
            "id": "inputUrl",
            "type": "url",
            "label": "Gallery URL",
            "description": "Gallery URL to scrape",
            "required": True
        },
        {
            "id": "downloadMode",
            "type": "select",
            "label": "Download Mode",
            "required": True,
            "default": "images_and_videos",
            "options": [
                {"value": "images_only", "label": "Images Only"},
                {"value": "videos_only", "label": "Videos Only"},
                {"value": "images_and_videos", "label": "Images & Videos"}
            ]
        },
        {
            "id": "quality",
            "type": "select",
            "label": "Quality",
            "default": "original",
            "options": [
                {"value": "thumbnail", "label": "Thumbnail"},
                {"value": "medium", "label": "Medium Quality"},
                {"value": "high", "label": "High Quality"},
                {"value": "original", "label": "Original"}
            ]
        },
        {
            "id": "maxConcurrent",
            "type": "number",
            "label": "Max Concurrent Downloads",
            "default": 3,
            "min": 1,
            "max": 10
        }
    ]
}

import re
from urllib.parse import urljoin, urlparse

def validate_options(options):
    """Validate options based on __meta__ schema"""
    meta_options = __meta__.get("options", {})
    
    for key, schema in meta_options.items():
        value = options.get(key)
        
        # Check required fields
        if schema.get("required", False) and value is None:
            raise ValueError(f"Required option '{key}' is missing")
        
        # Validate pattern for strings
        if value and schema.get("type") == "string" and "pattern" in schema:
            if not re.match(schema["pattern"], str(value)):
                raise ValueError(f"Option '{key}' {schema.get('validation', 'is invalid')}")
        
        # Validate number ranges
        if value and schema.get("type") in ["number", "range"]:
            if "min" in schema and value < schema["min"]:
                raise ValueError(f"Option '{key}' must be >= {schema['min']}")
            if "max" in schema and value > schema["max"]:
                raise ValueError(f"Option '{key}' must be <= {schema['max']}")

def main(options=None):
    """Main entry point with comprehensive option handling"""
    if not options:
        options = {}
    
    # Validate options
    validate_options(options)
    
    # Extract and process options
    url = options.get('inputUrl')
    download_mode = options.get('downloadMode', 'images_and_videos')
    quality = options.get('quality', 'original')
    max_concurrent = options.get('maxConcurrent', 3)
    enable_filtering = options.get('enableFiltering', False)
    
    icnx.logger.info(f"Starting advanced scrape of {url}")
    icnx.logger.info(f"Mode: {download_mode}, Quality: {quality}, Concurrent: {max_concurrent}")
    
    # Build headers
    headers = options.get('customHeaders', {})
    if not headers.get('User-Agent'):
        headers['User-Agent'] = 'Mozilla/5.0 (compatible; ICNX-Advanced/2.0)'
    
    # Fetch content
    html = icnx.fetch(url, headers)
    
    # Process based on download mode
    if download_mode == 'images_only':
        selectors = ['img[src]', 'a[href*=".jpg"]', 'a[href*=".png"]', 'a[href*=".gif"]']
    elif download_mode == 'videos_only':
        selectors = ['video[src]', 'a[href*=".mp4"]', 'a[href*=".webm"]']
    else:
        selectors = ['img[src]', 'video[src]', 'a[href*=".jpg"]', 'a[href*=".png"]', 'a[href*=".mp4"]']
    
    # Apply filtering if enabled
    if enable_filtering:
        allowed_extensions = options.get('fileExtensions', ['jpg', 'png', 'gif', 'mp4'])
        min_size = options.get('minFileSize', 0)
        icnx.logger.info(f"Filtering: extensions={allowed_extensions}, min_size={min_size}MB")
    
    items = []
    for selector in selectors:
        elements = icnx.select(html, selector)
        
        for element in elements:
            media_url = element['attrs'].get('src') or element['attrs'].get('href')
            if media_url:
                media_url = urljoin(url, media_url)
                filename = media_url.split('/')[-1]
                
                # Apply extension filtering
                if enable_filtering:
                    ext = filename.split('.')[-1].lower()
                    if ext not in allowed_extensions:
                        continue
                
                item = {
                    'url': media_url,
                    'filename': filename,
                    'title': element.get('text', '').strip() or filename,
                    'type': 'media',
                    'quality': quality,
                    'tags': options.get('tags', [])
                }
                
                items.append(item)
                icnx.emit_partial(item)
    
    icnx.emit({
        'dir': options.get('outputDir', 'advanced_downloads'),
        'items': items
    })
    
    icnx.logger.info(f"Advanced scrape completed: {len(items)} items found")

def on_resolve(url, ctx=None):
    """URL resolution entry point"""
    main({'inputUrl': url, **(ctx or {})})
