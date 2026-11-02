# API — foundation and public platform

JSON API, same origin only. Mutations require `Content-Type: application/json` and `Origin: APP_ORIGIN`. Authenticated mutations also need `X-CSRF-Token` from `/api/me`. The session is an HttpOnly cookie; never persist it in JavaScript storage. Production cookie is `__Host-jesusseat; Secure; HttpOnly; SameSite=Lax; Path=/`.

Errors return `{ "error": "safe human-readable message" }` with 400/401/403/404/409/413/415/429/500. No credentials, SQL or stack traces are returned. Unknown/no-membership church IDs return 404. Suspended membership workspaces return 403. Endpoint IDs are random identifiers, not a substitute for authorisation.

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | /api/health | Process readiness/version; DB must open before startup |
| GET | /api/config | Policy draft version, allowed template IDs and permission vocabulary |
| POST | /api/auth/register | name, email, password; non-enumerating 202; queues verification |
| POST | /api/auth/login | email, password; cookie and csrf; generic invalid-credential response |
| POST | /api/auth/verify | token; one-use 24-hour verification |
| POST | /api/auth/forgot | email; non-enumerating 202; one-hour reset email |
| POST | /api/auth/reset | token, password; consumes token and revokes all sessions |
| GET | /api/me | Current user, csrf and their church list |
| POST | /api/auth/logout | Revoke current session |
| POST | /api/auth/resend | Authenticated; rotate verification link, rate limited |
| GET | /api/auth/sessions | Own active sessions; opaque revocation ID, current/start/expiry; no bearer tokens |
| DELETE | /api/auth/sessions/:session | Revoke own selected session; signedOut=true and clear cookie if current |
| POST | /api/auth/logout-others | Revoke other sessions of this account; preserve current session |
| POST | /api/auth/password | currentPassword, password; rotate session/csrf, revoke others and reset links, queue notification |
| GET | /api/auth/mfa | Own MFA enabled status/time and remaining recovery-code count |
| POST | /api/auth/mfa/setup | currentPassword; returns manual enrollment details only to the authenticated session |
| POST | /api/auth/mfa/confirm | code; confirm pending enrollment, rotate session and return recovery codes once |
| GET | /api/auth/mfa/challenge | Password-stage challenge cookie required; returns its CSRF value |
| POST | /api/auth/mfa/login | code; challenge cookie and its X-CSRF-Token; returns full session and clears challenge cookie |
| POST | /api/auth/mfa/disable | currentPassword, code (authenticator or recovery); disable, rotate and notify |
| POST | /api/auth/mfa/recovery-codes | currentPassword, code; replace all recovery codes, rotate and return new codes once |
| POST | /api/churches | Verified account; name, slug, structure, country, city, timezone, acceptPolicy=true, policyVersion |
| POST | /api/invitations/accept | Verified account with matching email; token |
| GET | /api/churches/:id | Church profile, actor permissions, scoped branches, derived onboarding |
| PATCH | /api/churches/:id | Church-wide church.manage; name/contact_email/phone/welcome/service_times/template |
| POST | /api/churches/:id/branches | branches.manage; name, label, location, parent_id; scope checked |
| GET | /api/churches/:id/roles | team.read; church roles and permissions |
| POST | /api/churches/:id/roles | Church-wide roles.manage; name, permissions; cannot grant absent permission |
| PATCH | /api/churches/:id/roles/:role | Church-wide roles.manage; custom only; name, permissions, current version; confirmExpansion=true when expanding assigned/invited access |
| DELETE | /api/churches/:id/roles/:role | Archive unassigned custom role; current version required; pending active invitations must be revoked |
| GET | /api/churches/:id/team | team.read; scoped members, managers also get scoped invitations |
| POST | /api/churches/:id/invitations | team.manage; email, role_id, branch_id; queued 7-day link |
| DELETE | /api/churches/:id/invitations/:invite | Revoke an open invitation within actor authority |
| PATCH | /api/churches/:id/team/:membership | team.manage; role_id, branch_id; no self-demotion or escalation |
| DELETE | /api/churches/:id/team/:membership | Remove scoped membership within actor authority; no self-removal |
| GET | /api/churches/:id/statements | Church vision/mission entries |
| POST | /api/churches/:id/statements | Church-wide church.manage; kind, title, body |
| PATCH | /api/churches/:id/statements/:entry | Church-wide church.manage; title, body, position |
| DELETE | /api/churches/:id/statements/:entry | Church-wide church.manage |
| GET | /api/churches/:id/audit?before=:cursor | Church-wide audit.read; descending batches of 50 |

