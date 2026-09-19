# IEC ExpoTrack

Production-oriented exhibition management for the International Energy Club, with a shared Add/Edit workflow, normalized classifications and deterministic global location data.

## What is included

- AI exhibition search with loading, validation, no-result, error and multi-match states
- Large landscape review modal with strong backdrop blur, inline editing and confirmation
- Manual add, update, duplicate protection and confirmed deletion
- Searchable, keyboard-accessible category/topic multi-selects with in-place CRUD and usage-safe deletion
- Searchable ISO country and country-aware city selection powered server-side by `@countrystatecity/countries`
- Country-derived IANA timezone selection (automatic for one-zone countries, required choice for multi-zone countries)
- Gregorian/Persian date-range selection with shared ISO storage and full Persian month names
- Search, country/industry/year/status/topic filters, five sort modes and URL-backed pagination
- Shared date utility for upcoming countdowns, `LIVE NOW`, ended state and inclusive duration
- PostgreSQL/Prisma schema, migration and realistic 10-event seed
- Saved exhibitions, verified sources, map links and responsive detail pages
- Username/password authentication with opaque database-backed sessions and forced first-login password changes
- Granular permissions, user lifecycle management and final-administrator protection
- Immutable audit history and manual pre/post-event email follow-up tracking
- Production Docker, Compose, PM2 and Nginx guidance

When `DATABASE_URL` is omitted, repository-level exhibition reads can still use the non-persistent in-process demo catalog in development. The authenticated application requires PostgreSQL because users, sessions, permissions and audit history are intentionally persistent and server-controlled. Set PostgreSQL for application evaluation and every production environment.

## Local setup

```bash
npm install
copy .env.example .env
npm run db:start
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. On macOS/Linux, use `cp .env.example .env` instead of `copy`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production | PostgreSQL connection URL used by Prisma |
| `EXHIBITION_DATA_MODE` | Optional | `auto` permits demo read fallback in development; `database` fails fast |
| `OPENAI_API_KEY` | Optional | Enables live AI exhibition research; keep server-side |
| `OPENAI_MODEL` | Optional | Responses API model, defaults to `gpt-5-mini` |
| `INITIAL_ADMIN_USERNAME` | First deployment | Username used to idempotently create the initial administrator |
| `INITIAL_ADMIN_PASSWORD` | First deployment | Temporary administrator password that must be changed at first login |
| `NODE_ENV` | Production | Set to `production` for deployments |

Local PostgreSQL is exposed only on `127.0.0.1:55432`, avoiding the default host port `5432` and leaving other local services untouched. PostgreSQL continues to use port `5432` only inside its private Docker network.

The AI provider is isolated in `lib/exhibitions/ai-provider.ts`. Without a key it searches the included verified demo catalog and all review/add flows remain functional.
AI intentionally does not set country, city, category, topic or timezone; those values must come from the validated application datasets.

## Database workflow

Development migration:

```bash
npm run db:start
npm run db:migrate
npm run db:seed
```

Production migration:

```bash
npm run db:deploy
```

Do not use `prisma db push` for production.

Migration `202609180002_taxonomy_and_location` preserves the legacy `industry` and `topics` values, backfills normalized category/topic entities and join tables, and adds an optional ISO `countryCode` for legacy rows. Migration `202609190001_auth_admin_audit_followup` adds users, sessions, relational permissions, immutable audit history and nullable exhibition attribution/follow-up relations without changing existing exhibition rows. No reset or destructive migration is required.

The initial administrator is bootstrapped lazily and idempotently on the first login request. Existing accounts are never overwritten. Set both initial-admin variables before first sign-in, deploy the migration, and remove or rotate the bootstrap password in the environment after it has been changed. Sessions use random opaque tokens and PostgreSQL stores only their hashes, so no additional auth signing secret is required.

## Quality and production build

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run start
```

## PM2 deployment

On a Linux VPS with Node.js 24+, PostgreSQL and the environment file configured:

```bash
npm ci
npm run db:deploy
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Docker deployment

Change the example database password and then run:

```bash
docker compose up --build -d
docker compose exec app npm run db:seed
```

## Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name exhibitions.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Add HTTPS with Certbot/Let’s Encrypt after DNS is pointed to the VPS. No operating-system or proxy settings are changed by this repository.

## Routes

- `/` — public landing page and Add Exhibition flow
- `/exhibitions` — searchable exhibition database
- `/exhibitions/[slug]` — exhibition intelligence detail
- `/saved` — saved shortlist
- `/login` — username/password sign in
- `/settings/account` — username and password settings
- `/admin` — operational dashboard
- `/admin/users` — user and permission management
- `/admin/activity` — filterable, paginated audit history
- `/api/exhibitions/*` — validated CRUD, save and AI research endpoints
- `/api/taxonomies/*` — category/topic list and management endpoints
- `/api/locations/*` — server-only country, city and timezone lookups

## Authentication and saved-list scope

Internal pages and APIs require an active database-backed session. Administrators have all effective permissions; employee access comes from relational `UserPermission` rows and is rechecked by protected server mutations. Password changes, resets and account disabling revoke existing sessions. The existing Saved behavior remains a shared workspace shortlist; it was intentionally not converted into per-user saved records.

Audit timestamps and the administration dashboard’s “Today” boundary use UTC consistently. The manual pre/post-event email fields are status tracking only; this application does not send or schedule email.

## Persian font asset

Persian exhibition dates use the `B Nazanin` font declaration and language-aware `lang="fa"` styling. A redistributable font was not supplied, so add your licensed WOFF2 file at `public/fonts/BNazanin.woff2`. Until then, the UI falls back to Tahoma. See `public/fonts/README.md`.

## Visual asset

`public/iec-globe-network.png` was generated specifically for this project using the built-in OpenAI image-generation workflow. Prompt: a premium, dark-navy global energy intelligence hero with a right-anchored networked Earth, cyan data arcs, subtle violet/pink accents, a lower data-wave mesh, and clean left-side negative space; no text, logo or watermark.
