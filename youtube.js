'use strict';
/* Snake LIVE PRO - YouTube client. The browser NEVER sees an API key or an OAuth token:
 * it only listens to the backend (/events, Server-Sent Events) and asks it to connect / disconnect.
 * Connection states: Disconnected, Connecting, Connected, LIVE Active, Reconnecting, Error. */
const YT = {
  conn: "Disconnected", msg: "", channel: null, live: null, quota: null, configured: true, loggedIn: false, backend: "unknown",
  es: null, seen: 0, fails: 0, delay: 1000, blockedUntil: 0, admin: sessionStorage.getItem("adm") || "", listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  set(conn, msg) { this.conn = conn; this.msg = msg || ""; Stats.setLive(conn === "LIVE Active"); this.listeners.forEach(f => f()); },
  apply(s) {
    this.channel = s.channel; this.live = s.live; this.quota = s.quota; this.configured = s.configured; this.loggedIn = s.loggedIn; this.backend = "ok";
    if (s.channel) $("chn").textContent = "@" + String(s.channel.title).replace(/^@/, "").slice(0, 40);
    if (s.likes !== null && s.likes !== undefined) Stats.setReal(s.likes);
    this.set(s.conn, s.msg);
  },
  feed() {                      /* open the event stream; reconnect with back-off */
    if (this.es) { this.es.close(); this.es = null; }
    if (Date.now() < this.blockedUntil) return;
    const es = new EventSource("/events"); this.es = es;
    es.onopen = () => { this.seen = Date.now(); this.fails = 0; this.delay = 1000; };
    es.addEventListener("state", e => { this.seen = Date.now(); this.apply(JSON.parse(e.data)); });
    es.addEventListener("ping", () => { this.seen = Date.now(); });
    es.addEventListener("stats", e => { this.seen = Date.now(); const d = JSON.parse(e.data); if (d.likes !== null && d.likes !== undefined) Stats.setReal(d.likes); Stats.subs = d.subs; this.listeners.forEach(f => f()); });
    es.addEventListener("warning", e => { toast(JSON.parse(e.data).text); });
    es.addEventListener("yt", e => { this.seen = Date.now(); Queue.push(JSON.parse(e.data)); });
    es.onerror = () => { es.close(); if (this.es === es) this.es = null; this.fails++; this.backend = this.fails > 3 ? "unreachable" : "retry"; this.set(this.fails > 3 ? "Disconnected" : "Reconnecting", this.fails > 3 ? "Backend not reachable. Open the game from your server address." : "Connection lost, reconnecting..."); setTimeout(() => this.feed(), this.delay = Math.min(this.delay * 2, 15000)); };
  },
  simulateOffline(ms) {         /* test: drop the connection and reconnect after `ms` */
    this.blockedUntil = Date.now() + ms; if (this.es) { this.es.close(); this.es = null; } this.set("Reconnecting", "TEST: simulated internet loss (" + Math.round(ms / 1000) + " s)");
    setTimeout(() => { this.blockedUntil = 0; this.feed(); }, ms);
  },
  async api(path, body) {       /* admin actions need the admin password configured on the server */
    let r; try { r = await fetch(path, { method: "POST", headers: { "x-admin-key": this.admin, "content-type": "application/json" }, body: JSON.stringify(body || {}) }); } catch (e) { throw new Error("Backend not reachable"); }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Error " + r.status); return j;
  },
  setAdmin(p) { this.admin = p; sessionStorage.setItem("adm", p); },
  async login() { const j = await this.api("/api/auth-url"); location.href = j.url; },
  async connectLive(videoId) { const s = await this.api("/api/connect-live", { videoId: videoId || "" }); this.apply(s); },
  async disconnect() { this.apply(await this.api("/api/disconnect")); },
  async logout() { this.apply(await this.api("/api/logout")); },
  async refresh() { const r = await fetch("/api/state"); this.apply(await r.json()); }
};
function toast(t) { $("nu").textContent = "Snake LIVE"; $("nt").textContent = t; }
setInterval(() => { if (YT.es && YT.seen && Date.now() - YT.seen > 45000) YT.es.onerror(); }, 5000);   /* watchdog: a silent connection is treated as lost */
if (location.protocol === "http:" || location.protocol === "https:") YT.feed(); else YT.set("Disconnected", "Open the game from your server address (http/https), not as a file.");
