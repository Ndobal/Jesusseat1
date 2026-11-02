# Run, deploy and maintain JesusSeat

## Requirements

- Node.js 24 (pinned major), persistent local disk, one application process.
- No third-party npm runtime dependencies; no install step required.
- TLS reverse proxy or ingress for production and a canonical public origin.
- Verified sending domain and Resend API key for the included transactional mail adapter. A different email provider requires replacing the small delivery adapter, not changing account logic.

## Local development

```sh
cp .env.example .env
npm start
```

Open http://127.0.0.1:3000. Create your own account. No fake users/churches are seeded. If no email provider is configured, email is **queued**, not sent. In a separate terminal run `npm run mail` to inspect local verification/invitation/reset links. This command displays confidential links and is disabled in production. Do not publish screenshots/logs containing these links.

The development outbox key is created in `data/outbox.key`, mode 0600. Keep it with development data. Never commit `.env`, runtime data, backups or keys.

## Production configuration

Set `NODE_ENV=production`, `APP_ORIGIN=https://your-actual-domain`, `HOST=0.0.0.0`, `PORT`, `DATABASE_PATH` on persistent disk, `MAIL_API_KEY`, `MAIL_FROM`, and a randomly generated `OUTBOX_KEY` of at least 32 characters. Inject secrets through the host secret manager; don't put them in images, Git, command arguments or CI logs. Startup refuses insecure origins or missing mail/encryption configuration. An API key's presence does not verify email delivery: perform a real delivery test with the owner before onboarding churches.

Production uses Secure host-only cookies, HSTS and a strict CSP. No cross-origin API access. Reverse proxy must preserve the same canonical browser origin and forward traffic only to this app. The app ignores arbitrary `X-Forwarded-For` headers. Rate limits use the socket peer address, meaning a reverse proxy aggregates IP limits across visitors. Configure additional per-client limits at the trusted edge, and test/tune aggregate limits for expected traffic before launch; do not enable blind trust of forwarding headers. An explicit trusted-proxy implementation is a future hosting-specific task.

### Docker

Build with `docker build -t jesusseat .`. Supply environment using the host's secret mechanism and mount a writable volume at `/app/data`. The image runs as the unprivileged `node` user; initialise volume ownership accordingly. Terminate HTTPS at your ingress. Never expose an unauthenticated development build with live personal data. The application is not directly deployable to Workers/Pages; see ADR-001.

## Email outbox

Account/invitation records and queued mail commit in the same transaction. Payloads are AES-256-GCM encrypted; recipients and subjects remain readable to the database operator. A delivery lease avoids concurrent claims, the provider gets an idempotency key, failed sends back off up to one hour, and sent payloads are erased. The server attempts one message per 10 seconds. Run only one application process; review throughput before larger pilots. Pending emails are not proof of delivery. Confirm provider configuration and inspect queue metadata when users report missing links.

Encrypted queues contain expiring credentials. Restrict database/backups, keep the key stable, use encryption at rest and define a retention policy before public launch. Resending verification or invitations invalidates prior links. Delivery retries might deliver an old, invalid link followed by a newer one; tell users to use the newest message.

## Backups and restoration

`npm run backup` uses SQLite's consistent online backup API. Store backups encrypted outside the app host, and preserve OUTBOX_KEY separately in a secret manager. Protect the permissions of copied backups. Restore procedure:

1. Stop the application and retain the current database for investigation.
2. Restore the backup to the configured database path, with correct ownership. Remove stale `-wal`/`-shm` companions only while the app is stopped and after preserving the current data.
3. Restore the matching encryption key. Start a test instance on a private origin and validate accounts, churches, memberships and audit history.
4. Revoke restored sessions and outstanding tokens/invitations before resuming public service to avoid resurrecting credentials invalidated after the backup. Keep audit history; record the recovery administratively.
5. Verify email and the application, then resume service.

Backup creation is implemented. A real off-host backup schedule, disaster recovery rehearsal and retention policy are deployment tasks, not automatically configured by this repository.

