<div align="center">
  <img src="https://raw.githubusercontent.com/VectoDE/VectoBeat/main/assets/images/logo.png" alt="VectoBeat Logo" width="200" />
  <h1>Support Runbook</h1>
  <p><strong>Pathways for getting help, triaging incidents, and sharing diagnostics.</strong></p>
</div>

<hr />

<h2>🧭 Start Here</h2>
<ol>
  <li><strong>Check the docs:</strong> Review <code>README.md</code> plus the detailed guides under <code>docs/</code> (architecture, runbooks, local sandbox).</li>
  <li><strong>Search discussions &amp; issues:</strong> Avoid duplicates by scanning GitHub Issues and Discussions for similar reports.</li>
  <li><strong>Verify your version:</strong> Reproduce on the latest commit of <code>main</code> or the most recent tagged release.</li>
</ol>

<hr />

<h2>📞 Contact Matrix</h2>
<table>
  <thead>
    <tr>
      <th>Channel</th>
      <th>Use For</th>
      <th>SLA (Business Hours)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href="https://discord.gg/DtHPAEHxZk">Discord Support</a></td>
      <td>Live troubleshooting, roadmap Q&amp;A, architecture coaching</td>
      <td>Typical response &lt; 2h</td>
    </tr>
    <tr>
      <td>GitHub Issues</td>
      <td>Bugs, feature requests, and documentation gaps (use templates)</td>
      <td>Initial triage &lt; 48h</td>
    </tr>
    <tr>
      <td>timhauke@uplytech.de</td>
      <td>Confidential vulnerability disclosure (see <code>SECURITY.md</code>)</td>
      <td>Acknowledgement &lt; 24h</td>
    </tr>
  </tbody>
</table>

<hr />

<h2>🧰 Diagnostic Bundle Checklist</h2>
<ul>
  <li>Exact git commit SHA or release tag.</li>
  <li>Deployment mode (Docker, docker-compose, bare metal, Kubernetes) + region.</li>
  <li>Discord guild count, shard count, and whether AutoShardedBot is enabled.</li>
  <li>Lavalink version, plugin list, transport protocol (HTTP/WS, TLS).</li>
  <li>Relevant <code>config.yml</code> and `.env` snippets (scrub secrets).</li>
  <li>Console logs and Lavalink logs with timestamps and correlation IDs.</li>
  <li>Slash command payloads or screenshots of embeds where the issue reproduces.</li>
</ul>

<hr />

<h2>🩺 Self-Service Triage</h2>
<table>
  <tr>
    <td width="50%">
      <h3>Playback Issues</h3>
      <ul>
        <li>Run <code>/status</code> and <code>/lavalink</code>; attach embed outputs.</li>
        <li>Verify Lavalink node health via <code>curl -H \"Authorization: $LAVALINK_PASSWORD\" http://&lt;host&gt;:&lt;port&gt;/version</code> or the failover checker in <code>scripts/lavalink-failover-check.mjs</code>.</li>
        <li>Use <code>scripts/run_scenarios.py</code> to reproduce queue operations.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Deployment / Ops</h3>
      <ul>
        <li>Execute <code>docker compose ps</code> and share container health.</li>
        <li>Inspect `logs/bot.log` and `logs/lavalink.log` for stack traces.</li>
        <li>Confirm secrets are loaded (`printenv | grep VECTOBEAT`).</li>
      </ul>
    </td>
  </tr>
</table>

<hr />

<h2>🚀 Escalation Ladder</h2>
<ol>
  <li><strong>Community Support:</strong> Discord thread with diagnostics + reproduction steps.</li>
  <li><strong>GitHub Issue:</strong> If the problem requires a code change, open a templated issue and link the Discord context.</li>
  <li><strong>Maintainer Escalation:</strong> Ping <code>@VectoDE/maintainers</code> on the issue for blockers or incident-level events.</li>
</ol>

<p align="center"><em>High-quality diagnostics accelerate fixes. Thank you for keeping requests actionable and sanitized.</em></p>
