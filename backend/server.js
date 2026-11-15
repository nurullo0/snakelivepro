'use strict';
/*
 * Snake LIVE PRO backend (no dependencies, Node.js >= 18).
 *   Browser game  <--SSE /events-->  this server  <--HTTPS + OAuth-->  YouTube Data API
 * - Google OAuth 2.0 (authorization code flow). The refresh token never leaves the server.
 * - Detects the channel, the active live broadcast and its live chat automatically.
 * - Reads live chat (liveChatMessages.list), classifies events, removes duplicates and streams them to the game.
 * - Tracks API quota, reconnects after network errors, stops cleanly when the live ends.
 */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const env = process.env;
const CFG = {
  port: +env.PORT || 3000,
  clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '',
  publicUrl: (env.PUBLIC_URL || 'http://localhost:' + (env.PORT || 3000)).replace(/\/$/, ''),
  adminPassword: env.ADMIN_PASSWORD || '',
  pollMs: Math.max(+env.CHAT_POLL_MS || 8000, 2000),
  quotaLimit: +env.QUOTA_LIMIT || 10000,
  tokenFile: env.TOKEN_FILE || path.join(__dirname, 'data', 'tokens.json'),
  frontendDir: env.FRONTEND_DIR || path.join(__dirname, '..'),
  apiBase: env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3',
  tokenUrl: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  authUrl: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  scope: 'https://www.googleapis.com/auth/youtube.readonly',
  idleScanMs: +env.IDLE_SCAN_MS || 20000, likesMs: +env.LIKES_MS || 20000, subsMs: +env.SUBS_MS || 60000
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const logs = [];
function log(level, msg) { const l = new Date().toISOString() + ' ' + level + ' ' + msg; logs.push(l); if (logs.length > 200) logs.shift(); console.log(l); }

/* ---------- state ---------- */
const st = { conn: 'Disconnected', msg: '', channel: null, live: null, likes: null, subs: null, subsHidden: false };
const quota = { used: 0, day: pacificDay() };
function pacificDay() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); }
function quotaState() { if (quota.day !== pacificDay()) { quota.day = pacificDay(); quota.used = 0; } return { used: quota.used, limit: CFG.quotaLimit, day: quota.day }; }
function publicState() { return { conn: st.conn, msg: st.msg, channel: st.channel, live: st.live && { videoId: st.live.videoId }, likes: st.likes, subs: st.subs, subsHidden: st.subsHidden, quota: quotaState(), configured: !!(CFG.clientId && CFG.clientSecret), loggedIn: !!tokens.refresh }; }

/* ---------- server-sent events ---------- */
const clients = new Set();
function emit(type, data) { const p = 'event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n'; for (const r of clients) { try { r.write(p); } catch (e) { clients.delete(r); } } }
function setConn(conn, msg) { if (st.conn !== conn || st.msg !== (msg || '')) { st.conn = conn; st.msg = msg || ''; log('INFO', 'state: ' + conn + (msg ? ' - ' + msg : '')); emit('state', publicState()); } }
setInterval(() => emit('ping', { t: Date.now() }), 15000).unref();

