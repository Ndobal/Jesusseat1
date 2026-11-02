# JesusSeat

**An evangelical product of [Ndovera Limited](https://www.ndovera.com).**

Free church registration and a secure ministry workspace. Phases 1–7 include accounts and church setup, the platform website, five church website templates, member registry and worker appointments, attendance/ministry care, and Facebook/YouTube viewing with reviewed media connections. Later phases add finance, worker planning and Webnoryx domains.

**Native JesusSeat streaming is deferred. This release uses Facebook/YouTube embedded viewing.**

## Run locally

Requires Node.js 24. No dependency installation needed.

```sh
cp .env.example .env
npm start
```

Open http://127.0.0.1:3000. Register your own account; no mock records are seeded. Without configured mail credentials, use `npm run mail` in a private local terminal to open verification/invitation/recovery links. Mail is queued, not delivered, until the provider is configured.

```sh
npm run check
npm test
```

## Included

- Verified accounts, password recovery and secure sessions.
- Personal account security, password changes and active-session controls.
- Optional authenticator-app verification, one-use recovery codes and protected two-step sign-in.
- Church registration and a guided setup checklist.
- Independent churches, branch networks and denominations.
- Worker-only church dashboards, branch scopes, built-in/custom roles and team invitations.
- Head usher, usher, project coordinator and department leader role foundations.
- Multiple church memberships/dashboards with per-church worker suspension that preserves membership.
- Version-checked custom-role edits, expansion confirmation and safe role archival.
- Church profiles, template preference and multiple visions/missions.
- Append-only activity history and atomic audit for important changes.
- Encrypted mail outbox, backup utility, Dockerfile and CI.
- Public platform pages and searchable help guides.
- Five live church website templates, individual pages/entries, image galleries and a free church address.
- Website drafts, revisions, private preview, publishing permissions and moderated church enquiries/comments.
- Durable contact intake and an explicitly granted, MFA-protected platform enquiry inbox.
- Opt-in public church introductions and an optional hosted-donation checkout link.

## Documentation

- [Phase 1 review and complete project specification](docs/PHASE-1.md)
- [Phase 1 closeout](docs/PHASE-1-CLOSEOUT.md)
- [Phase 2 implementation and acceptance checklist](docs/PHASE-2.md)
- [Expanded church workflows and phase mapping](docs/CHURCH-WORKFLOWS.md)
- [Phase 4 church websites](docs/PHASE-4.md)
- [Phase 5 registry and appointments](docs/PHASE-5.md)
- [Phase 6 ushers and ministry care](docs/PHASE-6.md)
- [Phase 7 church media](docs/PHASE-7.md)
- [Phase 3 public website and acceptance checklist](docs/PHASE-3.md)
- [Two-step verification and recovery](docs/TWO-STEP-VERIFICATION.md)
- [API and permissions](docs/API.md)
- [Setup, deployment, email and recovery](docs/OPERATIONS.md)
- [Build status, limitations and developer handoff](docs/HANDOFF.md)

## Hosting and readiness

This implementation uses Node 24 and persistent SQLite on a **single server/container**, not Cloudflare Workers. Confirm this operating model before production hosting; see ADR-001. HTTPS, a stable origin, encryption key and real email credentials are required for production. Optional MFA is available; mandatory privileged-role enforcement and recovery support policy remain launch decisions alongside final policies, off-host backups, security review and pilot acceptance. Nothing here claims that all twelve phases or production deployment are complete.
