/**
 * generate-post.mjs
 * Gera um novo post para o Fome de Motivação usando a API do OpenRouter,
 * atualiza src/data/posts.ts com o novo artigo (com imagem Unsplash integrada),
 * e atualiza public/sitemap.xml adicionando a URL do novo post.
 *
 * Secrets necessários no repositório:
 *   OPENROUTER_API_KEY   — chave do OpenRouter
 *   UNSPLASH_API_KEY     — chave do Unsplash (para imagens reais)
 *   GH_TOKEN             — GitHub token com permissão contents:write
 *
 * Variáveis de ambiente opcionais (passadas pelo workflow):
 *   POST_TEMA            — tema do artigo (ex: "disciplina")
 *   POST_ANGULO          — ângulo editorial
 *   POST_SENSACAO        — reflexão que o leitor deve levar
 *   POST_PALAVRA_CHAVE   — keyword SEO
 *   OPENROUTER_MODEL     — modelo a usar (padrão: google/gemma-4-31b-it:free)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import https from 'https';

// ─── Modelos de fallback — ATUALIZADO AGOSTO 2026 ────────────────────────────
// Lista verificada em openrouter.ai/models (modelos :free com endpoint ativo)
// Se o modelo principal der 429 ou 404, tenta os próximos automaticamente
const FALLBACK_MODELS = [
  'google/gemma-4-26b-a4b-it:free',          // Gemma 4 26B — multimodal, estável
  'nvidia/nemotron-3-super-120b-a12b:free',  // Nemotron 120B — raciocínio geral
  'nvidia/nemotron-3-nano-30b-a3b:free',     // Nemotron 30B — rápido e leve
  'openai/gpt-oss-20b:free',                  // GPT OSS 20B — assistente geral
  'inclusionai/ling-3.0-flash:free',          // Ling 3.0 Flash — instruções gerais
  'nvidia/nemotron-3-ultra-550b-a55b:free',  // Nemotron Ultra 550B — longo contexto
  'poolside/laguna-xs-2.1:free',             // Laguna XS — coding + instrução
  'poolside/laguna-s-2.1:free',              // Laguna S — coding + instrução
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70);
}

function today() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return d.toISOString().split('T')[0];
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Falha ao parsear resposta: ' + data.slice(0, 300))); }
      });
    }).on('error', reject);
  });
}

function callOpenRouter(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://fomedemotivacao.com.br',
        'X-Title': 'Fome de Motivação',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Falha ao parsear resposta OpenRouter: ' + data.slice(0, 500))); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Chama OpenRouter com fallback automático ─────────────────────────────────
async function callOpenRouterWithFallback(messages, primaryModel) {
  const models = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (i > 0) {
      console.log(`⚠️  Tentando modelo de fallback #${i}: ${model}`);
    }

    const response = await callOpenRouter({
      model,
      messages,
      max_tokens: 4500,
      temperature: 0.85,
    });

    if (response.error) {
      const code = response.error.code || response.error.status;
      const msg = (response.error.message || '').toLowerCase();

      const isRateLimit = code === 429 || String(code) === '429' ||
        msg.includes('rate') || msg.includes('rate-limited');
      const isNotFound = code === 404 || String(code) === '404' ||
        msg.includes('no endpoints') || msg.includes('not found');

      if ((isRateLimit || isNotFound) && i < models.length - 1) {
        const reason = isNotFound ? 'Modelo não encontrado (404)' : 'Rate limit (429)';
        console.warn(`🔄 ${reason} em "${model}" — tentando próximo modelo...`);
        continue;
      }

      console.error(`❌ Erro OpenRouter com modelo "${model}":`, JSON.stringify(response.error, null, 2));
      process.exit(1);
    }

    if (i > 0) {
      console.log(`✅ Artigo gerado com modelo de fallback: ${model}`);
    } else {
      console.log(`✅ Artigo gerado com modelo principal: ${model}`);
    }
    return response;
  }

  console.error('❌ Todos os modelos retornaram erro. Tente novamente mais tarde.');
  process.exit(1);
}

// ─── Busca imagem no Unsplash ─────────────────────────────────────────────────

async function buscarImagemUnsplash(query) {
  const UNSPLASH_KEY = process.env.UNSPLASH_API_KEY;
  if (!UNSPLASH_KEY) {
    console.warn('⚠️  UNSPLASH_API_KEY não definida. Usando imagem OG dinâmica.');
    return null;
  }

  const traducoes = {
    'procrastinação': 'procrastination focus', 'autoconfiança': 'confidence success',
    'medo': 'fear courage', 'hábitos': 'habits routine morning', 'propósito': 'purpose life goals',
    'comparação': 'social media comparison', 'resiliência': 'resilience strength',
    'foco': 'focus concentration work', 'disciplina': 'discipline training',
    'limites': 'boundaries personal space', 'autoconhecimento': 'self reflection mirror',
    'gestão do tempo': 'time management productivity', 'motivação': 'motivation energy',
    'fracasso': 'failure learning', 'gratidão': 'gratitude thankful', 'zona de conforto': 'comfort zone growth',
    'tomada de decisão': 'decision making choice', 'autossabotagem': 'self sabotage mindset',
    'mentalidade': 'mindset growth success', 'solidão': 'solitude alone peaceful',
    'comunicação': 'communication people talking', 'ansiedade': 'anxiety calm mindfulness',
    'liderança': 'leadership team success', 'perfeccionismo': 'perfectionism detail work',
    'relacionamentos': 'relationships people connection', 'criatividade': 'creativity art inspiration',
    'saúde mental': 'mental health wellbeing', 'coragem': 'courage brave challenge',
    'identidade': 'identity self portrait', 'sonhos': 'dreams goals vision',
    'descanso': 'rest relaxation peace', 'autocuidado': 'self care wellness',
    'presença': 'mindfulness present moment', 'vulnerabilidade': 'vulnerability human emotion',
    'paciência': 'patience calm waiting', 'perdão': 'forgiveness peace heart',
    'responsabilidade': 'responsibility accountability', 'adaptabilidade': 'adaptability change',
    'persistência': 'persistence determination', 'clareza mental': 'mental clarity thinking',
  };

  const queryEn = Object.entries(traducoes).find(([k]) =>
    query.toLowerCase().includes(k)
  )?.[1] || `${query} motivation personal development`;

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(queryEn)}&per_page=10&orientation=landscape&client_id=${UNSPLASH_KEY}`;
    const data = await httpsGet(url);

    if (!data.results || data.results.length === 0) {
      console.warn('⚠️  Nenhuma imagem encontrada no Unsplash para:', queryEn);
      return null;
    }

    const pick = data.results[Math.floor(Math.random() * Math.min(5, data.results.length))];
    const imageUrl = pick.urls.regular;
    const authorName = pick.user.name;
    const authorLink = pick.user.links.html + '?utm_source=fome_de_motivacao&utm_medium=referral';
    const unsplashLink = pick.links.html + '?utm_source=fome_de_motivacao&utm_medium=referral';

    console.log(`🖼️  Imagem Unsplash: ${imageUrl}`);
    console.log(`📸 Foto por: ${authorName} | ${unsplashLink}`);

    return { url: imageUrl, author: authorName, authorLink, unsplashLink };
  } catch (err) {
    console.warn('⚠️  Erro ao buscar imagem no Unsplash:', err.message);
    return null;
  }
}

// ─── Atualiza sitemap.xml ─────────────────────────────────────────────────────
// ATENÇÃO: a rota dos artigos é /blog/{slug} — não /post/{slug}

function atualizarSitemap(slug, date) {
  const BASE_URL = 'https://fomedemotivacao.com.br';
  const sitemapPath = 'public/sitemap.xml';

  // Rota correta: /blog/{slug}
  const postUrl = `${BASE_URL}/blog/${slug}`;
  const lastmod = date; // YYYY-MM-DD

  let sitemapContent = '';

  if (existsSync(sitemapPath)) {
    sitemapContent = readFileSync(sitemapPath, 'utf-8');
  } else {
    sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
</urlset>`;
    console.log('📄 sitemap.xml não encontrado — criando novo.');
  }

  // Verifica se o slug já existe no sitemap (evita duplicata)
  if (sitemapContent.includes(`/blog/${slug}`)) {
    console.log(`ℹ️  URL já existe no sitemap: /blog/${slug}`);
    return false;
  }

  // Bloco da nova URL
  const newUrlBlock = `  <url>
    <loc>${postUrl}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

  // Insere antes do fechamento </urlset>
  const updated = sitemapContent.replace(
    '</urlset>',
    `${newUrlBlock}\n</urlset>`
  );

  writeFileSync(sitemapPath, updated, 'utf-8');
  console.log(`🗺️  sitemap.xml atualizado: ${postUrl}`);
  return true;
}

// ─── Banco de temas ───────────────────────────────────────────────────────────

const TEMAS_BANCO = [
  { tema: 'procrastinação', angulo: 'por que adiamos o que importa e o custo real disso', sensacao: 'clareza sobre o que estamos evitando', keyword: 'procrastinação como parar de adiar' },
  { tema: 'autoconfiança', angulo: 'como ela se constrói na prática e não pelo pensamento positivo', sensacao: 'confiança vem de ação, não de espera', keyword: 'como desenvolver autoconfiança' },
  { tema: 'medo do fracasso', angulo: 'por que o fracasso paralisa e como mudar a relação com ele', sensacao: 'menos medo de errar, mais disposição de tentar', keyword: 'medo de fracassar como superar' },
  { tema: 'hábitos', angulo: 'por que mudar hábitos é difícil e o que realmente funciona', sensacao: 'perspectiva realista sobre mudança de comportamento', keyword: 'como criar hábitos consistentes' },
  { tema: 'propósito', angulo: 'o mito de encontrar um propósito único e como construir sentido no dia a dia', sensacao: 'propósito pode ser construído, não apenas descoberto', keyword: 'como encontrar propósito de vida' },
  { tema: 'comparação com outros', angulo: 'o efeito das redes sociais na autoimagem e como sair do ciclo de comparação', sensacao: 'menos competição interna, mais foco no próprio caminho', keyword: 'parar de se comparar com os outros' },
  { tema: 'resiliência', angulo: 'o que ela é de verdade além do clichê motivacional', sensacao: 'resistir não significa ser invulnerável', keyword: 'como desenvolver resiliência' },
  { tema: 'foco', angulo: 'por que estamos cada vez mais distraídos e o que fazer com isso', sensacao: 'foco é uma escolha que pode ser treinada', keyword: 'como melhorar o foco e concentração' },
  { tema: 'disciplina', angulo: 'por que a disciplina sustenta resultados quando a motivação some', sensacao: 'consistência bate intensidade no longo prazo', keyword: 'disciplina e consistência para resultados' },
  { tema: 'limites pessoais', angulo: 'por que dizer não é uma forma de respeito próprio', sensacao: 'impor limites não é egoísmo, é saúde', keyword: 'como impor limites pessoais' },
  { tema: 'autoconhecimento', angulo: 'por que conhecer a si mesmo é o início de qualquer mudança real', sensacao: 'clareza sobre quem você é e o que te move', keyword: 'como desenvolver autoconhecimento' },
  { tema: 'gestão do tempo', angulo: 'por que gerenciar energia importa mais do que gerenciar horas', sensacao: 'usar o tempo com mais intenção', keyword: 'como gerenciar o tempo de forma eficiente' },
  { tema: 'motivação', angulo: 'por que a motivação some e o que sustenta a ação quando ela vai embora', sensacao: 'que motivação não é pré-requisito para agir', keyword: 'como manter a motivação' },
  { tema: 'fracasso', angulo: 'o que os fracassos realmente ensinam e como transformá-los em aprendizado', sensacao: 'fracasso como parte do processo, não fim', keyword: 'aprender com o fracasso' },
  { tema: 'gratidão', angulo: 'como a gratidão genuína difere do pensamento positivo forçado', sensacao: 'reconhecer o que existe sem ignorar o que falta', keyword: 'como praticar gratidão de verdade' },
  { tema: 'zona de conforto', angulo: 'por que sair da zona de conforto é mal compreendido e quando faz sentido', sensacao: 'que crescimento tem ritmo próprio', keyword: 'sair da zona de conforto com consciência' },
  { tema: 'tomada de decisão', angulo: 'como decidir melhor em um mundo cheio de opções', sensacao: 'clareza sobre o que guia suas escolhas', keyword: 'como tomar decisões melhores' },
  { tema: 'autossabotagem', angulo: 'como identificar comportamentos que nos impedem de avançar', sensacao: 'reconhecer padrões que nos travam', keyword: 'como parar de se autossabotar' },
  { tema: 'mentalidade de crescimento', angulo: 'o que realmente muda quando você acredita que pode melhorar', sensacao: 'abertura para aprender sem medo de errar', keyword: 'mentalidade de crescimento na prática' },
  { tema: 'solidão', angulo: 'a diferença entre solidão saudável e isolamento prejudicial', sensacao: 'que estar sozinho pode ser um ato de autocuidado', keyword: 'solidão e autoconhecimento' },
  { tema: 'comunicação', angulo: 'por que nos comunicamos mal e como melhorar isso no cotidiano', sensacao: 'que falar menos e ouvir mais muda relações', keyword: 'como melhorar a comunicação' },
  { tema: 'ansiedade', angulo: 'entendendo a ansiedade sem dramatizar nem minimizar', sensacao: 'que a ansiedade tem causas e pode ser manejada', keyword: 'como lidar com a ansiedade no dia a dia' },
  { tema: 'liderança pessoal', angulo: 'o que significa liderar a própria vida com responsabilidade', sensacao: 'que ser protagonista é uma escolha diária', keyword: 'como desenvolver liderança pessoal' },
  { tema: 'perfeccionismo', angulo: 'quando a busca pela perfeição vira bloqueio', sensacao: 'que feito é melhor que perfeito na maioria dos casos', keyword: 'como lidar com o perfeccionismo' },
  { tema: 'relacionamentos', angulo: 'como os vínculos que cultivamos definem quem nos tornamos', sensacao: 'reflexão sobre as pessoas que escolhemos ter perto', keyword: 'relacionamentos e crescimento pessoal' },
  { tema: 'criatividade', angulo: 'por que todos somos criativos e como desbloqueamos essa capacidade', sensacao: 'que criatividade é prática, não talento inato', keyword: 'como desenvolver criatividade' },
  { tema: 'saúde mental', angulo: 'o que significa cuidar da saúde mental de forma prática e honesta', sensacao: 'que cuidar da mente é tão importante quanto do corpo', keyword: 'como cuidar da saúde mental' },
  { tema: 'coragem', angulo: 'a diferença entre coragem real e impulsividade', sensacao: 'que agir com medo ainda é agir', keyword: 'como ser mais corajoso no dia a dia' },
  { tema: 'identidade', angulo: 'como nossa identidade se forma e por que é tão difícil mudá-la', sensacao: 'que você pode reescrever quem você está sendo', keyword: 'como construir identidade pessoal' },
  { tema: 'sonhos e metas', angulo: 'a diferença entre sonhar e ter objetivos reais', sensacao: 'que metas concretas transformam sonhos em caminhos', keyword: 'como transformar sonhos em metas reais' },
  { tema: 'descanso', angulo: 'por que descansar é produtivo e não preguiça', sensacao: 'que parar faz parte do processo de avançar', keyword: 'importância do descanso para produtividade' },
  { tema: 'autocuidado', angulo: 'o que autocuidado realmente significa além das tendências', sensacao: 'que cuidar de si não é luxo, é necessidade', keyword: 'como praticar autocuidado de verdade' },
  { tema: 'presença', angulo: 'como a falta de presença nos distancia do que realmente importa', sensacao: 'que viver no momento presente é uma prática', keyword: 'como viver mais presente' },
  { tema: 'vulnerabilidade', angulo: 'por que mostrar vulnerabilidade exige mais coragem do que escondê-la', sensacao: 'que ser vulnerável é humano e necessário', keyword: 'vulnerabilidade e força pessoal' },
  { tema: 'paciência', angulo: 'como a cultura da velocidade nos tornou intolerantes à espera', sensacao: 'que os melhores resultados exigem tempo', keyword: 'como desenvolver paciência' },
  { tema: 'perdão', angulo: 'o que o perdão realmente é e por que ele é para você, não para o outro', sensacao: 'que perdoar é uma forma de se libertar', keyword: 'como perdoar e se libertar do passado' },
  { tema: 'responsabilidade pessoal', angulo: 'a diferença entre assumir responsabilidade e se culpar', sensacao: 'que ser responsável pelos próprios resultados é poder, não fardo', keyword: 'responsabilidade pessoal e resultados' },
  { tema: 'adaptabilidade', angulo: 'como as pessoas que lidam melhor com mudanças pensam diferente', sensacao: 'que mudar de plano não é fracasso, é inteligência', keyword: 'como se adaptar a mudanças' },
  { tema: 'persistência', angulo: 'quando persistir faz sentido e quando é hora de mudar de direção', sensacao: 'que persistência com consciência é diferente de teimosia', keyword: 'como desenvolver persistência' },
  { tema: 'clareza mental', angulo: 'como o excesso de informação prejudica a capacidade de pensar com clareza', sensacao: 'que simplificar o ambiente mental melhora as decisões', keyword: 'como ter mais clareza mental' },
];

// ─── Sanitiza parágrafos gerados pela IA ─────────────────────────────────────
// CRÍTICO: evita que caracteres especiais quebrem a sintaxe TypeScript do posts.ts
// Qualquer caractere que quebre strings JS deve ser neutralizado aqui.

function sanitizeParagraph(p) {
  return p
    .replace(/\u2014|\u2013/g, ',')    // travessão em vírgula (regra do prompt)
    .replace(/\u2018|\u2019/g, "'")    // aspas tipográficas simples → padrão
    .replace(/\u201c|\u201d/g, '"')    // aspas tipográficas duplas → padrão
    .replace(/\\/g, '\\\\')            // backslashes soltos → escapados
    .replace(/`/g, "'")                // backticks → aspas simples (CRÍTICO: evita template literal quebrado)
    .replace(/\$\{/g, '(')            // ${...} → ( — evita interpolação quebrada no TS
    .replace(/\[/g, '(')              // FIX: colchetes dentro de parágrafo podem romper parsing do array TS
    .replace(/\]/g, ')')              // FIX: fecha colchetes também convertidos
    .trim();
}

// ─── Padrões de metadado gerados pela IA — NUNCA devem aparecer no artigo ────
// Modelos como Gemma, Nemotron e outros adicionam notas ao final da resposta,
// como "(Note: The article length is approximately X words, satisfying the
// minimum requirement.)" ou variações. Este filtro remove qualquer linha que
// corresponda a esses padrões antes de processar os parágrafos.

const AI_METADATA_PATTERNS = [
  /^\s*\(?\s*note\s*:/i,                          // (Note: ...) ou Note: ...
  /^\s*\(?\s*nota\s*:/i,                          // (Nota: ...) — variante PT
  /article\s+length\s+is\s+approximately/i,       // "article length is approximately"
  /satisfying\s+the\s+(minimum|word)\s+req/i,     // "satisfying the minimum requirement"
  /approximately\s+\d[\d,.]+\s+words/i,            // "approximately 1,380 words"
  /total\s+word\s+count/i,                         // "total word count"
  /word\s+count\s*:/i,                             // "word count:"
  /contagem\s+de\s+palavras/i,                     // PT: "contagem de palavras"
  /^\s*\*\*?note\s*:/i,                            // **Note: ...
  /^\s*\[note\]/i,                                  // [Note]
  /^\s*---\s*$/,                                    // separador horizontal solto
  /^\s*this\s+article\s+(has|contains|meets)/i,   // "This article has/contains..."
  /^\s*o\s+artigo\s+(tem|possui|atende)/i,         // PT: "O artigo tem..."
];

function isAIMetadata(line) {
  return AI_METADATA_PATTERNS.some(pattern => pattern.test(line));
}

// ─── Lê posts.ts e conta artigos existentes ──────────────────────────────────

const postsPath = 'src/data/posts.ts';
const postsRaw = readFileSync(postsPath, 'utf-8');

const slugMatches = [...postsRaw.matchAll(/slug:\s*"([^"]+)"/g)];
const totalExistingPosts = slugMatches.length;
const contadorArtigo = totalExistingPosts + 1;
const ofereceEbook = contadorArtigo % 3 === 0;

console.log(`📊 Posts existentes: ${totalExistingPosts}`);
console.log(`📝 Novo artigo: #${contadorArtigo} | offerEbook: ${ofereceEbook}`);

const existingSlugs = new Set(slugMatches.map(m => m[1]));

let temaIdx = totalExistingPosts % TEMAS_BANCO.length;
let temaDefault = TEMAS_BANCO[temaIdx];
for (let i = 0; i < 10; i++) {
  const candidateSlug = slugify(temaDefault.tema);
  const jaExiste = [...existingSlugs].some(s => s.includes(candidateSlug.split('-')[0]));
  if (!jaExiste) break;
  temaIdx = (temaIdx + 1) % TEMAS_BANCO.length;
  temaDefault = TEMAS_BANCO[temaIdx];
}

const tema = process.env.POST_TEMA || temaDefault.tema;
const angulo = process.env.POST_ANGULO || temaDefault.angulo;
const sensacao = process.env.POST_SENSACAO || temaDefault.sensacao;
const palavraChave = process.env.POST_PALAVRA_CHAVE || temaDefault.keyword;
const modelo = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';

console.log(`🎯 Tema: ${tema}`);
console.log(`📐 Ângulo: ${angulo}`);
console.log(`🔑 Palavra-chave: ${palavraChave}`);
console.log(`🤖 Modelo: ${modelo}`);

// ─── Lê PROMPT_MESTRE ────────────────────────────────────────────────────────

const promptMestreRaw = readFileSync('src/data/prompt-mestre.ts', 'utf-8');
const promptMestreMatch = promptMestreRaw.match(/export const PROMPT_MESTRE = `([\s\S]*?)`;/);
if (!promptMestreMatch) throw new Error('Não foi possível extrair PROMPT_MESTRE');
const PROMPT_MESTRE = promptMestreMatch[1];

// ─── Busca imagem no Unsplash (em paralelo com chamada da IA) ─────────────────

console.log('🖼️  Buscando imagem no Unsplash...');
const unsplashPromise = buscarImagemUnsplash(tema);

// ─── Monta prompts ────────────────────────────────────────────────────────────

const systemPrompt = PROMPT_MESTRE
  .replace('{tema_desc}', tema)
  .replace('{angulo}', angulo)
  .replace('{sensacao}', sensacao)
  .replace('{palavra_chave}', palavraChave)
  .replace('{contador_artigo}', String(contadorArtigo))
  .replace('{oferecer_ebook}', String(ofereceEbook));

const userPrompt = `Gere agora um artigo completo seguindo todas as instruções do prompt mestre.

Variáveis para este artigo:
- tema_desc: ${tema}
- angulo: ${angulo}
- sensacao: ${sensacao}
- palavra_chave: ${palavraChave}
- contador_artigo: ${contadorArtigo}
- oferecer_ebook: ${ofereceEbook}

ATENÇÃO: O artigo deve ter NO MÍNIMO 1.200 PALAVRAS. Preferencialmente entre 1.300 e 1.700 palavras.
Responda APENAS com o artigo. Primeira linha: # Título do Artigo. Segunda linha: RESUMO: [resumo até 200 caracteres].`;

const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: userPrompt },
];

// ─── Loop de geração: até 15 tentativas para obter texto com ≥ 1.200 palavras ──

const MAX_TENTATIVAS = 15;
const MIN_PALAVRAS = 1200;

let rawArticle = null;
let tentativa = 0;

while (tentativa < MAX_TENTATIVAS) {
  tentativa++;
  console.log(`\n⏳ Tentativa ${tentativa}/${MAX_TENTATIVAS} — chamando OpenRouter...`);

  const aiResponse = await callOpenRouterWithFallback(messages, modelo);
  const candidato = aiResponse.choices?.[0]?.message?.content;

  if (!candidato || candidato.trim().length < 200) {
    console.warn(`⚠️  Tentativa ${tentativa}: resposta vazia ou muito curta (${candidato?.length ?? 0} chars). Tentando novamente...`);
    continue;
  }

  const linhasCandidato = candidato.split('\n');
  const conteudoCandidato = linhasCandidato
    .filter(l => !l.startsWith('# ') && !l.startsWith('RESUMO:') && l.trim() !== '' && !isAIMetadata(l))
    .join(' ');
  const palavrasCandidato = conteudoCandidato.split(/\s+/).length;

  console.log(`📏 Tentativa ${tentativa}: ${palavrasCandidato} palavras geradas.`);

  if (palavrasCandidato >= MIN_PALAVRAS) {
    console.log(`✅ Mínimo de ${MIN_PALAVRAS} palavras atingido na tentativa ${tentativa}!`);
    rawArticle = candidato;
    break;
  }

  console.warn(`⚠️  Tentativa ${tentativa}: apenas ${palavrasCandidato} palavras — mínimo é ${MIN_PALAVRAS}. Tentando novamente...`);
}

if (!rawArticle) {
  console.error(`❌ Não foi possível gerar um artigo com ${MIN_PALAVRAS}+ palavras após ${MAX_TENTATIVAS} tentativas. Abortando.`);
  process.exit(1);
}

console.log(`\n✅ Artigo aprovado! Tamanho: ${rawArticle.length} chars`);

// ─── Aguarda imagem do Unsplash ───────────────────────────────────────────────

const unsplashResult = await unsplashPromise;

// ─── Extrai título, resumo e parágrafos ──────────────────────────────────────

const lines = rawArticle.split('\n');
const titleLine = lines.find(l => l.startsWith('# '))?.replace(/^#\s+/, '').trim() || `Artigo sobre ${tema}`;
const resumoLine = lines.find(l => l.startsWith('RESUMO:'))?.replace(/^RESUMO:\s*/, '').trim() || `Reflexões sobre ${tema} para ajudar você a pensar melhor e agir com mais clareza.`;

