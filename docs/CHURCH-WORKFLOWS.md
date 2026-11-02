# Church operations and worker access

Owner requirements incorporated 1 November 2026. This document extends the twelve-phase plan. Phase 1–6 engineering is implemented as bounded in the phase handoffs; later modules below are specifications, not claims of working features. Public pages use concise visitor-facing language, not these implementation notes.

## Access model

Only church workers have individual church dashboards. An ordinary member does not receive one merely by joining, registering, giving, uploading a receipt or submitting feedback. Personal account-security controls are not a church dashboard. Workers enter through an invitation and an assigned standard or custom worker role. Different church memberships retain independent permissions and branch scopes.

Members and visitors use the church website and focused services: event registration, prayer/contact requests, project contributions, receipt submission, feedback and a verified conversation about their own submission. These services must not grow into a general member dashboard. A receipt or conversation link must be opaque, short-lived and identity-verified before showing private information. A person may register a new church with authority to do so and become its administrator; ordinary membership in another church grants no access to that church's dashboard.

Worker dashboards show their own duties, authorised department feedback, assigned projects, notices and requests. A department leader sees the departments they lead. A project coordinator sees assigned projects and their related contributions and conversations. Public comments are distinct from confidential worker performance reviews. Church administrators manage appointments; workers cannot appoint themselves to sensitive offices.

### Confidential giving rule

Within the recorded church and branch scope, only the **built-in head usher, church administrator and pastor** may see a tithe payer's identity together with the amount. A treasurer, ordinary usher, department leader, project coordinator, custom role or platform administrator does not inherit this access from generic finance, audit, team or project permissions. The donor may receive confirmation of their own submission without gaining a browsing dashboard or access to other donors.

Appointing a pastor or head usher is restricted to a church-wide built-in administrator now, as is appointing another church administrator. Do not add a custom permission or role-name match that bypasses this rule. Apply the restriction to APIs, exports, reports, searches, notifications, audit details, attachments and payment metadata—not just the visible table. Standard church-wide audit must not include tithe payer names or amounts. Platform support must not gain automatic access to these records.

## Phase mapping

| Phase | Required work | Current status |
| --- | --- | --- |
| 1 | Define worker-only dashboards, confidential giving, project reconciliation and expanded operational scope. | Updated in this plan and PHASE-1.md. |
| 2 | Deny member-role workspace access, filter the workspace chooser, add operational worker roles, protect sensitive leadership appointments and migrate existing churches. | Implemented in this continuation, with API and upgrade tests. |
| 3 | Keep public website copy concise; offer relevant help without presenting future tools as available. | Existing site retained; member-dashboard promises removed. |
| 4 | Tenant website pages for projects, departments, published rosters/devotionals and moderated public feedback; safe submission forms. | Implemented as editable website pages and moderated comments/enquiries. Operational data/roster/finance modules remain later work. |
| 5 | Member/household records, worker appointments, department affiliations and verified submitter identity. | Upcoming. Membership alone never opens a dashboard. |
| 6 | Ushers' attendance corner, service sessions, count corrections, visitors, groups, care, welfare and safeguarding. | Upcoming. |
| 7 | Facebook/YouTube services and approved media links. | Upcoming; native streaming stays deferred. |
| 8 | Manual/gateway giving, immutable receipt review, confidential tithes, project contributions, reconciliation and payment-correction conversations. | Upcoming. |
| 9 | Departments/reviews, active/completed projects, coordinator workflows, ministers'/workers' rosters, weekly activities and Open Heavens/devotional scheduling. | Upcoming. |
| 10 | Focused member services, reminders, verified project conversations and communication delivery. | Upcoming; replaces the earlier general member portal. Phase 8 correction threads are usable within their own workflow first. |
| 11 | Full super-admin/support, suspension, custom domains and Webnoryx integration. | Upcoming; no default confidential-tithe access. |
| 12 | Church pilot, access testing, accessibility, financial reconciliation, recovery and launch. | Upcoming. |

## Phase 4 — public pages and feedback

Provide independent Projects, Departments, Weekly Activities and Devotionals pages, with individual project/department detail URLs. Church administrators decide what becomes public. A public project may show an approved description, target, progress, updates and completion report. Never publish contributor identities, receipts, conversations, individual tithes, attendance lists or internal review scores by default.

