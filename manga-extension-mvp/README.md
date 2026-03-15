# Manga Tracker Sync Extension

Extensão de navegador (Manifest V3) para sincronizar progresso de leitura com a API de integrações do Manga Tracker.

## O que já faz
- Configura `apiBaseUrl`, `partnerSlug`, `accessToken` e domínios permitidos.
- Faz `POST /integrations/connect/exchange` para trocar código por token.
- Suporta fluxo "Conectar com Manga Tracker" sem copiar codigo (web -> extensao por mensagem externa).
- Detecta leitura em sites permitidos e envia `POST /integrations/sync`.
- Envia `x-idempotency-key` por evento para reduzir duplicidade.
- Mantem fila local persistente com retry/backoff para falhas temporarias de rede/API.
- Tem adapter específico para `mangalivre.tv`.

## Aviso
- Capítulos podem não refletir 100% o estado real em todos os títulos.

## Estrutura
- `manifest.json`
- `src/background.js`
- `src/content.js`
- `src/options.html`
- `src/options.js`
- `src/adapters.js`
- `assets/icons/`

## Teste rápido (modo dev)
1. Acesse `chrome://extensions`.
2. Ative `Developer mode`.
3. Clique em `Load unpacked` e selecione `manga-extension-mvp`.
4. Abra `Options` da extensão.
5. Preencha API, parceiro e domínios permitidos.
6. Gere um código em `/profile/integrations`.
7. Em `Options`, preencha código e `client secret` do parceiro.
8. Clique em `Trocar código`, depois em `Salvar`.
9. Abra uma página de mangá em domínio permitido e confira logs do service worker.

## Publicação
- Use `EXTENSION_RELEASE_CHECKLIST.md` para publicar na Chrome Web Store e Opera Add-ons.
- Pipeline automatizado: `.github/workflows/extension-release.yml`.
- Script de build por target: `manga-extension-mvp/scripts/build-zip.sh <chromium|firefox|opera>`.
- Smoke check de artifact: `manga-extension-mvp/scripts/smoke-check.sh <zip> <target>`.