// FIX: filtra linhas de metadado da IA (ex: "Note: The article length is approximately...")
// além das linhas de título e resumo já descartadas anteriormente.
const contentLines = lines.filter(l =>
  !l.startsWith('# ') && !l.startsWith('RESUMO:') && l.trim() !== '' && !isAIMetadata(l)
).map(l => l.trim());

if (contentLines.length === 0) {
  console.error('❌ Nenhuma linha de conteúdo encontrada após filtragem. Abortando.');
  process.exit(1);
}

const paragraphs = [];
let buffer = '';
for (const line of contentLines) {
  if (line.startsWith('## ')) {
    if (buffer.trim()) { paragraphs.push(buffer.trim()); buffer = ''; }
    paragraphs.push(line);
  } else {
    buffer += (buffer ? ' ' : '') + line;
    if (buffer.length > 280 && /[.?!]$/.test(buffer)) {
      paragraphs.push(buffer.trim());
      buffer = '';
    }
  }
}
if (buffer.trim()) paragraphs.push(buffer.trim());

const wordCount = contentLines.join(' ').split(/\s+/).length;
const readingTime = `${Math.max(5, Math.round(wordCount / 200))} min`;

console.log(`✅ Contagem de palavras final: ${wordCount} palavras.`);

// ─── Imagem final: Unsplash ou fallback /og/{slug} ───────────────────────────