Public comments support a moderation queue, approval, rejection, reporting, anti-spam limits and withdrawal handling. Publishing a department comment requires approval; a confidential department review must never enter this queue accidentally. Identify what is public before submission. Route a comment to its department or project without giving the submitter internal access. If the underlying operations module is not ready, support approved website content without inventing live totals or nonfunctional submission buttons.

## Phase 5 — people, workers and departments

- People directory, households, visitor-to-member follow-up, import validation and duplicate review.
- Worker commissioning/appointment, department membership and designated team leaders. Coordinator projects, availability and training records continue in Phase 9.
- Separation of person records, sign-in accounts and worker assignments. A record need not have a sign-in account.
- Branch-scoped appointments with recorded acceptance/end timestamps and immediate removal of operational access when the final appointment ends. Future-dated commissioning schedules continue in Phase 9.
- Verified identity linking without exposing the church member directory. Donor receipt/conversation verification joins the Phase 8 payment workflows.
- Birthday greeting and announcement preferences. Photograph/public contribution permissions join the workflows that publish those assets.

## Phase 6 — ushers' corner and ministry care

Implemented with the operational boundaries and pilot limits in PHASE-6.md. Requests are staff-recorded; focused member request forms and outbound notifications remain Phase 10.

Create service sessions for Sunday services, weekly meetings, programmes and branch events. Ushers can submit adult/child counts, seating/section counts, first-time visitors, service start/end times and non-sensitive observations. Require a configured counting method so section counts and a whole-hall count are not silently added twice. Keep count-only reporting separate from named attendance and children's check-in.

The head usher reviews attendance reports, requests corrections and closes a session. Corrections preserve the original, author, reason and approval. Prevent overlapping counters from overwriting each other; use versions and a defined submission scope. Provide attendance trends, missing reports and approved service summaries. Ordinary ushers see assigned services/sections, not confidential care or giving records.

Additional tools: visitor welcome/follow-up assignment, small-group attendance, absence follow-up, welfare requests/approvals, pastoral appointment requests, prayer-request routing, consent-controlled care records, authorised child collection and safeguarding incident escalation. Sensitive records require separate permissions and strict sharing rules.

## Phase 8 — giving, receipts and reconciliation

### Ushers' giving tools

Record offerings, tithes, thanksgiving, mission giving, pledges and designated/project gifts per service, church and branch. Support denomination counting sheets, two-person cash count confirmation, deposit references, fund/category selection, approval/close and correction requests. Keep donor identity optional for categories where anonymous giving is allowed. Ordinary ushers may record approved aggregate batches without gaining a tithe-payer list. A donor-identified tithe entry requires one of the three permitted leadership roles.

Give each recorded payment one ledger identity and one source. A manual bank-transfer entry is separate from gateway money. A cash or bank receipt is not automatically a confirmed payment just because a receipt image was uploaded.

### Transfer receipt submission

1. A member selects a church/service/fund or project, enters the transfer reference, date, amount, currency and response details, and uploads a receipt through a focused website form.
2. The form acknowledges an **unverified claim**, not confirmed giving. Store the original attachment privately and immutably. Validate file signature, size/type, access and safe rendering; reject active content and never use public asset URLs.
3. Only the assigned head usher can open the submitted receipt image for review. The interface provides viewing and recording controls; it does not edit or replace the original. Viewing cannot technically prevent a viewer from taking a screenshot. Pastors/admins can see permitted tithe records without automatically gaining raw receipt-image access.
4. The head usher checks bank evidence and records or matches the payment. Request a clearer/corrected attachment from the submitter when necessary; retain original/version history. A coordinator can request correction without receiving private receipt access.
5. Mark matched, confirmed, duplicate, rejected or awaiting evidence, with a reason and audit. Unverified or rejected claims do not enter confirmed totals. Confirmation goes privately to the submitter.

### Gateway + manual totals

