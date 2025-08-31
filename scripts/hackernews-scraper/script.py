# ICNX Hacker News Scraper
__meta__ = {
    "name": "Hacker News Story Scraper",
    "author": "ICNX Team",
    "version": "1.0.0", 
    "description": "Scrapes stories from Hacker News front page using Python libraries",
    "supportedDomains": [
        "news.ycombinator.com",
        "ycombinator.com"
    ],
    "options": [
        {
            "id": "max_stories",
            "type": "number",
            "label": "Max Stories",
            "description": "Maximum number of stories to scrape",
            "default": 10,
            "min": 1,
            "max": 30
        },
        {
            "id": "include_comments",
            "type": "bool",
            "label": "Include Comment Links",
            "description": "Include links to comment pages",
            "default": True
        },
        {
            "id": "min_points",
            "type": "number",
            "label": "Minimum Points",
            "description": "Only include stories with this many points or more",
            "default": 0,
            "min": 0
        }
    ]
}

def onResolve(url, ctx):
    """Scrape Hacker News stories with enhanced parsing"""
    
    max_stories = icnx.get_option("max_stories", 10)
    include_comments = icnx.get_option("include_comments", True)
    min_points = icnx.get_option("min_points", 0)
    
    base_url = "https://news.ycombinator.com"
    
    print(f"Scraping Hacker News for {max_stories} stories...")
    
    try:
        # Use requests if available for better session handling
        try:
            session = icnx.create_requests_session()
            response = session.get(base_url, timeout=30)
            response.raise_for_status()
            html_content = response.text
            print("✓ Fetched content using requests library")
        except Exception as e:
            print(f"Requests failed: {e}, falling back to built-in fetch")
            html_content = icnx.fetch(base_url)
        
        # Parse with BeautifulSoup if available
        stories = []
        try:
            soup = icnx.parse_html(html_content, "html.parser")
            
            # Find story containers (Hacker News structure)
            story_rows = soup.find_all('tr', class_='athing')[:max_stories]
            
            for story_row in story_rows:
                try:
                    # Extract story data
                    title_cell = story_row.find('span', class_='titleline')
                    if not title_cell:
                        continue
                        
                    title_link = title_cell.find('a')
                    if not title_link:
                        continue
                        
                    title = title_link.get_text(strip=True)
                    story_url = title_link.get('href', '')
                    
                    # Make URL absolute if needed
                    if story_url.startswith('item?'):
                        story_url = base_url + '/' + story_url
                    elif not story_url.startswith(('http://', 'https://')):
                        story_url = base_url + '/' + story_url
                    
                    # Get story metadata from next row
                    story_id = story_row.get('id', '')
                    meta_row = story_row.find_next_sibling('tr')
                    
                    points = 0
                    comments_count = 0
                    author = ""
                    comments_url = ""
                    
                    if meta_row:
                        score_span = meta_row.find('span', class_='score')
                        if score_span:
                            score_text = score_span.get_text()
                            points = int(score_text.split()[0]) if score_text.split() else 0
                        
                        # Get author
                        author_link = meta_row.find('a', class_='hnuser')
                        if author_link:
                            author = author_link.get_text()
                        
                        # Get comments link
                        comment_links = meta_row.find_all('a')
                        for link in comment_links:
                            if 'comment' in link.get_text().lower():
                                comments_url = base_url + '/' + link.get('href', '')
                                # Extract comment count
                                comment_text = link.get_text()
                                import re
                                match = re.search(r'(\d+)', comment_text)
                                comments_count = int(match.group(1)) if match else 0
                                break
                    
                    # Filter by minimum points
                    if points < min_points:
                        continue
                    
                    story_data = {
                        'title': title,
                        'url': story_url, 
                        'points': points,
                        'author': author,
                        'comments_count': comments_count,
                        'comments_url': comments_url,
                        'story_id': story_id
                    }
                    
                    stories.append(story_data)
                    
                except Exception as e:
                    print(f"Error parsing story: {e}")
                    continue
            
            print(f"✓ Parsed {len(stories)} stories using BeautifulSoup")
            
        except Exception as e:
            print(f"BeautifulSoup parsing failed: {e}")
            # Fallback to simpler parsing
            story_links = icnx.select(html_content, ".titleline a")[:max_stories]
            for i, link in enumerate(story_links):
                title = link.get('text', f'Story {i+1}')
                story_url = link.get('href', '')
                
                if story_url.startswith('item?'):
                    story_url = base_url + '/' + story_url
                
                stories.append({
                    'title': title,
                    'url': story_url,
                    'points': 0,
                    'author': 'Unknown',
                    'comments_count': 0,
                    'comments_url': '',
                    'story_id': str(i)
                })
        
        # Create downloadable items
        items = []
        
        for i, story in enumerate(stories):
            # Main story link
            items.append({
                "url": story['url'],
                "filename": f"hn_story_{i+1}_{story['story_id']}.html",
                "title": f"[{story['points']} pts] {story['title']} by {story['author']}",
                "type": "document"
            })
            
            # Comments link if requested and available
            if include_comments and story['comments_url']:
                items.append({
                    "url": story['comments_url'],
                    "filename": f"hn_comments_{i+1}_{story['story_id']}.html", 
                    "title": f"Comments ({story['comments_count']}) - {story['title']}",
                    "type": "document"
                })
        
        # Also create a summary JSON file
        import json
        summary_content = json.dumps({
            "scraped_at": str(icnx.get_current_time()),
            "total_stories": len(stories),
            "filters": {
                "max_stories": max_stories,
                "min_points": min_points,
                "include_comments": include_comments
            },
            "stories": stories
        }, indent=2)
        
        encoded_summary = icnx.base64_encode(summary_content)
        items.append({
            "url": f"data:application/json;base64,{encoded_summary}",
            "filename": "hackernews_summary.json",
            "title": f"Hacker News Summary ({len(stories)} stories)",
            "type": "document"
        })
        
        # Emit results
        icnx.emit({
            "dir": f"hackernews_scrape_{icnx.get_current_time().strftime('%Y%m%d_%H%M%S')}",
            "items": items
        })
        
        print(f"✓ Successfully scraped {len(stories)} Hacker News stories")
        print(f"Created {len(items)} downloadable items")
        
    except Exception as e:
        print(f"✗ Hacker News scraping failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Emit error
        icnx.emit({
            "dir": "hackernews_error", 
            "items": [{
                "url": f"data:text/plain;base64,{icnx.base64_encode(str(e))}",
                "filename": "error.txt",
                "title": f"HackerNews Scraping Error",
                "type": "document"
            }]
        })
