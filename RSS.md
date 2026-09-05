# RSS Feed - Fome de Motivacao Blog

## URLs do RSS

### Feed Dinamico (recomendado)
```
https://fomedemotivacao.pages.dev/rss.xml
```

Este feed e gerado automaticamente pela Cloudflare Function e sempre mostra os posts mais recentes.

### Feed Estatico (alternativa)
```
https://fomedemotivacao.pages.dev/rss.xml
```

O feed estatico e gerado pelo script `scripts/generate-rss.mjs` e atualizado no build.

## Como usar no Pinterest

1. Acesse o [Pinterest Business](https://business.pinterest.com/)
2. Va em **Configuracoes** > **Claim** (Reivindicar)
3. Selecione **Website** ou **RSS Feed**
4. Cole a URL: `https://fomedemotivacao.pages.dev/rss.xml`
5. Siga as instrucoes de verificacao

## Como usar em outras plataformas

### Google Discover
- O RSS e automaticamente lido pelo Google quando o sitemap esta registrado no Search Console

### Flipboard
- Crie uma revista e adicione o RSS: `https://fomedemotivacao.pages.dev/rss.xml`

### Feedly
- Adicione o feed: `https://fomedemotivacao.pages.dev/rss.xml`

### IFTTT / Zapier
- Use o RSS como trigger para automatizar posts em redes sociais

## Atualizacao Automatica

O workflow `auto-post.yml` do GitHub Actions:
1. Gera novos artigos com `scripts/generate-post.mjs`
2. Regenera o RSS com `scripts/generate-rss.mjs`
3. Faz commit e push automaticos

## Comandos Manuais

### Gerar RSS localmente
```bash
node scripts/generate-rss.mjs
```

### Testar o feed
```bash
curl https://fomedemotivacao.pages.dev/rss.xml
```

## Estrutura do RSS

O feed segue o padrao RSS 2.0 com:
- Title, link, description para cada post
- Data de publicacao em UTC
- Ordenacao por data (mais recente primeiro)
- Charset UTF-8 para caracteres especiais

## Troubleshooting

### RSS nao atualiza
- Verifique os logs do deploy no Cloudflare Pages
- Rode `node scripts/generate-rss.mjs` localmente para testar

### Erro de parsing
- Valide o XML em: https://validator.w3.org/feed/
- Verifique caracteres especiais no titulo/descricao dos posts
