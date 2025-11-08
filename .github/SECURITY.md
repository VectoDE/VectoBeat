<div align="center">
  <img src="https://raw.githubusercontent.com/VectoDE/VectoBeat/main/assets/images/logo.png" alt="VectoBeat Logo" width="200" />
  <h1>Security &amp; Responsible Disclosure</h1>
  <p>Enterprise-ready guidance for reporting vulnerabilities, shipping patches, and operating VectoBeat securely.</p>
</div>

<hr />

<h2>🔐 Supported Release Channels</h2>
<table>
  <thead>
    <tr>
      <th>Channel</th>
      <th>Examples</th>
      <th>Support Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>main</strong></td>
      <td>Latest commit on <code>main</code></td>
      <td>✅ Full support</td>
    </tr>
    <tr>
      <td><strong>Tagged Releases</strong></td>
      <td><code>vX.Y.Z</code> semver tags announced in the README</td>
      <td>✅ Supported until superseded</td>
    </tr>
    <tr>
      <td><strong>Forks / Custom Builds</strong></td>
      <td>Self-maintained patches, private plugins</td>
      <td>⚠️ Best-effort triage only</td>
    </tr>
  </tbody>
</table>

<p>Reproducible reports must target the latest commit on <code>main</code> or the most recent supported tag. Heavily modified forks may require you to maintain your own patch.</p>

<hr />

<h2>🚨 Reporting Workflow</h2>
<ol>
  <li><strong>Keep reports private.</strong> Do not open public issues or discussions for vulnerabilities.</li>
  <li><strong>Contact the security desk:</strong>
    <ul>
      <li>Email: <a href="mailto:timhauke@uplytech.de">timhauke@uplytech.de</a></li>
      <li>Discord: DM any maintainer in <a href="https://discord.gg/DtHPAEHxZk">VectoBeat Support</a></li>
    </ul>
  </li>
  <li><strong>Provide actionable evidence:</strong>
    <ul>
      <li>Affected version, deployment method, and configuration snippets.</li>
      <li>Step-by-step reproduction (slash commands, payloads, API calls).</li>
      <li>Impact assessment (token leak, playback disruption, privilege escalation, etc.).</li>
      <li>Logs or proof-of-concept scripts (sanitize secrets beforehand).</li>
    </ul>
  </li>
  <li><strong>Encrypt if needed.</strong> Request a secure upload location for large files or encrypted archives.</li>
</ol>

<p><strong>Response targets:</strong></p>
<table>
  <thead>
    <tr>
      <th>Severity</th>
      <th>Examples</th>
      <th>Ack SLA</th>
      <th>Fix / Advisory Target</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Critical</strong></td>
      <td>Token leakage, RCE, auth bypass</td>
      <td>&lt; 24h</td>
      <td>&lt; 7 days</td>
    </tr>
    <tr>
      <td><strong>High</strong></td>
      <td>Privilege escalation, data exposure, playback outage across guilds</td>
      <td>&lt; 48h</td>
      <td>&lt; 14 days</td>
    </tr>
    <tr>
      <td><strong>Medium</strong></td>
      <td>Information disclosure without secrets, DoS requiring unusual configuration</td>
      <td>&lt; 72h</td>
      <td>&lt; 30 days</td>
    </tr>
    <tr>
      <td><strong>Low</strong></td>
      <td>Best-practice gaps, low-impact configuration bugs</td>
      <td>&lt; 5 business days</td>
      <td>As scheduled</td>
    </tr>
  </tbody>
</table>

<hr />

<h2>🧪 Reproduction &amp; Verification Checklist</h2>
<ul>
  <li>Capture the exact git commit SHA and bot build metadata.</li>
  <li>List guild count, shard count, and hosting environment (Docker, bare metal, Kubernetes).</li>
  <li>Share relevant `config.yml` excerpts and `.env` variables with secrets redacted.</li>
  <li>Include Lavalink node version, enabled plugins, and whether SSL is enforced.</li>
  <li>Attach sanitized Discord interaction IDs or trace IDs to correlate logs.</li>
</ul>

<hr />

<h2>🛡️ Hardening Recommendations</h2>
<table>
  <tr>
    <td width="50%">
      <h3>Identity &amp; Secrets</h3>
      <ul>
        <li>Rotate Discord tokens, Lavalink credentials, and Redis passwords at least quarterly.</li>
        <li>Store secrets in a vault (1Password, AWS Secrets Manager, etc.) instead of `.env` committed files.</li>
        <li>Enable Discord application presence and command auditing to detect unauthorized usage.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Infrastructure</h3>
      <ul>
        <li>Bind Lavalink and Redis to private networks; never expose unauthenticated ports to the internet.</li>
        <li>Force TLS for Lavalink ↔️ bot communication when deploying across hosts.</li>
        <li>Run `docker scan` or `trivy` on container images prior to promotion.</li>
      </ul>
    </td>
  </tr>
</table>

<hr />

<h2>📦 Dependency &amp; CI Hygiene</h2>
<ul>
  <li>Dependabot (`.github/dependabot.yml`) raises weekly PRs for pip, Docker, and GitHub Actions ecosystems.</li>
  <li>The `security` GitHub Actions workflow executes static analysis and dependency audits on every push.</li>
  <li>When adding new dependencies, run <code>pip install --upgrade -r requirements.txt</code>, regenerate lock files if applicable, and capture the reasoning in your PR.</li>
</ul>

<hr />

<p align="center"><em>Thank you for partnering with us to keep the VectoBeat community safe.</em></p>
