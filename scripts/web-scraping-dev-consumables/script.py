# Web scraping script for web-scraping.dev consumables section with pagination

__meta__ = {
    "name": "web-scraping-dev-consumables",
    "description": "Scrape consumables from web-scraping.dev with pagination",
    "version": "1.0.0",
    "author": "ICNX",
    "options": [
        {
            "id": "max_pages",
            "type": "number",
            "label": "Max Pages",
            "description": "Maximum pages to scrape (0 = auto-discover all)",
            "default": 0,
            "min": 0,
            "max": 50
        }
    ]
}

import re
from urllib.parse import urljoin, urlparse

def onResolve(url, ctx):
    base = "https://web-scraping.dev/products?category=consumables&page="
    max_pages = icnx.get_option("max_pages", 0)  # 0 = auto-discover
    
    # Discover total pages by scanning pagination links on first page
    first_html = icnx.fetch(base + "1&sort=desc")
    pagers = icnx.select(first_html, 'a[href*="category=consumables"][href*="page="]')
    
    last_page = 1
    for a in pagers:
        href = a.get("href", "")
        match = re.search(r'page=(\d+)', href, re.IGNORECASE)
        if match:
            n = int(match.group(1))
            last_page = max(last_page, n)
    
    if max_pages > 0:
        last_page = min(last_page, max_pages)
    
    items = []
    for p in range(1, last_page + 1):
        page_url = f"{base}{p}&sort=desc"
        html = icnx.fetch(page_url)
        
        # Target images within product cards or links to products
        candidates = icnx.select(html, 'a[href*="/products/"] img, article img, li img, .product img, main img')
        
        for img in candidates:
            src = img.get("src") or img.get("data-src") or ""
            if not src:
                continue
                
            # Make absolute URL
            if src.startswith("http"):
                abs_url = src
            else:
                abs_url = urljoin(page_url, src)
            
            filename = abs_url.split("/")[-1] or "image.jpg"
            
            # Skip SVG files
            if re.search(r'\.svg($|\?)', filename, re.IGNORECASE):
                continue
                
            title = img.get_text() or img.get("alt") or filename
            
            item = {
                "url": abs_url,
                "filename": filename,
                "title": title,
                "type": "image"
            }
            
            items.append(item)
    
    icnx.emit({"dir": "web-scraping-dev/consumables", "items": items})
