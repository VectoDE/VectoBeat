import { marked } from "marked"

marked.setOptions({
  gfm: true,
  breaks: true,
})

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
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cbd5f5;">${intro}</p>`
    : ""
  const safeFooter =
    footer ||
    `You’re receiving this message because your Discord account is linked to VectoBeat or you subscribed to updates. If this looks unfamiliar, contact support and revoke access in Account → Privacy.`

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#060a18;padding:32px 0;font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;">
    <tr>
      <td align="center">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="background:#080d1b;border:1px solid #0f172a;border-radius:24px;overflow:hidden;box-shadow:0 30px 80px rgba(15,23,42,0.55);">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(135deg,#0b1224,#131c35);border-bottom:1px solid #0f172a;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="display:flex;align-items:center;gap:12px;">
                      <img src="${normalizedAppUrl}/icon.svg" alt="VectoBeat" width="44" height="44" style="display:block;border-radius:12px;background:#0b1224;padding:6px;border:1px solid #1f2937;" />
                      <div>
                        <div style="color:#e2e8f0;font-size:17px;font-weight:700;">VectoBeat</div>
                        <div style="color:#cbd5f5;font-size:12px;letter-spacing:0.02em;">Community Ops, automated</div>
                      </div>
                    </div>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <a href="${normalizedAppUrl}" style="color:#93c5fd;font-size:13px;text-decoration:none;font-weight:600;">Open dashboard ↗</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 16px;background:#080d1b;">
              <h1 style="margin:0 0 12px;font-size:24px;color:#f8fafc;line-height:1.3;">${title}</h1>
              ${safeIntro}
              <div style="background:#0a1224;border:1px solid #1f2a44;border-radius:18px;padding:22px;color:#e2e8f0;font-size:15px;line-height:1.8;">
                ${rendered}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;background:#080d1b;">
              <p style="margin:18px 0 8px;font-size:12px;color:#9ca3af;line-height:1.6;">${safeFooter}</p>
              <p style="margin:6px 0 0;font-size:11px;color:#6b7280;line-height:1.6;">
                VectoBeat • UplyTech • Worldwide operations<br/>
                Support: <a href="${normalizedAppUrl}/support-desk" style="color:#93c5fd;text-decoration:none;">support-desk</a> • Terms: <a href="${normalizedAppUrl}/terms" style="color:#93c5fd;text-decoration:none;">terms</a> • Privacy: <a href="${normalizedAppUrl}/privacy" style="color:#93c5fd;text-decoration:none;">privacy</a><br/>
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
