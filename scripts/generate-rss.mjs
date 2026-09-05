import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Config
const SITE_URL = 'https://fomedemotivacao.com.br';
const RSS_TITLE = 'Fome de Motivacao - Blog';
const RSS_DESCRIPTION = 'Artigos sobre motivacao, criptomoedas, tecnologia e desenvolvimento pessoal';
const RSS_LANGUAGE = 'pt-br';

// Read posts.ts and extract the posts array
const postsPath = join(rootDir, 'src', 'data', 'posts.ts');
const postsContent = readFileSync(postsPath, 'utf-8');

// Simple regex to extract the posts array (adjust if needed)
const postsMatch = postsContent.match(/export\s+const\s+posts\s*=\s*(\[.*?\]);/s);
if (!postsMatch) {
  console.error('Could not find posts array in posts.ts');
  process.exit(1);
}

// Evaluate the posts array (safe since it's your own code)
const posts = new Function('return ' + postsMatch[1])();

// Generate RSS items
const rssItems = posts
  .filter(post => post && post.slug && post.title && post.date)
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .map(post => {
    const pubDate = new Date(post.date).toUTCString();
    const link = `${SITE_URL}/article/${post.slug}`;
    const description = post.description || post.title;
    
    return `    <item>
      <title><![CDATA[${escapeXml(post.title)}]]></title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description><![CDATA[${escapeXml(description)}]]></description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
  })
  .join('\n');

// Generate RSS XML
const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${RSS_TITLE}]]></title>
    <link>${SITE_URL}</link>
    <description><![CDATA[${RSS_DESCRIPTION}]]></description>
    <language>${RSS_LANGUAGE}</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rssItems}
  </channel>
</rss>
`;

// Write RSS file
const rssPath = join(rootDir, 'public', 'rss.xml');
writeFileSync(rssPath, rssXml, 'utf-8');

console.log(`RSS feed generated with ${posts.length} posts: ${rssPath}`);

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
