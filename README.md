<div align="center">
  <img src="https://raw.githubusercontent.com/VectoDE/VectoBeat/main/assets/images/logo.png" alt="VectoBeat Logo" width="280" />
  <p style="font-size: 1.2rem;"><strong>Music Bot for Discord</strong></p>
  <p style="max-width: 640px;">
    VectoBeat delivers premium audio playback, plan-aware control panel workflows, concierge/success pod tooling, and meticulous observability built on
    <strong>Python</strong>, <strong>discord.py</strong>, <strong>Lavalink v4</strong>, and a <strong>Next.js</strong> control panel.
  </p>
  <p>
    <a href="https://discord.com/api/oauth2/authorize?client_id=1435859299028172901&permissions=36768832&scope=bot%20applications.commands%20identify"><img src="https://img.shields.io/badge/Bot%20Invite-Add%20VectoBeat-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Invite the VectoBeat bot"></a>
    <a href="https://discordbotlist.com/bots/vectobeat"><img src="https://img.shields.io/badge/DiscordBotList-View%20Listing-ff3366?style=for-the-badge&logo=discord&logoColor=white" alt="DiscordBotList listing"></a>
    <a href="https://discord.gg/DtHPAEHxZk"><img src="https://img.shields.io/badge/Discord-Join%20Support-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord Support"></a>
    <a href="https://github.com/VectoDE/VectoBeat/stargazers"><img src="https://img.shields.io/github/stars/VectoDE/VectoBeat?style=for-the-badge&logo=github&color=yellow" alt="GitHub Stars"></a>
    <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"></a>
    <a href="https://www.apache.org/licenses/LICENSE-2.0"><img src="https://img.shields.io/badge/License-Apache%202.0-0A0A0A?style=for-the-badge" alt="License"></a>
  </p>
  <p>
    <a href="https://github.com/VectoDE/VectoBeat/actions/workflows/test.yml">
      <img src="https://github.com/VectoDE/VectoBeat/actions/workflows/test.yml/badge.svg?branch=main" alt="Quality Gate Status" />
    </a>
    <a href="https://github.com/VectoDE/VectoBeat/actions/workflows/build.yml">
      <img src="https://github.com/VectoDE/VectoBeat/actions/workflows/build.yml/badge.svg?branch=main" alt="Build Status" />
    </a>
    <a href="https://github.com/VectoDE/VectoBeat/actions/workflows/deploy.yml">
      <img src="https://github.com/VectoDE/VectoBeat/actions/workflows/deploy.yml/badge.svg?branch=main" alt="Release & Publish" />
    </a>
    <a href="https://github.com/VectoDE/VectoBeat/actions/workflows/security.yml">
      <img src="https://github.com/VectoDE/VectoBeat/actions/workflows/security.yml/badge.svg?branch=main" alt="Security Audit" />
    </a>
  </p>
</div>

<hr />

<div align="center" style="margin-bottom: 2rem;">
  <a href="#overview" style="margin: 0 0.5rem;">Overview</a> ·
  <a href="#capabilities" style="margin: 0 0.5rem;">Capabilities</a> ·
  <a href="#architecture" style="margin: 0 0.5rem;">Architecture</a> ·
  <a href="#setup" style="margin: 0 0.5rem;">Setup</a> ·
  <a href="#slash-commands" style="margin: 0 0.5rem;">Commands</a> ·
  <a href="#operations" style="margin: 0 0.5rem;">Operations</a> ·
  <a href="#contributing" style="margin: 0 0.5rem;">Contributing</a>
</div>

<hr />

<h2 id="overview">🎯 Overview</h2>
<p>
  VectoBeat is a production-ready Discord music bot that emphasises audibility, runtime transparency, and administrative control.
  Lavalink powers audio transport and yt-dlp handles multi-source ingestion while the control panel enforces plan rules, queue sync, concierge/success pod workflows, and compliance exports.
</p>

