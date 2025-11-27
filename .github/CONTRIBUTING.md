<div align="center">
  <img src="https://raw.githubusercontent.com/VectoDE/VectoBeat/main/assets/images/logo.png" alt="VectoBeat Logo" width="200" />
  <h1>Contributing Guide</h1>
  <p>Thank you for your interest in improving VectoBeat! Our goal is to maintain a professional, observability-driven music bot that delights operators and listeners alike.</p>
</div>

<hr />

<h2>🌟 Contribution Principles</h2>
<ul>
  <li><strong>User Safety First:</strong> Never degrade playback quality, permissions, or diagnostics.</li>
  <li><strong>One Shared Env:</strong> Bot and control panel both read the root <code>.env</code>; avoid per-service env files.</li>
  <li><strong>Observability-Driven:</strong> New flows should emit logs or metrics so operators can see what changed.</li>
  <li><strong>Plan-Aware:</strong> Respect plan gates (queue caps, AI recommendations, concierge/success pod scopes).</li>
</ul>

<hr />

<h2>🧱 Project Architecture Overview</h2>
<table>
  <tr>
    <td width="50%">
      <h3>Core Directories</h3>
      <ul>
        <li><code>bot/src/main.py</code> – AutoShardedBot bootstrap.</li>
        <li><code>bot/src/commands/</code> – Slash suites (playback, queue, diagnostics, concierge, compliance, settings).</li>
        <li><code>bot/src/events/</code> – Lavalink listeners, queue sync, telemetry emitters.</li>
        <li><code>bot/src/services/</code> – Server settings, queue sync/telemetry, analytics export, concierge/success pod bridges.</li>
        <li><code>frontend/</code> – Next.js control panel (App Router), Prisma schema, API routes, and tests.</li>
        <li><code>scripts/</code> – Scenario harness, env validation, profiling helpers, failover checker.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Design Tenets</h3>
      <ul>
        <li>Branded embeds and precise error messaging.</li>
        <li>Typed configuration (Pydantic) with <code>.env</code> overrides.</li>
        <li>Slash commands grouped by capability; help/command reference stays in sync.</li>
        <li>Control panel bridges authenticated via bearer tokens.</li>
      </ul>
    </td>
  </tr>
</table>

<hr />

<h2>🚀 Getting Started</h2>
<ol>
  <li><strong>Fork &amp; Clone</strong>
    <pre><code>git clone https://github.com/VectoDE/VectoBeat.git
cd VectoBeat
git remote add upstream https://github.com/VectoDE/VectoBeat.git</code></pre>
  </li>
  <li><strong>Environment</strong>
    <pre><code>cp .env.example .env
python3 scripts/validate_env.py  # catches missing keys</code></pre>
  </li>
  <li><strong>Bot dev (Python 3.12)</strong>
    <pre><code>cd bot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
set -a && source ../.env && set +a
python -m src.main</code></pre>
  </li>
  <li><strong>Frontend dev (Node 20, port 3050)</strong>
    <pre><code>cd frontend
npm install
set -a && source ../.env && set +a
npm run dev -p 3050</code></pre>
  </li>
  <li><strong>Dependencies</strong> — start Redis/MySQL/Lavalink via `docker compose up -d` from repo root (see `docs/local_sandbox.md`).</li>
</ol>

<hr />

<h2>✅ Development Checklist</h2>
<table>
  <tr>
    <td width="50%">
      <h3>Before Coding</h3>
      <ul>
        <li>Confirm scope and acceptance criteria in an issue.</li>
        <li>Ensure Discord intents are enabled for your dev bot.</li>
        <li>Have Lavalink credentials and Redis/MySQL reachable (use Compose).</li>
      </ul>
    </td>
    <td width="50%">
      <h3>While Coding</h3>
      <ul>
        <li>Use <code>EmbedFactory</code> and reuse existing services/helpers.</li>
        <li>Keep plan gates intact (queue caps, AI recs, concierge/success pod scopes).</li>
        <li>Add docstrings/comments where behaviour is non-obvious.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>Before Committing</h3>
      <ul>
        <li><code>python -m compileall src</code> and <code>pytest -q</code> from <code>bot/</code>.</li>
        <li><code>npm run lint</code> and <code>npm run test:server-settings</code> from <code>frontend/</code>.</li>
        <li>Run the scenario harness if playback logic changed: <code>python scripts/run_scenarios.py bot/tests/scenarios/basic_queue.yaml</code>.</li>
        <li>Regenerate docs when applicable: <code>python scripts/generate_command_reference.py</code>, <code>npx -y @mermaid-js/mermaid-cli -i docs/system_architecture.mmd -o assets/images/architecture.png ...</code>.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Pull Request Expectations</h3>
      <ul>
        <li>Document user-facing changes (commands, control panel flows, settings) in README/docs.</li>
        <li>Provide testing evidence and screenshots for UI or embed changes.</li>
        <li>Mention code owners for impacted paths and keep commits logical.</li>
      </ul>
    </td>
  </tr>
</table>

<hr />

<h2>📄 Commit &amp; PR Standards</h2>
<ul>
  <li>Use conventional commit prefixes (<code>feat:</code>, <code>fix:</code>, <code>docs:</code>, <code>refactor:</code>, etc.).</li>
  <li>Keep PRs scoped; split large refactors or feature flags.</li>
  <li>Include before/after behaviour for playback, control-panel APIs, or runbooks.</li>
</ul>

<hr />

<h2>🏷️ Labels &amp; Priorities</h2>
<table>
  <tr>
    <td><code>priority:critical</code></td>
    <td>Playback, security, or data loss issues.</td>
  </tr>
  <tr>
    <td><code>priority:high</code></td>
    <td>User-facing regressions or infra instability.</td>
  </tr>
  <tr>
    <td><code>priority:normal</code></td>
    <td>Feature improvements, docs, UX enhancements.</td>
  </tr>
  <tr>
    <td><code>priority:low</code></td>
    <td>Refactors, tooling, internal clean-up.</td>
  </tr>
</table>

<hr />

<h2>🛡️ Code of Conduct</h2>
<p>VectoBeat follows the <a href="CODE_OF_CONDUCT.md">Contributor Covenant</a>. Respectful collaboration is non-negotiable. Report unacceptable behaviour to the maintainers immediately.</p>

<hr />

<h2>🧪 Continuous Integration</h2>
<ul>
  <li>GitHub Actions run lint/tests (`test.yml`), container builds (`build.yml`), docs guard (`docs.yml`), and release publishing (`deploy.yml`).</li>
  <li>PRs must pass required checks before merging; CI assumes the shared root `.env` pattern.</li>
</ul>

<hr />

<h2>🙌 Thank You</h2>
<p align="center">Every contribution—bug fix, diagnostic improvement, or documentation enhancement—helps VectoBeat remain the best music bot for professional operators. Thank you for investing your time and expertise!</p>
