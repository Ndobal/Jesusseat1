# Build status and next developer

## Phase 1

Repository review, complete feature-to-phase mapping, ADR-001, data model, roles, API boundaries and acceptance criteria are in PHASE-1.md, API.md and OPERATIONS.md. The source repository was empty before this implementation.

Phase 1 engineering planning is now closed. See PHASE-1-CLOSEOUT.md for evidence and PHASE-2.md for the current implementation checklist.

## Phase 2 implemented

- Account registration, email verification, login/logout, reset with session revocation.
- Encrypted transactional mail queue, local-only inspection, Resend adapter with retries/idempotency.
- Church registration, policy-version acceptance, administrator assignment, same-transaction audit.
- Independent/multi-branch/denominational structures; scoped branches and configurable level labels.
- Built-in roles, custom roles, invitations, acceptance/revocation, membership changes/removal.
- Server-side tenant and branch boundaries, permission subset checks, CSRF/origin/session hardening.
- Persisted church profile, template preference, multiple vision/mission setup records.
- Derived onboarding checklist, role-aware responsive workspace, append-only audit viewer.
- Migration schema, consistent backup utility, Docker packaging and Node 24 CI.
- Account-security page with current-password changes, rotation, reset invalidation and own-session inventory/revocation.
- Version-checked custom-role edits, explicit confirmation of expanded assigned access and safe archival preserving history.
- Transactional version-two role migration, tested against an existing version-one database.
- Optional authenticator MFA with session-bound enrollment, password-stage challenges, replay prevention and one-use recovery codes; version-three security tables.

## Scope exclusions / limitations

- Final doctrine/legal policy approval is pending. Current acceptance is explicitly a draft.
- No production hosting or email credentials were supplied; live email and deployment are not verified.
- Optional authenticator MFA is implemented. Mandatory privileged-role enforcement, recovery support policy, off-host backups, production edge configuration and independent security assessment remain launch tasks.
- Branch labels/hierarchy can be added; reparenting, deletion and renaming are not in the current Phase 2 API. Independent church structure cannot yet be converted after registration.
- Custom roles can be edited and archived with safeguards; standard roles remain immutable. Archiving requires no assigned members or pending active invitations.
- No real church/member data was imported; tests use synthetic fixtures only.
- This is Node + persistent SQLite, not a Worker application. Revisit ADR-001 if Cloudflare-only hosting becomes a requirement.
- Phase 3 full platform pages, Phase 4 templates/publishing/domains, member registry, finance, payments, member portal and super-admin UI are not built.
- **Native streaming is out of scope.** Phase 7 uses Facebook/YouTube embeds only. Do not implement native ingestion/recording or cloud streaming billing during this release.

## Next

Continue Phase 2 verification using PHASE-2.md, particularly authenticated browser acceptance and real-provider/hosting setup when credentials are supplied. Phase 1 planning need not be restarted. Start Phase 3 only as the next explicitly selected build phase, using the existing account/tenant API. Design public publishing with separate publication projections: never expose the private church API on public tenant pages. Keep contact/support records isolated and sensitive ministry permissions independent. When adding payment callbacks, use verified signatures, idempotency and ledger reconciliation rather than browser success redirects. New feature mutations must share a transaction with their audit record.