/* ---------- token storage and OAuth ---------- */
const tokens = { refresh: env.REFRESH_TOKEN || '', access: '', expires: 0 };
try { if (!tokens.refresh && fs.existsSync(CFG.tokenFile)) tokens.refresh = JSON.parse(fs.readFileSync(CFG.tokenFile, 'utf8')).refresh_token || ''; } catch (e) { log('WARN', 'cannot read token file'); }
function saveRefresh() { try { fs.mkdirSync(path.dirname(CFG.tokenFile), { recursive: true }); fs.writeFileSync(CFG.tokenFile, JSON.stringify({ refresh_token: tokens.refresh }), { mode: 0o600 }); } catch (e) { log('WARN', 'cannot save token file (disk may be read-only)'); } }
function clearTokens() { tokens.refresh = ''; tokens.access = ''; tokens.expires = 0; try { fs.unlinkSync(CFG.tokenFile); } catch (e) {} }
async function tokenRequest(params) {
  const r = await fetch(CFG.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.reason = j.error; throw e; }
  return j;
}
async function accessToken() {
  if (tokens.access && Date.now() < tokens.expires - 60000) return tokens.access;
  if (!tokens.refresh) throw fatal('notLoggedIn');
  try {
    const j = await tokenRequest({ client_id: CFG.clientId, client_secret: CFG.clientSecret, refresh_token: tokens.refresh, grant_type: 'refresh_token' });
    tokens.access = j.access_token; tokens.expires = Date.now() + (j.expires_in || 3600) * 1000; return tokens.access;
  } catch (e) { if (e.reason === 'invalid_grant') { clearTokens(); throw fatal('invalid_grant'); } throw e; }
}
function fatal(reason) { const e = new Error(reason); e.fatal = true; e.reason = reason; return e; }
const FRIENDLY = {
  notLoggedIn: 'Not logged in. Press "Connect YouTube".',
  invalid_grant: 'Google login expired or was revoked. Press "Connect YouTube" again.',
  quotaExceeded: 'Daily YouTube API quota is used up. It resets at midnight Pacific time.',
  liveChatEnded: 'The live chat has ended.', liveChatDisabled: 'Live chat is turned off for this broadcast.',
  noChannel: 'No YouTube channel was found for this Google account.',
  insufficientLivePermissions: 'This login is not allowed to read live broadcasts.', liveStreamingNotEnabled: 'Live streaming is not enabled on this channel.',
  accessNotConfigured: 'YouTube Data API v3 is not enabled in your Google Cloud project.',
  keyInvalid: 'Google rejected the request (check the OAuth client settings).', forbidden: 'YouTube refused the request (forbidden).',
  videoNotFound: 'No video with this ID was found on your channel.'
};
const FATAL = /^(notLoggedIn|invalid_grant|noChannel|insufficientLivePermissions|liveStreamingNotEnabled|accessNotConfigured|keyInvalid|videoNotFound)$/;

/* ---------- YouTube API wrapper with quota accounting ---------- */
const COST = { channels: 1, liveBroadcasts: 1, videos: 1, 'liveChat/messages': 5 };
async function yt(ep, params) {
  const q = quotaState(), cost = COST[ep] || 1;
  if (q.used + cost > CFG.quotaLimit) { const e = new Error('quotaExceeded'); e.reason = 'quotaExceeded'; throw e; }
  const tok = await accessToken();
  quota.used += cost;
  const u = new URL(CFG.apiBase + '/' + ep); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { authorization: 'Bearer ' + tok } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e0 = j.error || {}, d = (e0.errors && e0.errors[0]) || {}; const e = new Error(d.reason || e0.status || 'HTTP ' + r.status); e.reason = d.reason || e0.status || 'HTTP ' + r.status; e.status = r.status; throw e; }
  if (quota.used >= CFG.quotaLimit * 0.9 && !quota.warned) { quota.warned = true; emit('warning', { text: 'YouTube API quota is above 90%.' }); }
  return j;
}

/* ---------- event classification and de-duplication ---------- */
const seen = new Map();
function firstTime(key) { if (!key) return true; if (seen.has(key)) return false; seen.set(key, Date.now()); if (seen.size > 5000) { let i = 0; for (const k of seen.keys()) { seen.delete(k); if (++i > 2500) break; } } return true; }
function classify(m) {
  const s = m.snippet || {}, a = m.authorDetails || {}, user = String(a.displayName || 'viewer').slice(0, 40);
  const base = { id: m.id, user, channelId: a.channelId || '', at: s.publishedAt || '' };
  switch (s.type) {
    case 'giftEvent': { const g = s.giftDetails || {}; return { ...base, kind: 'gift', giftName: String(g.giftName || '').slice(0, 80), jewels: g.jewelsAmount || 0, combo: g.comboCount || 0, alt: String(g.altText || '').slice(0, 120), key: m.id + ':' + (g.comboCount || 0) }; }
    case 'superChatEvent': { const d = s.superChatDetails || {}; return { ...base, kind: 'superchat', tier: d.tier || 1, amount: d.amountDisplayString || '', comment: String(d.userComment || '').slice(0, 120), key: m.id }; }
    case 'superStickerEvent': { const d = s.superStickerDetails || {}, md = d.superStickerMetadata || {}; return { ...base, kind: 'supersticker', tier: d.tier || 1, amount: d.amountDisplayString || '', alt: String(md.altText || '').slice(0, 120), stickerId: md.stickerId || '', key: m.id }; }
    case 'membershipGiftingEvent': { const d = s.membershipGiftingDetails || {}; return { ...base, kind: 'membership_gift', count: d.giftMembershipsCount || 1, level: d.giftMembershipsLevelName || '', key: m.id }; }
    case 'giftMembershipReceivedEvent': return { ...base, kind: 'gift_membership_received', key: m.id };
    case 'newSponsorEvent': return { ...base, kind: 'new_member', level: (s.newSponsorDetails || {}).memberLevelName || '', key: m.id };
    case 'memberMilestoneChatEvent': return { ...base, kind: 'member_milestone', months: (s.memberMilestoneChatDetails || {}).memberMonth || 0, key: m.id };
    case 'textMessageEvent': { const t = String((s.textMessageDetails || {}).messageText || '').trim(); return /^![a-z0-9]{1,20}$/i.test(t) ? { ...base, kind: 'chat_command', text: t.toLowerCase(), key: m.id } : null; }
    case 'chatEndedEvent': return { kind: 'chat_ended', key: m.id };
    default: return null;
  }
}

