<div align="center">
  <img src="https://raw.githubusercontent.com/VectoDE/VectoBeat/main/assets/images/logo.png" alt="VectoBeat Logo" width="280" />
  <p style="font-size: 1.2rem;"><strong>Music Bot for Discord</strong></p>
  <p style="max-width: 640px;">
    VectoBeat delivers premium audio playback, meticulous observability, and a polished operations toolchain built on
    <strong>Python</strong>, <strong>discord.py</strong>, and <strong>Lavalink v4</strong>.
  </p>
  <p>
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
    <a href="https://github.com/VectoDE/VectoBeat/actions/workflows/docs.yml">
      <img src="https://github.com/VectoDE/VectoBeat/actions/workflows/docs.yml/badge.svg?branch=main" alt="Documentation Guard" />
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
  <a href="#operations-runbook" style="margin: 0 0.5rem;">Operations</a> ·
  <a href="#contributing" style="margin: 0 0.5rem;">Contributing</a>
</div>

<hr />

<h2 id="overview">🎯 Overview</h2>
<p>
  VectoBeat is a production-ready Discord music bot that emphasises audibility, runtime transparency, and administrative control.
  The bot uses Lavalink for audio transport, yt-dlp for multi-source ingestion, and a thoughtfully designed slash-command surface.
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
        <li>Structured logging and error surfacing</li>
      </ul>
    </td>
    <td width="33%">
      <h3>🧩 Extensibility</h3>
      <ul>
        <li>Themed embed factory with single-source branding</li>
        <li>Typed configuration (Pydantic) and `.env` overrides</li>
        <li>Well documented commands and service boundaries</li>
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
        <li><strong>discord.py AutoShardedBot</strong> for automatic horizontal scaling</li>
        <li><strong>LavalinkManager</strong> managing node lifecycle & authentication</li>
        <li><strong>AudioService (yt-dlp)</strong> enabling multi-source fallback</li>
        <li><strong>EmbedFactory</strong> centralising branding assets (logo, colour palette)</li>
      </ul>
    </td>
    <td width="50%">
      <h3>Key Modules</h3>
      <ul>
        <li><code>src/commands</code>: Slash command suites (connection, playback, diagnostics, queue)</li>
        <li><code>src/events</code>: Presence rotation, playback announcers, global error handling</li>
        <li><code>src/services</code>: Lavalink glue & audio resolution wrappers</li>
        <li><code>src/configs</code>: Typed configuration (Pydantic) with `.env` overrides</li>
      </ul>
    </td>
  </tr>
</table>

<h3>System Overview</h3>
<p align="center" style="font-size: 0.9rem;"><em>High-level interaction map between Discord, the VectoBeat runtime, Lavalink, and upstream media sources.</em></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/VectoDE/VectoBeat/main/assets/images/architecture.png" alt="VectoBeat System Architecture" width="720" />
</p>
<p style="font-size: 0.85rem; text-align: center;">Source Mermaid definition lives at <code>docs/system_architecture.mmd</code>; regenerate the asset with:</p>

```bash
npx -y @mermaid-js/mermaid-cli@10.9.0 -p docs/puppeteer-config.json -t dark \
  -i docs/system_architecture.mmd -o assets/images/architecture.png
```

<hr />

<h2 id="setup">⚙️ Setup</h2>

<h3>1. Environment</h3>
<pre><code>python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt</code></pre>

<h3>2. Configure Lavalink</h3>
<ul>
  <li>Follow <a href="INSTALL_LAVALINK.md">INSTALL_LAVALINK.md</a> for deployment (Docker-ready recipe).</li>
  <li>Enable desired source managers (YouTube/yt-dlp, SoundCloud, Spotify plugin if licensed).</li>
  <li>Record host, port, password, SSL and region; update <code>.env</code> and <code>config.yml</code>.</li>
</ul>

