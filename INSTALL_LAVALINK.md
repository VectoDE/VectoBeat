<div align="center">
  <img src="https://raw.githubusercontent.com/VectoDE/VectoBeat/main/assets/images/logo.png" alt="VectoBeat Logo" width="200" />
  <h1>Lavalink Installation Guide</h1>
  <p>Deploy a resilient Lavalink v4 node suitable for VectoBeat or any enterprise music bot.</p>
</div>

<hr />

<h2>🧾 Prerequisites</h2>
<ul>
  <li>Ubuntu 22.04 LTS (recommended) or compatible Linux host.</li>
  <li>Docker Engine + Docker Compose (plugin) installed.</li>
  <li>Java 17 (if running Lavalink outside Docker).</li>
  <li>Network access for the sources you intend to use (YouTube, SoundCloud, Spotify, etc.).</li>
</ul>

<hr />

<h2>⚙️ System Preparation</h2>
<pre><code>sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release unzip
</code></pre>

<h3>Install Docker Engine &amp; Compose</h3>
<pre><code>sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
</code></pre>
<p><em>Log out/in to activate group membership.</em></p>

<hr />

<h2>📂 Directory Structure</h2>
<pre><code>mkdir -p ~/lavalink
cd ~/lavalink
curl -LO https://raw.githubusercontent.com/lavalink-devs/Lavalink/main/application.example.yml
mv application.example.yml application.yml
</code></pre>

<h3>application.yml Essentials</h3>
<pre><code>server:
  port: 2333
  address: 0.0.0.0
  password: supersecret
lavalink:
  server:
    sources:
      youtube: true
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      mixer: false
      http: true
      local: false
    bufferDurationMs: 400
    ytsearch: "ytsearch"
    ytsearchMixer: "ytmsearch"
    useRoutePlanner: false
  plugins:
    yt-dlp:
      enabled: true
    spotify:
      enabled: false  # set true and provide credentials if licensed
</code></pre>
<p>See <a href="https://lavalink.dev/docs/">official docs</a> for the latest schema and plugin instructions.</p>

<hr />

<h2>🛳️ Docker Compose Deployment</h2>

<pre><code>version: "3.9"
services:
  lavalink:
    image: fredboat/lavalink:4
    container_name: lavalink
    restart: unless-stopped
    ports:
      - "2333:2333"
    volumes:
      - ./application.yml:/app/application.yml:ro
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      JVM_OPTS: "-Xmx2G -Dlogging.file.path=./logs"
      LAVALINK_SERVER_PASSWORD: "supersecret"
</code></pre>

<h3>Start &amp; Verify</h3>
<pre><code>docker compose up -d
docker compose logs -f
</code></pre>
<p><strong>Look for:</strong></p>
<pre><code>Started Launcher in Xs
WebSocket connection established
</code></pre>

<hr />

<h2>🧪 Health Checks</h2>
<pre><code>curl -H "Authorization: supersecret" http://localhost:2333/version
curl -H "Authorization: supersecret" http://localhost:2333/v4/sessions</code></pre>

<p>If you terminate TLS at Lavalink (for example on port 443), update the configuration and expose <code>https: true</code> in your bot.</p>

<hr />

<h2>🎧 Source Configuration</h2>
<ul>
  <li><strong>YouTube / yt-dlp:</strong> Ensure <code>yt-dlp</code> plugin is enabled; provide cookies if links require login.</li>
  <li><strong>Spotify:</strong> Requires third-party plugin; supply <code>clientId</code> and <code>clientSecret</code>.</li>
  <li><strong>Geo Restrictions:</strong> Consider proxies for region-locked content.</li>
</ul>

<hr />

<h2>🔐 Security Checklist</h2>
<ul>
  <li>Rotate Lavalink password regularly, never commit it to Git.</li>
  <li>Restrict inbound firewall rules to trusted bot hosts.</li>
  <li>Monitor <code>logs/lavalink.log</code> for authentication failures.</li>
</ul>

<hr />

<h2>🧭 Operations</h2>
<ul>
  <li><strong>Logs:</strong> <code>docker compose logs lavalink</code> or mount <code>./logs</code> to external logging.</li>
  <li><strong>Updates:</strong> <code>docker compose pull lavalink &amp;&amp; docker compose up -d</code>.</li>
  <li><strong>Metrics:</strong> Exposed via Lavalink REST (<code>/v4/info</code>, <code>/v4/stats</code>).</li>
</ul>

<hr />

<h2>🆘 Troubleshooting</h2>
<table>
  <tr>
    <th>Symptom</th>
    <th>Resolution</th>
  </tr>
  <tr>
    <td>401 Unauthorized</td>
    <td>Verify <code>server.password</code> in <code>application.yml</code> matches bot configuration.</td>
  </tr>
  <tr>
    <td>“Video requires login”</td>
    <td>Provide YouTube cookies or switch to yt-dlp plugin with authenticated headers.</td>
  </tr>
  <tr>
    <td>No Spotify playback</td>
    <td>Install Spotify plugin and supply credentials, or allow fallback search via YouTube.</td>
  </tr>
  <tr>
    <td>Frame deficit grows</td>
    <td>Increase CPU/RAM allocation, scale nodes, or reduce concurrent playback.</td>
  </tr>
</table>

<hr />

<h2>✅ Next Steps</h2>
<ol>
  <li>Copy host, port, password, SSL flag into <code>.env</code> / <code>config.yml</code>.</li>
  <li>Run <code>python -m src.main</code> and test `/play` with multiple sources.</li>
  <li>Use <code>/lavalink</code> and <code>/status</code> to monitor node health in real time.</li>
</ol>

<p align="center" style="margin-top: 2rem;">
  <em>Enjoy pristine audio and rock-solid diagnostics with VectoBeat and Lavalink.</em>
</p>
