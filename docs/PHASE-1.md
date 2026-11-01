# JesusSeat: product specification and repository review

Reviewed 1 November 2026. Operator: **Ndovera Limited**, https://www.ndovera.com.
JesusSeat is the company's evangelical product. Registration and core church tools are free; third-party services and optional paid additions must disclose charges. Donations to JesusSeat are voluntary and separate from church giving.

## Verified starting point

The owner supplied `Ndobal/Jesusseat1` after the earlier `dawillcomputers/jesusseat` URL remained inaccessible. The new repository was public, empty, with no source files, dependency lockfiles, migrations, existing authentication, production settings, or AGENTS.md instructions. There was no existing app to extend or production data to migrate. The initial README establishes main; the implementation is developed on `build/phase-1-2` for review.

This is a new implementation, not a claim to have repaired or inspected the inaccessible repository. Repository metadata confirmed push permission. No hosting deployment was requested or performed.

## Product areas and information architecture

1. Platform public site: Home, About, Vision, Mission, Features, Templates, optional Church Directory, Donate, Contact, Help, Terms, Statement of Faith, Privacy. Each page has its own address.
2. Super admin: church/member counts with defined scopes; platform donation reconciliation; onboarding; support inbox and public enquiries; suspension/review/restoration; domains and integration health; configuration and audit. No automatic access to confidential pastoral records.
3. Church workspace: profile, hierarchy, people, ministry, communications, website/content, finance, operational resources and reports.
4. Member portal: verified identity; own records and authorised household access; events, groups, duties, receipts and care requests.

### Church website content model (Phase 4 target)

Five templates share one content model: Welcome Home, Living Faith, Grace & Heritage, Open Doors, The Gathering. Switching template must preserve content and stable URLs. Main pages: Home, About, Leadership, Visions, Missions, Ministries, Services, Watch Live, Sermons, Events, Gallery, Giving, Contact. Support custom pages, menus and individual sermon/event/ministry/statement pages. Multiple vision/mission statements have their own titles, descriptions, images, ordering and publication state. Templates need complete mobile layouts, image accessibility, proper contrast, metadata, galleries, drafts, revisions and preview before publication.

The Phase 2 statement records and template preference are preparatory data only: publication, statement images and page routing are not implemented yet. Church slugs are reserved, not live tenant domains.

### Media boundary

**Use only Facebook and YouTube embedded broadcasts for this release.** Media teams use their own accounts with official authorisation where supported. Manual approved links remain available. Account connection must not promise automatic access to every item. No password collection, scraping, native JesusSeat streaming, ingestion keys, video recording pipeline, browser production studio or 30-day JesusSeat-hosted replay policy in this build. Website embeds depend on the source's public visibility, permissions, restrictions and continued availability. Images may be uploaded for church galleries in Phase 4; video archives remain church/provider responsibility.

### Domains

Free JesusSeat address, bring-your-own domain, or purchase through Webnoryx inside the dashboard. Require explicit registration/renewal prices, church ownership, availability, payment/registration reconciliation, TLS status, reminders, renewal consent and transfer help. Do not show domain purchasing as working until Webnoryx and registrar operations are verified.

## Architecture decision ADR-001

Use **Node.js 24, SQLite, and a buildless HTML/CSS/JavaScript client** for the initial repository foundation. Node provides native scrypt and a native SQLite interface; no third-party runtime dependencies or package install are required. The result is a small, portable, single-instance app with genuine persistent records, testable transactions and low initial operational complexity.

This is an implementation choice for this previously empty repository, not a pre-existing user requirement. **It is not a Cloudflare Worker app.** It requires a Node host/container and persistent disk. Node 24's `node:sqlite` API is still evolving; pin and test the Node 24 runtime. Before selecting production hosting, confirm that this operating model is suitable. For Workers hosting, implement an explicit D1 adapter and replace the password hashing/runtime layer with a supported, audited approach (or managed identity); do not silently bundle Node's HTTP server or local database into Workers. Do not assume Webnoryx currently hosts arbitrary Node containers.

Application modules: HTTP boundary; account/security; church/permissions; content setup; email outbox; relational storage. Start with a modular monolith, not microservices. Extract components only when measured needs warrant it. SQLite WAL and synchronous transactions support one app process; horizontal/multi-region deployment requires a revised storage/concurrency design.

## Data model

