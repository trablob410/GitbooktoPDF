import markdownpdf from 'markdown-pdf';
import { glob } from 'glob';
import fs from 'fs-extra';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function generatePDF() {
  try {
    // Get all markdown files
    const files = await glob('**/*.md', { ignore: 'node_modules/**' });
    
    // Sort files to ensure README.md comes first, followed by chapters
    files.sort((a, b) => {
      if (a === 'README.md') return -1;
      if (b === 'README.md') return 1;
      return a.localeCompare(b);
    });

    // Combine all markdown content
    let combinedMarkdown = '';
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      combinedMarkdown += content + '\n\n';
    }

    // Create temp combined markdown file
    await fs.writeFile('combined.md', combinedMarkdown);

    // Generate PDF
    await new Promise((resolve, reject) => {
      markdownpdf()
        .from('combined.md')
        .to('output.pdf', function (err) {
          if (err) reject(err);
          else resolve();
        });
    });

    // Clean up temp file
    await fs.remove('combined.md');
    
    console.log('PDF generated successfully as output.pdf');
  } catch (error) {
    console.error('Error generating PDF:', error);
  }
}

generatePDF();