const slug = slugify(titleLine);
const postDate = today();

let imageUrl;
let imageCredit = null;

if (unsplashResult) {
  imageUrl = unsplashResult.url;
  imageCredit = {
    author: unsplashResult.author,
    authorLink: unsplashResult.authorLink,
    unsplashLink: unsplashResult.unsplashLink,
  };
} else {
  imageUrl = `/og/${slug}`;
  console.log('📷 Usando imagem OG gerada dinamicamente:', imageUrl);
}

// ─── Categoria e tags ─────────────────────────────────────────────────────────

const categoryMap = {
  procrastinação: 'Produtividade', foco: 'Produtividade', gestão: 'Produtividade',
  hábitos: 'Hábitos', disciplina: 'Disciplina', persistência: 'Disciplina',
  autoconfiança: 'Mentalidade', resiliência: 'Mentalidade', mentalidade: 'Mentalidade',
  coragem: 'Coragem', medo: 'Coragem', vulnerabilidade: 'Coragem',
  propósito: 'Propósito', sonhos: 'Propósito', identidade: 'Propósito',
  autoconhecimento: 'Autoconhecimento', comparação: 'Autoconhecimento', limites: 'Autoconhecimento',
  ansiedade: 'Saúde Mental', saúde: 'Saúde Mental', solidão: 'Saúde Mental',
  relacionamentos: 'Relacionamentos', comunicação: 'Relacionamentos',
  gratidão: 'Desenvolvimento Pessoal', criatividade: 'Desenvolvimento Pessoal',
};
const category = Object.entries(categoryMap).find(([k]) => tema.toLowerCase().includes(k))?.[1] || 'Desenvolvimento Pessoal';

