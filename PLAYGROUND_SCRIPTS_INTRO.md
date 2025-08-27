# ICNX — Scripts & Playground (Quick Intro)

A short guide you can share with your community about writing, testing, and editing scripts in ICNX.

## What it is
- The Playground is a lightweight in-app editor for authoring and running scripts.
- Use `emit(payload)` in your script to return a payload that describes download items.
- You can edit both `script.js` and `manifest.json` side-by-side using tabs.

## Key features
- Run scripts directly from the Playground to preview output and emitted items.
- Edit manifest fields inline; changes can be saved back to the script directory.
- A safety guard prevents accidental exit when there are unsaved edits.
- Options UI is auto-generated from the script's `manifest.json` (the `manifest.options` array becomes the form fields in the app).
- Install scripts from a ZIP file or directly from a GitHub repo (the app extracts `manifest.json` + `script.js`).

## Quick workflow
1. Open Playground → choose or paste your `script.js` code.
2. Click Run to execute; use `emit({ dir, items: [...] })` to return results.
3. Switch to the `manifest.json` tab to edit metadata and options.
4. Save to persist changes back to the script folder.
5. Install or share scripts via ZIP/GitHub for easy distribution.

## Tips for contributors
- Provide a `manifest.options` array in `manifest.json` to expose configurable options in the UI.
- Use `icnx.emitPartial(item)` to stream items progressively during scraping.
- Include `supportedDomains`, `icon`, and `website` in the manifest for better UX.

Share this in your Discord to help contributors get started quickly.
