# Phase 3 — public platform website

The Phase 3 implementation adds JesusSeat’s public platform site to the existing Node 24 / SQLite foundation. It depends on the Phase 1–2 branch. It does not deploy a production service or publish tenant church websites.

## Included

- Independent server-rendered Home, About, Vision, Mission, Features, Templates, Churches, Donate, Contact, Help, Terms, Privacy and Statement of Faith pages.
- Five distinct desktop/mobile design previews, each with its own detail page. These are illustrative concepts; selecting a preference in Church profile is already supported. Content editing, revision history and tenant publication belong to Phase 4.
- Eight searchable help guides, with their own URLs and related links. Features explicitly distinguishes current capabilities from planned modules.
- Responsive forest-green, ivory and gold presentation, original illustrative church imagery, compressed WebP assets, native mobile navigation, labelled forms, skip navigation, visible focus and reduced-motion support. No external font, analytics or player loads.
- Canonical URLs, page titles/descriptions, social metadata, robots.txt and a sitemap. Private application pages use noindex. Public directory routes enter the sitemap only when published and active.
- Contact intake with durable acknowledgement, encrypted message bodies, versioned privacy consent, one-use 30-minute form tokens, a short minimum completion time, honeypot, bounded input and persisted rate limits. Both JavaScript submission and a native HTML fallback work.
- A restricted platform inbox for reading, filtering, replying to and resolving contact enquiries. Replies and statuses use optimistic versions; replies, queued email and audit commit together. Email delivery requires the existing provider configuration.
- Optional notification emails contain an inbox link and reference, without the visitor’s name, email or message. Messages still reach the database when notifications are disabled.
- An opt-in church directory. Church-wide administrators can publish or withdraw an introduction. Only church name, city/country, slug, introduction and optional HTTPS external website are exposed. Private contacts and membership records are excluded. Suspended churches disappear from public projections.
- A Keep JesusSeat Alive page. A configured hosted checkout opens externally; otherwise the page truthfully offers a support enquiry. Payment collection, donor attribution, receipts and accounting are not implemented here.

## Platform inbox access

No email address receives automatic access. Church administrator permissions do not confer platform access, and there is no public grant API. An operator with host access must run:

```sh
npm run admin -- grant operator@example.com
npm run admin -- list
npm run admin -- revoke operator@example.com
```

The account must already exist, have verified email and have enabled authenticator verification before grant. Every inbox request checks the grant, verified email and enabled MFA. Revoking the grant denies subsequent requests immediately. The host CLI records grant/revoke events in append-only audit. Do not grant a synthetic test account on a live installation.

## Configuration and data

New optional environment variables:

| Variable | Purpose |
| --- | --- |
| `PLATFORM_NOTIFICATION_EMAIL` | Receive minimal alerts for new enquiries; blank disables alerts. |
| `DONATION_CHECKOUT_URL` | Operator-approved HTTPS hosted checkout; blank keeps online donations closed. |
| `DONATION_PROVIDER_LABEL` | Displayed provider name, required with a checkout URL. |

Migration four adds `platform_admins`, `public_contact_tokens`, `public_enquiries`, `public_enquiry_replies` and `church_directory`. Existing records and policy acceptances are preserved. Back up the database and stable `OUTBOX_KEY` before upgrading. This same key encrypts enquiry/reply bodies as well as MFA seeds and mail. Names, enquiry subjects, response email addresses and status metadata remain plaintext in the access-controlled database; this is not end-to-end encryption. Protect the database and backup files accordingly.

Policies carry a short **Policy draft** status. Public copy uses direct visitor-facing language; implementation explanations and launch requirements stay in these documentation files. New church registrations record participation version `2026-11-01-draft-2`; enquiry consent records privacy version `2026-11-01-draft-1`. The platform purpose and doctrinal text are proposed wording for approval. Before launch, finalise doctrine, operator particulars, complaints/review procedures, lawful processing bases, providers/locations, retention and deletion/export procedures. No legal-compliance certification is asserted.

## Verification and remaining gates

Validation passed: `npm run check` and all **69 automated tests** (47 foundation, 22 public-platform tests). Run the same commands when continuing. Public tests cover routes/metadata, asset responses, native contact submission, nonce/consent/abuse checks, encryption, access boundaries, transactional rollback, reply conflicts, directory opt-in/withdrawal, suspension, tenant/branch limits, safe links, literal searches, escaping and checkout states. The foundation migration fixture verifies repeatable upgrades from version one.

Managed-browser visual inspection covered the homepage, template gallery, design detail, Contact, plus mobile layout inspection. Automated tests use synthetic in-memory data. Real provider email, payment checkout ownership, authenticated inbox/directory browser acceptance, independent accessibility/security review and production hosting remain launch gates. The GitHub account’s previously reported billing lock may prevent hosted CI from starting; local results are separate evidence.

Next: Phase 4 builds five real tenant templates, independent church page routing, content editing, revisions, preview and publication with safe public projections. Webnoryx domains, full super-admin suspension/support tooling and payments stay in their later phases. Phase 7 remains Facebook/YouTube embedding only; native streaming is deferred.
