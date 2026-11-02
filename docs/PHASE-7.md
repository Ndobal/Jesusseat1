# Phase 7 — church media and external video viewing

Implemented on `build/phase-7`, stacked on `build/phase-6`. Churches can show eligible YouTube/Facebook services and messages on their existing websites. Videos remain with their provider. No JesusSeat streaming ingestion, recording, video uploads, studio, replay-download service or 30-day hosted-video deletion policy is added.

## Visitor experience

All five church designs support a validated video on an individual website entry. Watch Live features its first video entry, with links to the other entries; Sermons and other pages retain individual video routes. A Home-page Watch service button appears when an enabled Watch Live page has video content. Entry ordering remains controlled by the website editor. Live/upcoming/replay is an editorial classification, not an independently verified real-time availability badge.

A visitor explicitly chooses Load YouTube/Facebook player. No iframe, provider SDK, provider thumbnail or video network request is created automatically by JesusSeat before that choice. YouTube uses the privacy-enhanced embed host. The player has a descriptive title, fullscreen/picture-in-picture support, no forced autoplay, a Close player control and a direct provider fallback link. Closing removes the iframe and returns focus to the load control; it does not erase cookies the provider may have set. Without JavaScript the direct link remains usable.

Playback can depend on provider privacy, embed permissions, region/age/copyright restrictions, login, browser settings and ongoing video availability. Cross-origin iframe loading is not treated as proof that playback succeeded. The interface always offers the provider link. JesusSeat does not bypass restrictions or download provider videos. Upstream images remain outside this importer; the existing church-owned website image/gallery tools continue separately.

Church HTML alone receives the narrowly scoped frame-src allowance for YouTube's embed path and Facebook's video plugin. Account/registry/platform routes keep the stricter policy. The iframe uses strict-origin-when-cross-origin referrers so YouTube receives origin identification without disclosing a private preview path; the surrounding page keeps no-referrer. No provider script is added to the parent page.

## Media workers and website publication

Whole-church active workers with `media.manage` use Media & live services. Ordinary members, suspended workers, other churches and branch-scoped workers cannot use this shared church website media module. No new standard-role permissions are granted in this phase: church administrators and the existing media role already have media management; custom roles remain explicit.

A worker adds a full HTTPS video URL, church title/description and type, and attests authority/suitability for public viewing. YouTube watch/short/live/Shorts/embed links and numeric Facebook video permalinks are canonicalised. Arbitrary iframe markup, other hosts, credentials, custom ports, profile/channel/playlist URLs and shortened Facebook share redirects are rejected without fetching the supplied URL. Duplicate provider/video IDs are rejected within a church; different churches can use independent records for the same public video.

Entries are version checked and can be archived/restored. The library holds up to 300 entries with 25 per page. Archiving/editing the library does not silently modify an existing website draft or publication. A worker who also has website.manage can copy a selected active video to an existing website draft page, optionally enabling that page. Copying checks both item and website versions and uses a stable entry address. Recopying updates that entry instead of duplicating it; image/date fields are preserved. Website validation, history, private preview, restoration and the separate publisher permission continue to apply. A worker can also add/remove a validated video directly in a website entry editor. Only publication changes the live site; taking the website offline or suspending the church hides it immediately.

## Official account connections

Manual video links work with no provider application credentials. Provider sign-in buttons appear only when the corresponding server-side application is configured. Each provider uses its own top-level sign-in/consent screen; JesusSeat never asks for a Facebook/Google password.

YouTube uses a confidential web-server authorisation-code flow, read-only YouTube scope, PKCE S256, a ten-minute hashed state bound to the initiating church, verified user and current session, and a single-use callback. The callback exchanges the code server-side, obtains the authorised channels, then offers explicit channel selection. The browser receives channel names/IDs only. The selected connection stores encrypted access/refresh credentials; expired access can refresh server-side. Upload discovery reads that channel's uploads playlist; live/upcoming discovery lists the authorised user's broadcasts and filters video results to the selected channel. Only public, embeddable YouTube candidates are returned. Private/unlisted/nonembeddable/other-channel items are excluded from account discovery; a deliberately shared eligible manual link still depends on provider playback restrictions.

Facebook uses the confidential code flow with session/church/user-bound state and explicit managed Page selection. The adapter requests pages_show_list and pages_read_engagement, exchanges for longer-lived user access, obtains the Page tokens server-side and uses the chosen Page's videos endpoint with appsecret_proof and bearer authorisation. It does not read personal timelines, scrape a profile or collect a pasted token. Graph API version is mandatory operator configuration, not a silently assumed current version. Facebook candidates are videos exposed by that Page API; public-viewing suitability is explicitly confirmed by the worker and enforced by the provider's player. They are not labelled as independently verified public/playable videos. Facebook broadcast status is selected editorially; there is no live polling or webhook in this release.

Provider grants await selection for ten minutes; encrypted discovery previews expire after thirty minutes. Previews are creator-bound and checked against the current connection version. Workers choose candidates and supply/confirm the church-facing title/type/authority before adding them to the private library. Import does not publish a website. The provider connection is limited to twenty channels/Pages per church. Channel enumeration returns up to fifty YouTube channels or one hundred managed Pages; video discovery is twenty-five items per page with provider cursors. Returned paging URLs are never followed as arbitrary URLs. Workers may load subsequent video pages explicitly.

