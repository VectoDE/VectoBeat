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
    "You are receiving this message because your Discord account is linked to VectoBeat. Reach out to support if anything looks unfamiliar."

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#010417;padding:32px 0;font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:#050b1a;border:1px solid #111827;border-radius:24px;overflow:hidden;box-shadow:0 30px 80px rgba(15,23,42,0.55);">
            <tr>
              <td style="padding:32px;text-align:center;">
                <img src="${normalizedAppUrl}/icon.svg" alt="VectoBeat" width="64" height="64" style="display:block;margin:0 auto 16px;" />
                <h1 style="margin:0;font-size:24px;color:#f8fafc;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                ${safeIntro}
                <div style="background:#030712;border:1px solid #111827;border-radius:18px;padding:24px;color:#e2e8f0;font-size:15px;line-height:1.8;">
                  ${rendered}
                </div>
                <p style="margin:24px 0 0;font-size:12px;color:#64748b;line-height:1.6;">${safeFooter}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `
}
