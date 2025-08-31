"""
ICNX Python Script: Basic Web Scraping

@name: Basic Web Scraper
@author: ICNX Team
@version: 1.0.0
@description: Simple web scraping example for images and videos
@entry: main
"""

def main(options):
    """
    Main entry point - equivalent to main() in JS scripts
    """
    input_url = options.get('inputUrl', '')
    icnx.logger.info(f"Starting scrape of {input_url}")
    
    try:
        # Fetch the webpage
        html = icnx.fetch(input_url)
        
        # Parse and extract download links
        links = icnx.select(html, 'a[href*=".jpg"], a[href*=".png"], a[href*=".mp4"]')
        
        items = []
        for link in links:
            href = link['attrs'].get('href', '')
            if href:
                # Make absolute URL
                if href.startswith('/'):
                    from urllib.parse import urljoin
                    href = urljoin(input_url, href)
                
                # Extract filename
                filename = href.split('/')[-1]
                
                item = {
                    'url': href,
                    'filename': filename,
                    'title': link.get('text', '').strip(),
                    'type': 'media'
                }
                
                items.append(item)
                # Emit item immediately for real-time updates
                icnx.emit_partial(item)
        
        # Final emit with all items
        icnx.emit({
            'dir': options.get('outputDir', 'downloads'),
            'items': items
        })
        
        icnx.logger.info(f"Found {len(items)} items to download")
        
    except Exception as e:
        icnx.logger.error(f"Script failed: {str(e)}")
        raise


def on_resolve(url, ctx):
    """
    Alternative entry point - equivalent to onResolve() in JS scripts
    Used for URL-specific handling
    """
    icnx.logger.info(f"Resolving URL: {url}")
    
    # Example: Handle different URL patterns
    if 'gallery' in url:
        handle_gallery(url, ctx)
    elif 'post' in url:
        handle_post(url, ctx)
    else:
        # Fallback to main logic
        main({'inputUrl': url, **ctx})


def handle_gallery(url, ctx):
    """Handle gallery URLs"""
    html = icnx.fetch(url)
    
    # Extract post URLs from gallery
    post_links = icnx.select(html, '.gallery-item a')
    
    for link in post_links:
        post_url = link['attrs'].get('href', '')
        if post_url:
            from urllib.parse import urljoin
            post_url = urljoin(url, post_url)
            handle_post(post_url, ctx)


def handle_post(url, ctx):
    """Handle individual post URLs"""
    html = icnx.fetch(url)
    
    # Extract media from post
    media_elements = icnx.select(html, 'img, video, a[href*=".jpg"], a[href*=".mp4"]')
    
    for element in media_elements:
        media_url = element['attrs'].get('src') or element['attrs'].get('href')
        if media_url:
            from urllib.parse import urljoin
            media_url = urljoin(url, media_url)
            
            filename = media_url.split('/')[-1]
            
            item = {
                'url': media_url,
                'filename': filename,
                'title': element.get('text', '').strip() or filename,
                'type': 'media'
            }
            
            icnx.emit_partial(item)
