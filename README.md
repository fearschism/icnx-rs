# ICNX - Rust Downloader with Embedded JavaScript Runtime

A Rust-based downloader engine with embedded JavaScript runtime for running standalone scraper scripts. Features a desktop GUI built with the Iced library.

## Features

- **Quick Download**: Direct URL download with progress tracking
- **Installed Scripts**: Run JavaScript scraper scripts that emit download metadata
- **JavaScript Runtime**: Simple parser for `emit()` calls (no Node.js required)
- **Robust Downloader**: Uses reqwest with redirects, compression, retries, and concurrency
- **Cross-platform GUI**: Built with Iced framework

## Architecture

```
src/
├── core/           # JavaScript runtime and data models
├── downloader/     # HTTP download engine with queue management
├── data/           # Settings and history persistence
└── ui/             # Iced GUI components and views
```

## Script Format

Scripts are stored in `scripts/` folders with:
- `script.js` - The scraper code
- `manifest.json` - Metadata (name, description, version)

Example script:
```javascript
const data = {
  dir: "downloads/example",
  items: [
    {
      url: "https://httpbin.org/image/png",
      filename: "example.png",
      title: "Example Image",
      type: "image",
      headers: { "User-Agent": "ICNX-Script/0.1" }
    }
  ]
};

emit(data);
```

## Build & Run

### Prerequisites
- Rust 1.70+ 
- macOS/Windows/Linux

### Commands
```bash
# Clone and build
git clone <repo>
cd icnx
cargo build --release

# Run
cargo run
```

## Usage

1. **Quick Download**: Enter a URL and click Download
2. **Installed Scripts**: Click "Run Example" to test the sample script
3. **Script Execution**: Scripts parse and emit JSON, which queues downloads

## Current Status (POC)

✅ Working:
- Basic GUI with navigation tabs
- Quick download functionality  
- Script parsing and execution
- Download queue integration
- Example script included

🚧 TODO:
- Gallery view for download history
- Community script browsing
- Settings persistence
- Progress bars and cancellation
- Script installation/management

## Dependencies

- `iced` - Cross-platform GUI framework
- `reqwest` - HTTP client with compression
- `serde` - JSON serialization
- `tokio` - Async runtime
- `anyhow` - Error handling

No heavy JavaScript engines (V8/QuickJS) - uses simple text parsing for POC.
