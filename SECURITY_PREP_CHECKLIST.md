# Checklist pre-push (Passo 1)

## Concluido
- Segredos locais ignorados por git (`.env`, `.env.*`, chaves e `secretAuth.json`).
- Fluxo de auth por cookie + CSRF ativo.
- JWT com `tokenVersion` para invalidacao global de sessao.
- SMTP validado com envio real.
- Error format global padronizado + traducao por `Accept-Language`.
- Rate limit distribuido por IP + usuario/email e metricas de bloqueio.
- E2E de fluxos criticos (cookie+csrf, forgot/reset, 401/403/429, manga CRUD).
- Build/lint/test backend e frontend verdes.
- Strict TypeScript gradual aplicado por blocos (`auth`, `manga`, `core`).
- Conteudo legal publicado em `terms/privacy/contact`.

## Pendente antes do primeiro push publico
- Revisar valores finais de `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`, `TRUST_PROXY` por ambiente.
- Aplicar migracoes no banco de destino.
- Confirmar pages legais com texto final revisado juridicamente (versao atual e MVP tecnico).
- Definir dominio/canal de contato definitivo para suporte e privacidade.
- Executar runbook final: `GO_LIVE_CHECKLIST.md`.

## Guardas de seguranca aplicadas em codigo
- Em `NODE_ENV=production`, o backend valida startup e falha se:
  - `COOKIE_SECURE` nao for `true`
  - `COOKIE_SAMESITE` estiver invalido
  - `PASSWORD_RESET_DEV_RESPONSE` estiver `true`

## Comandos essenciais
- Aplicar migracoes: `pnpm prisma migrate deploy` (producao) ou `pnpm prisma migrate dev` (desenvolvimento)
- Gerar client Prisma: `pnpm prisma generate`
