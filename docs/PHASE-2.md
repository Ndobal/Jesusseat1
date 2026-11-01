# Phase 2: accounts, church registration and security

**Status: implementation and verification in progress; not publicly deployed.**

Phase 1 engineering planning is closed in PHASE-1-CLOSEOUT.md. The first Phase 2 implementation was already pushed in PR #1. Continuations add personal account security, custom-role lifecycle safeguards and optional authenticator MFA with recovery codes. The database schema is now version three.

Latest local verification: `npm run check` passed and **47 tests passed**. These cover the original foundation checks plus session privacy/revocation, password rotation/concurrency, atomic security rollback, custom-role lifecycle, existing-database upgrades and MFA. MFA verification includes independent RFC reference vectors, enrollment/session binding, challenges, replay/expiry/attempt limits, recovery-code consumption/replacement, no password-reset bypass and the complete HTTP cookie exchange. This is local execution evidence; authenticated browser acceptance and production delivery remain separately tracked below.

## Acceptance checklist

| ID | Capability | Engineering status | Evidence |
| --- | --- | --- | --- |
| P2-01 | Account registration and email verification | Implemented | Single-use/expiry and duplicate-account response tests |
| P2-02 | Sign-in/out, recovery and session revocation | Implemented | Password/session/CSRF/origin integration tests |
| P2-03 | Personal account security | Implemented | `/security`; password changes, sessions, authenticator setup, two-step sign-in and one-use recovery codes |
| P2-04 | Free church registration | Implemented | Atomic church/admin/roles/root/audit transaction tests |
| P2-05 | Church hierarchy | Implemented baseline | Independent, multi-branch and denomination structures, branch creation and scoped descendant visibility |
| P2-06 | Church isolation and permissions | Implemented | Cross-church reads/writes, foreign IDs, branch siblings and role escalation tests |
| P2-07 | Invitations and staff access | Implemented | Matching verified email, expiry, revocation, replay and concurrent-acceptance tests |
| P2-08 | Standard and custom roles | Implemented | Creation, version-checked edits, expansion confirmation, safe archive, immutable built-ins and no self-role edits |
| P2-09 | Guided onboarding | Implemented | Checklist derived from persisted church/branch/team/vision/mission setup |
| P2-10 | Accountability and persistence | Implemented | Atomic audit rollback, append-only triggers, backup restoration and repeatable v1-to-v3 upgrade |
| P2-11 | Browser usability | Partially verified | Earlier desktop sign-in visual inspection; new authenticated security/role controls and physical mobile devices still need browser acceptance |
| P2-12 | Production email and hosting | Pending external configuration | No production secrets supplied; queued mail and adapter tested locally |
| P2-13 | Public-launch security and policy review | Pending | Mandatory privileged-MFA policy, lost-factor support recovery, trusted-edge policy, final policies, monitoring, independent review and pilot acceptance |

## New account-security behaviour

Any authenticated account, including one awaiting email verification, can manage its own password and sessions. This allows users to secure an account before joining a church.

- Session inventory reveals only that account's active sessions; revocation IDs are independent digests, not authentication credentials.
- A user can sign out one session or all other sessions without affecting another account.
- Password changes require the existing password, reject unchanged/short passwords, rotate the current cookie/CSRF token and sign out all other sessions.
- Outstanding password-reset tokens are invalidated. A notification email is queued without including passwords or credentials.
- Hashing is asynchronous. Credential/session state is checked again before committing, so concurrent password changes or password recovery cannot silently overwrite newer security state.
- A concurrent login must still match the current stored password hash before its session is created.
- Audit and security changes share one transaction. Audit failure preserves the prior credential/session state.

Sessions currently show start/expiry time and current-session status. Device names, IP history and approximate location are not collected or invented.

## New custom-role behaviour

- Standard roles remain immutable. Only a church-wide actor with roles.manage can edit/archive custom roles, and only within their own permission authority.
- An actor cannot edit the custom role they are currently using.
- Clients must submit the current role version. Stale edits/archive requests return 409.
- Adding permissions to an assigned role or a role with active invitations requires explicit `confirmExpansion: true`; UI explains that existing access changes immediately.
- Removing permissions takes effect on the next request, without relying on cached session claims.
- Roles with members or pending active invitations cannot be archived. Archived role records remain for historical invitations, disappear from the active-role list and cannot be used in new invitations.
- Church-wide assignment/invitation counts are withheld from branch-scoped actors.
- Version two adds roles.archived_at using a transactional, repeatable startup migration. Existing records are preserved.

## Remaining Phase 2 decisions

Reparenting/removing branches and converting an independent church into a denomination require their own reviewed hierarchy lifecycle. Current branch creation is sufficient for the initial setup journey; do not add destructive reparenting without analysing inherited access. Optional MFA is implemented and documented in TWO-STEP-VERIFICATION.md. Mandatory privileged-role enforcement, lost-factor recovery policy and real-provider/hosting validation remain public-launch gates, not reasons to claim already tested authentication paths are still unbuilt.

## Completion rule

Do not call the product production-ready just because code and local tests pass. Record local test evidence, browser acceptance, provider delivery, deployment configuration and remaining launch tasks separately. GitHub-hosted CI was blocked before execution by the account billing lock during the first push; local checks remain reproducible using the commands in README.md.