<h3>3. Redis (Playlists & Autoplay)</h3>
<ul>
  <li>Prepare a Redis instance (single node is sufficient). Default config assumes <code>45.84.196.19:32768</code>.</li>
  <li>Set network rules so only the bot host can access Redis.</li>
  <li>Populate <code>REDIS_HOST</code>/<code>PORT</code>/<code>PASSWORD</code>/<code>DB</code> in <code>.env</code> or adjust <code>config.yml</code>.</li>
  <li>Tune history-driven autoplay via <code>AUTOPLAY_DISCOVERY_LIMIT</code> and <code>AUTOPLAY_RANDOM_PICK</code> (controls recommendation breadth and randomness).</li>
</ul>

<h3>4. Bot Configuration</h3>
<pre><code>.env
DISCORD_TOKEN=YOUR_BOT_TOKEN
LAVALINK_HOST=example-host
LAVALINK_PORT=2333
LAVALINK_PASSWORD=supersecret
LAVALINK_HTTPS=false
LAVALINK_REGION=eu
REDIS_HOST=45.84.196.19
REDIS_PORT=32768
REDIS_PASSWORD=
REDIS_DB=0
AUTOPLAY_DISCOVERY_LIMIT=10
AUTOPLAY_RANDOM_PICK=true
</code></pre>
<p>Optional: adjust <code>config.yml</code> for intents, shard count, embed theme.</p>

<h3>5. Launch</h3>
<pre><code>python -m src.main</code></pre>
<p>The bot registers slash commands and reports node health on startup. Review the logs for authentication or connectivity hints.</p>

<hr />

<h2 id="slash-commands">🎮 Slash Commands</h2>

<table>
  <thead>
    <tr>
      <th>Category</th>
      <th>Command</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="3"><strong>Voice</strong></td>
      <td><code>/connect</code></td>
      <td>Join caller’s voice channel, auditing missing permissions and node status.</td>
    </tr>
    <tr>
      <td><code>/disconnect</code></td>
      <td>Leave voice, destroy the Lavalink player, clear queue state.</td>
    </tr>
    <tr>
      <td><code>/voiceinfo</code></td>
      <td>Display latency, queue length, active status and permission checklist.</td>
    </tr>
    <tr>
      <td rowspan="8"><strong>Playback</strong></td>
      <td><code>/play &lt;query|url&gt;</code></td>
      <td>Resolve search or URL, queue up to three random candidates, start automatically.</td>
    </tr>
    <tr><td><code>/skip</code></td><td>Skip current track; embed shows remaining queue size.</td></tr>
    <tr><td><code>/stop</code></td><td>Stop playback and clear queued tracks.</td></tr>
    <tr><td><code>/pause</code> / <code>/resume</code></td><td>Pause or resume; embed indicates track title.</td></tr>
    <tr><td><code>/volume</code></td><td>Set volume between 0 and 200%.</td></tr>
    <tr><td><code>/loop</code></td><td>Toggle loop mode (Off, Track, Queue).</td></tr>
    <tr><td><code>/seek mm:ss</code></td><td>Jump to a timestamp within the current track.</td></tr>
    <tr><td><code>/replay</code></td><td>Restart currently playing track from the beginning.</td></tr>
    <tr>
      <td rowspan="6"><strong>Queue</strong></td>
      <td><code>/queue</code></td>
      <td>Paginated queue view with “Now Playing” and upcoming entries.</td>
    </tr>
    <tr><td><code>/queueinfo</code></td><td>Summary overview (duration, volume, loop state, up-next block).</td></tr>
    <tr><td><code>/remove &lt;index&gt;</code></td><td>Remove track by its 1-based index.</td></tr>
    <tr><td><code>/move &lt;from&gt; &lt;to&gt;</code></td><td>Reorder queued items.</td></tr>
    <tr><td><code>/shuffle</code></td><td>Shuffle queued tracks (requires ≥2).</td></tr>
    <tr><td><code>/clear</code></td><td>Purge the queued tracks while leaving the current song playing.</td></tr>
    <tr>
      <td rowspan="8"><strong>Diagnostics</strong></td>
      <td><code>/ping</code></td>
      <td>Latency snapshot (gateway + uptime + shard descriptor).</td>
    </tr>
    <tr><td><code>/status</code></td><td>Comprehensive metrics (latency p95, guild footprint, Lavalink stats, CPU/RAM).</td></tr>
    <tr><td><code>/botinfo</code></td><td>Application metadata, owners, command count, runtime environment.</td></tr>
    <tr><td><code>/uptime</code></td><td>Formatted uptime with Discord timestamp (absolute & relative).</td></tr>
    <tr><td><code>/lavalink</code></td><td>Per-node statistics: players, CPU, memory, frame deficit.</td></tr>
    <tr><td><code>/voiceinfo</code></td><td>See above; duplicated for quick reference.</td></tr>
    <tr><td><code>/guildinfo</code></td><td>Guild demographics and configuration (requires Manage Guild).</td></tr>
    <tr><td><code>/permissions</code></td><td>Audit the bot’s channel permissions with checkmarks.</td></tr>
    <tr>
      <td rowspan="4"><strong>Configuration</strong></td>
      <td><code>/profile show</code></td>
      <td>Display the guild’s playback profile (default volume, autoplay, announcement style).</td>
    </tr>
    <tr><td><code>/profile set-volume</code></td><td>Persist a default volume applied whenever the bot joins voice.</td></tr>
    <tr><td><code>/profile set-autoplay</code></td><td>Toggle automatic queue refill when playback finishes.</td></tr>
    <tr><td><code>/profile set-announcement</code></td><td>Switch between rich embeds and minimal now-playing text.</td></tr>
    <tr>
      <td rowspan="4"><strong>Playlists</strong></td>
      <td><code>/playlist save</code></td>
      <td>Persist the current queue (optionally including the active track) to Redis. Requires Manage Server.</td>
    </tr>
    <tr><td><code>/playlist load</code></td><td>Load a saved playlist into the queue, optionally replacing current items.</td></tr>
    <tr><td><code>/playlist list</code></td><td>Enumerate playlists stored for the guild.</td></tr>
    <tr><td><code>/playlist delete</code></td><td>Remove a playlist from storage. Requires Manage Server.</td></tr>
  </tbody>
