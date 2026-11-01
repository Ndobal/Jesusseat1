# JesusSeat

**An evangelical product of [Ndovera Limited](https://www.ndovera.com).**

Free church registration and a secure ministry workspace. This repository contains the Phase 1 specification and Phase 2 account/church foundation. Later phases add the public platform website, five church templates, membership/ministry/finance tools, Facebook/YouTube embeds and Webnoryx domain integration.

**Native JesusSeat streaming is deferred. Only Facebook/YouTube embedded streaming is planned for this release.**

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
- Church isolation, branch scopes, built-in/custom roles and team invitations.
- Version-checked custom-role edits, expansion confirmation and safe role archival.
- Church profiles, template preference and multiple visions/missions.
- Append-only activity history and atomic audit for important changes.
- Encrypted mail outbox, backup utility, Dockerfile and CI.

## Documentation

- [Phase 1 review and complete project specification](docs/PHASE-1.md)
- [Phase 1 closeout](docs/PHASE-1-CLOSEOUT.md)
- [Phase 2 implementation and acceptance checklist](docs/PHASE-2.md)
- [Two-step verification and recovery](docs/TWO-STEP-VERIFICATION.md)
- [API and permissions](docs/API.md)
- [Setup, deployment, email and recovery](docs/OPERATIONS.md)
- [Build status, limitations and developer handoff](docs/HANDOFF.md)

## Hosting and readiness

This implementation uses Node 24 and persistent SQLite on a **single server/container**, not Cloudflare Workers. Confirm this operating model before production hosting; see ADR-001. HTTPS, a stable origin, encryption key and real email credentials are required for production. Optional MFA is available; mandatory privileged-role enforcement and recovery support policy remain launch decisions alongside final policies, off-host backups, security review and pilot acceptance. Nothing here claims that all twelve phases or production deployment are complete.
