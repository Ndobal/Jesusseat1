# Phase 2 API

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
| POST | /api/churches | Verified account; name, slug, structure, country, city, timezone, acceptPolicy=true, policyVersion |
| POST | /api/invitations/accept | Verified account with matching email; token |
| GET | /api/churches/:id | Church profile, actor permissions, scoped branches, derived onboarding |
| PATCH | /api/churches/:id | Church-wide church.manage; name/contact_email/phone/welcome/service_times/template |
| POST | /api/churches/:id/branches | branches.manage; name, label, location, parent_id; scope checked |
| GET | /api/churches/:id/roles | team.read; church roles and permissions |
| POST | /api/churches/:id/roles | Church-wide roles.manage; name, permissions; cannot grant absent permission |
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

`/login`, `/register`, `/forgot`, `/verify#token=…`, `/reset#token=…`, `/invite#token=…`, `/new-church`, `/app?church=:id&tab=:tab`, `/participation`. Token fragments are read and immediately removed from the address bar, retained only in this tab's session storage while the flow is completed, then cleared. Tokens are submitted as JSON, never query strings.
