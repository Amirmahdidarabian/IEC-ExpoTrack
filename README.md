# IEC ExpoTrack

Production-oriented exhibition intelligence MVP for the International Energy Club. It reproduces the supplied dark IEC interface across AI discovery, the exhibitions database, review/edit dialogs, saved events and exhibition intelligence details.

## What is included

- AI exhibition search with loading, validation, no-result, error and multi-match states
- Large landscape review modal with strong backdrop blur, inline editing and confirmation
- Manual add, update, duplicate protection and confirmed deletion
- Search, country/industry/year/status/topic filters, five sort modes and URL-backed pagination
- Shared date utility for upcoming countdowns, `LIVE NOW`, ended state and inclusive duration
- PostgreSQL/Prisma schema, migration and realistic 10-event seed
- Saved exhibitions, verified sources, map links and responsive detail pages
- Production Docker, Compose, PM2 and Nginx guidance

When `DATABASE_URL` is omitted, the app uses a non-persistent in-process demo catalog so the complete interface can be evaluated immediately. Set PostgreSQL in every persistent or production environment.

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
| `NODE_ENV` | Production | Set to `production` for deployments |

Local PostgreSQL is exposed only on `127.0.0.1:55432`, avoiding the default host port `5432` and leaving other local services untouched. PostgreSQL continues to use port `5432` only inside its private Docker network.

The AI provider is isolated in `lib/exhibitions/ai-provider.ts`. Without a key it searches the included verified demo catalog and all review/add flows remain functional.

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

- `/` — public AI research search and add flow
- `/exhibitions` — searchable exhibition database
- `/exhibitions/[slug]` — exhibition intelligence detail
- `/saved` — saved shortlist
- `/reports`, `/resources`, `/about` — supporting product pages
- `/api/exhibitions/*` — validated CRUD, save and AI research endpoints

## Authentication and intentionally deferred scope

Authentication and multi-user saved lists are intentionally deferred because no identity system existed in the empty starting workspace. The current MVP is a single trusted workspace; deploy it behind an access layer if exposed publicly. Notifications, paid map embeds, full report versioning and a CMS are also outside the focused MVP. All visible product controls in the implemented flows are functional.

## Visual asset

`public/iec-globe-network.png` was generated specifically for this project using the built-in OpenAI image-generation workflow. Prompt: a premium, dark-navy global energy intelligence hero with a right-anchored networked Earth, cyan data arcs, subtle violet/pink accents, a lower data-wave mesh, and clean left-side negative space; no text, logo or watermark.
