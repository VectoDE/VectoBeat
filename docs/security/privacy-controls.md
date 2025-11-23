# Privacy-by-Design Controls

VectoBeat embeds privacy protections directly into the control panel and bot runtime. This document summarizes the data
retention policy, delete/export workflows, and localized consent notices that ship with the Enterprise stack.

## 1. Data Retention Policy

| Data Domain | Default Retention | Controls | Notes |
|-------------|------------------|----------|-------|
| **Queue telemetry & automation actions** | 30 days rolling window | Admins can shorten the window via support or delete per guild using the `/api/control-panel/security/audit` endpoint. | This log feeds the automation audit UI and is redacted automatically after 30 days. |
| **Access logs (logins + API token usage)** | 90 days | Guild owners can purge entries via `/api/control-panel/security/access` with `DELETE` semantics (scheduled Q3). Until then, support can wipe per guild. | Records IP + location for compliance investigations. |
| **User sessions & login events** | 30 days since last activity | Revoked automatically when the session expires or the user hits “Sign out of other sessions” in `/account`. | Tracks location for login alerts. |
| **Residency attestations & compliance exports** | Stored permanently in the customer’s storage location | Downloads provided via the control panel; we retain only audit hashes. | Customers can delete exports on their own storage; control panel keeps hash references for integrity checks. |
| **Bot playback history / playlists** | Until the guild deletes playlists or disables history sync | `/api/control-panel/server-settings` exposes toggles per guild. | Backed by Redis/Postgres depending on plan. |

### Custom Retention
- Enterprise support can override the defaults per guild via support desk or future UI (backed by `listSecurityAccessLogs` and automation audit cleanup jobs).
- Customers may request hard deletion of all data via `/api/account/privacy` (see section 2).

## 2. Delete & Export Workflows

### Self-Serve Exports
- **Account exports**: Users can download their personal data via `/api/account/export` (available in the Account page, backed by the existing endpoint). The export bundles profile metadata, active sessions, linked accounts, and preferences.
- **Guild audit exports**: `/api/control-panel/security/audit` (JSONL/CSV) and `/api/control-panel/security/access` provide compliance-grade extracts with IP/actor metadata.
- **Residency attestation downloads**: `/api/control-panel/security/residency/:id/attestation` ships signed JSON specifying the hosting region, data centers, encryption posture, and HMAC verification.

### Deletion Workflows
- **Account deletion**: `/api/account/privacy` exposes a workflow to request deletion. Logic is enforced server-side in `frontend/app/api/account/privacy/route.ts` which schedules deletes, removes sessions, and revokes tokens.
- **Guild data purge**: Administrators can revoke API tokens (`/api/control-panel/api-tokens`) and wipe automation audit history or queue telemetry by opening a support ticket (automation scheduled for follow-up release).
- **Login sessions**: `/api/account/security/sessions` allows users to revoke individual sessions, clearing their access logs for the affected session IDs.

All deletion requests are logged with a correlation ID and routed through the security desk to ensure SLA compliance.

## 3. Localized Consent Notices

### Cookie & Tracking
- The `CookieBanner` component (`frontend/components/cookie-banner.tsx`) renders localized consent copy (EN/DE) with explicit opt-in for analytics cookies. Consent status is persisted per locale.

### Legal Docs
- The control panel links localized Privacy, Imprint, and Terms pages (`/privacy`, `/imprint`, `/terms`) surfaced via the footer and 2FA/login flows.
- Consent text is injected into the checkout flow for EU billing addresses, ensuring compliance with GDPR Art. 13.

### Marketing Opt-Out
- `/api/account/preferences` stores marketing preferences (email updates, SMS alerts). Forms default to “off” for EU locales.

## 4. Engineering Checklist
1. Any new data store must declare its retention strategy and deletion API before shipping.
2. All exports must include metadata describing source endpoint and timestamp so customers can prove provenance.
3. Consent notices must be localized (EN/DE initially) and surfaced before enabling optional telemetry.
4. Threat model & secure coding docs should be updated whenever the privacy surface changes.

Document owner: **Privacy Engineering (Nora Günther)** — review every quarter or when a privacy feature ships.
