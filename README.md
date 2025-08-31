# ICNX - Intelligent Content Downloader

A powerful Rust-based downloader with **Python scripting engine** for automated web scraping and content extraction. Features intelligent URL detection, comprehensive library support, and a modern desktop interface.

## ✨ Features

- **🐍 Python Scripting Engine**: Full PyO3 integration with requests, BeautifulSoup, pandas, numpy
- **🔍 Smart URL Detection**: Automatically detects and suggests scripts based on domain matching  
- **⚡ Enhanced IDE**: Monaco editor with Python syntax highlighting, linting, and completions
- **📦 Zero Configuration**: Scripts use embedded `__meta__` dictionaries - no separate config files
- **🚀 High Performance**: Concurrent downloads with progress tracking and session management
- **🎯 Quick Download**: Paste any URL and start downloading immediately

## 🏗️ Architecture

```
src/
├── core/              # Python runtime engine (PyO3)
├── downloader/        # Multi-threaded download engine  
├── components/        # React UI components
├── pages/             # Application views
└── commands.rs        # Tauri backend commands
```

## 📝 Script Format

Scripts use embedded Python metadata:

```python
__meta__ = {
    "name": "GitHub Trending Scraper",
    "author": "ICNX Team",
    "version": "1.0.0",
    "description": "Scrapes trending repositories from GitHub",
    "supportedDomains": ["github.com", "*.github.com"],
    "options": [
        {
            "id": "language",
            "type": "select", 
            "label": "Programming Language",
            "default": "all",
            "options": [
                {"value": "python", "label": "Python"},
                {"value": "rust", "label": "Rust"}
            ]
        }
    ]
}

def onResolve(url, ctx):
    # Access Python libraries
    import requests
    from bs4 import BeautifulSoup
    
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Process and emit results
    ctx.emit({
        "dir": "github-trending",
        "items": [/* extracted items */]
    })
```

## 🚀 Quick Start

### Prerequisites
- **Rust** 1.70+ ([rustup.rs](https://rustup.rs/))
- **Node.js** 18+ ([nodejs.org](https://nodejs.org/))
- **Python** 3.8+ (for PyO3 integration)
- **System dependencies**:
  - macOS: Xcode Command Line Tools
  - Linux: `build-essential`, `libssl-dev`, `pkg-config`
  - Windows: Visual Studio Build Tools

### Installation

```bash
# Clone and run
git clone https://github.com/fearschism/icnx-rs.git
cd icnx-rs
npm install
npm run tauri dev
```

**Just paste a URL and ICNX will detect the right script automatically!**

## 🛠️ Tech Stack

- **Backend**: Rust + Tauri + PyO3 
- **Frontend**: React + TypeScript + Vite
- **Python Libraries**: requests, beautifulsoup4, lxml, pandas, numpy
- **Cross-Platform**: macOS, Windows, Linux support via Tauri

---

Built with ❤️ using Rust, Python, and modern web technologies.
