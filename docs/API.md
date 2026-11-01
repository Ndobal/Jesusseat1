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
