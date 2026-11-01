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
