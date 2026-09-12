import fs from 'node:fs';

const postsPath = 'src/data/posts.ts';
const slug = process.env.POST_SLUG?.trim();
const replacementPath = process.env.REPLACEMENT_FILE?.trim();

if (!slug) throw new Error('POST_SLUG é obrigatório');
if (!replacementPath) throw new Error('REPLACEMENT_FILE é obrigatório');
if (!fs.existsSync(replacementPath)) throw new Error(`Arquivo não encontrado: ${replacementPath}`);

const replacement = fs.readFileSync(replacementPath, 'utf8').trim();
if (replacement.split(/\s+/).length < 1200) throw new Error('O novo conteúdo precisa ter pelo menos 1200 palavras.');

const source = fs.readFileSync(postsPath, 'utf8');
const marker = `slug: ${JSON.stringify(slug)}`;
const start = source.indexOf(marker);
if (start < 0) throw new Error(`Slug não encontrado: ${slug}`);

const contentStart = source.indexOf('content: [', start);
if (contentStart < 0) throw new Error('Campo content não encontrado');
const arrayStart = source.indexOf('[', contentStart);

let depth = 0;
let inString = false;
let escaped = false;
let arrayEnd = -1;
for (let i = arrayStart; i < source.length; i++) {
  const ch = source[i];
  if (inString) {
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === '"') inString = false;
    continue;
  }
  if (ch === '"') inString = true;
  else if (ch === '[') depth++;
  else if (ch === ']') {
    depth--;
    if (depth === 0) { arrayEnd = i; break; }
  }
}
if (arrayEnd < 0) throw new Error('Fim do campo content não encontrado');

const paragraphs = replacement.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
const encoded = paragraphs.map(p => `      ${JSON.stringify(p)},`).join('\n');
const updated = source.slice(0, arrayStart) + '[\n' + encoded + '\n    ' + source.slice(arrayEnd);
const wordCount = replacement.split(/\s+/).length;
const objectEnd = updated.indexOf('  },', start);
if (objectEnd < 0) throw new Error('Fim do artigo não encontrado');
const objectText = updated.slice(start, objectEnd);
const correctedObject = objectText
  .replace(/wordCount: \d+/, `wordCount: ${wordCount}`)
  .replace(/readingTime: "[^"]*"/, `readingTime: "${Math.max(1, Math.ceil(wordCount / 200))} min"`);
const finalText = updated.slice(0, start) + correctedObject + updated.slice(objectEnd);
fs.writeFileSync(postsPath, finalText, 'utf8');
console.log(`Artigo reescrito: ${slug}`);
console.log(`Palavras: ${wordCount}`);
