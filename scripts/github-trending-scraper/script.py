# ICNX GitHub Trending Scraper
__meta__ = {
    "name": "GitHub Trending Scraper",
    "author": "ICNX Team",
    "version": "1.0.0",
    "description": "Scrapes trending repositories from GitHub using Python libraries",
    "supportedDomains": [
        "github.com",
        "*.github.com"
    ],
    "options": [
        {
            "id": "language",
            "type": "select",
            "label": "Programming Language",
            "description": "Filter by programming language",
            "default": "all",
            "options": [
                {"value": "all", "label": "All Languages"},
                {"value": "javascript", "label": "JavaScript"},
                {"value": "python", "label": "Python"},
                {"value": "java", "label": "Java"},
                {"value": "typescript", "label": "TypeScript"},
                {"value": "rust", "label": "Rust"},
                {"value": "go", "label": "Go"},
                {"value": "c++", "label": "C++"}
            ]
        },
        {
            "id": "time_range",
            "type": "select",
            "label": "Time Range", 
            "description": "Trending period",
            "default": "daily",
            "options": [
                {"value": "daily", "label": "Today"},
                {"value": "weekly", "label": "This Week"},
                {"value": "monthly", "label": "This Month"}
            ]
        },
        {
            "id": "max_repos",
            "type": "number",
            "label": "Max Repositories",
            "description": "Maximum number of repositories to scrape",
            "default": 15,
            "min": 1,
            "max": 50
        },
        {
            "id": "include_readme",
            "type": "bool",
            "label": "Download README files",
            "description": "Include README.md files for each repository",
            "default": False
        }
    ]
}

