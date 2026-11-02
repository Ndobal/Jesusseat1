# Phase 4 — church websites

Implemented on `build/phase-4`, based on `build/phase-3`. This phase adds church website publishing inside the Node 24 application. It does not deploy a production host, provision DNS or publish any real church's content automatically.

## Church editor

Whole-church workers with `website.manage` can open **Church website** from their workspace. The editor includes:

- Five live HTML/CSS designs: Welcome Home, Living Faith, Grace & Heritage, Open Doors and The Gathering. They use different typography, colours, hero compositions and card treatments, with shared content and stable routes.
- Public church name, tagline, welcome heading/text, logo, hero image, public contact information, address and service times. Private church contact email/phone are deliberately not copied into a new website.
- Independent core pages for Home, About, Leadership, Visions, Missions, Ministries, Services, Watch Live, Sermons, Events, Gallery, Giving, Contact, Projects, Departments, Weekly Activities and Devotionals. Only Home starts visible. Empty pages are not published accidentally.
- Custom pages; editable titles/text/images; page visibility; navigation inclusion and ordering; individual entries with dates, images and named HTTPS external links. Plain text is escaped; there is no arbitrary HTML/script editor.
- Multiple visions/missions and individual entry URLs. **Copy visions & missions** imports the current church statements into a new draft, retaining stable source-based entry addresses and manual website entries. It does not publish them automatically.
- Image upload/library, accessible image descriptions and gallery viewing with previous/next controls, arrow keys and Escape. A photo also has its own detail address.
- Saved revisions, historical previews, restoration as a new draft, explicit publication and taking the website offline. Unsaved-change notices protect local edits.
- Church enquiries and public comments, with status filters, pagination and moderation. A contact enquiry cannot become a public comment. Approved comments can be returned to review or removed from the website.

Existing page addresses cannot be removed by a normal save; hide unwanted pages instead. Template changes retain pages, entries and navigation. Entry removal is supported and removes that entry's current URL after publication; its earlier text remains in revision history. Restoring a revision keeps later-added pages as hidden drafts so existing page addresses remain reserved.

## Publishing and public routes

Free addresses use the existing application origin:

| Route | Result |
| --- | --- |
| `/c/:churchSlug` | Published Home page. |
| `/c/:churchSlug/:page` | An enabled published page. |
| `/c/:churchSlug/:page/:entry` | An entry's detail page. |
| `/c/:churchSlug/media/:imageId` | An image referenced by the published projection. |
| `/c/:churchSlug/sitemap.xml` | Enabled pages and their detail routes. |
| `/website-preview/:churchId` | Authenticated private preview of the saved draft. |
| `/website-preview/:churchId/:page/:entry?revision=N` | Authenticated historical/page preview. |

These are application paths, not newly provisioned subdomains or custom domains. Webnoryx/custom domains remain Phase 11. Root sitemap/robots discovery includes active published churches. Private previews are noindex and require a verified, active, whole-church website worker on every request, including images. They do not use public bearer-token preview links.

`website.publish` is separate from editing. It requires `website.manage` when selecting custom permissions. Standard church administrators receive it; media workers can edit/preview but cannot publish by default. Branch-scoped workers, ordinary members, suspended workers and other tenants cannot use the website API. Platform administration does not automatically grant church website access.

Saving a draft does not change the live site. Publish validates the expected draft version, complete visible pages and owned image references, then atomically stores a separate snapshot containing only enabled pages. Public routes never read private profile, membership, financial, care or draft records as content. Template selection and later private profile edits do not silently rewrite a publication. Church suspension and unpublishing immediately hide the site, public images and new form intake. They preserve drafts/revisions.

## Images and storage

Uploads accept bounded PNG and JPEG raster files only, up to 1.5 MB each, 6000 pixels per side and 24 megapixels. The server verifies format structure, PNG checksums and dimensions; strips PNG text/EXIF and JPEG application/comment metadata; rejects SVG, arbitrary supplied MIME, animated PNG and malformed/unsupported structures. This is format validation, not a claim of malware scanning or independent decoder security assessment.