## Security and pilot readiness

Passwords use scrypt N=32768,r=8,p=3 with independent random salts; comparisons are constant-time. Sessions and one-use tokens are stored only as SHA-256 digests. Twelve-character password minimum. Authentication requests and writes have persistent rate limits, body caps and origin checks. No default admin password or public platform-admin creation route. Authentication state is never accepted from client-supplied role IDs without server-side membership checks.

Production hardening still requires independent security review, password-abuse monitoring, mandatory privileged-account MFA policy, incident-response procedures, trusted-edge policy, final Terms/Privacy/Statement of Faith, transactional email deliverability testing, and pilot church acceptance. Optional authenticator MFA is now implemented; see TWO-STEP-VERIFICATION.md. Do not label this phase foundation a production-certified system.

## Verification

```sh
npm run check
npm test
```

The API suite exercises cross-tenant/branch access, role escalation, recovery, origin/CSRF protection, invitation binding/revocation, atomic audit rollback, body validation, mail retries, suspension enforcement, append-only audit and derived onboarding. CI runs checks and tests on Node 24. Browser acceptance covers initial account/church setup and responsive layouts when the managed preview environment is available.

## Phase 2 continuation

Database startup now performs the transactional version-two migration adding role archival. Take a consistent backup before updating an existing installation. The upgrade is repeatable and covered against a version-one fixture. Do not downgrade to the first build without restoring a matching backup: old positional role inserts are incompatible with the extended table.

The personal `/security` page lets users change their password and revoke their own sessions. No raw token/digest/CSRF credentials are exposed in the session inventory. Role edits use optimistic concurrency, explicit expansion confirmation and immediate permission checks; archiving retains historical records. Review PHASE-2.md for remaining acceptance gates.

GitHub Actions initially could not start jobs because GitHub reported an account billing lock. Do not treat that as a passing or failing application test; local checks and tests are the available execution evidence until hosted CI can run. Authenticated browser workflows and mobile device checks remain unverified.

### Version-three security upgrade

Startup now creates the MFA enrollment, challenge, encrypted-secret and recovery-digest tables and records schema version three. Schema creation and upgrade markers run inside one transaction. Take a backup before upgrading; restore against a copy to verify the encryption key. `OUTBOX_KEY` must remain stable after authenticator enrollment as well as while mail is queued. Neither the setup key nor recovery values may be sent to an external QR generator, added to logs or placed in analytics. Keep the server clock synchronised.

The production app intentionally has no unauthenticated MFA-disable route and email recovery does not bypass a factor. Resolve and document the owner-approved account-recovery policy before onboarding real churches; an operator should not improvise a database edit in response to an unverified support request.

## Phase 3 public website and inbox

Startup creates migration-four tables without changing existing church acceptance records. Back up first. Deploy the complete `public/` directory, including six WebP files, and the new source modules. Existing Docker packaging already includes those directories. The root URL now serves the public platform site; private workspaces remain at `/app`.

After registering and verifying an operator account and enabling its authenticator, grant only the intended operator using `npm run admin -- grant operator@example.com`. Review grants with `npm run admin -- list`, revoke with `npm run admin -- revoke operator@example.com`. The inbox lives at `/platform/inbox`; ordinary church administrators cannot open it. Host access is itself privileged and must be tightly restricted. These commands have not been run against any real operator account by this build.

`PLATFORM_NOTIFICATION_EMAIL` optionally enables minimal alerts; blank leaves enquiries available in the inbox. Provider email must be tested for actual reply delivery. Contact messages and replies are encrypted with the stable `OUTBOX_KEY`; names, email addresses and subjects are access-controlled plaintext metadata. Include enquiry records in approved retention/deletion and backup policy before launch. Do not use inbox status as a delivery receipt.

Leave `DONATION_CHECKOUT_URL` and `DONATION_PROVIDER_LABEL` blank until Ndovera Limited has approved and verified a hosted checkout. Configure both to expose an external payment link. This does not enable accounting, receipts, automatic donor identification or payment callbacks. Final policy/faith wording and production deployment particulars need owner review. See PHASE-3.md for exact scope and verification.