Discovery is rate limited to twelve requests per church/hour; sign-in starts to ten per worker/church/hour. Calls use fixed provider hosts, redirect refusal, bounded one-MB JSON responses, generic errors and a ten-second timeout per upstream request. Discovery refresh/results recheck the connection version and initiating worker's authority after network calls before an atomic save/audit. A suspended/demoted connecting worker requires reconnection by an authorised worker. Network calls never run inside SQLite transactions.

Disconnect removes that church's encrypted credential row and discovery previews. It leaves other churches, membership and existing website video links intact. Provider-wide revocation is intentionally a separate action in the provider account: Google documents that it can revoke the entire project grant, affecting other connected churches. The UI links to those controls. No automatic cross-church provider-wide revocation is performed. Complete the provider's policy/revocation/data-deletion review before enabling the application publicly; local disconnect is not a claim of provider-side revocation.

## Operator setup and launch gates

Optional variables are documented in .env.example:

- YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET; enable YouTube Data API and configure a web application with the exact APP_ORIGIN/media/oauth/youtube/callback redirect.
- FACEBOOK_APP_ID, FACEBOOK_APP_SECRET and an explicitly verified supported FACEBOOK_GRAPH_VERSION; configure the exact APP_ORIGIN/media/oauth/facebook/callback redirect and the appropriate Facebook Login/Page product, approved permissions and eligible Page access for your application.
- Use canonical HTTPS origins in production. Keep provider secrets outside Git and preserve the stable OUTBOX_KEY used for stored grants/tokens. Never log callback query strings, token bodies or unredacted provider responses at the reverse proxy/host.

Google verification/consent setup, YouTube policy review/quota monitoring and Meta product/app review/permission eligibility are operator launch tasks. No real provider credentials were supplied, no Google/Meta account was connected during this build, and no real API quota was used by the tests. Meta's official documentation endpoint returned HTTP 429 in the research environment; the Page adapter remains gated behind operator configuration and a live contract/permission pilot. This build does not certify the latest Meta version, permissions or real Page entitlement. Manual Facebook video links are independent of the Page API connection.

Test the complete real sign-in → consent → channel/Page selection → discover → explicit import → draft → publisher → anonymous visitor playback → disconnect/revoke journey with the approved apps before launch. Also check cancellation, refresh expiry, restricted/removed media, provider outage and multiple churches using one provider identity. App verification, provider grants and real playback are not replaced by fixture tests. Child-directed sites need the applicable provider-specific designation/review; this build does not configure those accounts or certify child-directed use.

The Privacy notice draft is versioned to 2026-11-02-draft-2 to explain opt-in players and encrypted account connections. Existing acceptance history is retained. Operator policy approval and any required notices/renewed consent remain launch work. Backup/retention reviews must include connection credentials and media history; do not assume an old backup has had disconnected credentials erased.

## Schema ten, cleanup and verification

New tables: media_library, media_oauth_states, media_grants, media_connections and media_discoveries. Migration ten is transactional/repeatable and preserves old website JSON, account/registry membership, existing permissions and per-church worker suspension. Old entries without a media field remain valid. Credential/grant/discovery payloads are encrypted with OUTBOX_KEY. Audits record actions, targets, provider and counts, without provider secrets or authorisation codes.

Expired temporary media state is rejected immediately and purged on relevant media operations, at normal server startup, and hourly while the server runs. npm run media:cleanup offers an operator cleanup command without printing payloads. Thus unused expired ciphertext may remain until the next cleanup (up to an hour while running); connection credentials remain until disconnect. The chosen church title/description and public video link are persistent editorial content, separate from short-lived provider previews. Review provider data-use, deletion and retention requirements before enabling real credentials.

Syntax checks and **216 automated tests** passed locally (183 existing and 33 new). New tests cover strict URLs, tenant/branch roles, manual fallback without credentials, drafts/publishing, stale writes and audit rollback, session-bound one-use OAuth/PKCE, wrong-account selection, encrypted credentials, eligible discovery, refresh, failures, permission changes in flight, local disconnect, schema-ten repeatability, CSP isolation and explicit-load/close client behaviour. Provider tests use deterministic synthetic HTTP fixtures and do not claim live API verification.

Browser QA inspected actual rendered synthetic snapshots of all five church designs, the media workspace and 390px church/editor layouts. No page overflow or pre-choice player iframe was present. This checks layout and initial player behaviour, not authenticated end-to-end flows or real external playback. No synthetic snapshot/seed is shipped. Hosted CI previously encountered an account billing lock; local checks are separate evidence. No production deployment is made.

Next: Phase 8 giving, private transfer receipts and reconciliation. Native streaming stays deferred; birthday delivery remains Phase 10.

## Primary references checked

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list
- https://developers.google.com/youtube/data/reference/rest/v3/videos
- https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts/list
- https://support.google.com/youtube/answer/171780
- Meta operator verification targets (retrieval rate-limited): https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/ , https://developers.facebook.com/docs/graph-api/reference/user/accounts/ , https://developers.facebook.com/docs/plugins/embedded-video-player/
