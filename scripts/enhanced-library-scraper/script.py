# ICNX Enhanced Web Scraper with Python Libraries
__meta__ = {
    "name": "Enhanced Python Library Scraper",
    "author": "ICNX Team", 
    "version": "1.0.0",
    "description": "Demonstrates advanced web scraping using Python libraries like requests, BeautifulSoup, and pandas",
    "supportedDomains": [
        "httpbin.org",
        "example.com",
        "reddit.com",
        "*.reddit.com"
    ],
    "options": [
        {
            "id": "target_url",
            "type": "url",
            "label": "Target URL",
            "description": "Website to scrape",
            "default": "https://httpbin.org/html",
            "required": True
        },
        {
            "id": "use_requests",
            "type": "bool",
            "label": "Use Requests Library",
            "description": "Use Python requests library instead of built-in fetch",
            "default": True
        },
        {
            "id": "parse_with_bs4",
            "type": "bool", 
            "label": "Use BeautifulSoup",
            "description": "Parse HTML with BeautifulSoup instead of built-in selector",
            "default": True
        },
        {
            "id": "save_to_dataframe",
            "type": "bool",
            "label": "Export to DataFrame",
            "description": "Process results with pandas DataFrame",
            "default": False
        },
        {
            "id": "max_items",
            "type": "number",
            "label": "Maximum Items",
            "description": "Maximum number of items to extract",
            "default": 10,
            "min": 1,
            "max": 100
        }
    ]
}

def onResolve(url, ctx):
    """Enhanced web scraping using Python libraries"""
    
    # Get user options
    target_url = icnx.get_option("target_url", "https://httpbin.org/html")
    use_requests = icnx.get_option("use_requests", True)
    parse_with_bs4 = icnx.get_option("parse_with_bs4", True)
    save_to_dataframe = icnx.get_option("save_to_dataframe", False)
    max_items = icnx.get_option("max_items", 10)
    
    print(f"Scraping: {target_url}")
    print(f"Using requests: {use_requests}")
    print(f"Using BeautifulSoup: {parse_with_bs4}")
    
    try:
        # Method 1: Use requests library if available
        if use_requests:
            try:
                # Create a requests session with enhanced features
                session = icnx.create_requests_session()
                response = session.get(target_url, timeout=30)
                response.raise_for_status()
                html_content = response.text
                print("✓ Successfully fetched content using requests library")
            except Exception as e:
                print(f"✗ Requests library failed: {e}")
                print("Falling back to built-in fetch...")
                html_content = icnx.fetch(target_url)
        else:
            # Method 2: Use built-in fetch
            html_content = icnx.fetch(target_url)
            print("✓ Successfully fetched content using built-in fetch")
        
        # Parse HTML content
        links_data = []
        
        if parse_with_bs4:
            try:
                # Method 1: Use BeautifulSoup for parsing
                soup = icnx.parse_html(html_content, "html.parser")
                
                # Extract links using BeautifulSoup
                links = soup.find_all('a', href=True)[:max_items]
                
                for i, link in enumerate(links):
                    href = link.get('href', '')
                    text = link.get_text(strip=True) or f"Link {i+1}"
                    title_attr = link.get('title', '')
                    
                    # Make absolute URL if needed
                    if href.startswith('/'):
                        href = target_url.rstrip('/') + href
                    elif href and not href.startswith(('http://', 'https://')):
                        href = target_url.rstrip('/') + '/' + href
                    
                    if href:
                        links_data.append({
                            'url': href,
                            'text': text,
                            'title': title_attr,
                            'index': i + 1
                        })
                
                print(f"✓ Successfully parsed {len(links_data)} links using BeautifulSoup")
                
            except Exception as e:
                print(f"✗ BeautifulSoup parsing failed: {e}")
                print("Falling back to built-in selector...")
                parse_with_bs4 = False
        
        if not parse_with_bs4:
            # Method 2: Use built-in CSS selector
            link_elements = icnx.select(html_content, "a[href]")[:max_items]
            
            for i, element in enumerate(link_elements):
                href = element.get('href', '') if hasattr(element, 'get') else ''
                text = element.get('text', '') if hasattr(element, 'get') else f"Link {i+1}"
                
                # Make absolute URL if needed  
                if href.startswith('/'):
                    href = target_url.rstrip('/') + href
                elif href and not href.startswith(('http://', 'https://')):
                    href = target_url.rstrip('/') + '/' + href
                
                if href:
                    links_data.append({
                        'url': href,
                        'text': text,
                        'title': '',
                        'index': i + 1
                    })
            
            print(f"✓ Successfully parsed {len(links_data)} links using built-in selector")
        
        # Process with pandas if requested
        if save_to_dataframe and links_data:
            try:
                # Create DataFrame from extracted data
                df = icnx.create_dataframe(links_data)
                
                # Perform some data analysis
                print(f"✓ Created DataFrame with {len(df)} rows")
                
                # Add some computed columns
                df_dict = df.to_dict('records') if hasattr(df, 'to_dict') else links_data
                
                # Add data analysis results to the output
                for item in df_dict[:max_items]:
                    item['text_length'] = len(item.get('text', ''))
                    item['has_title'] = bool(item.get('title', ''))
                
                links_data = df_dict
                print("✓ Enhanced data with pandas analysis")
                
            except Exception as e:
                print(f"✗ Pandas processing failed: {e}")
                print("Continuing with raw data...")
        
        # Prepare items for download/export
        items = []
        for i, link_data in enumerate(links_data[:max_items]):
            # Create different types of exports based on the data
            if save_to_dataframe:
                # Export as JSON data file
                filename = f"link_data_{i+1}.json"
                file_type = "document"
                
                # Create JSON content
                json_content = json.dumps(link_data, indent=2)
                # Use base64 encoding to include content
                encoded_content = icnx.base64_encode(json_content)
                
                items.append({
                    "url": f"data:application/json;base64,{encoded_content}",
                    "filename": filename,
                    "title": f"Link Data: {link_data.get('text', 'Unknown')}",
                    "type": file_type
                })
            else:
                # Export as downloadable links
                items.append({
                    "url": link_data['url'],
                    "filename": f"link_{i+1}.html",
                    "title": link_data.get('text', f"Link {i+1}"),
                    "type": "document"
                })
        
        # Emit results
        result_dir = "enhanced_scraper_results"
        if use_requests:
            result_dir += "_requests"
        if parse_with_bs4:
            result_dir += "_bs4"
        if save_to_dataframe:
            result_dir += "_pandas"
        
        icnx.emit({
            "dir": result_dir,
            "items": items
        })
        
        print(f"✓ Successfully scraped {len(items)} items")
        print(f"Results saved to: {result_dir}")
        
    except Exception as e:
        print(f"✗ Scraping failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Emit error information
        icnx.emit({
            "dir": "scraper_error",
            "items": [{
                "url": f"data:text/plain;base64,{icnx.base64_encode(str(e))}",
                "filename": "error.txt",
                "title": f"Scraping Error: {target_url}",
                "type": "document"
            }]
        })