const tags = [palavraChave, tema, 'desenvolvimento pessoal', 'mentalidade', 'autoconhecimento']
  .filter((v, i, a) => v && a.indexOf(v) === i)
  .slice(0, 5);

console.log(`📌 Slug: ${slug}`);
console.log(`📂 Categoria: ${category}`);
console.log(`📖 Palavras: ~${wordCount}`);
console.log(`🖼️  Imagem final: ${imageUrl}`);

// ─── Verifica duplicata de slug ───────────────────────────────────────────────

if (existingSlugs.has(slug)) {
  console.error(`❌ Slug "${slug}" já existe! Abortando para evitar duplicata.`);
  process.exit(1);
}

// ─── Monta bloco do novo post ─────────────────────────────────────────────────

// CRÍTICO: sanitiza parágrafos antes de serializar para evitar corrupção do posts.ts
// JSON.stringify já escapa aspas duplas e newlines — sanitizeParagraph neutraliza
// os demais caracteres perigosos (backticks, ${, travessões, colchetes, etc.)
const escapedParagraphs = paragraphs
  .map(p => `      ${JSON.stringify(sanitizeParagraph(p))}`)
  .join(',\n');

const imageCreditField = imageCredit
  ? `,\n    imageCredit: { author: ${JSON.stringify(imageCredit.author)}, authorLink: ${JSON.stringify(imageCredit.authorLink)}, unsplashLink: ${JSON.stringify(imageCredit.unsplashLink)} }`
  : '';

