import { marked } from 'marked';
import fs from 'fs-extra';
import puppeteer from 'puppeteer-core';
import { glob } from 'glob';
import path from 'path';

async function convertLocalMarkdown() {
  try {
    // Get all markdown files
    const files = await glob('**/*.md');

    // Combine all markdown content
    let combinedMarkdown = '';
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      combinedMarkdown += `\n# ${path.basename(file, '.md')}\n\n${content}\n`;
    }

    // Convert markdown to HTML
    const html = marked(combinedMarkdown);
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; }
            h1 { color: #2c3e50; border-bottom: 1px solid #eee; }
            code { background: #f8f9fa; padding: 2px 4px; border-radius: 4px; }
            pre { background: #f8f9fa; padding: 15px; border-radius: 8px; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `;

    // Save HTML temporarily
    const tempPath = path.join(process.cwd(), 'temp.html');
    await fs.writeFile(tempPath, fullHtml);

    // Launch browser with cloud-specific settings
    const browser = await puppeteer.connect({
      browserWSEndpoint: 'ws://localhost:3000', // Stackblitz WebSocket endpoint
    });

    const page = await browser.newPage();
    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0',
    });

    await page.pdf({
      path: 'output.pdf',
      format: 'A4',
      margin: {
        top: '40px',
        right: '40px',
        bottom: '40px',
        left: '40px',
      },
      printBackground: true,
    });

    // Cleanup
    await browser.close();
    await fs.remove(tempPath);

    console.log('✅ PDF đã được tạo thành công: output.pdf');
  } catch (error) {
    console.error('❌ Lỗi khi tạo PDF:', error);
    // Log chi tiết lỗi cho debug
    console.error('Chi tiết lỗi:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

convertLocalMarkdown();
