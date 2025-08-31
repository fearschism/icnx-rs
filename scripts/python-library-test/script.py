# ICNX Python Library Test Script
__meta__ = {
    "name": "Python Library Test",
    "author": "ICNX Team",
    "version": "1.0.0",
    "description": "Test Python library installation and functionality",
    "options": [
        {
            "id": "test_requests",
            "type": "bool",
            "label": "Test Requests Library",
            "description": "Test HTTP requests functionality",
            "default": True
        },
        {
            "id": "test_beautifulsoup",
            "type": "bool", 
            "label": "Test BeautifulSoup",
            "description": "Test HTML parsing functionality",
            "default": True
        },
        {
            "id": "test_pandas",
            "type": "bool",
            "label": "Test Pandas",
            "description": "Test DataFrame functionality", 
            "default": True
        },
        {
            "id": "test_lxml",
            "type": "bool",
            "label": "Test LXML",
            "description": "Test XML/HTML parsing with lxml",
            "default": False
        },
        {
            "id": "test_numpy",
            "type": "bool",
            "label": "Test NumPy",
            "description": "Test numerical computing functionality",
            "default": False
        }
    ]
}

def onResolve(url, ctx):
    """Test Python library installation and functionality"""
    
    test_requests = icnx.get_option("test_requests", True)
    test_beautifulsoup = icnx.get_option("test_beautifulsoup", True)
    test_pandas = icnx.get_option("test_pandas", True)
    test_lxml = icnx.get_option("test_lxml", False)
    test_numpy = icnx.get_option("test_numpy", False)
    
    print("Starting Python Library Compatibility Tests...")
    print("=" * 50)
    
    test_results = []
    
    # Test 1: Requests Library
    if test_requests:
        print("\n1. Testing Requests Library...")
        try:
            session = icnx.create_requests_session()
            test_url = "https://httpbin.org/json"
            response = session.get(test_url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            print(f"✓ Requests test passed")
            print(f"  - Status: {response.status_code}")
            print(f"  - Response type: {type(data)}")
            print(f"  - Headers available: {bool(response.headers)}")
            
            test_results.append({
                "library": "requests",
                "status": "PASS",
                "details": f"Successfully fetched JSON from {test_url}",
                "response_code": response.status_code
            })
            
        except Exception as e:
            print(f"✗ Requests test failed: {e}")
            test_results.append({
                "library": "requests", 
                "status": "FAIL",
                "error": str(e)
            })
    
    # Test 2: BeautifulSoup
    if test_beautifulsoup:
        print("\n2. Testing BeautifulSoup...")
        try:
            test_html = """
            <html>
                <body>
                    <h1>Test Page</h1>
                    <div class="content">
                        <p>This is a test paragraph.</p>
                        <a href="https://example.com">Test Link</a>
                        <ul>
                            <li>Item 1</li>
                            <li>Item 2</li>
                        </ul>
                    </div>
                </body>
            </html>
            """
            
            soup = icnx.parse_html(test_html, "html.parser")
            
            # Test various BeautifulSoup operations
            title = soup.find('h1').get_text()
            links = soup.find_all('a')
            list_items = soup.select('li')
            
            print(f"✓ BeautifulSoup test passed")
            print(f"  - Title extracted: '{title}'")
            print(f"  - Links found: {len(links)}")
            print(f"  - List items: {len(list_items)}")
            
            test_results.append({
                "library": "beautifulsoup4",
                "status": "PASS", 
                "details": f"Parsed HTML, found {len(links)} links and {len(list_items)} list items"
            })
            
        except Exception as e:
            print(f"✗ BeautifulSoup test failed: {e}")
            test_results.append({
                "library": "beautifulsoup4",
                "status": "FAIL",
                "error": str(e)
            })
    
    # Test 3: Pandas
    if test_pandas:
        print("\n3. Testing Pandas...")
        try:
            # Test DataFrame creation and operations
            test_data = [
                {"name": "Alice", "age": 25, "city": "New York"},
                {"name": "Bob", "age": 30, "city": "San Francisco"},
                {"name": "Charlie", "age": 35, "city": "Chicago"}
            ]
            
            df = icnx.create_dataframe(test_data)
            
            # Test basic operations
            row_count = len(df)
            columns = list(df.columns) if hasattr(df, 'columns') else []
            
            print(f"✓ Pandas test passed")
            print(f"  - DataFrame created with {row_count} rows")
            print(f"  - Columns: {columns}")
            
            # Test data analysis if possible
            if hasattr(df, 'describe'):
                stats = df.describe()
                print(f"  - Statistics computed successfully")
            
            test_results.append({
                "library": "pandas",
                "status": "PASS",
                "details": f"Created DataFrame with {row_count} rows and {len(columns)} columns"
            })
            
        except Exception as e:
            print(f"✗ Pandas test failed: {e}")
            test_results.append({
                "library": "pandas",
                "status": "FAIL", 
                "error": str(e)
            })
    
    # Test 4: LXML (if requested)
    if test_lxml:
        print("\n4. Testing LXML...")
        try:
            # Test lxml parsing
            test_xml = """<?xml version="1.0"?>
            <root>
                <item id="1">First item</item>
                <item id="2">Second item</item>
            </root>"""
            
            # Try to parse with lxml
            soup = icnx.parse_html(test_xml, "lxml")
            items = soup.find_all('item')
            
            print(f"✓ LXML test passed")
            print(f"  - XML parsed successfully")
            print(f"  - Items found: {len(items)}")
            
            test_results.append({
                "library": "lxml",
                "status": "PASS",
                "details": f"Parsed XML with {len(items)} items"
            })
            
        except Exception as e:
            print(f"✗ LXML test failed: {e}")
            test_results.append({
                "library": "lxml",
                "status": "FAIL",
                "error": str(e)
            })
    
    # Test 5: NumPy (if requested)
    if test_numpy:
        print("\n5. Testing NumPy...")
        try:
            # This would require numpy integration in our Python runtime
            # For now, we'll create a placeholder test
            print("⚠ NumPy integration not yet implemented")
            test_results.append({
                "library": "numpy",
                "status": "PENDING",
                "details": "NumPy integration not yet implemented in ICNX runtime"
            })
            
        except Exception as e:
            print(f"✗ NumPy test failed: {e}")
            test_results.append({
                "library": "numpy",
                "status": "FAIL",
                "error": str(e)
            })
    
    # Summary
    print("\n" + "=" * 50)
    print("TEST SUMMARY")
    print("=" * 50)
    
    passed = len([r for r in test_results if r["status"] == "PASS"])
    failed = len([r for r in test_results if r["status"] == "FAIL"])
    pending = len([r for r in test_results if r["status"] == "PENDING"])
    
    print(f"Total tests: {len(test_results)}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Pending: {pending}")
    
    for result in test_results:
        status_icon = "✓" if result["status"] == "PASS" else "✗" if result["status"] == "FAIL" else "⚠"
        print(f"{status_icon} {result['library']}: {result['status']}")
        if "details" in result:
            print(f"    {result['details']}")
        if "error" in result:
            print(f"    Error: {result['error']}")
    
    # Create comprehensive test report
    import json
    report = {
        "test_timestamp": str(icnx.get_current_time()),
        "icnx_version": "1.0.0",
        "python_runtime": "PyO3",
        "summary": {
            "total_tests": len(test_results),
            "passed": passed,
            "failed": failed,
            "pending": pending,
            "success_rate": f"{(passed / len(test_results) * 100):.1f}%" if test_results else "0%"
        },
        "test_results": test_results,
        "recommendations": []
    }
    
    # Add recommendations based on results
    if failed > 0:
        report["recommendations"].append("Some library tests failed. Check Python environment and package installations.")
    if pending > 0:
        report["recommendations"].append("Some features are not yet implemented. Consider updating ICNX.")
    if passed == len(test_results):
        report["recommendations"].append("All tests passed! Python library integration is working correctly.")
    
    # Create downloadable report
    report_json = json.dumps(report, indent=2)
    encoded_report = icnx.base64_encode(report_json)
    
    items = [{
        "url": f"data:application/json;base64,{encoded_report}",
        "filename": f"python_library_test_report_{icnx.get_current_time().strftime('%Y%m%d_%H%M%S')}.json",
        "title": f"Python Library Test Report ({passed}/{len(test_results)} passed)",
        "type": "document"
    }]
    
    # Also create a simple text summary
    summary_text = f"""ICNX Python Library Test Report
Generated: {report['test_timestamp']}

SUMMARY:
- Total Tests: {report['summary']['total_tests']}
- Passed: {report['summary']['passed']}
- Failed: {report['summary']['failed']}
- Pending: {report['summary']['pending']}
- Success Rate: {report['summary']['success_rate']}

DETAILED RESULTS:
"""
    
    for result in test_results:
        summary_text += f"\n{result['library']}: {result['status']}"
        if "details" in result:
            summary_text += f"\n  Details: {result['details']}"
        if "error" in result:
            summary_text += f"\n  Error: {result['error']}"
    
    encoded_summary = icnx.base64_encode(summary_text)
    items.append({
        "url": f"data:text/plain;base64,{encoded_summary}",
        "filename": "test_summary.txt",
        "title": "Test Summary (Text)",
        "type": "document"
    })
    
    # Emit results
    icnx.emit({
        "dir": f"python_library_tests_{icnx.get_current_time().strftime('%Y%m%d_%H%M%S')}",
        "items": items
    })
    
    print(f"\n✓ Test completed successfully!")
    print(f"Results: {passed}/{len(test_results)} tests passed")
