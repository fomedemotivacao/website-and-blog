import { posts } from '../src/data/posts';

export const onRequestGet = () => {
  const SITE_URL = 'https://fomedemotivacao.com.br';
  const RSS_TITLE = 'Fome de Motivacao - Blog';
  const RSS_DESCRIPTION = 'Artigos sobre motivacao, criptomoedas, tecnologia e desenvolvimento pessoal';
  const RSS_LANGUAGE = 'pt-br';

  // Sort posts by date (newest first)
  const sortedPosts = [...posts]
    .filter(post => post && post.slug && post.title && post.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Generate RSS items
  const rssItems = sortedPosts.map(post => {
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
  }).join('\n');

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

  return new Response(rssXml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
