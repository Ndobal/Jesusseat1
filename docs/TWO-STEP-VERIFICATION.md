# Two-step verification

JesusSeat supports optional authenticator-app verification for personal accounts. It applies across all church memberships of that account. Enabling it does not grant church or platform privileges. The product still needs a decision on mandatory enforcement for privileged roles before public launch.

## User journey

1. Sign in and open **Account security** (`/security`).
2. Confirm the current password to begin setup. Setup is bound to that session and expires after ten minutes.
3. In an authenticator app, add a time-based account manually. Use the displayed JesusSeat account and private setup key. The algorithm is SHA-1, six digits, 30-second periods. No external QR-code service receives the key; QR display is not included in this version.
4. Enter a current authenticator code to confirm possession. MFA is not enabled until this succeeds.
5. Save the ten recovery codes shown once on the confirmation page. They remain only in the page's memory and disappear on navigation/reload. No plaintext recovery-code copy is stored on the server.
6. Subsequent sign-ins require the password followed by an authenticator code or an unused recovery code. The password stage alone does not create a full application session.

The confirmation code is consumed. If you sign in again immediately, wait for a fresh authenticator code or use a recovery code. Keep the authenticator device and server clocks synchronised. The verifier permits a one-step clock difference in either direction, with replay prevention.

## Managing access

- Replacing recovery codes or disabling MFA requires the current password and a fresh authenticator/unused recovery code.
- Enabling, disabling or replacing codes rotates the current session and signs out other sessions and pending sign-in challenges. Reset tokens are invalidated and a security notification is queued.
- Replacing codes invalidates all previous recovery codes. Each recovery code is usable only once.
- Email password recovery changes the password and revokes sessions/challenges, but **does not disable MFA**. The new password still needs the second factor.
- Losing the authenticator and all recovery codes currently means there is no self-service MFA bypass. Church administrators cannot disable another person's MFA. A separately reviewed support recovery policy is required before public launch; do not add a public backdoor.

## Implementation boundaries

Authenticator generation/verification follows RFC 4226 (HOTP) and RFC 6238 (TOTP), tested against their published reference vectors. The implementation uses Node's built-in HMAC and constant-time code comparison. This is independent code; no RFC reference implementation was copied. The known reference secret in tests is public test data, not a deployed secret.

- Secrets are encrypted with AES-256-GCM under `OUTBOX_KEY` (which also protects queued mail). Preserve and back up this key separately from the database. Losing it makes enrolled authenticators unreadable; password reset does not repair that.
- Recovery values have 96 random bits, are stored as user-bound SHA-256 digests, and are consumed transactionally.
- The password-stage challenge has a separate HttpOnly, SameSite=Lax cookie (`__Host-jesusseat-mfa; Secure` in production), a hashed server token, its own CSRF value, five-minute expiry and five-attempt limit. Failed attempts commit their counters.
- Successful factor verification consumes the challenge and returns a full session cookie plus a separate challenge-clearing cookie. The HTTP server preserves both Set-Cookie headers.
- A challenge is bound to the current password hash version. Recovery/password changes also invalidate outstanding challenges and pending enrollment.
- Authenticator counters, recovery consumption, session rotation and audit records commit together. A failed audit rolls back security changes.
- Enrollment/status/recovery management routes require the existing account session and ordinary origin/CSRF protections. Status never exposes the seed or recovery values.

Current limits are per-account/per-IP application controls on the existing single-instance database. Trusted-edge client-IP handling, independent security review, phishing-resistant options, security monitoring, mandatory MFA policy and recovery support procedures remain deployment/launch tasks. Do not describe TOTP as phishing-resistant.

## References

- https://www.rfc-editor.org/rfc/rfc4226
- https://www.rfc-editor.org/rfc/rfc6238