Images are church-owned SQLite BLOBs, named with random identifiers. No caller-chosen filesystem paths or external-image fetches are used. The current allowance is 100 images and 25 MB per church. Users must have rights/permission to publish their images.

Private/orphaned images cannot be fetched anonymously. Public image access requires that the image be referenced in the enabled publication. An image in use by the draft or live website cannot be deleted. Deleting an unused image may make an older revision unrestorable until a replacement is chosen; restore fails explicitly rather than partially changing the draft. Backups now include these BLOBs and website revisions. Plan disk monitoring, off-host backups and approved revision/message retention before production scale.

## Enquiries and comments

A published Contact page has a durable enquiry form. Enabled pages can separately allow public comments. Both JavaScript and native HTML POST submission are supported; personal details are never placed in a GET query string.

Forms use a church-bound, one-use, 30-minute token, minimum completion time, honeypot, persisted rate limits, bounded input and versioned consent. Contact consent permits responding to the enquiry. Comment consent explicitly permits moderated publication of the display name and comment, while keeping email private. Enquiry/comment bodies are encrypted with the stable `OUTBOX_KEY`; response email, name and status metadata remain access-controlled plaintext. Acknowledgements confirm database receipt, not an email delivery.

Website workers can review their church's inbox. Comments are hidden until approval, and only approved comments on a currently enabled/comment-enabled page appear publicly. Moderation is version checked and transactional with audit. Contact enquiries remain private and can be marked resolved/reopened. This phase does not add a tenant email-reply composer or automated church messaging; staff can use the response address under the submitter's consent. Birthday messaging remains Phase 10.

## Schema seven and safeguards

New tables: `website_drafts`, `website_revisions`, `website_publications`, `website_assets`, `website_form_tokens`, `website_messages`. Revisions are append-only. Draft saves/restores/imports, publication, image changes and message reviews share transactions with audit. Draft/message/publication operations reject stale versions. Revision and inbox lists have pagination.

Migration seven adds website publishing to standard church-administrator roles only, audits that addition and is repeatable. Media/custom roles are not silently elevated. Existing account, member and per-church worker-suspension rules remain in force. Take a consistent backup before upgrading and preserve the matching encryption key.

The current limits are 40 pages, 60 entries per page, 240 total entries and 220 KB of normalised text/settings per website snapshot. Website JSON saves have a 256 KB HTTP body cap, image uploads a bounded 2.2 MB body cap; unrelated APIs keep their 32 KB cap.

## Verification and remaining launch gates

`npm run check` and all **106 automated tests** passed locally (77 existing tests plus 29 website tests). Run both checks when continuing. Tests cover draft/publication separation, five templates, independent routes, metadata/escaping, custom pages and ordering, image validation/ownership/privacy, stale writes, editor/publisher/branch/member permissions, restoration, suspension/unpublishing, import stability, encrypted enquiry receipt, native form fallback, comment moderation, one-use/church-bound tokens and audit rollback. Upgrade tests check old databases and administrator-only permission migration.

Browser inspection used an isolated synthetic QA database, not real church records. All five desktop templates and gallery open/next/Escape/focus return were inspected. The signed-in editor and mobile-device layouts still require owner/pilot browser acceptance; API checks do not substitute for those checks. No development seed script or default demo content is shipped in the application.

Remaining launch gates: real hosting/HTTPS/email setup, independent accessibility/security review, operator-approved policies and retention, off-host backup rehearsal and pilot acceptance. GitHub's previously reported account billing lock can prevent hosted CI from starting; local checks are separate evidence.

## Next phase

Phase 5 implements the private registry, household/visitor records, identity linking, duplicate review and worker/department appointment groundwork. It must include ordinary-member self-registration with name/email/phone/birth day and month only, multiple church relationships and no ordinary-member dashboards. Suspended worker restoration must require an authorised same-church department appointment. Birthday greetings and church notices remain registry-based and independent of worker status, with delivery in Phase 10. Native streaming stays deferred; Phase 7 uses Facebook/YouTube embeds.