Future module permissions do not expose future APIs. No platform-super-admin bootstrap endpoint exists. No church can register itself with platform authority. Full policy, church management, domains, payments, streaming/social connection APIs belong to their later phases.

## Browser routes

`/login`, `/mfa`, `/register`, `/forgot`, `/verify#token=…`, `/reset#token=…`, `/invite#token=…`, `/new-church`, `/app?church=:id&tab=:tab`, `/security`, `/participation`. Token fragments are read and immediately removed from the address bar, retained only in this tab's session storage while the flow is completed, then cleared. Tokens are submitted as JSON, never query strings.

Role GET returns an opaque version for optimistic concurrency, member/pending-invitation counts for church-wide actors (null for scoped actors), and only active roles. Clients must reload after 409 before editing. Archival preserves historical foreign keys. Built-in roles cannot be archived or modified.

### MFA login contract

When two-step verification is enabled, successful `/api/auth/login` returns `{mfaRequired:true,csrf}` and an **MFA challenge cookie**, not a full session. The client visits `/mfa`, loads the challenge CSRF and submits the factor to `/api/auth/mfa/login`. That response sets two distinct cookies: the ordinary session and the expired challenge cookie. Password recovery preserves MFA. No API accepts a client-supplied user ID to modify another person's factors. See TWO-STEP-VERIFICATION.md for expiry/replay/recovery details.

## Phase 3 public site and enquiries

Public HTML routes: `/`, `/about`, `/vision`, `/mission`, `/features`, `/templates`, `/templates/:design`, `/churches`, `/churches/:publishedSlug`, `/donate`, `/contact`, `/help`, `/help/:article`, `/terms`, `/privacy`, `/statement-of-faith`. Each is server-rendered. `/participation` permanently redirects to `/terms`. Unknown or unpublished detail paths return 404. `/robots.txt` and `/sitemap.xml` cover the public projection; private HTML uses noindex.

| Method and endpoint | Access and behavior |
| --- | --- |
| `GET /api/public/contact-token` | Anonymous; returns one-use `nonce`, expires in 30 minutes. |
| `POST /api/public/contact` | Anonymous with same-origin JSON; name, email, topic, subject, message, nonce, boolean consent, current privacyVersion; optional website honeypot must be blank. Returns 202 with a durable reference. |
| `POST /contact` | Native same-origin URL-encoded HTML form fallback; same validation and acknowledgement. |
| `GET /api/public/churches?q=&page=1` | Anonymous; active, opted-in church introductions, 12 per page. Search treats wildcards literally. |
| `GET /api/churches/:id/directory` | Verified member, church.manage and whole-church scope; returns listing, version 0 when absent. |
| `PATCH /api/churches/:id/directory` | Same permission plus CSRF; summary, website_url (optional HTTPS), boolean published, version. Stale writes return 409. |
| `GET /api/platform/enquiries?status=new&page=1` | Explicit platform grant, verified email and enabled MFA; statuses new/open/resolved/all, 25 per page. Metadata only. |
| `GET /api/platform/enquiries/:id` | Same platform requirements; decrypted message and reply history. |
| `PATCH /api/platform/enquiries/:id` | Same access plus CSRF; status and current version; atomic audit. |
| `POST /api/platform/enquiries/:id/replies` | Same access plus CSRF; message, current version and optional resolve boolean; returns 201 after reply, mail and audit commit. |

`/api/me` includes a platformAdmin UI hint; every protected enquiry route independently enforces access. There is no browser/API grant endpoint. Grant/revoke through the host CLI only after account verification and MFA enrollment. Public contact acknowledgement confirms database receipt, not outbound email delivery. Replies use the existing encrypted outbox and provider retry worker. No payment API, donor ledger or Webnoryx/domain API is added in this phase.

## Worker-only workspace access

`/api/me` returns only churches where the account has an active worker role. The built-in Member role never opens a church workspace; every tenant API rejects it with 403, including direct requests to read or mutate profile, roles, team, statements, audit and directory. General account-security controls remain available. A custom role is a worker appointment; its role name does not confer special leadership authority.

Invitation acceptance now returns `workspaceAccess` alongside `churchId`. False confirms membership without directing the person into a worker dashboard. Promotion/demotion takes effect on the next request. Workspace responses include workerRole (a built-in code, or null for a custom role) so leadership appointment controls match server rules. Sensitive-role invitation acceptance rechecks the inviter’s current authority. Church-wide built-in administrators alone can assign the built-in pastor, head_usher and church_admin roles. Generic permission subsets are insufficient for those appointments. New head_usher, usher, project_coordinator and department_leader roles do not enable unfinished finance/project/review modules. Migration five adds them to existing churches without assigning anyone automatically.