## Migration five — worker access

Back up before upgrading. Existing ordinary-member roles have their former workspace permissions cleared with an audit entry. Assignments lose workspace/dashboard access immediately but retain their membership record and personal account-security controls. Custom roles are worker appointments and should be reviewed by the church administrator; no existing assignment is automatically promoted to a new operational role. Migration five adds Head usher, Usher, Project coordinator and Department leader built-ins, preserving custom name collisions with a distinct standard-role label. Role additions, audit and the migration marker commit together and do not repeat on reopening. No new role receives finance.manage or platform authority. Only a church-wide built-in administrator can appoint a pastor or head usher. Future tithe confidentiality and receipt/ledger workflows are required by CHURCH-WORKFLOWS.md; they are not implemented financial features in this continuation.

## Migration six — preserve membership on worker suspension

Back up before upgrading. Startup adds worker_access_suspensions with a church/user membership reference and records schema version six. Stopping worker access preserves the membership row, assigns the standard Member role, records a per-church suspension and appends audit atomically. It does not disable global sign-in or other church dashboards. Do not delete a suspension marker by hand to bypass the department appointment policy. Until that module is built, suspended workers cannot be restored through the existing role editor. This migration cannot recreate memberships physically removed in earlier builds. Birthday and registry self-registration work remains scheduled in CHURCH-WORKFLOWS.md; no birthday messages or external WhatsApp/SMS sends are performed by this upgrade.

## Phase 4 / schema seven — website publication

Back up the database and matching OUTBOX_KEY before upgrading. Startup adds website drafts/revisions/publications, private raster assets, form tokens and encrypted enquiry/comment records. Migration seven grants website.publish only to standard church administrators and records audit once. Media workers keep editing permission without publishing authority. Custom roles need website.manage alongside website.publish.

Deploy the complete src/ and public/ trees, including church-site.css and church-site.js. Existing Docker packaging includes them. Images are stored as SQLite BLOBs and included in consistent database backups. Monitor persistent-disk usage, revision growth, pending moderation and approved publication rights. Current per-church image limits are 100 images / 25 MB, 1.5 MB per PNG/JPEG. Unused-image deletion can affect historical restoration; do not erase active referenced assets.

Publication is application state, not a hosting deployment. /c/:slug becomes available at the configured origin when an authorised publisher publishes; private preview requires active whole-church website access and is noindex. Unpublish or church suspension denies public pages, referenced media and new messages immediately. Root robots/sitemap discover active church sites and individual tenant sitemaps. No custom domain/DNS or hosted storage purchase is provisioned by this phase.

Church contact/comment bodies use OUTBOX_KEY encryption. Keep metadata/database/backups protected. Contact success means stored receipt, not email delivery; the tenant inbox currently supports review/resolution, not an email-reply composer. Resolve church/site-specific privacy notices, image permission, message/revision retention and independent security/accessibility review before production. See PHASE-4.md for verification evidence and remaining pilot browser checks.

## Registry upgrade (schema eight)

Back up the database and matching OUTBOX_KEY before upgrading. Start Node 24 normally; migration eight is transactional and repeatable. Only standard church administrators and department leaders gain departments.manage; custom roles require an explicit permission review. Registry intake stays off until a whole-church administrator selects settings. No legacy people import or worker reactivation runs automatically.

Enable mail and test a synthetic join → proof → church review → account link → department invitation → acceptance → final appointment end → reactivation journey before real intake. Confirm branch isolation, mobile usability, consent copy and the church's retention policy. Inspect queued mail locally without sharing tokens/logging private payloads. Registration acknowledgements confirm receipt, not delivered mail. Birthday preferences do not create message jobs in this phase. Review unhandled submissions regularly; the current list caps at 100. See PHASE-5.md for pilot scale limits and one-effective-role constraint.
