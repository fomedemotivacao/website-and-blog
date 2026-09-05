import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const SITE_URL = 'https://fomedemotivacao.com.br';

// Read posts.ts
const postsPath = join(rootDir, 'src', 'data', 'posts.ts');
const postsContent = readFileSync(postsPath, 'utf-8');

// Extract posts array (supports both with and without type annotation)
const postsMatch = postsContent.match(/export\s+const\s+posts(:\s*Post\[\])?\s*=\s*(\[.*?\]);/s);
if (!postsMatch) {
  console.error('Could not find posts array in posts.ts');
  process.exit(1);
}

const posts = new Function('return ' + postsMatch[2])();

// Generate CSV for Pinterest
const csvRows = ['title,description,link,image_file_or_url'];

posts
  .filter(post => post && post.slug && post.title)
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .forEach((post, index) => {
    const title = escapeCsv(post.title);
    const description = escapeCsv(post.description || post.title);
    const link = `${SITE_URL}/article/${post.slug}`;
    // Tenta pegar imagem do post ou usa placeholder
    const image = post.image || post.imageUrl || `${SITE_URL}/placeholder.svg`;
    
    csvRows.push(`"${title}","${description}","${link}","${image}"`);
  });

const csvContent = csvRows.join('\n');

// Write CSV file
const csvPath = join(rootDir, 'public', 'pinterest-posts.csv');
writeFileSync(csvPath, csvContent, 'utf-8');

console.log(`Pinterest CSV generated with ${posts.length} posts: ${csvPath}`);

function escapeCsv(str) {
  if (!str) return '';
  return str
    .replace(/"/g, '""')  // Escape quotes
    .replace(/\n/g, ' ')  // Remove newlines
    .replace(/\r/g, ' ')  // Remove carriage returns
    .substring(0, 500);   // Max 500 chars
}
