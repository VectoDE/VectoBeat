# Secure Coding Guidelines (Control Panel + Bot)

These guidelines apply to every service in the VectoBeat stack (Next.js control panel, Python bot, and supporting APIs).
They encode how we protect secrets, prevent injection, and harden the UI surface for enterprise customers.

## 1. Encryption & Secrets

1. **Encryption in transit**: All public traffic is terminated via TLS 1.2+ (managed by Cloudflare/TLS proxies). Bot ↔ Lavalink communication uses TLS certificates managed by the same PKI.
2. **Encryption at rest**: Databases and object storage sit on encrypted volumes (AES-256). Residency-specific keys (EU/US) are managed via AWS KMS/HSM and never leave their jurisdiction.
3. **Key derivation**: Use libsodium / Node `crypto` for symmetric operations. No custom crypto.
4. **Secret rotation**: Rotate Discord credentials, Stripe keys, SMTP credentials, and API signing secrets quarterly. Use Terraform/Secrets Manager → `.env` is a runtime artifact only. Scripts check timestamp of secrets and warn if older than 90 days.
5. **Hashing**: All API tokens are hashed with SHA-256 before storage. Never log raw tokens.

## 2. Authentication & Sessions

1. **Session storage**: Session hashes are HMAC’d and persisted in MySQL (`user_sessions`). Regenerate tokens on every login.
2. **Two-factor**: Enforce TOTP for privileged users (`security.loginAlerts`, `twoFactorEnabled`).
3. **Access logs**: Every login and token usage captures IP, user agent, geolocation, and session ID for forensics.

## 3. Rate Limiting & Abuse Prevention

1. **Per-session throttles**: Control panel writes pass through `lib/security.checkRateLimit` with adaptive thresholds. Increase aggressiveness on admin routes.
2. **Bot command throttling**: `QueueCommands` and `MusicControls` log `command_throttled` events, sending telemetry to the automation audit service.
3. **API**: Public endpoints such as `/api/external/queue` use token-bound quotas (10 req/s default) and log each call.

## 4. CSRF, CSP, & Browser Hardening

1. **CSRF**: All unsafe HTTP verbs require CSRF tokens (double submit cookie + header). Validate server-side before any mutation.
2. **CSP**: Apply strict CSP via `lib/security.getSecurityHeaders` to block inline scripts. Allow only required origins (self, Discord widget).
3. **X-Frame-Options**: `DENY` to prevent clickjacking.
4. **Referrer Policy**: `strict-origin-when-cross-origin` to avoid leaking guild IDs or tokens.

## 5. Input Validation & Output Encoding

1. Sanitize every string before storing: use `sanitizeInput` utility for panel forms (strip scripts, limit length).
2. Server-side validation via Zod/Pydantic for API payloads.
3. Escape user-supplied content in embeds and UI (React already handles HTML escaping, but never use `dangerouslySetInnerHTML` without sanitization).

## 6. Secret Handling in CI/CD

1. Secrets live in the root `.env` for local dev only. CI pulls from GitHub Actions secrets.
2. `scripts/validate_env.py` enforces presence of required secrets before boot.
3. Never commit `.env` or derived files; `.gitignore` blocks them.

## 7. Incident Response Hooks

1. Login alerts email/SMS the user when a new session is recorded.
2. Leak marking on API tokens auto-disables the token and notifies owners.
3. Residency attestations are signed with HMAC to detect tampering and keep auditors informed.

Review cadence: revisit after each major feature launch or when the threat model (see `docs/security/threat-model.md`) changes.
