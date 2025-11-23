# Compliance Export Jobs (Scheduled + On-Demand)

VectoBeat now ships a reference job that runs daily/hourly to pull compliance exports (queue actions, moderation events, billing entries) and deliver the encrypted payloads to secure storage (S3 or SFTP). This workflow reuses the existing control-panel compliance API so there is a single, audited source of truth.

## 1. Exports Available

| Type | Endpoint | Format | Notes |
|------|----------|--------|-------|
| Queue actions | `/api/control-panel/compliance/export?type=queue` | JSONL / CSV | Behind plan gate, includes queue trims, automation events, metadata |
| Moderation events | `/api/control-panel/compliance/export?type=moderation` | JSONL / CSV | Captures moderation audit log for compliance desks |
| Billing entries | `/api/control-panel/compliance/export?type=billing` | JSONL / CSV | Mirrors Stripe invoices + entitlements for finance audits |

On-demand exports remain available inside the Security & Compliance Desk UI. The scheduled job simply automates the fetch + delivery flow.

## 2. Scheduled Job Script

Path: `scripts/compliance-export-job.mjs`

### Capabilities

- Authenticates with a service-account bearer token (`COMPLIANCE_EXPORT_BEARER`) and the target guild/discord IDs.
- Fetches queue/moderation/billing exports sequentially in JSONL (or CSV, configurable).
- Encrypts each payload using AES-256-GCM with a static 32-byte key stored in `COMPLIANCE_ENCRYPTION_KEY`.
- Writes encrypted metadata to `compliance-exports/<guildId>/timestamp-type.jsonl.enc.json`.
- Delivers the encrypted file to either:
  - **AWS S3** via the AWS CLI, forcing `--sse AES256` so at-rest encryption is guaranteed.
  - **SFTP** via the system `sftp` client using SSH key-based auth.
  - **Local** only, if `COMPLIANCE_DELIVERY_MODE=local`.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `COMPLIANCE_EXPORT_BASE_URL` | Base URL for the control panel (e.g., `https://panel.example.com`). |
| `COMPLIANCE_EXPORT_BEARER` | Bearer token for the service account hitting the API. |
| `COMPLIANCE_EXPORT_GUILD_ID` / `COMPLIANCE_EXPORT_DISCORD_ID` | Identify which guild’s exports to pull and the acting Discord user ID. |
| `COMPLIANCE_ENCRYPTION_KEY` | 32-byte base64/hex key for AES-256-GCM encryption. |
| `COMPLIANCE_EXPORT_TYPES` | Optional comma-separated list of export types (default: `queue,moderation,billing`). |
| `COMPLIANCE_DELIVERY_MODE` | `local`, `s3`, or `sftp`. |
| `COMPLIANCE_S3_BUCKET`, `COMPLIANCE_S3_REGION`, `COMPLIANCE_S3_PREFIX` | Required when `DELIVERY_MODE=s3`. Uses `aws s3 cp … --sse AES256`. |
| `COMPLIANCE_SFTP_HOST`, `COMPLIANCE_SFTP_USER`, `COMPLIANCE_SFTP_IDENTITY_FILE`, `COMPLIANCE_SFTP_PORT`, `COMPLIANCE_SFTP_PATH` | Required when `DELIVERY_MODE=sftp`. Script calls `sftp -i … -b …`. |

### Cron Example

```
0 2 * * * /usr/bin/node /srv/vectobeat/scripts/compliance-export-job.mjs >> /var/log/compliance-export.log 2>&1
```

Set `COMPLIANCE_EXPORT_TYPES=queue,moderation,billing` for nightly exports, or schedule per-type jobs if retention windows differ.

## 3. On-Demand Secure Delivery

1. Control panel UI still allows administrators to download JSONL/CSV files directly with IP/logging metadata.
2. Residency attestations maintain integrity via HMAC signatures (`/api/control-panel/security/residency/:id/attestation`).
3. Customers who prefer direct SFTP uploads can point the script at their hardened bastion or ingest account.

## 4. Encryption & Integrity

- Each encrypted export contains `version`, `guildId`, `type`, `format`, `createdAt`, and the base64-encoded `iv`, `authTag`, `ciphertext`.
- Downstream systems must base64-decode and run AES-256-GCM decryption using the same key. The integrity check fails if the file is tampered with.
- S3 uploads add another layer of encryption using SSE-S3 (`--sse AES256`). SFTP transfers rely on SSH key pairs stored in a secure vault.

## 5. Troubleshooting

- Set `COMPLIANCE_EXIT_ON_FAILURE=true` to force the job to exit non-zero if any export fails.
- Ensure the AWS CLI and `sftp` binaries are available on the worker node; the script shells out to them.
- Audit logs for each fetch + upload appear in the Security & Compliance Desk, keeping the scheduled job transparent.
