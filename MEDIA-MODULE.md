# Media module — implementation and verification

Media manages publications and editorial contacts independently of Companies. No publisher links, media assets, CRM statuses, portraits or speculative descriptions are created.

## Architecture and entry points

- `/media` uses the existing Header, Footer, buttons, theme variables, flag-icons, responsive layout, Modal focus trap/body scroll lock, SearchableCombobox and TaxonomyMultiSelect.
- `app/media/page.tsx`, `app/media.css` and `components/media/` implement the list, forms, import wizard and four detail tabs: Overview, Contacts, Categories & Topics, Notes.
- `lib/media/` contains Zod validation, normalization, server-side queries, transactional repositories, bounded XLSX parsing and import planning/persistence.
- Shared integration changes are limited to navigation (`components/Header.tsx`, `app/HomeClient.tsx`), page protection (`proxy.ts`), permissions, country lookup read authorization and taxonomy read/usage checks. Media editing does not grant global taxonomy administration.
- No new dependencies were needed. ExcelJS, JSZip, Prisma, Zod, icons, flags and Vitest were already installed. Only a local database test script was added to `package.json`.

### Routes

| Route | Methods / permission |
| --- | --- |
| `/api/media` | GET `VIEW_MEDIA`; POST `CREATE_MEDIA` |
| `/api/media/[id]` | GET `VIEW_MEDIA`; PATCH `UPDATE_MEDIA`; DELETE `DELETE_MEDIA` |
| `/api/media/[id]/contacts` | POST `UPDATE_MEDIA` |
| `/api/media/[id]/contacts/[contactId]` | PATCH / DELETE `UPDATE_MEDIA` |
| `/api/media/[id]/contacts/reorder` | PATCH `UPDATE_MEDIA` |
| `/api/media/[id]/classification` | PATCH `UPDATE_MEDIA` |
| `/api/media/[id]/notes` | POST `UPDATE_MEDIA` |
| `/api/media/[id]/notes/[noteId]` | PATCH / DELETE `UPDATE_MEDIA` |
| `/api/media/import` | POST preview/import `IMPORT_MEDIA` |
| `/api/media/import/[jobId]` | GET persisted diagnostics `IMPORT_MEDIA` |

Mutation requests use same-origin checks, authenticated actors, bounded bodies, Zod validation, rate limiting and audit records. Parent IDs scope contacts and notes. Outlet deletion cascades only owned records; shared taxonomy, users, companies and exhibitions remain intact. Notes render as plain React text; external links accept HTTP(S) only.

Administrators automatically have the new permissions. Existing non-admin users must be explicitly granted the needed Media permissions in Administration. Taxonomy creation/renaming/deletion retains the existing `UPDATE_COMPANIES` / `UPDATE_EXHIBITIONS` checks, not `UPDATE_MEDIA`.

### Database

`prisma/schema.prisma` and `prisma/migrations/202610180001_media_module/migration.sql` add:

- `MediaOutlet`, `MediaContact`, `MediaSocialLink`, `MediaCategory`, `MediaTopic`, `MediaNote`, `MediaImportJob`, `MediaImportSource`;
- Media permissions, audit actions/entities, contact methods and import outcomes;
- indexes for normalized name, domain, country, scope, original category, timestamps, contact email/order and classification joins;
- a partial unique index enforcing at most one primary contact per outlet. Row locks serialize primary changes and reorders.

The list is server-paginated at 25/50/100 with stable ID tie-breakers. The explicit **All** option returns every matching publication summary, preserves search/filters and resets to page 1 (no hidden 100-row cap). Normal/default requests remain paginated. Name/domain/email/role/location/category/topic searches and filters are evaluated in PostgreSQL. Contact-count bounds use one aggregate query. Only up to three contact summaries and category tags are selected per list row; full detail is fetched for the selected `?outlet=<id>`. Search, filters, sort, page and tab state are URL parameters. Drawer tabs support arrow/Home/End keys and Escape closes the dialog.

## Import rules and privacy