Display **confirmed gateway payments**, **confirmed manual payments** and **combined confirmed total**, broken down by currency, fund, service/project and period. Example: gateway NGN 50,000 + manual NGN 30,000 = confirmed NGN 80,000. A separate NGN 10,000 unverified receipt claim leaves the confirmed total at NGN 80,000. Do not sum different currencies together without a disclosed exchange-rate workflow.

Use verified webhook signatures, provider-transaction uniqueness, idempotent replay handling and reconciliation. Browser redirects are not proof of payment. Gateway gross, fees and net settlement must be distinguishable; never subtract fees from the recorded gift silently. Display refunds/reversals and derived net totals explicitly. A gateway payment later supported by an uploaded receipt is matched to the same entry, not added again. A bank reference plus amount/date/account requires duplicate review; do not reject genuine distinct payments just because amounts match.

Corrections use an approved reclassification, reversal or adjustment and preserve the original record. Enforce balanced reconciliation and atomic audit. Lock closed periods; changes require authorised reopening or a subsequent-period adjustment. No silent amount edits, destructive ledger deletion or automatic confirmation of a member's claim.

### Project contributions and corrections

Assigned workers and coordinators can view active/completed project summaries, approved budgets, confirmed contributions, pledges, expenses, outstanding amounts and progress. Contributor names and amounts are visible only to authorised project workers; public names require explicit consent and anonymous gifts remain anonymous publicly. A pledge is separate from received money. Coordinators do not gain access to unrelated church gifts or tithe records. A payment classified as tithe must retain the stricter tithe rule even when linked to a project.

Each contributor can open a private conversation with the assigned coordinator about their own project payment. Bind the conversation to a project and verified contributor/submission, not a guessable payment ID. Support messages, evidence requests, proposed corrections, approval state, notifications and a clear outcome. Coordinators propose ledger corrections; the authorised finance reviewer/head usher confirms bank evidence and approves changes. A conversation never directly changes a confirmed amount. Keep a full history of requests, decisions, adjustments and who performed them. Internal staff notes are separate from contributor-visible replies.

Church giving and Keep JesusSeat Alive donations use separate ownership, ledgers, permissions and reports. A church coordinator cannot access the platform's donor ledger.

## Phase 9 — departments, projects and weekly duties

### Department and worker dashboards

Departments include ushering, choir/music, media, children, youth, welfare, evangelism, prayer, protocol, hospitality and other church-defined teams. Workers see assigned duties, availability, announcements, approved department comments, appropriate reviews, training and project tasks. Leaders assign work and review their own departments. Personnel reviews may be confidential to the reviewed worker and authorised leaders; they must not expose another worker's review. Support review periods, criteria, evidence, acknowledgment, response, improvement actions and appeals. Public feedback can inform a review after moderation, but does not become an unreviewed public rating of a worker.

### Projects

Use proposed → approved → active → completed → archived, with paused/cancelled outcomes and an explicit completion approval. Provide coordinators, department/branch ownership, purpose, targets, budget, milestones, tasks, procurement, responsible workers, documents, photos, updates, risks, expenses, reports and handover. Completed/executed projects stay accessible to authorised workers with their final financial reconciliation and completion evidence. Publishing a completion story is separate from exposing the internal project records.

### Ministers' and workers' rosters

Create weekly and recurring schedules by church timezone, service, branch and department. Assign preaching/teaching, worship leading, choir, instruments, usher sections, media, prayer, announcements, hospitality and other duties. Support pasted/imported roster tables with a validation preview before saving, plus manual entry. Check dates, role eligibility, unavailability and overlapping assignments. Never silently convert a bad pasted row into an assignment.

Draft, approve and publish schedules; notify assigned workers, collect acceptance/declines, handle substitute requests and preserve revision history. A published change triggers only relevant notifications and prevents duplicate reminders. Provide printable weekly programmes and calendars. A public roster is an explicit, consent-aware projection; private contact details and sensitive assignments remain hidden.

### Open Heavens and devotional activities

Schedule date, theme, scripture references, reading plan, assigned minister/leader, discussion, prayer points and an approved resource link for Open Heavens or other devotionals. Churches can write their own reflections and notes. Store or republish third-party devotional text/audio/images only with permission or a suitable licence; otherwise use attribution and authorised links. Support daily/weekly reading schedules, workers' preparation tasks and reminders without implying a content licence or collecting member reading histories by default.