## Per-church worker suspension

Demoting a worker to the standard Member role or calling DELETE /api/churches/:id/team/:membershipId now preserves the membership record and suspends that church's worker dashboard. DELETE is a worker-access removal action, not registry erasure. /api/me omits that dashboard, tenant routes deny it, and GET team includes worker_suspended_at for authorised reviewers. Suspended workers cannot be restored through PATCH team (409 for a worker role) or by a new invitation to their existing membership (409). Other church memberships, worker dashboards and personal security sessions are unaffected. A same-church department appointment workflow will implement authorised restoration in Phases 5/9; there is no restore API in the current foundation.

## Phase 4 — church websites

All private website routes require verified, active, whole-church worker access. `website.manage` controls editing/preview/media/inbox; `website.publish` controls publishing/offline state. Custom publishing permissions also require editing permission.

| Method and path (relative to `/api/churches/:id`) | Behavior |
| --- | --- |
| `GET /website?revision=N` | Current draft or historical snapshot; version, publication metadata, free slug and publishing hint. |
| `PATCH /website` | `{version,snapshot}`; normalised settings/pages/entries, expected version, stable page addresses. |
| `GET /website/revisions?before=N` | Thirty immutable revision metadata records per page. |
| `POST /website/restore` | `{version,revision}`; creates a new draft, preserves live content. |
| `POST /website/import-purpose` | `{version}`; copies current visions/missions into a new draft with stable entry addresses. |
| `POST /website/publish` | `{version}`; publish the expected saved draft's enabled projection. |
| `DELETE /website/publish` | `{version}` of current publication; hide the site and public media. |
| `GET /website/assets` | Owned image metadata list. |
| `POST /website/assets` | `{name,data}`; base64 PNG/JPEG, strict format/size/ownership quotas. Returns 201. |
| `GET /website/assets/:imageId` | Authenticated image bytes encoded as base64 with verified MIME. |
| `DELETE /website/assets/:imageId` | Delete only an image unused by current draft/publication; revisions may then require replacements. |
| `GET /website/messages?status=pending&before=cursor` | Twenty-five decrypted own-church enquiry/comment records. Status pending/approved/rejected/resolved. |
| `PATCH /website/messages/:messageId` | `{version,status}`; comments permit pending/approved/rejected, private contacts pending/resolved. |

Anonymous routes: `GET /api/public/sites/:slug/token` returns church-bound nonce/consentVersion; `POST /api/public/sites/:slug/messages` takes page, kind, name, email, message, nonce, consentVersion, boolean consent and an empty website honeypot. Contact submissions require a published Contact page; comments require that the published page allow comments. Accepted submissions return 202 after durable storage/audit. Native POST `/c/:slug/send` uses the same service, URL-encoded fields and origin checks. Private contacts cannot be approved for public display.

Public HTML routes, private preview routes, image projections and sitemap behavior are documented in PHASE-4.md. There are no member registry, payment, native streaming, domain provisioning or birthday-delivery endpoints in this phase.

## Phase 5 registry and appointments

All church routes retain verified session, CSRF/origin, church/branch permission checks and audit. Mutation payloads use expected `version` where a record already exists. See PHASE-5.md for limits and consent behaviour.