/* ---------- monitor loop ---------- */
let run = 0, manualVideoId = '', sess = { chatId: '', tok: '', first: true };
async function fetchStats(my) {
  if (st.live) { try { const v = await yt('videos', { part: 'statistics', id: st.live.videoId }); const s0 = v.items && v.items[0] && v.items[0].statistics; if (my === run && s0) { st.likes = s0.likeCount !== undefined ? +s0.likeCount : null; emit('stats', { likes: st.likes, subs: st.subs, subsHidden: st.subsHidden }); } } catch (e) { if (e.reason === 'quotaExceeded') throw e; } }
}
async function fetchSubs(my) {
  try {
    const c = await yt('channels', { part: 'statistics', mine: 'true' }); const s0 = c.items && c.items[0] && c.items[0].statistics; if (!s0 || my !== run) return;
    st.subsHidden = !!s0.hiddenSubscriberCount; const n = st.subsHidden ? null : +s0.subscriberCount;
    if (n !== null && st.subs !== null && n > st.subs) emit('yt', { kind: 'subscriber', user: '', approx: true, delta: n - st.subs, key: 'sub:' + n });
    if (n !== null) st.subs = n; emit('stats', { likes: st.likes, subs: st.subs, subsHidden: st.subsHidden });
  } catch (e) { if (e.reason === 'quotaExceeded') throw e; }
}
async function findLive() {
  if (manualVideoId) {
    const v = await yt('videos', { part: 'snippet,liveStreamingDetails', id: manualVideoId });
    const it = v.items && v.items[0]; if (!it) throw fatal('videoNotFound');
    if (st.channel && it.snippet.channelId !== st.channel.id) throw fatal('videoNotFound');
    return it.liveStreamingDetails && it.liveStreamingDetails.activeLiveChatId ? { videoId: it.id, chatId: it.liveStreamingDetails.activeLiveChatId } : null;
  }
  const b = await yt('liveBroadcasts', { part: 'id,snippet,status', broadcastStatus: 'active', broadcastType: 'all', maxResults: '5' });
  const it = (b.items || []).find(x => x.snippet && x.snippet.liveChatId); return it ? { videoId: it.id, chatId: it.snippet.liveChatId } : null;
}
async function monitor() {
  const my = ++run; let backoff = 5000; setConn('Connecting');
  while (my === run) {
    try {
      if (!st.channel) {
        const c = await yt('channels', { part: 'snippet,statistics', mine: 'true' }); const it = c.items && c.items[0]; if (!it) throw fatal('noChannel');
        st.channel = { id: it.id, title: it.snippet.title }; st.subsHidden = !!it.statistics.hiddenSubscriberCount; st.subs = st.subsHidden ? null : +it.statistics.subscriberCount;
        log('INFO', 'channel: ' + st.channel.title); setConn('Connected', 'Waiting for a live broadcast...');
      }
      const live = await findLive();
      if (!live) { if (st.live) { st.live = null; } setConn('Connected', 'Waiting for a live broadcast...'); await sleep(CFG.idleScanMs); continue; }
      if (!st.live || st.live.videoId !== live.videoId) { st.live = live; sess = { chatId: live.chatId, tok: '', first: true }; st.likes = null; log('INFO', 'live found: ' + live.videoId); }
      setConn('LIVE Active', ''); emit('state', publicState());
      await watchChat(my); backoff = 5000;
      if (my === run) { st.live = null; manualVideoId = ''; setConn('Connected', 'The live ended. Waiting for the next one...'); await sleep(CFG.idleScanMs); }
    } catch (e) {
      if (my !== run) return;
      const reason = e.reason || e.message;
      if (e.fatal || FATAL.test(reason)) { setConn('Error', FRIENDLY[reason] || reason); log('ERROR', 'fatal: ' + reason); if (reason === 'videoNotFound') manualVideoId = ''; return; }
      if (reason === 'quotaExceeded') { setConn('Error', FRIENDLY.quotaExceeded); log('ERROR', 'quota exceeded'); while (my === run && quotaState().used + 6 > CFG.quotaLimit) await sleep(60000); if (my === run) setConn('Reconnecting', 'Quota reset, reconnecting...'); continue; }
      setConn('Reconnecting', 'Network or API problem: ' + reason); log('WARN', 'retry in ' + backoff + 'ms: ' + reason); await sleep(backoff); backoff = Math.min(backoff * 2, 60000);
    }
  }
}
const statT = { likes: 0, subs: Date.now() };   /* survives reconnects, so stats keep their rhythm */
async function watchChat(my) {
  while (my === run) {
    const r = await yt('liveChat/messages', { liveChatId: sess.chatId, part: 'snippet,authorDetails', maxResults: '200', ...(sess.tok ? { pageToken: sess.tok } : {}) }).catch(e => { if (e.reason === 'liveChatEnded' || e.reason === 'liveChatDisabled') { log('INFO', 'chat finished: ' + e.reason); return { ended: true }; } throw e; });
    if (r.ended) return;
    sess.tok = r.nextPageToken || sess.tok;
    if (sess.first) sess.first = false;               /* the first page is old backlog: skip it */
    else for (const m of r.items || []) { const ev = classify(m); if (!ev) continue; if (ev.kind === 'chat_ended') return; if (firstTime(ev.key)) emit('yt', ev); }
    if (Date.now() - statT.likes > CFG.likesMs) { statT.likes = Date.now(); await fetchStats(my); }
    if (Date.now() - statT.subs > CFG.subsMs) { statT.subs = Date.now(); await fetchSubs(my); }
    await sleep(Math.max(r.pollingIntervalMillis || 0, CFG.pollMs));
  }
}
function stopMonitor(conn, msg) { run++; st.live = null; sess = { chatId: '', tok: '', first: true }; setConn(conn, msg); }

