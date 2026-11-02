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

## Phase 3 implemented

Public platform pages, five illustrative design concepts, searchable help, draft policy pages, durable encrypted contact enquiries, a host-granted MFA-protected platform inbox, opt-in public church listings, SEO metadata and an optional hosted checkout link are implemented. See PHASE-3.md for scope, operator setup and acceptance evidence. Migration four preserves existing records and acceptances.

## Worker-access continuation implemented

Ordinary member roles are denied church-workspace API access and omitted from the workspace chooser. Member invitations confirm membership without opening a worker dashboard. New and existing churches receive Head usher, Usher, Project coordinator and Department leader roles; migration five preserves assignments/custom-name collisions and records role bootstrap audit. Only church-wide built-in administrators can appoint pastors, head ushers or other administrators. Existing custom roles represent worker appointments. No finance/project/review/roster module is claimed complete.

See CHURCH-WORKFLOWS.md for the expanded requirements and phase assignments. It supersedes earlier member-dashboard/portal plans. Phase 6 adds attendance, Phase 8 giving/receipts/project-payment reconciliation, Phase 9 departments/projects/rosters/devotionals and Phase 10 focused member services. Do not grant tithe identity/amount access through generic finance or platform permissions.

## Scope exclusions / limitations

- Final doctrine/legal policy approval is pending. Current acceptance is explicitly a draft.
- No production hosting or email credentials were supplied; live email and deployment are not verified.
- Optional authenticator MFA is implemented. Mandatory privileged-role enforcement, recovery support policy, off-host backups, production edge configuration and independent security assessment remain launch tasks.
- Branch labels/hierarchy can be added; reparenting, deletion and renaming are not in the current Phase 2 API. Independent church structure cannot yet be converted after registration.
- Custom roles can be edited and archived with safeguards; standard roles remain immutable. Archiving requires no assigned members or pending active invitations.
- No real church/member data was imported; tests use synthetic fixtures only.
- This is Node + persistent SQLite, not a Worker application. Revisit ADR-001 if Cloudflare-only hosting becomes a requirement.
- Member registry, finance/payment processing, focused member services, custom domains and the full super-admin console remain later work. Phase 4 includes website publishing and a church enquiry/comment review inbox, not the later operational modules.
- **Native streaming is out of scope.** Phase 7 uses Facebook/YouTube embeds only. Do not implement native ingestion/recording or cloud streaming billing during this release.

## Next

Phase 3 engineering is implemented; complete its live-provider and owner-policy launch gates before production. Phase 4 is implemented as described below. Begin Phase 5 when selected, preserving the public projection boundary. Keep native streaming deferred. Domains/Webnoryx, donation ledgers and full platform suspension/support workflows remain in their assigned later phases.

## Registry, birthdays and per-church suspension continuation

Migration six adds worker_access_suspensions. Worker demotion/removal preserves the membership row as Member instead of deleting it; the suspension marker independently denies the workspace and removes it from /api/me. A role edit or new invitation cannot restore access. No global account/session suspension occurs, and the same person can keep worker dashboards and member relationships in other churches. Audit and the state change are atomic. The team UI distinguishes suspended dashboards and does not offer an ineffective role-change restore.

Registry self-registration (name, email, phone, birth day/month without a year), department-based activation/reactivation, and consent-aware birthday greetings/pastor/church notices are planned in CHURCH-WORKFLOWS.md. They are not claimed implemented here. Birthday eligibility will use registry membership, not worker status. The department module must supply the authorised reactivation transaction; no temporary admin bypass or fabricated department exists in the current build.

## Phase 4 implemented

Five live templates share a validated website content model. Whole-church website workers edit settings, core/custom pages and entries; reorder menus/entries; upload validated private PNG/JPEG images; preview drafts/history; copy church visions/missions; review enquiries/comments. Separate website publishers control publication and taking sites offline. Public sites use /c/:slug with enabled-page projections, owned public image references, independent entry routes and sitemap discovery. Drafts/private contact information never become public automatically. Migration seven grants publishing to standard administrators only. See PHASE-4.md for limits, routes, verification and launch gates.

Next: Phase 5's member registry, ordinary-member self-registration (name, email, phone, birth day/month only), households/visitors, duplicate review and verified identity linking. Preserve multiple church memberships and per-church worker dashboard suspension. Implement authorised department appointment reactivation without an admin bypass. Birthdays must follow registry membership rather than worker status; scheduled email/WhatsApp/SMS and consent-aware church notices remain Phase 10.
