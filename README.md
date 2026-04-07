# MD Reader

MD Reader is a Chrome extension for opening local Markdown files as clean, readable HTML pages. It runs entirely in the browser: drop an `.md` file into the reader, and the extension renders it locally without upload, account setup, or external services.

This project is being prepared for publication as a Chrome extension.

## Features

- Opens from the Chrome extension toolbar.
- Supports drag-and-drop Markdown loading.
- Supports file picker loading after a document is already open.
- Renders headings, paragraphs, lists, blockquotes, code blocks, links, images, horizontal rules, and tables.
- Strips front matter and leading metadata before rendering content.
- Keeps Markdown content local to the browser.
- Provides a focused reading layout with light and dark color support.

## Project Structure

```text
.
|-- manifest.json   # Chrome extension manifest
|-- background.js   # Opens the reader page from the extension action
|-- newtab.html     # Reader page markup
|-- app.js          # Markdown parsing, rendering, and file handling
|-- style.css       # Reader UI and responsive styles
|-- icon.png        # Extension icon
`-- Cloud.png       # Drop-zone illustration
```

## Local Installation

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Select `Load unpacked`.
4. Choose this project folder.
5. Click the MD Reader extension icon to open the reader page.

## Usage

1. Open MD Reader from the Chrome toolbar.
2. Drag a Markdown file onto the page.
3. To open another file, use either side drop area or click a side drop area to open the file picker.

Supported file extensions include `.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`, `.mdwn`, `.mdtxt`, and `.mdtext`.

## Chrome Extension Publication Notes

Before publishing to the Chrome Web Store, review the following:

- Confirm the extension name, description, version, and icons in `manifest.json`.
- Prepare store listing assets such as screenshots, promotional images, and a detailed description.
- Add privacy policy details if required by the Chrome Web Store listing.
- Test the unpacked extension in Chrome with representative Markdown files.
- Package the extension folder for upload after final review.

## Privacy

MD Reader reads Markdown files selected by the user and renders them locally in the extension page. The current implementation does not upload file contents to a server.
