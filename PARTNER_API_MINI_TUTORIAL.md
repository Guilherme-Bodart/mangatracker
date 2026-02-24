# Mini Tutorial - API de Integracoes para Parceiros

Este guia mostra como um parceiro conecta a conta do usuario e envia atualizacao de capitulo.

## 1) Admin cadastra parceiro (uma vez)
Requer usuario admin autenticado no seu site.

Endpoint:
- `POST /integrations/admin/partners`

Payload:
```json
{
  "slug": "site-a",
  "name": "Site A",
  "allowedDomains": ["site-a.com"],
  "isActive": true
}
```

Resposta:
- retorna dados do parceiro + `clientSecret` (mostrar uma vez e guardar com seguranca).

## 2) Usuario conecta conta com parceiro
Fluxo em 2 etapas.

### 2.1) Front do seu site gera codigo curto
Requer usuario logado (JWT cookie) + CSRF.

Endpoint:
- `POST /integrations/connect/start`

Payload:
```json
{
  "partnerSlug": "site-a",
  "sourceDomain": "site-a.com",
  "scopes": ["manga:write"]
}
```

Resposta:
```json
{
  "code": "...",
  "expiresInMs": 300000
}
```

### 2.2) Backend do parceiro troca codigo por token
Endpoint:
- `POST /integrations/connect/exchange`

Payload:
```json
{
  "partnerSlug": "site-a",
  "clientSecret": "SEGREDO_DO_PARCEIRO",
  "code": "CODIGO_RECEBIDO",
  "sourceDomain": "site-a.com"
}
```

Resposta:
```json
{
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresInSeconds": 2592000,
  "scopes": ["manga:write"]
}
```

## 3) Parceiro envia atualizacao de manga
Endpoint:
- `POST /integrations/sync`
- Header: `Authorization: Bearer <accessToken>`
- Header recomendado para retry seguro: `x-idempotency-key: <id-unico-do-evento>`

Payload:
```json
{
  "partnerSlug": "site-a",
  "externalMangaId": "one-piece-123",
  "title": "One Piece",
  "chapter": 1123,
  "sourceDomain": "site-a.com"
}
```

Resposta (exemplos):
- `created`: manga nao existia na lista do usuario e foi criada com entrada minima.
- `updated`: manga existia e capitulo foi atualizado.
- `noop`: capitulo recebido era menor/igual ao atual.

## 4) Regra de negocio aplicada
- Se manga ja existe: atualiza apenas `currentChapter` quando `incoming > atual`.
- Se manga nao existe: cria item minimo (`status=READING`, `currentChapter`) e mapeia `externalMangaId`.
- Nota e campos extras ficam vazios para o usuario preencher depois.

## 5) Endpoints admin uteis
Todos exigem admin autenticado (`INTEGRATION_ADMIN_EMAILS`) e, quando mutacao, tambem CSRF.

- `GET /integrations/admin/partners`
- `PATCH /integrations/admin/partners/:id`
- `POST /integrations/admin/partners/:id/rotate-secret`
- `GET /integrations/admin/connections?partnerSlug=site-a`
- `POST /integrations/admin/connections/:id/revoke`

## 6) Variaveis importantes
- `INTEGRATION_ADMIN_EMAILS=admin1@dominio.com,admin2@dominio.com`
- `INTEGRATION_JWT_SECRET` (opcional, recomendado)
  - se nao definir, usa `JWT_SECRET`.

## 7) Seguranca recomendada
- Rotacionar `clientSecret` periodicamente.
- Manter `allowedDomains` preenchido por parceiro.
- Usar apenas `manga:write` no MVP.
- Auditar eventos via tabela `SyncEventLog`.
- Em caso de retry de rede/timeouts, reutilizar o mesmo `x-idempotency-key` para evitar duplicacao de processamento.