</table>

<hr />

<h2 id="operations-runbook">🧭 Operations Runbook</h2>

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
  <li>Long-running slash commands (e.g. playlist loading) now show live progress embeds so users know what’s happening.</li>
  <li>Regularly patch yt-dlp for source compatibility.</li>
  <li>Monitor Redis availability (<code>INFO</code>/<code>PING</code>) if playlist persistence is enabled.</li>
</ul>

<hr />

<h2 id="contributing">🤝 Contributing</h2>
<p>Contributions are welcome! Please review <a href=".github/CODE_OF_CONDUCT.md">CODE_OF_CONDUCT.md</a> and the <a href=".github/CONTRIBUTING.md">Contributing Guide</a>, then follow the steps below.</p>

<ol>
  <li>Fork the repository and clone your fork.</li>
<li>Create a feature branch <code>git checkout -b feature/amazing-improvement</code>.</li>
<li>Run <code>python3 -m compileall src</code> and <code>scripts/typecheck.sh</code> before committing.</li>
<li>(Optional) Exercise queue scenarios via <code>scripts/run_scenarios.py tests/scenarios/basic_queue.yaml</code> when touching playback logic.</li>
  <li>Regenerate the slash-command reference via <code>python scripts/generate_command_reference.py</code> before publishing docs changes.</li>
  <li>Spin up the local sandbox stack via <code>docker compose -f docker-compose.local.yml up</code> (see <code>docs/local_sandbox.md</code>) when you need Lavalink/Redis/Postgres locally.</li>
  <li>Tune search caching via the <code>cache</code> section in <code>config.yml</code> to reduce repeated Lavlink lookups.</li>
  <li>Adjust dynamic search limits via <code>search_limits</code> to balance latency vs. search breadth.</li>
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
- Profile the event loop with `python scripts/profile_event_loop.py` (requires pyinstrument) and inspect `profiles/event-loop-profile.html` for hotspots.