const newPostBlock = `  {\n    slug: "${slug}",\n    title: ${JSON.stringify(titleLine)},\n    description: ${JSON.stringify(resumoLine)},\n    date: "${postDate}",\n    readingTime: "${readingTime}",\n    category: ${JSON.stringify(category)},\n    tags: ${JSON.stringify(tags)},\n    wordCount: ${wordCount},\n    offerEbook: ${ofereceEbook},\n    image: ${JSON.stringify(imageUrl)}${imageCreditField},\n    content: [\n${escapedParagraphs}\n    ],\n  }`;

// ─── Insere no topo do array posts ───────────────────────────────────────────
// FIX 1: replace mais específico — remove apenas espaços/newlines iniciais do slice,
// preservando a estrutura do restante do array sem consumir tokens importantes.

const insertMarker = 'export const posts: Post[] = [';
const insertIdx = postsRaw.indexOf(insertMarker);
if (insertIdx === -1) throw new Error('Não encontrei "export const posts: Post[] = [" em posts.ts');

const insertPoint = insertIdx + insertMarker.length;
const before = postsRaw.slice(0, insertPoint);
// FIX 1: /^[\s\n]*/ em vez de /^\s*/ — consome todos os whitespace/newlines iniciais
// e reinsere separador correto, evitando colisão progressiva entre posts
const after = postsRaw.slice(insertPoint).replace(/^[\s\n]*/, '\n\n  ');