### Additional church tools

- Service order/programme planning, sermon calendar, minister availability and speaker invitations.
- Rehearsals, choir setlists and approved resource links; equipment bookings and maintenance.
- Volunteer shifts, training/induction, duty substitutions and task checklists.
- Event registration, capacity, volunteer allocation and follow-up.
- Facility bookings, inventory, asset custody, consumables and procurement approvals.
- Welfare assistance workflow, restricted benevolence funds and authorised visits.
- Church meeting agendas/minutes, decisions, action owners and document library.
- Discipleship classes, baptism/membership preparation and certificates with approval history.
- Outreach plans, follow-up tasks and consent-aware communication lists.
- Department reports, project closeout reports, attendance trends and fund reconciliation.

## Phase 10 — communication and focused member services

Provide scoped worker messages, department notices, roster reminders, coordinator conversations, receipt acknowledgements and church support requests. Use channel consent, recipient verification, delivery state, retries, usage/cost limits and duplicate prevention. Communication permissions must not make finance attachments discoverable. Visitors/members can revisit only their own verified submission/conversation through an expiring access flow; there is no ordinary member dashboard, broad inbox, member directory or unrestricted contribution history.

## Acceptance requirements

- Test direct API access by non-workers, role removal and tenant/branch boundaries; hiding navigation is insufficient.
- Head usher/pastor/administrator appointment cannot be gained through a permission-equivalent custom role.
- Tithe identities/amounts must be absent from unauthorised API payloads, exports, logs, shared audit, notifications and cached pages.
- Receipt upload cannot execute content or expose a public URL; receipt viewing does not permit editing the original or confirming an unchecked transfer.
- Duplicate webhooks, repeated receipt submissions, concurrent reviewers, refunds and adjustments must reconcile to one correct ledger result.
- Tests must separate pending claims, pledges, confirmed receipts, gateway gross/fees/net and currencies.
- Project chat cannot disclose another donor's evidence or change money without an approved adjustment.
- Reviews/comments require appropriate confidentiality/moderation; roster publication excludes private information and preserves consent.
- Test every new workflow with persisted storage, server permissions, audit atomicity, failure handling and responsive accessible interfaces before calling it built.

## Registry self-registration and birthday care

### One person, several church relationships

A person can be an ordinary member in several churches, a worker in several churches, or a mixture of both. Use a global sign-in identity only where the person has an account, with separate tenant-owned registry records and worker appointments for each church. Do not impose a global one-church membership or worker limit. Each worker church has its own dashboard, permissions, department/branch scope, appointments and suspension state. Church A cannot see or change the person's Church B registry, birthday preferences, duties or dashboard.

Stopping work in Church A suspends only Church A's worker dashboard. It must not suspend the global account, revoke Church B's worker dashboard, delete either membership or switch off birthday care in either church. A person remains in the ordinary registry of Church A unless they separately request to leave that church's registry. In product language, becoming a worker enables full worker access; it does not mean ordinary members are less fully part of their church.

### Phase 4–5 — Join the church registry

Add an independent Join our church / Register as a member page to each church website, backed by Phase 5's registry. Collect:

| Field | Requirement |
| --- | --- |
| Full name | Required; the church-facing preferred name can be corrected by a verified process. |
| Email | Required; verify ownership before linking an account or showing a private submission. |
| Phone | Required, with country code; verify the contact where the selected service requires it. |
| Birth day | Required valid day, together with month. |
| Birth month | Required valid month; no birth year, age or complete date of birth is collected. |
| Birthday greeting preferences | Separate email, WhatsApp and SMS choices with opt-out. |
| Church birthday announcement permission | Separate choice to share the member's birthday/name with the pastor and church community. |

Validate real month/day combinations and support 29 February without asking for a birth year. Give the church an explicit 29-February-in-non-leap-years setting (28 February or 1 March). Never infer a birth year, age or a default full date for storage.

Self-registration creates a pending/verified ordinary registry record, not a worker role or dashboard. Use rate limits, duplicate review within the selected church and a verifiable contact process. Do not reveal whether an email or phone belongs to another church. Joining Church B must not overwrite the person's Church A record. Link an existing verified identity to an approved registry record without creating another person or asking them to create a second sign-in account.

