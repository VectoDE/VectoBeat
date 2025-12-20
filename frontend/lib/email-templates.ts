import { marked } from "marked"

marked.setOptions({
  gfm: true,
  breaks: true,
})

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

interface EmailTemplateOptions {
  title: string
  intro?: string
  markdown: string
  footer?: string
}

const appUrl =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
const normalizedAppUrl = appUrl.replace(/\/$/, "")

export const renderMarkdownEmail = ({ title, intro, markdown, footer }: EmailTemplateOptions) => {
  const rendered = marked.parse(markdown)
  const safeIntro = intro
    ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#475569;">${escapeHtml(
        intro
      )}</p>`
    : ""
  const safeFooter =
    footer ||
    `You’re receiving this message because your Discord account is linked to VectoBeat or you subscribed to updates. If this looks unfamiliar, contact support and revoke access in Account → Privacy.`

  const safeTitle = escapeHtml(title)

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e2e8f0;padding:32px 0;font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;">
    <tr>
      <td align="center">
        <table role="presentation" width="720" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,0.18);">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#1e293b);border-bottom:1px solid #0f172a;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="display:flex;align-items:center;gap:14px;">
                      <div style="width:48px;height:48px;border-radius:14px;background:#0b1224;border:1px solid #1f2937;display:flex;align-items:center;justify-content:center;">
                        <img src="${normalizedAppUrl}/favicon.ico" alt="VectoBeat" width="28" height="28" style="display:block;" />
                      </div>
                      <div>
                        <div style="color:#e2e8f0;font-size:18px;font-weight:800;">VectoBeat</div>
                        <div style="color:#cbd5f5;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;">Invoice template styling</div>
                      </div>
                    </div>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <div style="display:flex;align-items:flex-end;justify-content:flex-end;gap:10px;">
                      <div style="text-align:right;">
                        <p style="margin:0;color:#cbd5f5;font-size:11px;letter-spacing:0.32em;text-transform:uppercase;">Notice</p>
                        <p style="margin:4px 0 0;color:#e2e8f0;font-size:20px;font-weight:700;">${safeTitle}</p>
                      </div>
                      <span style="display:inline-block;padding:8px 12px;border-radius:9999px;background:#0b1224;border:1px solid #1f2937;color:#e5e7eb;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                        Update
                      </span>
                    </div>
                    <div style="margin-top:10px;">
                      <a href="${normalizedAppUrl}" style="color:#93c5fd;font-size:13px;text-decoration:none;font-weight:600;">Open dashboard ↗</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;background:#ffffff;">
              <div style="border-left:4px solid #111827;background:linear-gradient(120deg,#f8fafc,#eef2ff);border-radius:16px;padding:20px 22px 18px;">
                <h1 style="margin:0 0 10px;font-size:24px;color:#0f172a;line-height:1.3;">${safeTitle}</h1>
                ${safeIntro}
                <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 20px;color:#0f172a;font-size:15px;line-height:1.8;box-shadow:0 10px 30px rgba(148,163,184,0.25);">
                  ${rendered}
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 10px;font-size:12px;color:#6b7280;line-height:1.7;">${safeFooter}</p>
              <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;line-height:1.6;">
                VectoBeat • UplyTech • Worldwide operations<br/>
                Support: <a href="${normalizedAppUrl}/support-desk" style="color:#2563eb;text-decoration:none;">support-desk</a> • Terms: <a href="${normalizedAppUrl}/terms" style="color:#2563eb;text-decoration:none;">terms</a> • Privacy: <a href="${normalizedAppUrl}/privacy" style="color:#2563eb;text-decoration:none;">privacy</a><br/>
                If you prefer not to receive these messages, adjust preferences in Account → Privacy or contact support to unsubscribe.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `
}