def onResolve(url, ctx):
    """Scrape GitHub trending repositories"""
    
    language = icnx.get_option("language", "all")
    time_range = icnx.get_option("time_range", "daily")
    max_repos = icnx.get_option("max_repos", 15)
    include_readme = icnx.get_option("include_readme", False)
    
    # Build GitHub trending URL
    base_url = "https://github.com/trending"
    if language != "all":
        base_url += f"/{language}"
    
    # Add time range parameter
    params = {"since": time_range}
    trending_url = f"{base_url}?since={time_range}"
    
    print(f"Scraping GitHub trending ({language}, {time_range})...")
    
    try:
        # Fetch content with enhanced session
        try:
            session = icnx.create_requests_session()
            # GitHub requires User-Agent header
            session.headers.update({
                'User-Agent': 'ICNX-Scraper/1.0'
            })
            response = session.get(trending_url, timeout=30)
            response.raise_for_status()
            html_content = response.text
            print("✓ Fetched content using requests library")
        except Exception as e:
            print(f"Requests failed: {e}, falling back to built-in fetch")
            html_content = icnx.fetch(trending_url)
        
        repositories = []
        
        try:
            # Parse with BeautifulSoup
            soup = icnx.parse_html(html_content, "html.parser")
            
            # Find repository articles
            repo_articles = soup.find_all('article', class_='Box-row')[:max_repos]
            
            for article in repo_articles:
                try:
                    # Extract repository information
                    repo_link = article.find('h2').find('a')
                    if not repo_link:
                        continue
                    
                    repo_path = repo_link.get('href', '').strip('/')
                    repo_name = repo_path.split('/')[-1] if '/' in repo_path else repo_path
                    repo_owner = repo_path.split('/')[0] if '/' in repo_path else 'unknown'
                    repo_url = f"https://github.com/{repo_path}"
                    
                    # Get description
                    desc_elem = article.find('p')
                    description = desc_elem.get_text(strip=True) if desc_elem else ""
                    
                    # Get language
                    lang_elem = article.find('span', {'itemprop': 'programmingLanguage'})
                    repo_language = lang_elem.get_text(strip=True) if lang_elem else "Unknown"
                    
                    # Get stars and forks
                    stars = 0
                    forks = 0
                    
                    # Look for star and fork counts
                    link_elements = article.find_all('a')
                    for link in link_elements:
                        href = link.get('href', '')
                        if 'stargazers' in href:
                            star_text = link.get_text(strip=True)
                            # Extract number from text like "1,234"
                            import re
                            star_match = re.search(r'([0-9,]+)', star_text)
                            if star_match:
                                stars = int(star_match.group(1).replace(',', ''))
                        elif 'forks' in href:
                            fork_text = link.get_text(strip=True)
                            fork_match = re.search(r'([0-9,]+)', fork_text)
                            if fork_match:
                                forks = int(fork_match.group(1).replace(',', ''))
                    
                    # Get today's stars
                    today_stars = 0
                    star_span = article.find('span', class_='d-inline-block')
                    if star_span:
                        today_text = star_span.get_text()
                        star_match = re.search(r'([0-9,]+)', today_text)
                        if star_match:
                            today_stars = int(star_match.group(1).replace(',', ''))
                    
                    repo_data = {
                        'name': repo_name,
                        'owner': repo_owner,
                        'full_name': repo_path,
                        'url': repo_url,
                        'description': description,
                        'language': repo_language,
                        'stars': stars,
                        'forks': forks,
                        'today_stars': today_stars,
                        'trending_rank': len(repositories) + 1
                    }
                    
                    repositories.append(repo_data)
                    
                except Exception as e:
                    print(f"Error parsing repository: {e}")
                    continue
            
            print(f"✓ Parsed {len(repositories)} repositories using BeautifulSoup")
            
        except Exception as e:
            print(f"BeautifulSoup parsing failed: {e}")
            # Fallback parsing
            repo_links = icnx.select(html_content, "article h2 a")[:max_repos]
            for i, link in enumerate(repo_links):
                href = link.get('href', '').strip('/')
                name = href.split('/')[-1] if '/' in href else f"repo_{i+1}"
                
                repositories.append({
                    'name': name,
                    'owner': href.split('/')[0] if '/' in href else 'unknown',
                    'full_name': href,
                    'url': f"https://github.com/{href}",
                    'description': "",
                    'language': "Unknown",
                    'stars': 0,
                    'forks': 0,
                    'today_stars': 0,
                    'trending_rank': i + 1
                })
        
        # Create downloadable items
        items = []
        
        for i, repo in enumerate(repositories):
            # Main repository page
            items.append({
                "url": repo['url'],
                "filename": f"github_{repo['owner']}_{repo['name']}.html",
                "title": f"#{repo['trending_rank']} {repo['full_name']} ({repo['stars']} ⭐, +{repo['today_stars']} today)",
                "type": "document"
            })
            
            # README file if requested
            if include_readme:
                readme_url = f"{repo['url']}/blob/main/README.md"
                items.append({
                    "url": readme_url,
                    "filename": f"README_{repo['owner']}_{repo['name']}.md",
                    "title": f"README - {repo['full_name']}",
                    "type": "document" 
                })
        
        # Create summary with data analysis
        if repositories:
            try:
                # Try to use pandas for analysis
                df = icnx.create_dataframe(repositories)
                
                # Calculate statistics
                total_stars = sum(r['stars'] for r in repositories)
                avg_stars = total_stars / len(repositories) if repositories else 0
                top_language = max(set(r['language'] for r in repositories if r['language'] != 'Unknown'), 
                                 key=lambda x: sum(1 for r in repositories if r['language'] == x),
                                 default='Unknown')
                
                analysis = {
                    "total_repositories": len(repositories),
                    "total_stars": total_stars,
                    "average_stars": round(avg_stars, 1),
                    "top_language": top_language,
                    "languages_distribution": {}
                }
                
                # Language distribution
                for repo in repositories:
                    lang = repo['language']
                    analysis['languages_distribution'][lang] = analysis['languages_distribution'].get(lang, 0) + 1
                
                print("✓ Enhanced data with pandas analysis")
                
            except Exception as e:
                print(f"Pandas analysis failed: {e}")
                analysis = {"total_repositories": len(repositories)}
        
        # Create comprehensive summary
        import json
        summary_content = json.dumps({
            "scraped_at": str(icnx.get_current_time()),
            "filters": {
                "language": language,
                "time_range": time_range,
                "max_repos": max_repos
            },
            "analysis": analysis,
            "repositories": repositories
        }, indent=2)
        
        encoded_summary = icnx.base64_encode(summary_content)
        items.append({
            "url": f"data:application/json;base64,{encoded_summary}",
            "filename": f"github_trending_{language}_{time_range}.json",
            "title": f"GitHub Trending Summary ({len(repositories)} repos)",
            "type": "document"
        })
        
        # Emit results
        icnx.emit({
            "dir": f"github_trending_{language}_{time_range}_{icnx.get_current_time().strftime('%Y%m%d_%H%M%S')}",
            "items": items
        })
        
        print(f"✓ Successfully scraped {len(repositories)} trending repositories")
        print(f"Created {len(items)} downloadable items")
        
    except Exception as e:
        print(f"✗ GitHub trending scraping failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Emit error
        icnx.emit({
            "dir": "github_trending_error",
            "items": [{
                "url": f"data:text/plain;base64,{icnx.base64_encode(str(e))}",
                "filename": "error.txt",
                "title": f"GitHub Trending Scraping Error",
                "type": "document"
            }]
        })
