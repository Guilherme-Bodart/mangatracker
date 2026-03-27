# Roadmap de Padronizacao - Manga Tracker

## Objetivo

Executar a padronizacao do monorepo sem big-bang, com entregas pequenas e validaveis.

## Fase 1 - Baseline e Quick Wins (em andamento)

### Escopo

1. confirmar jobs recorrentes/custos;
2. quebrar a pagina mais acoplada de admin;
3. estabelecer padrao de feature (hook + componentes + page leve).

### Status

1. `@Cron` ativo no backend: **nao encontrado**;
2. `manga-list/app/[locale]/profile/integrations-admin/page.tsx`:
   - antes: ~701 linhas;
   - agora: ~113 linhas;
   - extraido para:
     - `manga-list/hooks/use-integrations-admin-page.ts`;
     - `manga-list/components/profile/integrations-admin/integrations-admin-sections.tsx`.

### Criterio de aceite

1. `pnpm -C manga-list typecheck` verde;
2. sem regressao funcional na tela de admin de integracoes.

## Fase 2 - Frontend: paginas grandes

### Escopo

1. dividir `app/[locale]/user/[username]/page.tsx` (perfil publico);
2. dividir `app/[locale]/my-track/page.tsx`;
3. extrair clientes e hooks para reduzir logica no JSX.

### Criterio de aceite

1. nenhuma rota principal acima de 320 linhas;
2. textos no i18n (PT/EN) e sem hardcode novo.

## Fase 3 - Backend: servicos monoliticos

### Escopo

1. decompor `integrations.service.ts` por subdominio:
   - parceiros,
   - conexoes,
   - aplicacoes,
   - webhooks.
2. reduzir acoplamento controller -> service gigante.

### Criterio de aceite

1. service principal passa a orquestrar;
2. testes de integracoes continuam verdes.

## Fase 4 - Extensao: modularizacao progressiva

### Escopo

1. separar `popup.js` em UI + handlers;
2. isolar fluxo de sync no `background.js`;
3. preparar base para multiplos parceiros sem acoplamento.

### Criterio de aceite

1. build de extensao sem alteracao de comportamento;
2. smoke test manual em Chromium/Opera.

## Fase 5 - Consolidacao de padrao

### Escopo

1. checklist de PR aplicado no repositorio inteiro;
2. limpeza de utilitarios e scripts soltos;
3. varredura final de arquitetura e divida tecnica.

### Criterio de aceite

1. arquitetura respeitada em todos os modulos ativos;
2. backlog de melhorias restante priorizado por impacto.