<table>
  <tr>
    <td width="33%">
      <h3>🎧 Audio Excellence</h3>
      <ul>
        <li>Lavalink v4 with resilient reconnects</li>
        <li>Multi-source resolution (YouTube, SoundCloud, Spotify<sup>*</sup>)</li>
        <li>Adaptive embeds with live progress bars</li>
      </ul>
    </td>
    <td width="33%">
      <h3>🔍 Observability</h3>
      <ul>
        <li>/status and /lavalink diagnostics</li>
        <li>/voiceinfo with latency + permission audit</li>
        <li>Queue sync + telemetry webhooks with plan-aware redaction</li>
        <li>Structured logging and error surfacing</li>
      </ul>
    </td>
    <td width="33%">
      <h3>🧩 Extensibility</h3>
      <ul>
        <li>Themed embed factory with single-source branding</li>
        <li>Typed configuration (Pydantic) and `.env` overrides</li>
        <li>Control panel bridges for concierge/success pod + server settings</li>
        <li>Well documented commands, service boundaries, and plan enforcement</li>
      </ul>
    </td>
  </tr>
</table>

<p style="font-size: 0.85rem;"><sup>*</sup> Spotify tracks are proxied via YouTube search unless a Spotify plugin is configured for your Lavalink node.</p>

<hr />

<h2 id="capabilities">🚀 Core Capabilities</h2>

<table>
  <thead>
    <tr>
      <th>Domain</th>
      <th>Highlights</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Playback</strong></td>
      <td>Randomised search results, queue autosync, manual seek, replay, loop modes, volume control, auto-resume protection, Redis-backed playlists, history-aware autoplay</td>
    </tr>
    <tr>
      <td><strong>Queueing</strong></td>
      <td>Paginated queue view, move/remove/shuffle, queue metadata summary, up-next projections</td>
    </tr>
    <tr>
      <td><strong>Diagnostics</strong></td>
      <td>/status (latency, CPU, RAM, guild footprint), /lavalink node stats, /permissions check, /voiceinfo latency+perms</td>
    </tr>
    <tr>
      <td><strong>Control Panel &amp; Ops</strong></td>
      <td>Queue sync + telemetry webhooks, plan-aware `/settings`, concierge/success pod lifecycle, compliance exports, regional routing</td>
    </tr>
    <tr>
      <td><strong>Branding</strong></td>
      <td>Config-driven logos, colours, author/footers across all embeds, with overrides per guild if required</td>
    </tr>
    <tr>
      <td><strong>Error Handling</strong></td>
      <td>User-facing exceptions routed to ephemeral embeds, logger visibility for unexpected faults</td>
    </tr>
  </tbody>
</table>

<hr />

<h2 id="architecture">🧱 Architecture</h2>

<table>
  <tr>
    <td width="50%">
      <h3>Runtime Stack</h3>
      <ul>
        <li><strong>discord.py AutoShardedBot</strong> with plan-aware settings, concierge/success pod, and audit bridges</li>
        <li><strong>LavalinkManager</strong> managing node lifecycle & authentication</li>
        <li><strong>AudioService (yt-dlp)</strong> enabling multi-source fallback</li>
        <li><strong>QueueSync + Telemetry services</strong> mirroring state to the control panel and webhooks</li>
        <li><strong>Next.js App Router</strong> control panel with Prisma/MySQL and durable queue sync store</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Key Modules</h3>
      <ul>
        <li><code>bot/src/commands</code>: Slash command suites (connection, playback, diagnostics, queue, ops)</li>
        <li><code>bot/src/services</code>: Lavalink glue, queue sync, concierge client, status API</li>
        <li><code>frontend/app/api</code>: Control-panel APIs (account, concierge, security/audit, bot bridges)</li>
        <li><code>frontend/lib</code>: Auth, plan capabilities, durable queue store</li>
      </ul>
    </td>
  </tr>
</table>

<h3>System Overview</h3>
<p align="center" style="font-size: 0.9rem;"><em>High-level interaction map between Discord, the VectoBeat runtime, Lavalink, and upstream media sources.</em></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/VectoDE/VectoBeat/main/assets/images/architecture.png" alt="VectoBeat System Architecture" width="720" />
</p>
<p style="font-size: 0.9rem; text-align: center;">
  A prose + Mermaid breakdown of the data flow lives in <code>docs/architecture.md</code> (source: <code>docs/system_architecture.mmd</code>).
  Regenerate the 4K system diagram with:
</p>

```bash
npx -y @mermaid-js/mermaid-cli -i docs/system_architecture.mmd -o assets/images/architecture.png -w 3840 -H 2160 -b transparent
```