| Route | Methods / purpose |
| --- | --- |
| `/api/churches/:id/registry/settings` | GET/PATCH: whole-church `church.manage`; enable intake, branch, leap-day policy. |
| `/api/churches/:id/registry/people` | GET/POST: `members.manage`, scoped paginated people/search/filter and creation. |
| `/api/churches/:id/registry/people/:person` | GET/PATCH: detail, duplicate flags and versioned correction/leaving. |
| `/api/churches/:id/registry/people/:person/link` | POST: identity-attested account-link invitation. |
| `/api/churches/:id/registry/people/:person/merge` | POST: source/target versions, explicit reason. |
| `/api/churches/:id/registry/households[/:household]` | GET/POST/PATCH: same-branch household grouping. |
| `/api/churches/:id/registry/followups` | GET: open scoped tasks. |
| `/api/churches/:id/registry/people/:person/followups[/:task]` | POST/PATCH: encrypted note, assignee, due date/status. |
| `/api/churches/:id/registry/submissions[/:submission]` | GET/PATCH: email-proof review, approve/reject or match existing person. |
| `/api/churches/:id/registry/imports` | POST: CSV staged validation preview. |
| `/api/churches/:id/registry/imports/commit` | POST: creator-bound reviewed valid rows. |
| `/api/churches/:id/departments[/:department]` | GET/POST/PATCH/DELETE: designated leader/delegated roles; DELETE archives empty departments. |
| `/api/churches/:id/departments/:department/candidates?email=` | GET: authorised exact-email candidate lookup. |
| `/api/churches/:id/departments/:department/appointments[/:appointment]` | POST/DELETE: invite, cancel/end with expected version. |
| `/api/registry/link` | POST: verified-email account-link acceptance; no church dashboard required. |
| `/api/registry/appointments/accept` | POST: verified-email same-church worker activation/reactivation. |
| `/api/public/registry/:slug/info` and `/token` | GET: enabled public registry settings / one-use form nonce. |
| `/api/public/registry/:slug/join` | POST: consented encrypted intake, queues proof mail. |
| `/api/public/registry/verify` | POST: single-use email proof. |
| `/api/public/registry/:slug/preferences-request` | POST: generic private-link request. |
| `/api/public/registry/preferences/view` and `/save` | POST: minimal preferences view / one-use versioned save. |

Public pages: `/join/:slug`, `/registry/verify`, `/registry/preferences`; native POST fallback at `/join/:slug` and `/join/:slug/preferences`. Account-bound acceptance pages: `/registry-link`, `/worker-appointment`. Private tokens belong in fragments, never logged query strings. Registry CSV JSON requests have a 256 KB HTTP cap; native intake 32 KB. Existing unrelated limits remain.

## Phase 6 ministry operations

All routes below begin `/api/churches/:churchId/ministry/`, require a verified active worker session, and preserve church/branch scope, CSRF/origin checks and same-transaction audit/history. Existing-record writes require numeric expected `version`; new group meetings use `group_version`. Body limits remain 32 KB. Lists/details are private; no new public intake endpoint is added.

| Path | Methods and purpose |
| --- | --- |
| `services` | GET paginated assigned/reviewable services; POST reviewer creates explicit count mode/slots. |
| `services/:service` | GET authorised detail/history; PATCH close/reopen/cancel with reason/version. |
| `services/:service/slots/:slot` | PATCH reviewer reassigns an unreported open slot. |
| `services/:service/slots/:slot/report` | POST assigned counter appends initial/corrected counts. |
| `services/:service/slots/:slot/review` | POST reviewer approves/requests correction with reason/version. |
| `attendance-trends` | GET reviewer-only closed-service counts. |
| `groups` | GET authorised groups/leaders; POST church administrator/pastor creates. |
| `groups/:group` | GET roster/recent meetings/history; PATCH settings/archive with version. |
| `groups/:group/members` | POST active member add/remove with group version. |
| `groups/:group/candidates?q=` | GET minimal exact-branch active name lookup (20 results). |
| `groups/:group/meetings[/:meeting]` | POST new complete roster; PATCH expected-version correction/reason. |
| `groups/:group/absences` | GET absences across latest eight meetings. |
| `groups/:group/followups` | POST assign a recorded absence to the private registry follow-up queue. |
| `care-options` | GET permitted categories/worker names; requires care or safeguarding access. |
| `care?kind=&page=` | GET paginated visible cases; POST consented staff intake/assignment. |
| `care/:case` | GET authorised details/history and view audit; PATCH progress/status/routing/rescheduling. |
| `children?service=` | GET scoped open service choices and selected named check-in register (never code hashes). |
| `children/search?branch_id=&q=` | GET minimal active child name lookup (20 results). |
| `children/:child` | GET permitted collector details/encrypted history with view audit. |
| `children/:child/guardians[/:guardian]` | POST authority-attested collector; PATCH expected-version corrections/revocation. |
| `checkins` | POST verified check-in returns private `collection_code` once. |
| `checkins/:checkin/collect` | POST version, correct code and in-person identity attestation. |
| `checkins/:checkin/reissue` | POST version, current collector, verified authority and reason; invalidates old code. |

Times use ISO timestamps with explicit Z/offset; group dates use YYYY-MM-DD. Counts are bounded non-negative integers; first-time visitors are included in adults/children. Welfare amount_minor is an integer; the browser converts the entered normal amount exactly to minor units. See PHASE-6.md for state transitions, role delegation, currencies and pilot limits.
