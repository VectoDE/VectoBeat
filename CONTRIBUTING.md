<div align="center">
  <img src="https://raw.githubusercontent.com/VectoDE/VectoBeat/main/assets/images/logo.png" alt="VectoBeat Logo" width="200" />
  <h1>Contributing Guide</h1>
  <p>Thank you for your interest in improving VectoBeat! Our goal is to maintain a professional, observability-driven music bot that delights operators and listeners alike.</p>
</div>

<hr />

<h2>🌟 Contribution Principles</h2>
<ul>
  <li><strong>User Safety First:</strong> Changes must not compromise playback quality, permissions, or diagnostics.</li>
  <li><strong>Documentation Matters:</strong> Every new module or helper requires docstrings; commands must explain behaviour.</li>
  <li><strong>Observability-Driven:</strong> Features should expose metrics or logging so operators can monitor them.</li>
  <li><strong>Design Consistency:</strong> Respect the existing embed branding, slash command ergonomics, and configuration patterns.</li>
</ul>

<hr />

<h2>🧱 Project Architecture Overview</h2>
<table>
  <tr>
    <td width="50%">
      <h3>Core Directories</h3>
      <ul>
        <li><code>src/main.py</code> – AutoShardedBot entrypoint and lifecycle.</li>
        <li><code>src/commands/</code> – Slash command suites (voice, playback, queue, diagnostics).</li>
        <li><code>src/events/</code> – Lavalink event listeners, status rotation, global error handling.</li>
        <li><code>src/services/</code> – Lavalink and audio integration helpers.</li>
        <li><code>src/utils/</code> – Embed factory, pagination, logging utilities.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Design Tenets</h3>
      <ul>
        <li>Commands return branded embeds with actionable detail.</li>
        <li>Configuration is typed (Pydantic) with `.env` overrides.</li>
        <li>Diagnostics commands provide on-demand observability.</li>
        <li>Error surfaces use <code>UserFacingError</code> where appropriate.</li>
      </ul>
    </td>
  </tr>
</table>

<hr />

<h2>🚀 Getting Started</h2>
<ol>
  <li><strong>Fork &amp; Clone:</strong>
    <pre><code>git clone https://github.com/VectoDE/VectoBeat.git
cd VectoBeat
git remote add upstream https://github.com/VectoDE/VectoBeat.git</code></pre>
  </li>
  <li><strong>Create a Feature Branch:</strong>
    <pre><code>git checkout -b feature/my-enhancement</code></pre>
  </li>
  <li><strong>Set Up Environment:</strong>
    <pre><code>python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt</code></pre>
  </li>
  <li><strong>Configure Lavalink:</strong> Follow <a href="INSTALL_LAVALINK.md">INSTALL_LAVALINK.md</a> to run Lavalink locally or connect to a staging node.</li>
  <li><strong>Run the Bot:</strong>
    <pre><code>python -m src.main</code></pre>
  </li>
</ol>

<hr />

<h2>✅ Development Checklist</h2>
<table>
  <tr>
    <td width="50%">
      <h3>Before Coding</h3>
      <ul>
        <li>Open an issue or confirm an existing one.</li>
        <li>Align on scope, acceptance criteria, and diagnostics requirements.</li>
        <li>Ensure your Discord application has required intents.</li>
        <li>Obtain Lavalink credentials for testing.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>While Coding</h3>
      <ul>
        <li>Add docstrings to new modules, classes, helpers, and commands.</li>
        <li>Use <code>EmbedFactory</code> for any embed creation.</li>
        <li>Maintain the slash command UX (ephemeral vs. public, error messaging).</li>
        <li>Prefer typed helpers; avoid duplicating configuration logic.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>Before Committing</h3>
      <ul>
        <li>Run <code>python3 -m compileall src</code>.</li>
        <li>Test playback flows: <code>/play</code>, <code>/skip</code>, <code>/nowplaying</code>, <code>/queueinfo</code>.</li>
        <li>Exercise diagnostics: <code>/status</code>, <code>/lavalink</code>, <code>/voiceinfo</code>.</li>
        <li>Ensure README or docs are updated if behaviour changes.</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Pull Request Expectations</h3>
      <ul>
        <li>Provide a summary, testing evidence, and screenshots/gifs for UI changes.</li>
        <li>Link to the tracking issue and mention reviewers.</li>
        <li>Keep commits logical (squash noisy work-in-progress commits).</li>
      </ul>
    </td>
  </tr>
</table>

<hr />

<h2>📄 Commit &amp; PR Standards</h2>
<ul>
  <li>Use conventional commit prefixes (<code>feat:</code>, <code>fix:</code>, <code>docs:</code>, <code>refactor:</code>, etc.).</li>
  <li>Keep PRs scoped – split large changes into smaller reviews.</li>
  <li>Include before/after behaviour where relevant.</li>
</ul>

<hr />

<h2>🏷️ Labels &amp; Priorities</h2>
<table>
  <tr>
    <td><code>priority:critical</code></td>
    <td>Playback blockers or security issues.</td>
  </tr>
  <tr>
    <td><code>priority:high</code></td>
    <td>User-facing regressions, compatibility fixes.</td>
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
  <li>GitHub Actions (see <code>.github/workflows</code>) run syntax compilation, linting (if configured), and deployment packaging.</li>
  <li>PRs must pass all required checks before merging.</li>
</ul>

<hr />

<h2>🙌 Thank You</h2>
<p align="center">Every contribution—bug fix, diagnostic improvement, or documentation enhancement—helps VectoBeat remain the best music bot for professional operators. Thank you for investing your time and expertise!</p>