<p style="font-size: 0.9rem; text-align: center;">
  For the full documentation index (deployment, ops, troubleshooting, and API guides), start at <code>docs/README.md</code>.
</p>

<hr />

<h2 id="setup">⚙️ Setup</h2>

<div style="background:rgba(14,165,233,0.1);border:1px solid #38bdf8;color:#ffffff;padding:0.75rem 1rem;border-radius:8px;margin:0.75rem 0;">Keep a single root <code>.env</code> for bot + frontend; CI fails on stray env files.</div>
<div style="background:rgba(251,191,36,0.12);border:1px solid #fbbf24;color:#ffffff;padding:0.75rem 1rem;border-radius:8px;margin:0.75rem 0;">Compose builds use the repo root as context; ensure <code>plan-capabilities.json</code> and Prisma schema stay present when building images.</div>
<div style="background:rgba(248,113,113,0.12);border:1px solid #f87171;color:#ffffff;padding:0.75rem 1rem;border-radius:8px;margin:0.75rem 0;">Never commit secrets: <code>.env</code> is gitignored. Rotate Discord/Stripe/SMTP keys if credentials leak.</div>

<div align="center">
  <table>
    <tr>
      <td width="33%">
        <h3>1️⃣ Env (root only)</h3>
        <p>Copy <code>.env.example</code> → <code>.env</code>. One file powers bot + frontend.</p>
        <pre><code>cp .env.example .env
python3 scripts/validate_env.py</code></pre>
        <p style="font-size: 0.9rem;">Before publishing invites, swap the hero badge client IDs for your live bot.</p>
      </td>
      <td width="33%">
        <h3>2️⃣ Local dev</h3>
        <p><strong>Bot:</strong> <code>cd bot && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && set -a && source ../.env && set +a && python -m src.main</code></p>
        <p><strong>Frontend:</strong> <code>cd frontend && npm install && set -a && source ../.env && set +a && npm run dev -p 3050</code></p>
      </td>
      <td width="33%">
        <h3>3️⃣ Docker (parity)</h3>
        <p>Full stack with MySQL, Redis, Lavalink.</p>
        <pre><code>cp .env.example .env
docker compose up -d --build
docker compose logs -f frontend bot</code></pre>
      </td>
    </tr>
  </table>
</div>

<p style="text-align: center;">Services: frontend <code>3050</code>, bot status <code>3051</code>, bot metrics <code>3052</code>, Lavalink <code>2333</code>, MySQL <code>3306</code>, Redis <code>6379</code>.</p>
<p style="text-align: center;">Compose builds from <code>frontend/Dockerfile</code> and <code>bot/Dockerfile</code> using the repo root as context; healthchecks restart until dependencies are ready.</p>
<p style="text-align: center;">Docs index, deployment, ops, and troubleshooting guides live under <code>docs/</code>.</p>

<hr />

<h2 id="slash-commands">🎮 Commands</h2>
<p>Use <code>/help</code> in Discord for in-bot guidance. Categories below list every command with a short description (see <code>docs/command_reference.md</code> for the generated source).</p>
<div style="background:rgba(14,165,233,0.1);border:1px solid #38bdf8;color:#ffffff;padding:0.75rem 1rem;border-radius:8px;margin:0.75rem 0;"><strong>Info:</strong> Spotify tracks are proxied via YouTube search unless a Lavalink Spotify plugin is configured.</div>
<div style="background:rgba(251,191,36,0.12);border:1px solid #fbbf24;color:#ffffff;padding:0.75rem 1rem;border-radius:8px;margin:0.75rem 0;"><strong>Warning:</strong> Queue control commands enforce DJ/Manage perms when collaborative mode is off.</div>
<div style="background:rgba(248,113,113,0.12);border:1px solid #f87171;color:#ffffff;padding:0.75rem 1rem;border-radius:8px;margin:0.75rem 0;"><strong>Heads up:</strong> Concierge and scaling/chaos commands are gated by plan tier and authenticated bot API calls.</div>

