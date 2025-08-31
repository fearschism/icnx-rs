"""
Simple Python class-based ICNX script
"""

__meta__ = {
    "name": "Reddit Media Scraper",
    "author": "ICNX Team", 
    "version": "1.0.0",
    "description": "Scrapes media from Reddit posts and galleries",
    "supportedDomains": [
        "reddit.com",
        "*.reddit.com"
    ],
    "options": [
        {
            "id": "subreddit",
            "type": "text",
            "label": "Subreddit",
            "description": "Name of the subreddit to scrape",
            "required": True
        },
        {
            "id": "limit",
            "type": "number",
            "label": "Post Limit",
            "default": 25,
            "min": 1,
            "max": 100
        }
    ]
}

class ICNXScript:
    name = "Reddit Media Scraper"
    author = "ICNX Team"
    version = "1.0.0"
    description = "Scrapes media from Reddit posts and galleries"
    
    def __init__(self):
        self.items = []
    
    def main(self, options=None):
        """Main execution method"""
        if not options:
            options = {}
            
        url = options.get('inputUrl', '')
        
        if 'reddit.com' not in url:
            raise ValueError("This script is designed for Reddit URLs")
        
        print(f"Scraping Reddit URL: {url}")
        
        # Get page content
        html = icnx.fetch(url, {
            'User-Agent': 'Mozilla/5.0 (compatible; ICNX/1.0)'
        })
        
        # Reddit-specific selectors
        selectors = [
            'img[src*="i.redd.it"]',
            'img[src*="preview.redd.it"]', 
            'video[src*="v.redd.it"]',
            'a[href*="i.redd.it"]',
            'a[href*="v.redd.it"]'
        ]
        
        for selector in selectors:
            elements = icnx.select(html, selector)
            
            for element in elements:
                media_url = element['attrs'].get('src') or element['attrs'].get('href')
                
                if media_url and self._is_valid_media(media_url):
                    item = self._create_item(media_url, url)
                    if item:
                        self.items.append(item)
                        icnx.emit_partial(item)
        
        # Final emit
        icnx.emit({
            'dir': options.get('outputDir', 'reddit_downloads'),
            'items': self.items
        })
        
        print(f"Found {len(self.items)} Reddit media items")
    
    def _is_valid_media(self, url):
        """Check if URL is valid media"""
        media_domains = ['i.redd.it', 'v.redd.it', 'preview.redd.it']
        return any(domain in url for domain in media_domains)
    
    def _create_item(self, media_url, source_url):
        """Create download item"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(media_url)
            filename = parsed.path.split('/')[-1]
            
            # Reddit URLs sometimes need extension fixes
            if not '.' in filename:
                if 'v.redd.it' in media_url:
                    filename += '.mp4'
                else:
                    filename += '.jpg'
            
            return {
                'url': media_url,
                'filename': filename,
                'title': f"Reddit media - {filename}",
                'type': 'video' if '.mp4' in filename else 'image'
            }
        except:
            return None


# Create instance for ICNX to use
script = ICNXScript()

def main(options=None):
    """Entry point for ICNX"""
    script.main(options)

def on_resolve(url, ctx=None):
    """URL resolution entry point"""
    script.main({'inputUrl': url, **(ctx or {})})
