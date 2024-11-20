import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import readline from 'readline';

// Tạo interface cho readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promise wrapper cho readline
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function getAllLinks(page) {
  console.log('🔍 Đang tìm tất cả các links...');
  
  const possibleSelectors = [
    'nav a',
    '.css-175oi2r a',
    'aside a',
    '.sidebar a',
    '.menu a',
    'div[role="navigation"] a',
    '.gitbook-root a'
  ];

  try {
    await page.waitForFunction((selectors) => {
      return selectors.some(selector => document.querySelector(selector));
    }, { timeout: 30000 }, possibleSelectors);

    const links = await page.evaluate((selectors) => {
      let allLinks = [];
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (element.href && element.href.startsWith('http')) {
            allLinks.push({
              url: element.href,
              title: element.textContent.trim() || 'Untitled Page',
              selected: false
            });
          }
        });
      });
      
      return Array.from(new Set(allLinks.map(link => link.url)))
        .map(url => allLinks.find(link => link.url === url))
        .filter(link => !link.url.includes('#'));
    }, possibleSelectors);

    return links;
  } catch (error) {
    console.log('⚠️ Không tìm thấy menu navigation, thử phương án khác...');
    const currentUrl = await page.url();
    const title = await page.title();
    return [{
      url: currentUrl,
      title: title || 'Main Page',
      selected: false
    }];
  }
}

async function selectPages(links) {
  console.log('\n📑 Danh sách các trang có sẵn:');
  links.forEach((link, index) => {
    console.log(`[${index + 1}] ${link.title}`);
  });

  console.log('\nCách chọn trang:');
  console.log('- Nhập số thứ tự (vd: 1, 2, 3)');
  console.log('- Nhập khoảng (vd: 1-5)');
  console.log('- Nhập nhiều số cách nhau bởi dấu phẩy (vd: 1,3,5)');
  console.log('- Nhập "all" để chọn tất cả');
  console.log('- Nhập "done" để hoàn tất\n');

  const selectedIndices = new Set();

  while (true) {
    const input = await question('Chọn trang (hoặc "done" để kết thúc): ');
    
    if (input.toLowerCase() === 'done') {
      if (selectedIndices.size === 0) {
        console.log('⚠️ Vui lòng chọn ít nhất một trang!');
        continue;
      }
      break;
    }

    if (input.toLowerCase() === 'all') {
      for (let i = 0; i < links.length; i++) {
        selectedIndices.add(i);
      }
      console.log('✅ Đã chọn tất cả các trang');
      continue;
    }

    if (input.includes('-')) {
      // Xử lý khoảng (vd: 1-5)
      const [start, end] = input.split('-').map(num => parseInt(num) - 1);
      if (!isNaN(start) && !isNaN(end) && start >= 0 && end < links.length) {
        for (let i = start; i <= end; i++) {
          selectedIndices.add(i);
        }
      }
    } else if (input.includes(',')) {
      // Xử lý danh sách số (vd: 1,3,5)
      input.split(',').forEach(num => {
        const index = parseInt(num) - 1;
        if (!isNaN(index) && index >= 0 && index < links.length) {
          selectedIndices.add(index);
        }
      });
    } else {
      // Xử lý số đơn
      const index = parseInt(input) - 1;
      if (!isNaN(index) && index >= 0 && index < links.length) {
        selectedIndices.add(index);
      }
    }

    console.log('\nĐã chọn:');
    Array.from(selectedIndices).sort((a, b) => a - b).forEach(index => {
      console.log(`✓ ${links[index].title}`);
    });
  }

  return Array.from(selectedIndices);
}

async function getPageContent(page, url, title) {
  console.log(`📄 Đang tải trang: ${title}`);
  
  try {
    await page.goto(url, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 60000
    });

    const contentSelectors = [
      'article',
      '.markdown-body',
      '.gitbook-content',
      '.content',
      'main',
      '.main-content',
      '[role="main"]'
    ];

    await page.waitForFunction((selectors) => {
      return selectors.some(selector => document.querySelector(selector));
    }, { timeout: 30000 }, contentSelectors);

    const content = await page.evaluate((selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.innerHTML;
        }
      }
      return '';
    }, contentSelectors);

    return `
      <div class="page-break"></div>
      <h1>${title}</h1>
      ${content}
    `;
  } catch (error) {
    console.log(`⚠️ Lỗi khi tải trang ${title}:`, error.message);
    return `
      <div class="page-break"></div>
      <h1>${title}</h1>
      <p>Error loading content: ${error.message}</p>
    `;
  }
}

async function downloadGitBook(url) {
  console.log('🚀 Bắt đầu tạo PDF từ GitBook URL...');
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36');

    console.log('📚 Đang truy cập trang chủ GitBook...');
    await page.goto(url, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
      timeout: 60000
    });

    const docTitle = await page.title();
    const links = await getAllLinks(page);
    
    if (links.length === 0) {
      throw new Error('Không tìm thấy links nào trong trang');
    }

    // Cho phép user chọn trang
    const selectedIndices = await selectPages(links);
    const selectedLinks = selectedIndices.map(index => links[index]);

    console.log(`\n✅ Đã chọn ${selectedLinks.length} trang để download`);

    let fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${docTitle}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            h1, h2, h3 { color: #2c3e50; margin-top: 2em; }
            pre {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 8px;
              overflow-x: auto;
              white-space: pre-wrap;
              word-wrap: break-word;
            }
            code {
              background: #f8f9fa;
              padding: 2px 4px;
              border-radius: 4px;
            }
            img {
              max-width: 100%;
              height: auto;
            }
            .page-break {
              page-break-before: always;
              margin-top: 30px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 15px 0;
              font-size: 14px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f8f9fa;
            }
          </style>
        </head>
        <body>
          <h1>${docTitle}</h1>
          <div class="table-of-contents">
            <h2>Mục lục</h2>
            <ul>
              ${selectedLinks.map(link => `<li>${link.title}</li>`).join('\n')}
            </ul>
          </div>
    `;

    for (const link of selectedLinks) {
      const content = await getPageContent(page, link.url, link.title);
      fullHtml += content;
    }

    fullHtml += '</body></html>';

    const tempFile = 'temp.html';
    await fs.writeFile(tempFile, fullHtml);
    
    console.log('📑 Đang tạo PDF...');
    await page.setContent(fullHtml, {
      waitUntil: ['networkidle0', 'domcontentloaded']
    });

    await page.pdf({
      path: 'gitbook-output.pdf',
      format: 'A4',
      margin: {
        top: '40px',
        right: '40px',
        bottom: '40px',
        left: '40px'
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font-size: 10px; margin-left: 20px;"></div>',
      footerTemplate: '<div style="font-size: 10px; margin-left: 20px; width: 100%; text-align: center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
    });

    await fs.remove(tempFile);
    console.log('✅ PDF đã được tạo thành công!');

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Đã đóng browser');
    }
    rl.close();
  }
}

const gitbookUrl = process.argv[2] || 'https://docs.usual.money/';
console.log('📚 GitBook PDF Generator');
console.log('--------------------');
downloadGitBook(gitbookUrl);