<table>
  <thead>
    <tr><th>Category</th><th>Command</th><th>Description</th></tr>
  </thead>
  <tbody>
    <tr><td rowspan="3"><strong>Voice</strong></td><td><code>/connect</code></td><td>Join caller’s voice channel (permission + node checks).</td></tr>
    <tr><td><code>/disconnect</code></td><td>Leave voice, destroy player, clear queue state.</td></tr>
    <tr><td><code>/voiceinfo</code></td><td>Latency, queue length, active status, permission checklist.</td></tr>
    <tr><td rowspan="11"><strong>Playback</strong></td><td><code>/play</code></td><td>Search/URL resolve (YouTube/SoundCloud/Spotify), enqueue, autoplay.</td></tr>
    <tr><td><code>/nowplaying</code></td><td>Live now-playing embed with progress.</td></tr>
    <tr><td><code>/skip</code></td><td>Skip current track.</td></tr>
    <tr><td><code>/stop</code></td><td>Stop playback and clear queue.</td></tr>
    <tr><td><code>/pause</code></td><td>Pause playback.</td></tr>
    <tr><td><code>/resume</code></td><td>Resume playback.</td></tr>
    <tr><td><code>/volume</code></td><td>Set volume (0–200%).</td></tr>
    <tr><td><code>/volume-info</code></td><td>Show current and default volume.</td></tr>
    <tr><td><code>/loop</code></td><td>Toggle Off/Track/Queue loop modes.</td></tr>
    <tr><td><code>/seek</code></td><td>Seek within current track (mm:ss).</td></tr>
    <tr><td><code>/replay</code></td><td>Restart current track.</td></tr>
    <tr><td rowspan="6"><strong>Queue</strong></td><td><code>/queue</code></td><td>Paginated queue with now-playing and up-next.</td></tr>
    <tr><td><code>/queueinfo</code></td><td>Queue summary (duration, loop, up-next).</td></tr>
    <tr><td><code>/shuffle</code></td><td>Shuffle queued tracks (≥2).</td></tr>
    <tr><td><code>/move</code></td><td>Reorder items by position.</td></tr>
    <tr><td><code>/remove</code></td><td>Remove track by 1-based index.</td></tr>
    <tr><td><code>/clear</code></td><td>Clear queued tracks.</td></tr>
    <tr><td rowspan="5"><strong>Playlists</strong></td><td><code>/playlist save</code></td><td>Persist current queue as a named playlist.</td></tr>
    <tr><td><code>/playlist load</code></td><td>Load a saved playlist (append/replace).</td></tr>
    <tr><td><code>/playlist list</code></td><td>List saved guild playlists.</td></tr>
    <tr><td><code>/playlist delete</code></td><td>Remove a saved playlist.</td></tr>
    <tr><td><code>/playlist sync</code></td><td>Attach an external URL to a saved playlist.</td></tr>
    <tr><td rowspan="4"><strong>Profiles</strong></td><td><code>/profile show</code></td><td>Display default volume/autoplay/embed style.</td></tr>
    <tr><td><code>/profile set-volume</code></td><td>Persist default volume for the guild.</td></tr>
    <tr><td><code>/profile set-autoplay</code></td><td>Toggle autoplay when queue finishes.</td></tr>
    <tr><td><code>/profile set-announcement</code></td><td>Choose between rich embeds and minimal text.</td></tr>
    <tr><td rowspan="4"><strong>DJ Controls</strong></td><td><code>/dj add-role</code></td><td>Grant DJ permissions to a role.</td></tr>
    <tr><td><code>/dj remove-role</code></td><td>Revoke DJ permissions from a role.</td></tr>
    <tr><td><code>/dj clear</code></td><td>Open queue control by clearing DJ roles.</td></tr>
    <tr><td><code>/dj show</code></td><td>Display configured DJ roles and actions.</td></tr>
    <tr><td rowspan="8"><strong>Diagnostics &amp; Help</strong></td><td><code>/ping</code></td><td>Gateway latency/uptime snapshot.</td></tr>
    <tr><td><code>/status</code></td><td>Latency p95, guild footprint, Lavalink stats, CPU/RAM.</td></tr>
    <tr><td><code>/lavalink</code></td><td>Per-node stats (players, CPU, memory, frame deficit).</td></tr>
    <tr><td><code>/guildinfo</code></td><td>Guild demographics and configuration.</td></tr>
    <tr><td><code>/permissions</code></td><td>Audit bot channel permissions with remediation tips.</td></tr>
    <tr><td><code>/botinfo</code></td><td>Application metadata and runtime.</td></tr>
    <tr><td><code>/uptime</code></td><td>Formatted uptime with timestamps.</td></tr>
    <tr><td><code>/help</code></td><td>Grouped list of available commands.</td></tr>
    <tr><td rowspan="17"><strong>Automation &amp; Ops</strong></td><td><code>/concierge request</code></td><td>File a concierge ticket for migrations/incidents (Growth+).</td></tr>
    <tr><td><code>/concierge usage</code></td><td>Show remaining concierge hours this cycle.</td></tr>
    <tr><td><code>/concierge resolve</code></td><td>Staff: resolve a concierge ticket.</td></tr>
    <tr><td><code>/success request</code></td><td>Submit a request to your success pod (Scale).</td></tr>
    <tr><td><code>/success status</code></td><td>View recent success pod lifecycle updates.</td></tr>
    <tr><td><code>/success contact</code></td><td>Show your account manager and escalation path.</td></tr>
    <tr><td><code>/success acknowledge</code></td><td>Staff: acknowledge and assign a success pod request.</td></tr>
    <tr><td><code>/success schedule</code></td><td>Staff: schedule a success pod session.</td></tr>
    <tr><td><code>/success resolve</code></td><td>Staff: resolve a success pod request.</td></tr>
    <tr><td><code>/success set-contact</code></td><td>Staff: update account manager contact info.</td></tr>
    <tr><td><code>/settings queue-limit</code></td><td>Adjust queue cap (plan-aware).</td></tr>
    <tr><td><code>/settings collaborative</code></td><td>Toggle collaborative queue (DJ/Manage perms enforced).</td></tr>
    <tr><td><code>/scaling evaluate</code></td><td>Force an autoscaling evaluation.</td></tr>
    <tr><td><code>/scaling status</code></td><td>Show scaling metrics and last signal.</td></tr>
    <tr><td><code>/chaos run</code></td><td>Trigger a chaos experiment immediately.</td></tr>
    <tr><td><code>/chaos status</code></td><td>Show recent chaos drills and schedule.</td></tr>
    <tr><td><code>/compliance export</code></td><td>Download compliance-ready JSONL events (admins).</td></tr>
  </tbody>
