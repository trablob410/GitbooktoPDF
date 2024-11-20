# GitBook PDF Generator

A tool to convert GitBook documentation into PDF.

## Setup

```bash
npm install
```

## Usage

### Download from GitBook URL:
```bash
npm run download
```
When prompted, enter the public GitBook URL you want to convert to PDF.

### Convert Local Markdown:
```bash
npm start
```

The generated PDF will be saved as:
- `gitbook-output.pdf` for downloaded GitBooks
- `output.pdf` for local markdown files

## Project Structure

* `README.md` - This documentation
* `download-gitbook.js` - GitBook URL to PDF converter
* `index.js` - Local markdown to PDF converter
* `chapters/` - Your local markdown content (if any)

## Notes

- Make sure the GitBook URL is public and accessible
- The download process might take a few moments depending on the content size
- Some GitBooks might have authentication requirements which aren't supported