Allow authorised church staff to review and correct a record; verify the submitter's identity before changing their response address, birthday or preferences. Record consent, source and correction history. The registry is private; self-registration is not consent to publish someone's email, phone number, birth day/month or photograph.

### Phase 2 implemented now — keep membership when worker access stops

Both worker-role demotion to Member and the existing remove-access action suspend that church's worker access, preserve the church membership record and retain the same identity. Personal account-security controls and other churches' dashboards remain available. The workspace chooser excludes the suspended church, and direct API calls are denied. A role edit, new invitation or altered navigation cannot reopen it.

Migration six adds a church/user suspension marker with audit. It does not add personal birthday fields or a birthday scheduler before the registry module exists. Existing churches and assignments remain intact; old physical membership removals cannot be reconstructed from an upgrade alone.

### Phase 5/9 — department appointment and reactivation

A valid, accepted department appointment in the same church is required to restore a previously suspended worker dashboard. The authorised leader can act only for their own department/branch and cannot select an elevated role beyond their authority. Appointing a pastor, head usher or church administrator still requires the church-wide administrator. If every active worker appointment ends, suspend that church's worker dashboard; ending one department assignment must not suspend it when another authorised appointment in that same church remains active.

Reactivation must atomically check the registry/account link, church status, department/branch, role, appointment approval/acceptance and current suspension revision, then activate the appointment, remove the active suspension marker and append the audit event. Do not reactivate after a worker's own role change, an expired invitation, or a department in another church. Preserve the past suspension/appointment history in audit.

Until the department appointment module is implemented, the existing team role editor deliberately cannot restore a previously suspended worker. Do not add a temporary restore toggle or fake department assignment. Initial worker invitations/appointments remain available through the foundation for people who have not been suspended.

### Phase 10 — birthday greetings and church notices

Schedule birthday care from the **church registry**, independently of worker status. Ordinary members, active workers and former workers who remain registered continue to be eligible. A member leaving the registry, withdrawing messaging permission or withdrawing announcement permission changes the corresponding eligibility; ending a worker appointment does not.

Send the member a personalised church birthday greeting by their permitted email, WhatsApp or SMS channel. Use channel preferences, verified destinations, configured providers and usage budgets. Avoid sending three copies by default; use the selected primary channel with consent-aware fallback, or additional channels where explicitly chosen. WhatsApp/SMS must not be described as delivered when credentials, templates, units or provider acceptance are missing. Surface failed or budget-paused deliveries to authorised staff, with safe retries.

Notify the pastor and make a birthday announcement available to the entire church community for members who permit church sharing. Use a daily birthday bulletin and the church's approved communication channels; ordinary members still do not need dashboards. Show the approved display name and birthday greeting, with a photo only when separately permitted. Do not disclose email addresses, phone numbers, birth year, age, full private registry details or recipient contact lists. Birthday sharing permission is distinct from permission to receive a personal greeting.

Use church-local dates/timezones, durable scheduled jobs, an agreed catch-up window, per-church preferences, idempotent yearly/daily delivery keys and retry tracking. A person belonging to several churches may receive each church's greeting according to their preferences; a worker role change must not generate another birthday greeting. Prevent duplicate broadcasts on scheduler restarts, repeated provider callbacks or a contact correction. Keep provider charges and opt-outs visible to the church administrator.

### Additional acceptance tests

- The same identity can hold two active worker dashboards and ordinary membership in a third church.
- Suspending Church A preserves every registry relationship and leaves Church B active; Church A cannot be restored by role edit or re-invitation.
- Suspension, membership preservation and audit commit or roll back together.
- Department-based restoration accepts only an authorised same-church appointment, and last-assignment removal is calculated per church.
- Registry submission does not create a worker, leak another tenant's member record or collect a birth year.
- Birthday jobs include ordinary and suspended-worker members, respect consent and channel budgets, and exclude members who have left the registry.
- Date validation covers invalid days, 29 February, non-leap policies, timezone boundaries and duplicate/retried jobs.
- Church birthday notices never include contact details or age and cannot be exposed without the member's sharing permission.