| Entity | Ownership and constraints |
| --- | --- |
| Users | Global identity; canonical unique email; salted password hash; verified timestamp |
| Sessions | Hashed bearer token; user; CSRF secret; absolute 12-hour expiry |
| Verification/recovery tokens | Hashed random token; purpose; expiry; consumed atomically |
| Churches | Tenant ID; unique slug; structure; profile; timezone; active/suspended; acceptance evidence |
| Branches | Church ID; optional same-church parent; configurable level label |
| Roles | Church ID; immutable built-in definitions or custom permission set |
| Memberships | User + church unique; same-church role and optional branch scope |
| Invitations | Church, verified recipient, role, scope; hashed token; expiry/revocation/acceptance |
| Statements | Multiple church-owned vision/mission entries with ordering |
| Audit | Append-only actor/action/target history; church-bound where applicable |
| Outbox | Encrypted mail payload; delivery lease, retry and idempotency metadata |
| Rate limits | Shared persistent counters; no raw IP stored in keys |

Roles never carry platform authority. Branch scope includes that branch and descendants; NULL means church-wide. Membership is one assignment per user per church in this release. People may have different memberships in different churches. Public church verification is deliberately distinct from email verification and church registration.

## Permissions and responsibilities

Built-ins: Church administrator, Pastor, Secretary, Media team, Treasurer, Attendance officer, Member. Custom roles select from server-known permissions and cannot exceed the creator's permissions. Church-wide administration is necessary for settings, role creation and full audit access. Only a church-wide built-in administrator can appoint another church administrator. Existing administrators cannot remove/demote themselves through this UI. Keep at least one administrator. Built-in roles cannot be edited or deleted in this release. Branch parents cannot be reparented, so the add-only hierarchy cannot acquire cycles.

Future module permissions (`finance.manage`, `care.manage`, etc.) are reserved for future enforcement, not evidence that those modules exist. A registered church admin does not become a platform super admin.

## Main journeys and acceptance criteria

- Account: register -> queued verification email -> single-use verification -> sign-in -> secure session -> sign-out. Unverified users cannot create or join churches.
- Recovery: non-enumerating reset request -> one-hour token -> new password -> all prior sessions revoked.
- Church: verified user accepts current participation draft -> atomic church, roles, root branch, admin membership and audit -> derived onboarding checklist.
- Team: authorised inviter chooses same-church role/scope -> queued invitation -> matching verified recipient accepts once -> immediate access. Revoke/reinvite invalidates old links.
- Hierarchy: independent single location or network with regions/districts/branches. Scoped leaders see only authorised branch subtrees and cannot reach siblings or elevate permissions.
- Accountability: privileged changes and audit commit together. Audit failure rolls back the change.

## Nonfunctional acceptance criteria

Cross-tenant reads/writes must fail on the server. Requests need valid origin and, when authenticated, a session CSRF token. Use parameterised SQL, bounded inputs, secure cookies in production, restrictive content security policy, no raw tokens in URLs sent to the server or stored in the database, no secrets in Git, tested backup restoration and production email configuration. UI must work on narrow screens without inaccessible controls. Automated API tests are necessary but do not replace independent security review or pilot use.

## Policies still requiring owner approval before launch

The initial participation draft requires sound biblical teaching, honest representation, safeguarding, confidentiality and no fraudulent fundraising, abuse or impersonation. Finalise the detailed Statement of Faith, doctrinal review criteria, reports/appeals process, Terms, Privacy Policy, data retention/deletion/export, donation handling, and domain obligations before public rollout. A draft consent record does not establish completed legal/policy readiness.

## Full build sequence

1. Repository review/specification/architecture/data model (this document).
2. Accounts, verification/recovery, church registration/isolation, invitations, hierarchy, roles, audit, onboarding.
3. Platform public site, contact intake, policy pages and help structure.
4. Five church templates, page/content management, revision history, accessibility, publishing and free addresses.
5. Members/households/visitors, imports, duplicate review and follow-up.
6. Attendance, groups, pastoral care, welfare and children's safeguarding/check-in.
7. Facebook/YouTube embeds and authorised media connections; no native streaming.
8. Church finances/giving, approvals/reconciliation and separate platform donations.
9. Events, worship planning, discipleship, volunteers/staff, facilities/assets.
10. Member portal and communications with usage controls.
11. Custom domains/Webnoryx, full super-admin/support and suspension workflows.
12. Church pilot, security/accessibility/performance checks, policy completion, backup recovery and launch.

Each later phase must include UI, storage, server permissions, audit, failure handling, and meaningful tests. Do not add fake member counts, invented payments, nonfunctional purchase buttons or placeholder production secrets.
