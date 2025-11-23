# VectoBeat Threat Model (2025 Edition)

This document captures the current threat landscape for VectoBeat’s control panel, API, and bot runtime. It focuses on
high-value assets, trust boundaries, attacker motivations, and the technical controls we apply to keep those assets secure.

## 1. Assets & Stakeholders

| Asset | Description | Stakeholders | Impact if Compromised |
|-------|-------------|--------------|------------------------|
| Discord OAuth tokens / API tokens | Grants privileged access to the bot, automation actions, and developer APIs | Customers, internal SREs | Unauthorized queue automation, data exfiltration, impersonation |
| Billing + plan metadata | Drives entitlement checks, queue limits, and concierge gating | Finance, Customer Success | Incorrect billing, exposure of pricing, free-riding on premium features |
| Automation audit + compliance logs | Proof of system behaviour for audits, forensics, and success-pod escalations | Compliance, Legal, Enterprise customers | Loss of auditability, inability to prove compliance, tampering with evidence |
| Residency-limited data (EU-only / US-only workloads) | Customer data that must stay in a specific jurisdiction | Security, Legal, Enterprise customers | Regulatory penalties, SLA violations, reputational damage |
| Secrets (Discord tokens, Stripe keys, SMTP creds) | Underpin authentication and outbound notifications | Platform engineering | Bot disablement, fraudulent payments, spam |

## 2. Trust Boundaries & Attack Surfaces

| Boundary | Threats | Existing Controls |
|----------|---------|-------------------|
| Discord OAuth → control panel session issuance | Token replay, session fixation, leaked OAuth codes | Short-lived login tokens, HMAC-signed sessions, MFA enforcement, login alerts + access log geolocation |
| Control panel → API routes | CSRF, rate-limit evasion, stale secrets, insecure headers | Double-submit CSRF tokens, per-session rate limiters, quarterly secret rotation runbook, strict CSP via `lib/security.ts:getSecurityHeaders` |
| Bot ↔ Lavalink ↔ media sources | MITM, command injection, playback hijacking | TLS everywhere, command scopes, signed Lavalink auth, command throttle logging through AutomationAuditService |
| Developer API tokens | Scope abuse, leaked tokens, unbounded lifetime | Granular scopes, forced TTL policies, leak flagging, email alerts, attestation that tokens limited per plan |
| Residency-specific storage (EU/US clusters) | Data drift across regions, unauthorized admin access | Residency proofs + attestations, replication policies, access logs tied to guild owner region, HSM-backed encryption at rest |

## 3. Threat Scenarios & Mitigations

### 3.1 Compromised API Token
1. Attacker steals a production API token from CI logs.
2. Attempts to call `/api/external/queue`.

Mitigations:
- Tokens hashed at rest; leaks flagged automatically with forced disable.
- TTL policy enforced per guild; expired tokens cannot be used.
- Access logs capture IP, user agent, and endpoint for forensics.
- Token usage triggers security alerts for admins.

### 3.2 Malicious Panel Session (CSRF / Clickjacking)
1. User visits a malicious site that tries to POST to `/api/control-panel/server-settings`.
2. Without CSRF, attacker could change queue limits or rotate tokens.

Mitigations:
- CSRF tokens required for all unsafe methods.
- `X-Frame-Options: DENY` + strict CSP prevents framing.
- Rate limiting and anomaly detection for sudden burst of privileged calls.

### 3.3 Residency Drift
1. Database failover replicates EU data into a US region.
2. Customer audits the residency log and demands proof.

Mitigations:
- Residency proofs + signed attestations (HMAC) provided via control panel.
- Replication policies documented per region.
- Automation ensures only EU-cleared staff can access EU clusters (documented as part of attestation).

### 3.4 Secret Leakage
1. A developer commits `.env` with live secrets.
2. Secrets rotate slowly and remain exposed.

Mitigations:
- Secure coding guidelines enforce quarterly rotation and Just-In-Time access.
- CI checks for plaintext secrets.
- `scripts/validate_env.py` ensures the runtime fails fast if secrets missing → encourages using secret managers.

### 3.5 Abuse of Automation Actions
1. Malicious moderator spams automation commands.
2. Tries to drain queues or DoS other shards.

Mitigations:
- Automation actions streamed to `/api/control-panel/security/audit`.
- Rate-limited commands with logging of actor, shard, and metadata.
- Alerts route to on-call if throttling triggers repeatedly (`command_throttled` audit events).

## 4. Remaining Risks & Follow-Ups

| Risk | Status | Next Step |
|------|--------|-----------|
| Insider misuse of compliance exports | Medium | Layer in per-export approvals + customer notification hooks |
| Automated detection of residency drift | Medium | Wire residency proofs into monitoring so drift triggers Slack/PagerDuty |
| Bot command impersonation in shared environments | Low | Continue shipping scoped slash command permissions and per-guild allow lists |

Document owner: **Security Engineering (Mara Weiss)** — update quarterly or after any material architecture change.