1. Read **Sheet1 only**, ascending row order. A nonblank, non-merged-slave A cell opens a publication group. Blank A rows with D/E attach to that group; blank rows do not erase it. Orphans are reported, never reassigned speculatively.
2. Anchor B/C/F supply raw category, full website and country/scope. D is a literal role/contact label, never an invented person's name. E becomes validated email(s), an HTTP(S) contact page, `Call in site` / website form, or a preserved OTHER value requiring review.
3. Full website paths, query strings and nondefault ports participate in publication identity. Matching requires normalized name **and** canonical website identity. Shared domain/email alone never merges publications. Different roles sharing an email remain distinct; exact duplicate label/method/value entries within one outlet are ignored.
4. Only unambiguous country names/codes get ISO alpha-2 flags. Regions, compound countries and cities such as Berlin remain raw scope values. Original imported categories are preserved and cannot be overwritten by the edit form. Conservative taxonomy suggestions require explicit selection; no new taxonomy is auto-created.
5. Workbook size is bounded at 20 MB, archive entries at 2,048, expanded content at 64 MB, and Sheet1 at 5,000 rows / 100 columns. Formula cells are rejected without trusting cached results. Excel parsing stays server-side.
6. Preview precedes import. Default policy creates new publications, matches confident identities and skips uncertain names. Optional update mode only fills missing scalar fields. Transactions batch writes; a transaction-scoped advisory lock serializes imports. File SHA-256 plus column mapping identifies a completed repeat import. PostgreSQL JSONB key order does not affect that comparison.
7. Import jobs retain counts, duplicates, row warnings, category-review suggestions and source row provenance. Reports download as JSON; no spreadsheet formula execution is involved. Raw source contact values remain in protected database provenance, not broad audit telemetry or a public workbook download.

The attached source workbook remained in the user's private Downloads directory. It was not copied into `public/`, added to Git, or embedded in source code. Local QA artifacts and the local pre-migration backup are under ignored `.tools/`.

## Measured initial import — local development only

Verified on 2026-10-18 against PostgreSQL **`iec_expobot` at `127.0.0.1:55432`**, container `iecexpotrack-db-1`. A private PostgreSQL backup was taken before migration. Production was not contacted or changed.

| Metric | Actual result |
| --- | ---: |
| Sheet1 data rows scanned | 1,360 |
| Publication anchors / distinct normalized names | 304 / 303 |
| Continuation rows / contact-bearing rows | 1,046 / 1,338 |
| Publications created / updated / skipped | 303 / 0 / 0 |
| Repeated anchor matched on name + website | 1 |
| Contacts persisted | 1,334 |
| Email contact entries | 1,295 |
| Contact-page URLs / website-form entries | 5 / 25 |
| Exact within-publication contact duplicates ignored | 4 |
| Raw region/scope publication anchors | 39 |
| Unrecognized contact values retained for review | 6 |
| Warnings / rejected rows | 58 / 0 |
| Distinct raw category labels in review report | 180 |
| Sheet4 source records persisted | **0** |

`Oil And Gas Journal` was verified with its 17 contacts. Actual database counts after fixture cleanup were 303 outlets and 1,334 contacts. Repeating the actual workbook import created **zero** outlets and **zero** contacts. Original import results remain in `MediaImportJob`; each repeat has its own report. Warnings include raw non-country scopes and repeated/ambiguous source values; they are not a claim that all source text is clean.

### Repeat local verification

Run from the repository root with the local `.env` and Docker database available:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:media:db
npm run build