/* ---------- HTTP helpers ---------- */
const fails = new Map();
function isAdmin(req) {
  if (!CFG.adminPassword) return 503;
  const ip = req.socket.remoteAddress || '?', f = fails.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 600000) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 8) return 429;
  const a = crypto.createHash('sha256').update(String(req.headers['x-admin-key'] || '')).digest(), b = crypto.createHash('sha256').update(CFG.adminPassword).digest();
  if (crypto.timingSafeEqual(a, b)) { fails.delete(ip); return 200; }
  f.n++; fails.set(ip, f); return 401;
}
function send(res, code, body, type) { res.writeHead(code, { 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); }
function readBody(req) { return new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 10000) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch (e) { r({}); } }); }); }
const states = new Map();   /* OAuth state -> expiry */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json' };
const STATIC = new Set(['index.html', 'style.css', 'game.js', 'gift-system.js', 'youtube.js', 'panel.js']);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, CFG.publicUrl), p = url.pathname;
  try {
    if (p === '/healthz') return send(res, 200, { ok: true });
    if (p === '/api/state') return send(res, 200, publicState());
    if (p === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 3000\n\n'); clients.add(res); res.write('event: state\ndata: ' + JSON.stringify(publicState()) + '\n\n');
      req.on('close', () => clients.delete(res)); return;
    }
    if (p === '/api/auth-url' && req.method === 'POST') {
      const a = isAdmin(req); if (a !== 200) return send(res, a, { error: a === 503 ? 'ADMIN_PASSWORD is not set on the server' : a === 429 ? 'Too many attempts. Wait 10 minutes.' : 'Wrong admin password' });
      if (!CFG.clientId || !CFG.clientSecret) return send(res, 503, { error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set on the server' });
      const s = crypto.randomBytes(16).toString('hex'); states.set(s, Date.now() + 600000);
      const q = new URLSearchParams({ client_id: CFG.clientId, redirect_uri: CFG.publicUrl + '/auth/callback', response_type: 'code', scope: CFG.scope, access_type: 'offline', prompt: 'consent', state: s });
      return send(res, 200, { url: CFG.authUrl + '?' + q });
    }
    if (p === '/auth/callback') {
      const s = url.searchParams.get('state'), code = url.searchParams.get('code'), exp = states.get(s); states.delete(s);
      const page = (t, ok) => '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font:20px system-ui;background:#000;color:#fff;padding:24px"><h2>' + (ok ? '&#9989; ' : '&#10060; ') + t + '</h2><p><a style="color:#39ff14" href="/">Back to the game</a></p>';
      if (!exp || exp < Date.now() || !code) return send(res, 400, page('Login failed: invalid or expired request. Start again from the game.', false), 'text/html; charset=utf-8');
      try {
        const j = await tokenRequest({ code, client_id: CFG.clientId, client_secret: CFG.clientSecret, redirect_uri: CFG.publicUrl + '/auth/callback', grant_type: 'authorization_code' });
        if (!j.refresh_token) return send(res, 400, page('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and try again.', false), 'text/html; charset=utf-8');
        tokens.refresh = j.refresh_token; tokens.access = j.access_token; tokens.expires = Date.now() + (j.expires_in || 3600) * 1000; saveRefresh(); st.channel = null; monitor();
        return send(res, 200, page('YouTube connected. You can return to the game.', true), 'text/html; charset=utf-8');
      } catch (e) { log('ERROR', 'oauth exchange: ' + e.message); return send(res, 400, page('Login failed: ' + e.message, false), 'text/html; charset=utf-8'); }
    }
    if (p.startsWith('/api/') && req.method === 'POST') {
      const a = isAdmin(req); if (a !== 200) return send(res, a, { error: a === 503 ? 'ADMIN_PASSWORD is not set on the server' : a === 429 ? 'Too many attempts. Wait 10 minutes.' : 'Wrong admin password' });
      const body = await readBody(req);
      if (p === '/api/start') { if (!tokens.refresh) return send(res, 400, { error: FRIENDLY.notLoggedIn }); monitor(); return send(res, 200, publicState()); }
      if (p === '/api/connect-live') { manualVideoId = /^[\w-]{6,20}$/.test(body.videoId || '') ? body.videoId : ''; if (!tokens.refresh) return send(res, 400, { error: FRIENDLY.notLoggedIn }); st.live = null; monitor(); return send(res, 200, publicState()); }
      if (p === '/api/disconnect') { stopMonitor('Disconnected', ''); return send(res, 200, publicState()); }
      if (p === '/api/logout') { stopMonitor('Disconnected', ''); clearTokens(); st.channel = null; emit('state', publicState()); return send(res, 200, publicState()); }
      if (p === '/api/log') return send(res, 200, { logs });
    }
    /* static frontend */
    const name = p === '/' ? 'index.html' : p.slice(1);
    if (STATIC.has(name)) { const f = path.join(CFG.frontendDir, name); return fs.readFile(f, (e, d) => { if (e) return send(res, 404, 'Not found', 'text/plain'); res.writeHead(200, { 'content-type': MIME[path.extname(name)] || 'text/plain', 'x-content-type-options': 'nosniff', 'permissions-policy': 'camera=(self)', 'content-security-policy': "default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'", 'cache-control': 'no-cache' }); res.end(d); }); }
    send(res, 404, 'Not found', 'text/plain');
  } catch (e) { log('ERROR', 'request ' + p + ': ' + e.message); try { send(res, 500, { error: 'Server error' }); } catch (e2) {} }
});
function start() { server.listen(CFG.port, () => { log('INFO', 'listening on ' + CFG.port + ' | public url ' + CFG.publicUrl); if (tokens.refresh) { log('INFO', 'saved login found, connecting'); monitor(); } }); return server; }
if (require.main === module) start();
module.exports = { start, server, classify, CFG, st, quota, stopMonitor };