</table>


<hr />

<h2 id="operations">🧭 Operations Runbook</h2>

<h3>Health Monitoring</h3>
<table>
  <tr>
    <td width="50%">
      <h4>Command Diagnostics</h4>
      <ul>
        <li><code>/status</code>: Watch for CPU &gt; 70%, RAM &gt; 500MB – investigate long queues or Lavalink issues.</li>
        <li><code>/lavalink</code>: Frame deficit or high Lavalink CPU indicates node saturation.</li>
        <li><code>/voiceinfo</code>: Gateway latency spike implies region/regression; check Discord status.</li>
      </ul>
    </td>
    <td width="50%">
      <h4>Common Actions</h4>
      <ul>
        <li>No audio? Verify Lavalink source managers (YouTube/Spotify) and logs for “requires login”.</li>
        <li>Bot silent? Confirm permissions with <code>/permissions</code> (connect, speak, view channel).</li>
        <li>Queue stuck? Use <code>/stop</code> followed by <code>/play</code> to reset the player.</li>
        <li>No autoplay? Check Redis reachability and <code>VectoBeat</code> logs for “Autoplay” warnings.</li>
      </ul>
    </td>
  </tr>
</table>

<h3>Recommended Monitoring</h3>
<ul>
  <li>Capture <code>stdout</code> for VectoBeat; enable log shipping in production (ELK, CloudWatch, etc.).</li>
  <li>Monitor Lavalink metrics: player count, CPU, memory, frame deficit.</li>
  <li>Import the bundled Grafana dashboards in <code>docs/grafana</code> for shard latency, node health, and slash command throughput visualisations.</li>
  <li>Enable the command analytics pipeline (<code>docs/analytics.md</code>) to push anonymised slash usage into your data warehouse.</li>
  <li>Wire the queue telemetry webhook (<code>docs/queue_telemetry.md</code>) into your status site for real-time “now playing” indicators.</li>
  <li>Keep the queue sync publisher healthy (<code>docs/queue_sync.md</code>) so the control panel reflects live queues.</li>
  <li>Long-running slash commands (e.g. playlist loading) now show live progress embeds so users know what’s happening.</li>
  <li>Regularly patch yt-dlp for source compatibility.</li>
  <li>Monitor Redis availability (<code>INFO</code>/<code>PING</code>) if playlist persistence is enabled.</li>