node --env-file=.env --import tsx scripts/media-local.ts verify
node --env-file=.env --import tsx scripts/media-local.ts preview "C:\private\Database of Global Media and Magazines.xlsx"
```

For a newly prepared **local** database, `scripts/media-local.ts migrate` applies committed migrations; `scripts/media-local.ts import "C:\private\file.xlsx"` imports using an existing active local administrator as audit actor. These commands refuse production mode, remote hosts, other ports or other database names. They never create an administrator or print connection credentials.

Actual verification outcomes:

- `npm run lint`: passed, no warnings.
- `npm run typecheck`: passed.
- `npm run test`: 195 tests in 39 files passed, including 30 Media tests and all existing Exhibition/Company tests.
- `npm run test:media:db`: 27 real PostgreSQL checks passed. Covers CRUD, shared taxonomy, actor audits, concurrent primary uniqueness, contact ordering, cross-outlet rejection, All pagination, same-file idempotency, changed-file missing-only updates and forced-failure atomic rollback. Only uniquely owned synthetic fixtures are removed afterward.
- Headless Chrome: 30 local browser checks passed at 375/768/1024/1440/1920px, including mobile cards, full-height drawer/non-scrolling tabs, actual imported contacts, keyboard tabs, create/edit/delete, contact/note persistence, view-only restrictions, taxonomy permissions, light theme, column mapping and actual-file repeat-import Results. No runtime exceptions were observed. Screenshots are private QA artifacts, not part of the data source or public repository.
- `npm run build`: Prisma generation and optimized Next.js production build passed.
- `npm run security:scan`: no secret leaks found.

### Responsive UI refinement

`components/media/MediaTable.tsx`, `MediaPagination.tsx` and `lib/media/pagination.ts` separate row rendering and pagination from the explorer. The refined list uses compact desktop rows, a constrained 1,680px content width, readable coverage badges, a single contact-count action instead of repeated generic contact labels, clearer applied-filter names and a sticky footer with **25 / 50 / 100 / All** on the right. Row menus support outside-click/Escape dismissal and flip upward near the bottom edge. Touch actions are enlarged on tablet/mobile.

At 601–1,100px the list uses a two-column card layout; at 600px and below it uses one column. Footer controls reflow, and mobile page navigation omits distant page buttons to avoid overflow. The full-height drawer and its existing four tabs remain intact. Dark/light themes and reduced-motion preferences are preserved.

78 additional read-only layout checks passed across 13 widths from 320px to 2,560px, covering middle-page pagination, All against the actual 303-row dataset, uniform 136×44px contact buttons, filtered/empty results, row-menu keyboard dismissal and light theme. Contact roles/names are omitted from the compact list but preserved in the Contacts detail tab. Imported outlet/contact counts remain unchanged. The 30 full Media browser regression checks were also rerun successfully after the redesign.

The local database already had migration-history entry `202609280001_openai_settings` absent from this checkout. The new Media migration applied successfully with `migrate deploy`, without resetting or rewriting existing history. Review that pre-existing history discrepancy separately; do not use database reset or production `db push` to conceal it.

## Production handoff — approval required, not executed

Follow [PRODUCTION.md](PRODUCTION.md) and the IEC production-operations procedure **only after the owner approves a release ref, migration and data import**:

1. Inspect `/opt/IEC-ExpoTrack`, clean/dirty Git state, deployed SHA, Compose/database health, listening ports, TLS and current logs. Preserve the current application image and release SHA for rollback. Do not touch unrelated infrastructure or secrets.
2. Create a protected, non-empty PostgreSQL custom-format `pg_dump`; validate it with `pg_restore --list`. A full database dump is required: the existing Administration JSON export is exhibition-oriented and does **not** back up this new Media module.
3. Fetch and switch to the explicitly approved release, run the project's code/security gate, then build `docker-compose.production.yml`. Its migration service uses the project-pinned `prisma migrate deploy` before starting the app. Do not use `migrate dev`, database reset, `db push`, volume deletion or `docker compose down -v` on production.
4. Check migration logs, healthy app/database containers, local `127.0.0.1:3000/api/health`, public HTTPS/TLS for the configured hostname(s), and recent logs. Preserve the existing apex-only hostname policy unless the owner separately requests changes.
5. Grant Media permissions as appropriate. As an authorized administrator, privately upload the workbook through **Media → Import Excel**. Review mapping, warnings, duplicate policy and category-review report, then explicitly confirm the production import. Do not copy the workbook into the repository or public web directory. The local-only CLI intentionally cannot run this production import.
6. Verify actual production counts, the OGJ contact group, Sheet4 exclusion, responsive tabs and repeat-import zero-add behavior. Download and securely retain the import report. Confirm Companies, Exhibitions and Saved still operate.
7. On failure, preserve logs and backups. Roll back application code/image only when compatible with the applied schema. Database restoration is a separate, explicit high-risk approval, never automatic.

No production approval, Git commit, GitHub push or deployment is implied by this implementation. Optional Media Saved, publisher-company links, exhibition partnerships and full backup-UI integration are intentionally out of scope.
