# Arquitetura de Projeto - Manga Tracker

## Objetivo

Padronizar o desenvolvimento do monorepo para:

1. reduzir acoplamento entre frontend, backend e extensao;
2. acelerar manutencao e onboarding;
3. facilitar evolucao visual sem quebrar regra de negocio;
4. permitir trabalho paralelo por feature;
5. diminuir regressao em deploy.

## Escopo

Este documento cobre:

1. `manga-list` (frontend web - Next.js App Router);
2. `manga-list-backend` (API - NestJS + Prisma + Postgres);
3. `manga-extension-mvp` (extensao browser MV3);
4. `.github/workflows` (validacoes e automacoes de release/health).

## Principios

1. **Feature-first**: organizar por dominio de negocio antes de organizar por tipo tecnico.
2. **Container vs Presentation**: orquestracao separada de render.
3. **Single responsibility**: cada arquivo tem um motivo claro para mudar.
4. **Contracts first**: DTOs/tipos estaveis entre camadas.
5. **Admin-safe**: acao administrativa sempre com guard no backend.
6. **I18n-first**: texto de UI sai do JSX e vai para `messages/*.json`.
7. **Incremental refactor**: migracao por partes, sem big-bang.

## Estrutura alvo (monorepo)

```text
mangalist/
  arquitetura.md
  .github/
    workflows/

  manga-list/
    app/
      [locale]/
        <rota>/page.tsx                 # rota leve (container)
    components/
      ui/                               # design system base
      <feature>/                        # componentes de feature
    hooks/                              # hooks compartilhados de UI/estado
    lib/
      api-client.ts                     # client HTTP base
      <feature>-api.ts                  # contratos HTTP por dominio
    messages/
      pt.json
      en.json

  manga-list-backend/
    prisma/
      schema.prisma
      migrations/
    src/
      <modulo>/
        <modulo>.controller.ts          # entrada HTTP
        <modulo>.service.ts             # regra de negocio
        dto/                            # contratos de entrada/saida
        guards/                         # autorizacao por dominio
      common/
      observability/
      tasks/

  manga-extension-mvp/
    src/
      background.js                     # orquestracao e integracao com backend
      content.js                        # coleta no site parceiro
      adapters.js                       # parser por dominio
      popup.js                          # UI da extensao
      options.js                        # configuracao da extensao
    _locales/
```

## Contrato por camada - Frontend (`manga-list`)

### 1) `app/**/page.tsx` (rota/container)

Responsavel por:

1. auth bootstrap e redirect;
2. chamada de hooks/clientes de dominio;
3. composicao da tela.

Nao deve:

1. conter regra de negocio pesada;
2. chamar `fetch` direto sem `lib/api-client`;
3. crescer sem extracao quando passar do limite recomendado.

### 2) `components/**`

Responsavel por:

1. render puro e interacao local;
2. receber props tipadas;
3. reutilizacao intra-feature e cross-feature.

### 3) `hooks/**`

Responsavel por:

1. estado da tela;
2. handlers;
3. derivacao de dados.

### 4) `lib/<feature>-api.ts`

Responsavel por:

1. contrato HTTP do dominio;
2. parse padrao de erro;
3. uso consistente de auth/csrf.

### 5) `messages/*.json`

Responsavel por:

1. todo texto de UI;
2. chaves estaveis;
3. paridade PT/EN.

## Contrato por camada - Backend (`manga-list-backend`)

### 1) `*.controller.ts`

Responsavel por:

1. rota e status code;
2. validacao via DTO;
3. composicao de guards.

Nao deve:

1. acessar banco diretamente;
2. concentrar regras longas de negocio.

### 2) `*.service.ts`

Responsavel por:

1. regra de negocio;
2. orquestracao entre modulos e provedores externos;
3. transacoes de escrita quando necessario.

### 3) `dto/*`

Responsavel por:

1. schema de entrada/saida;
2. validacoes class-validator;
3. mensagens de erro previsiveis.

### 4) `guards/*`

Responsavel por:

1. autorizacao por escopo (admin/user);
2. bloqueio padrao por default-deny;
3. retorno consistente de `403`.

### 5) `tasks/*`

Responsavel por:

1. jobs manuais ou agendados de manutencao;
2. operacoes batch isoladas da request principal;
3. logs e limite de execucao.

Regra atual:

