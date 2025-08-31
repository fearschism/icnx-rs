"""
ICNX Python Script: Gallery Scraper
"""

__meta__ = {
    "name": "Gallery Scraper",
    "author": "ICNX Team",
    "version": "1.0.0", 
    "description": "Scrapes images and videos from gallery pages",
    "supportedDomains": [],
    "options": [
        {
            "id": "url",
            "type": "url",
            "label": "Gallery URL",
            "description": "URL of the gallery to scrape",
            "required": True
        },
        {
            "id": "max_items",
            "type": "number",
            "label": "Max Items",
            "default": 50,
            "min": 1,
            "max": 200
        }
    ]
}

def main(options=None):
    """Main entry point for the script"""
    if not options:
        options = {}
    
    input_url = options.get('inputUrl', '')
    print(f"[INFO] Starting scrape of {input_url}")
    
    try:
        # Fetch the webpage (icnx will be injected by runtime)
        html = icnx.fetch(input_url)
        
        # Find media links
        links = icnx.select(html, 'a[href*=".jpg"], a[href*=".png"], a[href*=".mp4"], img, video')
        
        items = []
        for link in links:
            url = link['attrs'].get('href') or link['attrs'].get('src')
            if url:
                # Make absolute URL
                if url.startswith('/'):
                    from urllib.parse import urljoin
                    url = urljoin(input_url, url)
                
                filename = url.split('/')[-1].split('?')[0]  # Remove query params
                
                item = {
                    'url': url,
                    'filename': filename,
                    'title': link.get('text', '').strip() or filename,
                    'type': 'media'
                }
                
                items.append(item)
                icnx.emit_partial(item)  # Real-time emission
        
        # Final batch emit
        icnx.emit({
            'dir': options.get('outputDir', 'downloads'),
            'items': items
        })
        
        print(f"[SUCCESS] Found {len(items)} media items")
        
    except Exception as e:
        print(f"[ERROR] Script failed: {str(e)}")
        raise


# Alternative entry point for URL resolution
def on_resolve(url, ctx=None):
    """Handle URL-specific resolution"""
    if not ctx:
        ctx = {}
    
    print(f"[INFO] Resolving URL: {url}")
    main({'inputUrl': url, **ctx})


if __name__ == "__main__":
    # For testing outside ICNX
    test_options = {
        'inputUrl': 'https://example.com/gallery',
        'outputDir': 'test_downloads'
    }
    main(test_options)
