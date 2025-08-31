# URL Echo Test - Simply echoes the input URL as a download item

__meta__ = {
    "name": "url-echo-test",
    "description": "Simple test script that echoes a URL as a download item",
    "version": "1.0.0",
    "author": "ICNX",
    "options": [
        {
            "id": "test_url",
            "type": "url",
            "label": "Test URL",
            "description": "URL to echo as download",
            "default": "https://httpbin.org/json",
            "required": True
        },
        {
            "id": "filename",
            "type": "text",
            "label": "Filename",
            "description": "Filename for the download",
            "default": "test_file.json"
        }
    ]
}

def onResolve(url, ctx):
    test_url = icnx.get_option("test_url", "https://httpbin.org/json")
    filename = icnx.get_option("filename", "test_file.json")
    
    items = [{
        "url": test_url,
        "filename": filename,
        "title": f"Echo test: {filename}",
        "type": "document",
        "headers": {"User-Agent": "ICNX-Echo-Test/1.0"}
    }]
    
    icnx.emit({"dir": "tests/echo", "items": items})
