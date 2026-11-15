'use strict';
/* End-to-end test of the backend against a MOCK Google/YouTube server. No real network or account is used. */
const http = require('http'), os = require('os'), path = require('path'), fs = require('fs');
const MP = 4101, SP = 4100, tmp = path.join(os.tmpdir(), 'snake-live-test-' + process.pid + '.json');
Object.assign(process.env, { PORT: SP, PUBLIC_URL: 'http://127.0.0.1:' + SP, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'secret', ADMIN_PASSWORD: 'pw',
  YT_API_BASE: 'http://127.0.0.1:' + MP + '/youtube/v3', GOOGLE_TOKEN_URL: 'http://127.0.0.1:' + MP + '/token', TOKEN_FILE: tmp,
  CHAT_POLL_MS: 2000, IDLE_SCAN_MS: 400, LIKES_MS: 1000, SUBS_MS: 1000, FRONTEND_DIR: path.join(__dirname, '..', '..') });
const calls = { broadcasts: 0, chat: 0, channels: 0 }; let tokenGrants = [];
const item = (id, type, extra, a) => ({ id, snippet: Object.assign({ type, publishedAt: '2026-11-15T10:00:00Z' }, extra), authorDetails: { displayName: a || 'Ali', channelId: 'UCali' } });
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), json = (c, b) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (u.pathname === '/token') { let d = ''; req.on('data', c => d += c); req.on('end', () => { const p = new URLSearchParams(d); tokenGrants.push(p.get('grant_type')); json(200, { access_token: 'AT' + tokenGrants.length, expires_in: 3600, refresh_token: p.get('grant_type') === 'authorization_code' ? 'RT1' : undefined }); }); return; }
  if (req.headers.authorization !== 'Bearer AT' + tokenGrants.length) return json(401, { error: { errors: [{ reason: 'authError' }] } });
  if (u.pathname.endsWith('/channels')) { calls.channels++; return json(200, { items: [{ id: 'UC1', snippet: { title: 'My Channel' }, statistics: { subscriberCount: calls.channels < 3 ? '100' : '101', hiddenSubscriberCount: false } }] }); }
  if (u.pathname.endsWith('/liveBroadcasts')) { calls.broadcasts++; return json(200, { items: (calls.broadcasts < 3 || calls.chat >= 5) ? [] : [{ id: 'VID1', snippet: { liveChatId: 'CHAT1' } }] }); }
  if (u.pathname.endsWith('/videos')) return json(200, { items: [{ id: 'VID1', statistics: { likeCount: '77' } }] });
  if (u.pathname.endsWith('/liveChat/messages')) {
    calls.chat++; const n = calls.chat, base = { pollingIntervalMillis: 100, nextPageToken: 'T' + n };
    if (n === 1) return json(200, { ...base, items: [item('old1', 'giftEvent', { giftDetails: { giftName: 'Old gift' } })] });
    if (n === 2) return json(200, { ...base, items: [
      item('g1', 'giftEvent', { giftDetails: { giftName: 'Estrella', jewelsAmount: 2, comboCount: 1 } }),
      item('g1', 'giftEvent', { giftDetails: { giftName: 'Estrella', jewelsAmount: 2, comboCount: 1 } }),
      item('g1', 'giftEvent', { giftDetails: { giftName: 'Estrella', jewelsAmount: 2, comboCount: 2 } }),
      item('s1', 'superChatEvent', { superChatDetails: { tier: 3, amountDisplayString: '$5.00', userComment: 'hi' } }),
      item('k1', 'superStickerEvent', { superStickerDetails: { tier: 2, amountDisplayString: '$2.00', superStickerMetadata: { altText: 'cat', stickerId: 'x' } } }),
      item('m1', 'membershipGiftingEvent', { membershipGiftingDetails: { giftMembershipsCount: 5 } }),
      item('n1', 'newSponsorEvent', { newSponsorDetails: { memberLevelName: 'Gold' } }),
      item('t1', 'textMessageEvent', { textMessageDetails: { messageText: '!zorro' } }),
      item('t2', 'textMessageEvent', { textMessageDetails: { messageText: 'hello everyone' } })] });
    if (n === 3) return json(500, { error: { errors: [{ reason: 'backendError' }] } });      /* simulated outage */
    if (n === 4) return json(200, { ...base, items: [item('g9', 'giftEvent', { giftDetails: { giftName: 'Bola de discoteca', comboCount: 0 } })] });
    return json(200, { ...base, items: [item('end', 'chatEndedEvent', {})] });
  }
  json(404, {});
});
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  await new Promise(r => mock.listen(MP, r));
  const app = require('../server.js'); await new Promise(r => app.start().once('listening', r));
  const B = 'http://127.0.0.1:' + SP;
  const post = (p, k, body) => fetch(B + p, { method: 'POST', headers: { 'x-admin-key': k, 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  ok((await post('/api/auth-url', 'wrong')).status === 401, 'wrong admin password is rejected (401)');
  const au = await (await post('/api/auth-url', 'pw')).json(); ok(/accounts\.google\.com/.test(au.url) && /access_type=offline/.test(au.url), 'auth URL built with offline access');
  const state = new URL(au.url).searchParams.get('state');
  /* SSE listener */
  const events = [], states = []; const ac = new AbortController();
  fetch(B + '/events', { signal: ac.signal }).then(async r => { const rd = r.body.getReader(), dec = new TextDecoder(); let buf = ''; for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2); const t = (/event: (\w+)/.exec(blk) || [])[1], d = (/data: (.*)/.exec(blk) || [])[1]; if (t === 'yt') events.push(JSON.parse(d)); if (t === 'state') states.push(JSON.parse(d)); } } }).catch(() => {});
  ok((await fetch(B + '/auth/callback?code=bad&state=nope')).status === 400, 'callback with unknown state is rejected');
  const cb = await fetch(B + '/auth/callback?code=abc&state=' + state); ok(cb.status === 200, 'OAuth callback exchanges the code (200)');
  ok(JSON.parse(fs.readFileSync(tmp, 'utf8')).refresh_token === 'RT1', 'refresh token stored on the server only');
  await new Promise(r => setTimeout(r, 16000));
  const conns = states.map(s => s.conn);
  ok(states.some(s => s.channel && s.channel.title === 'My Channel'), 'channel name detected automatically');
  ok(conns.includes('Connected') && conns.includes('LIVE Active'), 'states: Connected -> LIVE Active (' + [...new Set(conns)].join(', ') + ')');
  ok(conns.includes('Reconnecting'), 'network/API error -> Reconnecting, then recovered');
  const kinds = events.map(e => e.kind + (e.giftName ? ':' + e.giftName : '') + (e.tier ? ':t' + e.tier : ''));
  console.log('events:', kinds.join(' | '));
  ok(!events.some(e => e.giftName === 'Old gift'), 'old backlog message was skipped');
  ok(events.filter(e => e.kind === 'gift' && e.giftName === 'Estrella').length === 2, 'duplicate gift removed, combo update (comboCount 2) kept');
  ok(events.some(e => e.kind === 'superchat' && e.tier === 3), 'Super Chat classified'); ok(events.some(e => e.kind === 'supersticker' && e.alt === 'cat'), 'Super Sticker classified');
  ok(events.some(e => e.kind === 'membership_gift' && e.count === 5), 'Membership Gift classified'); ok(events.some(e => e.kind === 'new_member'), 'new member classified');
  ok(events.some(e => e.kind === 'chat_command' && e.text === '!zorro') && !events.some(e => /hello/.test(e.text || '')), 'only !commands are forwarded from chat (privacy)');
  ok(events.some(e => e.kind === 'gift' && e.giftName === 'Bola de discoteca'), 'event after the outage was not lost');
  ok(events.some(e => e.kind === 'subscriber' && e.approx), 'subscriber increase detected (approximate, from channel statistics)');
  ok(states.some(s => s.likes === 77) || (await (await fetch(B + '/api/state')).json()).likes === 77, 'like count read from video statistics');
  const fin = await (await fetch(B + '/api/state')).json();
  ok(fin.quota.used > 0, 'API quota is counted (' + fin.quota.used + '/' + fin.quota.limit + ')'); ok(!JSON.stringify(fin).includes('RT1') && !JSON.stringify(fin).includes('AT'), 'no token appears in public state');
  ok(fin.conn === 'Connected' && /ended|Waiting/.test(fin.msg), 'live end handled: back to Connected / waiting (' + fin.msg + ')');
  const d = await (await post('/api/disconnect', 'pw')).json(); ok(d.conn === 'Disconnected', 'Disconnect works');
  ok((await fetch(B + '/index.html')).status === 200 && (await fetch(B + '/server.js')).status === 404, 'only whitelisted frontend files are served');
  ac.abort(); app.stopMonitor('Disconnected', ''); app.server.close(); mock.close(); try { fs.unlinkSync(tmp); } catch (e) {} setTimeout(() => process.exit(process.exitCode || 0), 200);
})();
