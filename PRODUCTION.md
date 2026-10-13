# IEC ExpoTrack production deployment

This is the shortest safe path from a new server to a checked deployment. The repository prepares the application, database networking, health checks, migrations, and validation. DNS, TLS, the host firewall, and GitHub repository rules still require the account or server owner.

## 1. Prepare configuration

Copy `.env.production.example` to an untracked `.env` on the server. Fill in the values there or provide the same variables through your deployment platform.

Generate two different random secrets:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Use one as `POSTGRES_PASSWORD` and one as `AUTH_SECRET`. Build `DATABASE_URL` with the same PostgreSQL password. Do not commit the completed file. `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD` are only for the first administrator; remove both after that account has signed in and changed its password.

## 2. Run the automated gate

On a development computer, use `npm run release:check` to check the code, build, dependencies and secrets with your local configuration. It reports **CODE READY**, not production readiness, and writes `.release-check.json`. It does not change your `.env` or check the server's secrets.

For the full gate, run in an environment with the actual production configuration:

```bash
npm ci
npm run prod:check
```

The command validates Prisma, generates the client, runs lint, checks TypeScript, runs tests, builds the application, rejects High/Critical dependency findings, scans Git history with Gitleaks, and validates the production environment. It also writes a secret-free local `.security-check.json` result for deployment automation. That file is ignored by Git; the web page never executes build or scanning tools.

To validate a separately prepared, untracked production file without replacing the development `.env`, use `npm run prod:check -- --env-file .env.production.local`. This file is used only by the environment-validation subprocess; builds and tests still use their normal configuration. The runtime configuration must also be validated on the server. Do not copy server credentials onto a development computer just to make a check pass.

The `deepmerge-ts` override in `package.json` patches GHSA-ggr8-5vv4-36mx in Prisma's CLI-only configuration loader. Remove the override after the installed `@prisma/config` release depends on `deepmerge-ts` 8 or newer, then confirm `npm run prod:check` remains green.

Next.js and its lint config require at least 16.3.8; Vitest requires at least 4.1.11. Security overrides update `sharp`, `source-map-js` and ExcelJS's CommonJS-compatible `uuid` dependency. The Next ESLint plugin's sole glob consumer calls `globSync(pattern, { onlyDirectories: true })`; its `fast-glob` dependency is replaced by `tinyglobby` using an npm alias to eliminate the unpatched `braces` chain while retaining the Next rules. This is scoped to that plugin, not a general drop-in replacement for every fast-glob API. Review the override and compatibility tests when upgrading the plugin. See [the braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [tinyglobby's API](https://github.com/SuperchupuDev/tinyglobby).

Gitleaks must be installed or Docker Desktop/the Docker daemon must be running. CI runs Gitleaks independently on every pull request to `main`.

## 3. Start the production services

```bash
docker compose --env-file .env -f docker-compose.production.yml build
docker compose --env-file .env -f docker-compose.production.yml up -d
docker compose --env-file .env -f docker-compose.production.yml ps
```

The migration container runs `prisma migrate deploy` before the app starts. PostgreSQL has no published host port. Next.js is reachable only at `127.0.0.1:3000`, ready for the host reverse proxy. Database data remains in the named `postgres_data` volume.

## 4. Configure Nginx and HTTPS

1. Point the DNS record for the chosen hostname to the server.
2. Copy `deploy/nginx.conf.example` into the server's Nginx site configuration.
3. Replace `exhibitions.example.com` with the real hostname.
4. Obtain a certificate, for example: `sudo certbot --nginx -d exhibitions.example.com`.
5. Test and reload: `sudo nginx -t && sudo systemctl reload nginx`.

The proxy must set `X-Forwarded-Proto https`. Keep `HTTPS_ENABLED=true` only when HTTPS works; it enables Secure session cookies at runtime and HSTS during the application build. Production Compose passes this value into the image build automatically. For a non-Docker deployment, set it before running `npm run build`.

## 5. Verify the live server

Run these on the server:

```bash
curl -fsS https://exhibitions.example.com/api/health
sudo ss -lntp
docker compose --env-file .env -f docker-compose.production.yml ps
```

Expected results:

- the health endpoint returns only `{"status":"ok"}`;
- public listeners are limited to intended services, normally SSH, HTTP, and HTTPS;
- port 3000 listens only on `127.0.0.1`;
- PostgreSQL port 5432 is not published;
- all containers are healthy or completed successfully.

Then sign in as an administrator and open `/admin/security`. Infrastructure items remain `UNKNOWN` until the live firewall, DNS, TLS, and GitHub settings are checked externally; the application deliberately does not probe the server or third parties.

## 6. Protect `main` in GitHub

Open: **Repository → Settings → Rules → Rulesets → New branch ruleset**.

Target `main`, then enable:

- restrict deletions;
- block force pushes;
- require a pull request before merging;
- require conversations to be resolved;
- require the branch to be up to date;
- require status checks `quality`, `dependency-audit`, and `secret-scan`.

Then open **Repository → Settings → Code security and analysis** and enable secret scanning and push protection when the repository plan supports them. These account-level settings cannot be truthfully verified from application code.

## Credential leak response

If Gitleaks reports a real credential in any commit, treat it as compromised. Rotate it at the provider first, update the server secret, and review its usage logs. Removing it from the latest file is not sufficient. Do not paste the credential into an issue or pull request.

## Operational checks

- Backups: use **Administration → Data Management**, export a JSON backup, and periodically verify restore in a non-production database.
- Updates: run `npm audit --audit-level=high` and the full `npm run prod:check` before deployment.
- Logs: review **Administration → Activity Logs**; application routes do not permit editing or deleting these entries.
- Status: review **Administration → System & Security** after configuration changes.

## Manual actions remaining

These cannot be completed safely from this repository:

1. Configure DNS for the production hostname.
2. Install the real secrets outside Git.
3. Install and verify the TLS certificate and Nginx site on the server.
4. Verify the live firewall and listening ports with `sudo ss -lntp`.
5. Enable the GitHub `main` ruleset, secret scanning, and push protection using the UI paths above.
