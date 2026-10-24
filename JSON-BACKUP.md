# Full application JSON backup (v2)

Use **Administration → Data Management → Export JSON**. Administrator access and
same-origin checks are required. Download responses are private and not cached.
The export is a consistent database snapshot; a successful export is audited.

## Included

- Exhibitions: details, dates, sources, categories/topics, author references,
  email follow-up status/timestamps, exhibitor-list flags/link and networking flag.
- Companies: details, priority, every contact and primary selection, social links,
  notes/authors, categories/topics, linked exhibitions (role, hall, booth and notes).
- Company folders: names, descriptions, colors, memberships and membership dates.
- Media: publication details, all labelled/ordered contacts and primary selection,
  social links, notes/authors, categories/topics and original import provenance.
- Saved: exhibition and company `saved` flags. The Saved page is derived from these;
  it is not a separate or per-user table in this application.
- Administration: user profiles, roles and permission lists, activity history,
  company/media Excel import jobs, reports and provenance. Dashboard totals are
  derived from restored records, not a separate stored configuration.

## Intentionally excluded

Password hashes, plaintext passwords, sessions, token hashes, rate-limit identifiers,
environment files/API keys, TLS/SSH keys, Nginx/Docker/host configuration and
browser-local diagnostics are **not** a portable JSON backup. Recognizable
credential keys/connection strings in free-form JSON metadata are redacted. Treat
all backup files as confidential: they contain personal and business contact data.
Never upload them to GitHub. Use verified, access-controlled PostgreSQL dumps for
full disaster recovery (including credentials). A JSON export is not a server image.

## Restore behavior

1. Export a fresh backup of the destination first; retain a verified PostgreSQL dump
   before a production restore. Production restores require explicit operator approval.
2. Select a `.json` file (up to 50 MiB). Preview validates the entire document,
   supported version, types, unique identities, one primary contact per parent and
   all foreign references. Review section counts, match counts and warnings.
3. Confirm restore. All database writes, including its audit entry, are one transaction.
   Any failure rolls back the whole import. Imports serialize with an advisory lock.
4. Included parent records are restored from the snapshot. Their child lists
   (contacts, notes, sources, social links, classifications and folder/exhibition
   memberships) are replaced. Newer related data for those parents can be lost:
   keep the fresh pre-restore backup. Parents absent from the file are retained.
5. Company identity uses stable record IDs; do not rewrite IDs in a JSON file to
   merge companies. Taxonomy/folders use IDs or unique names/slugs; Exhibitions use
   IDs/slugs and Media uses IDs/identity keys. Conflicting matches abort instead
   of silently combining different records. Mapped identities propagate to links.
6. Existing destination accounts, credentials, activity and permissions are never
   overwritten. User ID/username conflicts abort. New profiles keep their role and
   permission lists but are created **disabled** with unusable random credentials
   and mandatory password change. An existing administrator must reset their
   password and explicitly enable them. Bootstrap an administrator first on a new
   installation. No restored profile can sign in automatically.
7. Imported activity is labelled `[Imported history]`; it is uploaded history,
   not proof that the destination performed that action. Existing audit IDs and
   import-job history are retained. Import history never executes a job.

Version 1 exhibition-only backups remain supported. They never clear or modify
Companies, Media or administrative sections omitted from that legacy format.

## Local verification

```bash
npm run test
npm run test:backup:db
```

The second command is deliberately restricted to local `iec_expobot` on port 55432.
It exports real data to ignored `outputs/full-backup-verification/`, creates an
isolated random `iec_backup_verify_*` database, applies the project's migrations,
restores and re-exports every business field/relationship, verifies repeated import,
account safety, ID remapping, legacy support and transaction rollback, then removes
only the exact temporary database it created. It does not import into the source.

For production files above the existing proxy limit, an operator must separately
review Nginx upload/time-out settings. The repository template allows 51 MiB on
admin preview/import endpoints; deploys do not automatically change live Nginx.
Older deployed versions cannot import v2: deploy a v2-capable release first.
