# Go-Live Checklist (MangaList)

## 0) Security first
- Confirm `.env` files are ignored and not staged.
- Rotate secrets immediately if they were ever exposed in logs/chat/screenshots.
- Ensure production env uses `PASSWORD_RESET_DEV_RESPONSE=false`.

## 1) Production env setup
- Create runtime env from `manga-list-backend/.env.production.example`.
- Set real values for database, JWT, OAuth, SMTP, and frontend URLs.
- Keep `COOKIE_SECURE=true`.

## 2) Install and build
- Backend: `cd manga-list-backend && pnpm install && pnpm build`
- Frontend: `cd manga-list && pnpm install && pnpm build`

## 3) Database migration (production)
- `cd manga-list-backend`
- `pnpm prisma migrate deploy`
- `pnpm prisma generate`

## 4) Start services
- Start backend with production env.
- Start frontend with production env.

## 5) Smoke tests
- Health/basic: open frontend home and login/register pages.
- Auth flow: register, login, `/auth/me`, logout.
- Security: confirm mutation without `x-csrf-token` returns 403.
- Password reset: forgot/reset with real email.
- Manga flow: add/update/favorite/remove item from list.

## 6) Post-deploy verification
- Check backend logs for structured entries with `traceId`.
- Check error responses include `code/message/details/path/timestamp`.
- Confirm rate-limit headers on repeated auth attempts.

## 7) First push hygiene
- Review `git status` and ensure no secret files are tracked.
- Push repository only after all checks above pass.
