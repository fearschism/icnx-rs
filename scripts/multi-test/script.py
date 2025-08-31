# Multi Test script: emits multiple files to download

__meta__ = {
    "name": "multi-test",
    "description": "Multi Test script: emits multiple files to download",
    "version": "1.0.0",
    "author": "ICNX",
    "options": [
        {
            "id": "count",
            "type": "number",
            "label": "Number of Images",
            "description": "How many random images to download",
            "default": 5,
            "min": 1,
            "max": 20
        }
    ]
}

def onResolve(url, ctx):
    count = icnx.get_option("count", 5)
    items = []
    
    for i in range(1, count + 1):
        image_url = f"https://picsum.photos/seed/icnx_{i}/800/600"
        items.append({
            "url": image_url,
            "filename": f"random_{i}.jpg",
            "title": f"Random Image {i}",
            "type": "image",
            "headers": {"User-Agent": "ICNX-Test/1.0"}
        })
    
    icnx.emit({"dir": "tests/multi", "items": items})