// FIX 2 (validação de depth): percorre o conteúdo do array verificando
// balanceamento de colchetes e chaves, ignorando aspas simples para evitar
// falsos positivos em contrações (ex: "don't", "você's").
// Aspas simples NÃO delimitam strings em TypeScript/JSON, então não precisam
// ser rastreadas — JSON.stringify usa apenas aspas duplas.
const newContent = before + '\n' + newPostBlock + ',\n' + after;

const arrayStart = newContent.indexOf('export const posts: Post[] = [');
const arraySection = newContent.slice(arrayStart);
let depth = 0;
let inString = false;
let escape = false;
for (const ch of arraySection) {
  if (escape) { escape = false; continue; }
  if (ch === '\\' && inString) { escape = true; continue; }
  if (ch === '"' && !escape) { inString = !inString; continue; }
  // aspas simples ignoradas intencionalmente — não delimitam strings em JSON/TS
  if (!inString) {
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
  }
}
if (depth !== 0) {
  console.error(`❌ posts.ts ficaria com sintaxe inválida (depth=${depth}). Abortando para não corromper o arquivo.`);
  process.exit(1);
}

writeFileSync(postsPath, newContent, 'utf-8');

console.log('💾 posts.ts atualizado!');

// ─── Atualiza sitemap.xml ─────────────────────────────────────────────────────

atualizarSitemap(slug, postDate);

// ─── Resumo final ─────────────────────────────────────────────────────────────

console.log(`🎉 Post publicado: "${titleLine}"`);
console.log(`📅 Data: ${postDate}`);
console.log(`📖 Palavras: ${wordCount} | Leitura: ${readingTime}`);
if (imageCredit) {
  console.log(`📸 Crédito da imagem: ${imageCredit.author} via Unsplash`);
}
console.log(`🗺️  URL do post: https://fomedemotivacao.com.br/blog/${slug}`);