</ul>

<hr />

<h2 id="security-compliance">🛡️ Security &amp; Compliance</h2>
<p>
  Enterprise customers rely on VectoBeat to demonstrate residency, threat mitigation, and secure coding practices. Two canonical documents now live under
  <code>docs/security</code>:
</p>
<ul>
  <li><strong>Threat Model</strong> (<code>docs/security/threat-model.md</code>) – enumerates assets, attacker goals, trust boundaries, and mitigation strategies for secrets, automation, and residency.</li>
  <li><strong>Secure Coding Guidelines</strong> (<code>docs/security/secure-coding-guidelines.md</code>) – covers encryption standards, secret rotation cadence, rate limiting rules, CSRF/CSP expectations, input validation, and incident-response hooks.</li>
  <li><strong>Privacy-by-Design Controls</strong> (<code>docs/security/privacy-controls.md</code>) – documents retention policies, delete/export workflows, and localized consent notices embedded in the control panel.</li>
  <li><strong>Compliance Export Jobs</strong> (<code>docs/backend/compliance-export-jobs.md</code>) – explains how scheduled/on-demand export jobs pull queue/moderation/billing data and deliver encrypted payloads via S3/SFTP.</li>
  <li><strong>Queue-Based Processing</strong> (<code>docs/backend/queue-processing.md</code>) – covers Redis-backed job queues for analytics exports and embed override propagation, plus worker configuration.</li>
  <li><strong>Observability Metrics</strong> (<code>docs/observability/metrics.md</code>) – enumerates shard load, Lavalink health, automation success, API error budgets, and concierge SLA metrics + alerting guidance.</li>
</ul>
<p>
  Keep both artifacts in sync with your deployments. Any new surface (API route, slash command, or residency zone) must be reflected in the threat model and inherit the published secure coding rules.
</p>

<hr />

<h2 id="contributing">🤝 Contributing</h2>
<p>Contributions are welcome! Please review <a href=".github/CODE_OF_CONDUCT.md">CODE_OF_CONDUCT.md</a> and the <a href=".github/CONTRIBUTING.md">Contributing Guide</a>, then follow the steps below.</p>

<ol>
  <li>Fork the repository and clone your fork.</li>
  <li>Create a feature branch <code>git checkout -b feature/amazing-improvement</code>.</li>
  <li>Bot checks: <code>cd bot && python -m compileall src && pytest -q</code> (plus <code>../scripts/typecheck.sh</code> if pyright is installed).</li>
  <li>Frontend checks: <code>cd frontend && npm run lint && npm run test:server-settings</code>.</li>
  <li>(Optional) Exercise queue scenarios via <code>python scripts/run_scenarios.py bot/tests/scenarios/basic_queue.yaml</code> when touching playback logic.</li>
  <li>Regenerate slash-command docs if commands change: <code>python scripts/generate_command_reference.py</code> (see <code>docs/command_reference.md</code>).</li>
  <li>Update diagrams when <code>docs/system_architecture.mmd</code> changes: <code>npx -y @mermaid-js/mermaid-cli -i docs/system_architecture.mmd -o assets/images/architecture.png -w 3840 -H 2160 -b transparent</code>.</li>
  <li>Spin up the sandbox via <code>docker compose up -d --build</code> (see <code>docs/local_sandbox.md</code>) to verify Lavalink/Redis/MySQL locally.</li>
  <li>Submit a pull request describing the motivation, approach, and testing performed.</li>
</ol>

<hr />

<h2 id="support">💬 Support</h2>
<ul>
  <li>Open issues for bugs or feature requests.</li>
  <li>Join the community Discord for live support and roadmap discussions.</li>
  <li>Star the repository to support the project’s visibility.</li>
</ul>

<p align="center" style="margin-top: 2rem;">
  <em>VectoBeat — engineered for premium audio experiences and operational clarity.</em>
</p>
