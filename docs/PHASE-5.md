# Phase 5 — private registry and department appointments

Implemented on `build/phase-5`, based on `build/phase-4`. This adds durable church-owned people records and authorised department appointments. It does not deploy production or send scheduled birthday messages.

## People and consent

Workers with `members.manage` use People & registry to search paginated people/visitor records, edit contact details, group same-branch households, review duplicates and assign visitor follow-ups. Branch workers see only their scope. Follow-up assignees must be active registry workers in scope. Notes and duplicate reasons are encrypted. Household relationships never grant account authority.

Birthdays store day and month only; birth years and full dates of birth are rejected, including CSV headers. 29 February is valid. Church settings store a future leap-day delivery policy. Email, WhatsApp, SMS greetings and church announcement sharing have distinct opt-ins and append-only consent events. Staff must attest consent before adding permissions. Contact changes reset affected permissions and verification. Merely ending service preserves registry membership and preferences; leaving the registry ends appointments and follow-ups.

Church-wide administrators opt into public registration and choose its branch. A published active church then shows Join our church at `/join/:slug`. Intake requires name, email, international phone, day/month and registry consent; birthday options start unchecked. One-use church-bound forms, minimum completion time, honeypot, durable rate limits and bounded input protect intake. Native HTML POST also works. Intake is encrypted and awaits single-use email proof, then authorised church review. Matching an existing record does not overwrite its details or permissions. No public member directory is created.

Private preference links allow updates without a worker dashboard. Links are short-lived, single-use and version checked; private tokens use URL fragments, are removed immediately and are submitted by POST. JavaScript is required for these private-link screens. Preferences request responses do not reveal whether a person exists. Public intake consent text/version is separate from birthday consent.

## Imports, duplicates and accounts

CSV supports `name,email,phone,birth_day,birth_month,kind`, quoted fields and up to 200 rows/100 KB. Preview reports invalid and duplicate rows; explicit commit imports valid reviewed rows only. Encrypted staging expires after 30 minutes, is creator-bound and rejects registry changes since preview. Bulk imports do not opt people into messages or create workers. No automatic legacy membership-to-person conversion runs.

Duplicate contacts require explicit review and an encrypted reason. Merging retains the source as merged and preserves the target's details/consent, with version checks. Different linked accounts cannot be merged; active source appointments must end first. Linking an existing account requires an attested invitation and the same verified email. It creates ordinary membership only and cannot restore suspended worker access. A global account can link to independent records in multiple churches.

## Departments and dashboards

Only a whole-church built-in church administrator configures departments, their designated leaders and delegated roles. Leaders need `departments.manage`, explicit department ownership and branch authority. They can look up a candidate by exact email without seeing the wider registry, phone or birthday. A changed role requires renewed delegation approval. Church administrator, pastor and head usher appointments are never delegated to department leaders.

Accepted appointments require the same verified email and recheck the inviter, department, role, person and membership state. Activation, linking, same-church suspension clearance and audit are atomic. Ending the final active appointment demotes to ordinary Member and suspends only that church dashboard. Ending one of several active appointments leaves access active. Team suspension closes appointments and invalidates pending invitations. Old team edits/invitations cannot restore access.

The foundation currently supports **one effective role and branch scope per person per church**. Multiple departments must share that role/scope. Changing it requires explicit church-admin approval and no conflicting active appointments. Pending invitations are intentionally strict: accepting one may invalidate another issued against the previous person/membership version; cancel and reissue it. Invitations expire after seven days. Recorded acceptance/end timestamps are supported; future scheduling, availability, training, full reviews/projects/coordinator workflows and rosters continue in Phase 9. Receipt/payment identity workflows remain Phase 8.

## Schema, operations and verification

Migration eight adds registry settings, people, households, submissions, forms, tokens, consents, imports, follow-ups, departments and appointments. It grants department management only to existing standard church administrators/department leaders, with audit and repeatability. Existing assignments, memberships and suspensions survive. No real records are seeded or imported.

Take a consistent backup before upgrading and retain its matching stable `OUTBOX_KEY`. Intake, mail, import staging, follow-up notes and duplicate reasons use encryption; registry contact details and birth day/month remain access-controlled plaintext in SQLite. Backups contain personal data. Consent and audit are append-only. Operational retention/purge, off-host backup recovery and independent security/privacy/accessibility review need operator approval before launch. Person lists are paginated (25); review lists currently cap at 100 and households/departments lack pagination, so this build requires a bounded pilot before large-directory scale.

`npm run check` and **148 automated tests** passed locally. Coverage includes migration repeatability, branch/tenant boundaries, encrypted intake and notes, calendar validation, consent resets, single-use/expired/stale tokens, native POST, import previews/concurrency, merges, account linking, delegated authority, protected roles, suspension/reactivation, multiple churches and transactional audit rollback. UI module checks exercise rendered fields and form payloads. Desktop public registration was inspected using isolated synthetic records. Signed-in editor journeys, mobile-device layouts, real email delivery and production deployment remain pilot acceptance tasks. GitHub-hosted CI may remain blocked by the previously observed account billing lock; local results are separate evidence.

Next: Phase 6 attendance and ministry care. Birthday delivery and pastor/church notices remain Phase 10; Facebook/YouTube embeds remain Phase 7. Native JesusSeat streaming remains deferred.
