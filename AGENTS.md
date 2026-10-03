# IEC ExpoTrack agent guide

## Scope

- Treat this repository root as the working directory for all commands and file edits.
- Keep changes focused on the requested task and preserve unrelated user changes.
- Never commit `.env`, database exports, backups, credentials, or generated `.next` files.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Prisma, and PostgreSQL.
- The local web server uses `http://localhost:3100`.
- Local PostgreSQL is provided by Docker Compose on `127.0.0.1:55432`.

## Common commands

- Install: `npm ci`
- Start database: `npm run db:start`
- Generate Prisma client: `npm run db:generate`
- Apply development migrations: `npm run db:migrate`
- Seed local data: `npm run db:seed`
- Run development server: `npm run dev`
- Verify changes: `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`

## Conventions

- Reuse the existing validation, authorization, repository, and component patterns before introducing new abstractions.
- Add or update Vitest coverage for behavioral changes.
- Use `.env.example` for local configuration shape and `.env.production.example` for deployment shape; do not expose actual secret values.
- Read `PRODUCTION.md` and use the production deployment procedure before making server or deployment changes.