1. evitar cron agressivo em producao quando impacto de custo for alto;
2. priorizar execucao sob demanda e gatilho administrativo.

## Contrato por camada - Extensao (`manga-extension-mvp`)

### 1) `background.js`

Responsavel por:

1. conexao com backend;
2. fila/retry do sync;
3. permissao de dominio e controle de sessao;
4. telemetria minima de erro no console.

### 2) `adapters.js` + `content.js`

Responsavel por:

1. parse de titulo/capitulo/url por parceiro;
2. emissao de payload canonico para o background;
3. isolamento por dominio.

### 3) `popup.js` + `options.js`

Responsavel por:

1. UX de conexao/configuracao;
2. exibicao de status local;
3. acionamento de fluxos sem duplicar regra de negocio do backend.

## Contrato de integracao entre apps

1. Extensao envia payload minimo confiavel (`partnerSlug`, `externalMangaId`, `title`, `chapter`, `sourceDomain`).
2. Backend enriquece e normaliza metadados (capa, autor, generos, sinopse).
3. Frontend apenas consome API consolidada; nao replica logica de enrichment.
4. Ordem de fallback de metadata/capa deve ser centralizada no backend, nunca no frontend.

## Convencoes de nomes

1. Componente React: `PascalCase.tsx`.
2. Hook: `useXxx.ts`.
3. API client frontend: `<feature>-api.ts`.
4. Service backend: `<feature>.service.ts`.
5. DTO: `<acao>.dto.ts`.
6. Guard: `<dominio>-admin.guard.ts` ou `<dominio>-scope.guard.ts`.
7. Arquivo de estilo dedicado: `<feature>.styles.ts` quando necessario.

## Limites de arquivo (guia)

### Frontend

1. rota/container: recomendado ate 220, maximo 320 linhas;
2. componente: recomendado ate 180, maximo 260 linhas;
3. hook/client API: recomendado ate 200, maximo 300 linhas.

### Backend

1. controller: recomendado ate 220, maximo 320 linhas;
2. service: recomendado ate 320, maximo 500 linhas;
3. DTO/guard: recomendado ate 120, maximo 200 linhas.

### Extensao

1. `popup.js`: recomendado ate 260, maximo 380 linhas;
2. `background.js`: recomendado ate 320, maximo 450 linhas;
3. `adapters.js`: extrair por dominio ao passar de 300 linhas.

Ao ultrapassar recomendado: extrair na mesma PR ou justificar no texto da PR.

## Seguranca e confiabilidade

1. Guard de admin obrigatorio para qualquer endpoint de manutencao (`/admin/*`).
2. Nao expor segredo em frontend/extensao.
3. Validar sempre input de extensao no backend.
4. Timeout e retry com limite em chamadas externas.
5. Logar erro com contexto (traceId) sem vazar dado sensivel.

## Observabilidade e custo

1. Priorizar metricas de erro, latencia e fila.
2. Evitar polling frequente sem necessidade funcional.
3. Operacoes de manutencao pesada devem ser manuais/admin.
4. Cron deve existir apenas com justificativa de produto/operacao.

## Padrao de refatoracao para arquivos grandes

### Passo 1 - Estabilizar

1. congelar comportamento;
2. garantir `typecheck` verde.

### Passo 2 - Extrair render

1. mover blocos de JSX para `components/<feature>`;
2. remover duplicacao visual.

### Passo 3 - Extrair logica

1. mover estado/handlers para hook;
2. mover I/O para `lib/*-api` (frontend) ou `service` (backend).

### Passo 4 - Revisao

1. validar fluxo principal;
2. revisar i18n PT/EN;
3. revisar guard, permissao e fallback.

## Checklist de PR

1. arquitetura por camada foi respeitada?
2. arquivos estao dentro dos limites?
3. sem regra pesada em JSX/controller?
4. sem texto hardcoded fora de i18n?
5. auth/guard aplicados nos fluxos sensiveis?
6. typecheck/build verde?
7. fluxo manual principal testado?
8. impacto de custo (DB/API externa/polling) avaliado?

## Roadmap de padronizacao (proximas fases)

1. quebrar paginas gigantes de admin/profile em componentes + hooks de feature;
2. separar `integrations.service.ts` por subservicos de dominio;
3. consolidar `lib/*-api` por feature com contratos tipados unificados;
4. criar guia de design UI no `components/ui` com tokens e estados padrao.
