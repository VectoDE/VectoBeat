/**
 * Custom node:test reporter that generates a rich, self-contained HTML report
 * and a JSON summary.
 *
 * Usage:
 *   node --test --reporter=./tests/reporter.mjs tests/*.test.ts
 *   OR via npm:
 *   npm run test:report
 *
 * Outputs:
 *   test-report/report.html  – richly styled, human-readable HTML report
 *   test-report/results.json – machine-readable JSON summary
 */

import fs from "node:fs"
import path from "node:path"
import { Transform } from "node:stream"

const OUT_DIR = path.resolve("test-report")

// ─── Collect all events ────────────────────────────────────────────────────────

const results = {
    suiteStart: null,
    tests: [],
    passes: 0,
    failures: 0,
    skips: 0,
    totalDurationMs: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
}

// ─── HTML template ─────────────────────────────────────────────────────────────

const statusBadge = (status) => {
    const colors = { pass: "#22c55e", fail: "#ef4444", skip: "#f59e0b" }
    const icons = { pass: "✅", fail: "❌", skip: "⚠️" }
    const bg = colors[status] ?? "#6b7280"
    return `<span style="background:${bg};color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700;">${icons[status] ?? "?"} ${status.toUpperCase()}</span>`
}

const escapeHtml = (str) =>
    String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")

const renderTest = (t, idx) => {
    const durationMs = t.details?.duration_ms ?? 0
    const status = t.details?.error ? "fail" : t.skip ? "skip" : "pass"
    const err = t.details?.error
        ? `<pre class="error">${escapeHtml(t.details.error.message ?? JSON.stringify(t.details.error))}\n${escapeHtml(t.details.error.stack ?? "")}</pre>`
        : ""
    return `
  <tr class="test-row ${status}">
    <td class="idx">${idx + 1}</td>
    <td class="name">${escapeHtml(t.name)}</td>
    <td class="badge">${statusBadge(status)}</td>
    <td class="duration">${durationMs.toFixed(1)} ms</td>
  </tr>
  ${err ? `<tr class="error-row"><td colspan="4">${err}</td></tr>` : ""}`
}

const buildHtml = () => {
    const total = results.tests.length
    const passRate = total > 0 ? ((results.passes / total) * 100).toFixed(1) : "0.0"
    const passColor = results.failures > 0 ? "#ef4444" : "#22c55e"

    const testRows = results.tests.map((t, i) => renderTest(t, i)).join("\n")

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>VectoBeat – Test Report</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;line-height:1.6;padding:40px 20px}
    h1{font-size:28px;font-weight:800;margin-bottom:4px;color:#f8fafc}
    .subtitle{color:#94a3b8;font-size:14px;margin-bottom:32px}
    .summary{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:32px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px 28px;min-width:140px;text-align:center}
    .card .val{font-size:36px;font-weight:800}
    .card .lbl{font-size:12px;color:#94a3b8;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
    .pass-rate .val{color:${passColor}}
    .passes .val{color:#22c55e}
    .failures .val{color:#ef4444}
    .skips .val{color:#f59e0b}
    .totals .val{color:#60a5fa}
    table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155}
    thead tr{background:#0f172a}
    th{padding:12px 16px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b}
    td{padding:10px 16px;border-top:1px solid #1e293b}
    tr.test-row{background:#1e293b;transition:background .15s}
    tr.test-row:hover{background:#263148}
    tr.fail td{background:#2d1515 !important}
    tr.error-row td{padding:0 16px 12px;background:#2d1515 !important;border-top:none}
    pre.error{background:#1a0a0a;color:#fca5a5;padding:12px 16px;border-radius:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;border:1px solid #7f1d1d}
    .idx{width:48px;color:#475569;font-size:13px}
    .duration{width:100px;text-align:right;color:#64748b;font-size:13px}
    .badge{width:120px}
    .footer{margin-top:24px;color:#475569;font-size:12px}
    .badge-bar{display:flex;gap:8px;margin-bottom:24px;align-items:center;flex-wrap:wrap}
  </style>
</head>
<body>
  <h1>🎵 VectoBeat – Test Report</h1>
  <p class="subtitle">Generated: ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · Duration: ${(results.totalDurationMs / 1000).toFixed(2)}s</p>

  <div class="summary">
    <div class="card pass-rate"><div class="val">${passRate}%</div><div class="lbl">Pass Rate</div></div>
    <div class="card totals"><div class="val">${total}</div><div class="lbl">Total Tests</div></div>
    <div class="card passes"><div class="val">${results.passes}</div><div class="lbl">Passed</div></div>
    <div class="card failures"><div class="val">${results.failures}</div><div class="lbl">Failed</div></div>
    <div class="card skips"><div class="val">${results.skips}</div><div class="lbl">Skipped</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Test Name</th>
        <th>Status</th>
        <th style="text-align:right">Duration</th>
      </tr>
    </thead>
    <tbody>
      ${testRows || "<tr><td colspan='4' style='text-align:center;color:#64748b;padding:32px'>No tests recorded.</td></tr>"}
    </tbody>
  </table>

  <p class="footer">VectoBeat Frontend Test Suite · node:test · ${results.finishedAt ?? results.startedAt}</p>
</body>
</html>`
}

// ─── Reporter Transform Stream ─────────────────────────────────────────────────

export default class HtmlReporter extends Transform {
    constructor() {
        super({ objectMode: true })
    }

    _transform(event, _encoding, callback) {
        try {
            switch (event.type) {
                case "test:pass":
                    results.tests.push(event.data)
                    results.passes++
                    break
                case "test:fail":
                    results.tests.push(event.data)
                    results.failures++
                    break
                case "test:skip":
                    results.tests.push(event.data)
                    results.skips++
                    break
                case "test:diagnostic":
                    // Duration from summary lines like "tests 10, pass 9, fail 1"
                    break
                case "test:summary": {
                    if (event.data?.duration_ms) {
                        results.totalDurationMs = event.data.duration_ms
                    }
                    break
                }
                default:
                    break
            }
        } catch {
            // never let reporter errors abort the run
        }
        callback()
    }

    _flush(callback) {
        results.finishedAt = new Date().toISOString()
        if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

        const html = buildHtml()
        fs.writeFileSync(path.join(OUT_DIR, "report.html"), html, "utf8")
        fs.writeFileSync(
            path.join(OUT_DIR, "results.json"),
            JSON.stringify(
                {
                    startedAt: results.startedAt,
                    finishedAt: results.finishedAt,
                    totalDurationMs: results.totalDurationMs,
                    total: results.tests.length,
                    passes: results.passes,
                    failures: results.failures,
                    skips: results.skips,
                    passRate: results.tests.length > 0
                        ? ((results.passes / results.tests.length) * 100).toFixed(1) + "%"
                        : "0.0%",
                    tests: results.tests.map((t) => ({
                        name: t.name,
                        status: t.details?.error ? "fail" : t.skip ? "skip" : "pass",
                        durationMs: t.details?.duration_ms ?? 0,
                        error: t.details?.error
                            ? { message: t.details.error.message, stack: t.details.error.stack }
                            : null,
                    })),
                },
                null,
                2,
            ),
            "utf8",
        )

        const passColor = results.failures > 0 ? "\x1b[31m" : "\x1b[32m"
        const reset = "\x1b[0m"
        process.stdout.write(
            `\n${passColor}📊 Test report written → test-report/report.html${reset}\n` +
            `   ✅ ${results.passes} passed  ❌ ${results.failures} failed  ⚠️  ${results.skips} skipped\n`,
        )
        callback()
    }
}
