# Simple but powerful options schema
__meta__ = {
    "name": "YouTube-dl Style Scraper",
    "version": "1.0.0",
    "description": "Simple scraper with youtube-dl inspired options",
    "supportedDomains": [],
    "options": [
        {
            "id": "url",
            "type": "url",
            "label": "URL",
            "required": True,
            "description": "URL to download from"
        },
        {
            "id": "output",
            "type": "text",
            "label": "Output Directory",
            "default": "./downloads",
            "description": "Output directory"
        },
        {
            "id": "format",
            "type": "select",
            "label": "Format",
            "default": "best",
            "options": [
                {"value": "best", "label": "Best Quality"},
                {"value": "worst", "label": "Worst Quality"},
                {"value": "mp4", "label": "MP4"},
                {"value": "webm", "label": "WebM"},
                {"value": "any", "label": "Any Format"}
            ]
        },
        {
            "id": "limit",
            "type": "number",
            "label": "Maximum Downloads",
            "min": 1,
            "max": 1000,
            "default": 50
        },
        {
            "id": "verbose",
            "type": "bool",
            "label": "Verbose Logging",
            "description": "Enable verbose logging"
        },
        {
            "id": "retries",
            "type": "number",
            "label": "Retries",
            "default": 3,
            "description": "Number of retries on failure"
        },
        {
            "id": "delay",
            "type": "number",
            "label": "Request Delay",
            "min": 0.0,
            "max": 60.0,
            "default": 1.0,
            "description": "Delay between requests (seconds)"
        }
    ]
}

def main(options=None):
    """Simple main function using the options"""
    opts = options or {}
    
    # Get values with automatic type conversion and defaults
    url = opts['url']  # Required, will raise if missing
    output_dir = opts.get('output', './downloads')
    format_pref = opts.get('format', 'best')
    limit = opts.get('limit', 50)
    verbose = opts.get('verbose', False)
    retries = opts.get('retries', 3)
    delay = opts.get('delay', 1.0)
    
    if verbose:
        icnx.logger.info(f"Verbose mode enabled")
        icnx.logger.info(f"Config: format={format_pref}, limit={limit}, retries={retries}")
    
    icnx.logger.info(f"Downloading from: {url}")
    
    for attempt in range(retries + 1):
        try:
            html = icnx.fetch(url)
            break
        except Exception as e:
            if attempt == retries:
                raise
            icnx.logger.warn(f"Attempt {attempt + 1} failed: {e}")
            icnx.sleep(delay)
    
    # Simple media extraction
    links = icnx.select(html, 'a[href*=".mp4"], a[href*=".jpg"], img, video')
    
    items = []
    for i, link in enumerate(links[:limit]):
        if delay > 0 and i > 0:
            icnx.sleep(delay)
            
        media_url = link['attrs'].get('href') or link['attrs'].get('src')
        if media_url:
            filename = media_url.split('/')[-1]
            
            item = {
                'url': media_url,
                'filename': filename,
                'title': f"Item {i+1}: {filename}",
                'type': 'media'
            }
            
            items.append(item)
            icnx.emit_partial(item)
            
            if verbose:
                icnx.logger.info(f"Found: {filename}")
    
    icnx.emit({'dir': output_dir, 'items': items})
    icnx.logger.info(f"Completed: {len(items)} items downloaded")


# Alternative: Use function annotations for type hints
def main_with_types(
    url: str,                    # Required string
    output: str = "./downloads", # Optional with default
    format: str = "best",        # Choice type (validated elsewhere)
    limit: int = 50,             # Integer with implicit range
    verbose: bool = False,       # Boolean flag
    retries: int = 3,
    delay: float = 1.0
):
    """Type-annotated version - cleaner for Python developers"""
    icnx.logger.info(f"Type-safe download from {url}")
    # Implementation same as above...
