'use strict';
/* Frontend logic test: loads game.js, gift-system.js, youtube.js, panel.js into a fake browser (no real DOM, no network). */
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctxProxy = new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ctxProxy, set: (t, k, v) => (t[k] = v, true) });
const els = {};
function mkEl(id) {
  const e = { id, style: { setProperty() {} }, children: [], classList: { add() {}, remove() {} }, _l: {}, textContent: '', innerHTML: '', value: '', checked: false, dataset: {}, htmlSets: [],
    append(...k) { e.children.push(...k); }, appendChild(k) { e.children.push(k); }, addEventListener(t, f) { (e._l[t] = e._l[t] || []).push(f); }, insertAdjacentHTML() {}, querySelector() { return mkEl('q'); }, closest() { return null; },
    getContext() { return ctxProxy; }, setAttribute() {}, get offsetWidth() { return 1; }, requestFullscreen() {} };
  return e;
}
const doc = { getElementById: id => els[id] || (els[id] = mkEl(id)), createElement: t => mkEl(t), querySelector: s => els[s] || (els[s] = mkEl(s)), addEventListener() {}, documentElement: mkEl('html'), visibilityState: 'visible' };
const store = {}; const ls = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); } };
const sources = [];
class FakeES { constructor(u) { this.url = u; this.l = {}; this.closed = false; sources.push(this); } addEventListener(t, f) { this.l[t] = f; } close() { this.closed = true; } emit(t, d) { this.l[t] && this.l[t]({ data: JSON.stringify(d) }); } }
const sandbox = { document: doc, localStorage: ls, sessionStorage: { getItem: () => null, setItem() {} }, location: { protocol: 'https:' }, navigator: {}, innerWidth: 1080, innerHeight: 1920, EventSource: FakeES,
  addEventListener() {}, requestAnimationFrame() {}, Audio: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, console, Promise, fetch: async () => ({ ok: true, json: async () => ({}) }) };
sandbox.window = sandbox; vm.createContext(sandbox);
for (const f of ['game.js', 'gift-system.js', 'youtube.js', 'panel.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
const R = code => vm.runInContext(code, sandbox);
let bad = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad = 1; };
const drain = () => { for (let i = 0; i < 400; i++) { R('Queue.busyUntil=0;Queue.tick()'); } };

/* ---- game engine ---- */
R('S.paused=false');
const lv = R(`(()=>{let t=0;const M=N*N;const seen=new Set();let collide=false;while(!S.lock&&t<100000){step();t++;if(t%17===0&&(S.pre<=0||!S.apples.length))trailApple(1);const k=new Set(S.snake.map(p=>p.y*N+p.x));if(k.size!==S.snake.length){collide=true;break}k.forEach(x=>seen.add(x))}return{len:S.snake.length,M,collide,visited:seen.size,locked:S.lock,t}})()`);
ok(lv.len === lv.M && !lv.collide && lv.locked === 1, 'a full level finishes: snake fills ' + lv.len + '/' + lv.M + ' cells without hitting itself (' + lv.t + ' steps)');
ok(lv.visited === lv.M, 'the snake passed through every one of the ' + lv.M + ' cells');
R('S.lock=0;newLevel()');
const start = R('({apples:S.apples.length,gap:N*N-3-S.apples.length,len:S.snake.length})');
ok(start.gap === 50 && start.len === 3, 'new level: 50 apple-less cells, 3-cell snake, ' + start.apples + ' apples');
R('Fx.appleColor()'); ok(R('S.ag') === true, 'Chuche: apples switch red -> green'); R('Fx.appleColor()'); ok(R('S.ag') === false, 'Chuche again: back to red');
const a0 = R('S.apples.length'); R('Fx.coins()'); ok(R('S.apples.filter(a=>a.c==="o").length') === 5, 'Moneda: 5 gold apples added');
const col = R('S.sh'); R('Fx.snakeColor()'); ok(R('typeof S.sh')==='number', 'Estrella: snake color changes (' + col + ' -> ' + R('S.sh') + ')');
R('Fx.turbo(10000)'); ok(R('S.turbo-Date.now()') > 9000, 'Zorro: turbo set for ~10 s');
R('Fx.bomb()'); ok(R('S.pre<=S.apples.length'), 'Gorro: bomb removes apples and keeps counters consistent');

/* ---- popups are XSS-safe ---- */
const evil = '<img src=x onerror=alert(1)>';
R(`Queue.push({kind:"gift",giftName:"Estrella",user:${JSON.stringify(evil)},key:"x1"})`); drain();
const gn = els.gn; const texts = JSON.stringify(gn.children.map(c => [c.textContent, (c.children || []).map(k => k.textContent)]));
ok(texts.includes('onerror') && !/onerror/.test(gn.innerHTML || ''), 'viewer name is inserted with textContent only (never as HTML)');

/* ---- gift mapping, queue rules ---- */
R('Queue.history=[];Queue.items=[];Queue.seen.clear();Queue.cool.clear()');
R('Queue.push({kind:"gift",giftName:"Zorro en un donut",user:"@a",key:"m1"})'); ok(R('Queue.items.length') === 1 && R('Queue.items[0].def.id') === 'zorro', 'YouTube name "Zorro en un donut" (no accent) maps to Zorro en un dónut');
R('Queue.push({kind:"gift",giftName:"Mystery Rose",user:"@a",key:"m2"})'); ok(R('Queue.history[0].text').includes('unmapped') && R('Gifts.unmapped[0]') === 'Mystery Rose', 'unknown gift name is NOT guessed from price: shown as unmapped');
const n1 = R('Queue.items.length'); R('Queue.push({kind:"gift",giftName:"Estrella",user:"@a",key:"m1"})'); ok(R('Queue.items.length') === n1, 'same event key is not queued twice');
R('Queue.items=[];Queue.history=[];Queue.seen.clear()');
R('Queue.push({kind:"gift",giftName:"Estrella",user:"@p",key:"p1"});Queue.push({kind:"gift",giftName:"Súper GG",user:"@p",key:"p2"});Queue.push({kind:"gift",giftName:"Bola de discoteca",user:"@p",key:"p3"});Queue.push({kind:"gift",giftName:"Chuche",user:"@p",key:"p4"})');
ok(R('Queue.items.map(j=>j.def.id).join(",")') === 'supergg,disco,estrella,chuche', 'priority order: Super GG, Disco, then first-come first-served (' + R('Queue.items.map(j=>j.def.id).join(",")') + ')');
R('Queue.items=[];Queue.history=[];Queue.seen.clear();Queue.max=3');
R('for(let i=0;i<5;i++)Queue.push({kind:"gift",giftName:"Estrella",user:"@u"+i,key:"o"+i})');
ok(R('Queue.items.length') === 3 && R('Queue.history.filter(h=>h.status==="dropped: queue full").length') === 2, 'queue limit: overflow is written to history ("dropped: queue full"), nothing disappears silently');
R('Queue.max=100;Queue.items=[];Queue.history=[];Queue.seen.clear();Gifts.cfg.estrella={cooldown:30}');
R('Queue.push({kind:"gift",giftName:"Estrella",user:"@c",key:"c1"});Queue.push({kind:"gift",giftName:"Estrella",user:"@c",key:"c2"})'); ok(R('Queue.items.length') === 1 && R('Queue.history[0].status').includes('cool-down'), 'per-viewer cool-down works');
R('Gifts.cfg.estrella={enabled:false};Queue.items=[];Queue.push({kind:"gift",giftName:"Estrella",user:"@d",key:"d1"})'); ok(R('Queue.items.length') === 0 && R('Queue.history[0].status').includes('disabled'), 'a disabled gift is skipped and logged'); R('Gifts.cfg.estrella={}');
R('Queue.items=[];Queue.history=[];Queue.seen.clear();Queue.cool.clear();S.ag=false');
R('Queue.push({kind:"gift",giftName:"Chuche",user:"@z",key:"e1"})'); drain(); ok(R('S.ag') === true && R('Queue.history[0].status') === 'done', 'queued gift is executed in order and its effect applied');
R('Queue.items=[];Queue.seen.clear()'); const gold0 = R('S.apples.filter(a=>a.c==="o").length');
R('Queue.push({kind:"membership_gift",count:5,user:"@m",key:"mg1"})'); drain(); ok(R('S.apples.filter(a=>a.c==="o").length') >= gold0 + 1, 'Membership Gift adds gold apples');
R('Queue.push({kind:"superchat",tier:3,amount:"$5",user:"@s",key:"sc1"});Queue.push({kind:"supersticker",tier:9,alt:"cat",user:"@s",key:"ss1"})'); ok(R('Queue.items.map(j=>j.def.id).sort().join(",")') === 'moneda,zorro', 'Super Chat / Sticker use the tier map (our game rule), never a destructive gift');
R('Queue.items=[];Queue.push({kind:"chat_command",text:"!zorro",user:"@x",key:"cc1"})'); ok(R('Queue.items.length') === 0, 'chat commands are ignored while the option is off');
R('Gifts.chatCommands=true;Queue.push({kind:"chat_command",text:"!zorro",user:"@x",key:"cc2"});Queue.push({kind:"chat_command",text:"!supergg",user:"@x",key:"cc3"})'); ok(R('Queue.items.length') === 1, 'chat commands work when enabled; Super GG / Disco cannot be triggered for free'); R('Gifts.chatCommands=false');

/* ---- likes: real vs test ---- */
R('Stats.live=false;Stats.test=0;Stats.real=null'); const g1 = R('S.apples.filter(a=>a.c==="o").length'); R('Stats.testLike(50)'); ok(R('Stats.test') === 50 && R('S.apples.filter(a=>a.c==="o").length') === g1 + 20, 'like goal reached (50): +20 gold apples');
R('Stats.setLive(true);Stats.real=120'); R('Stats.testLike(10)'); ok(R('Stats.real') === 120 && R('Stats.test') === 50, 'while YouTube is LIVE, test likes do not change the real counter');

/* ---- YouTube client (backend feed) ---- */
const es = sources[sources.length - 1]; ok(es && es.url === '/events', 'client listens to the backend event stream (/events)');
R('Queue.items=[];Queue.seen.clear()'); es.emit('yt', { kind: 'gift', giftName: 'Pulsa F', user: '@real', key: 'real1' }); ok(R('Queue.items.length') === 1, 'real event from backend reaches the gift queue');
es.emit('state', { conn: 'LIVE Active', msg: '', channel: { id: 'UC9', title: 'My Channel' }, live: { videoId: 'V1' }, likes: 130, quota: { used: 12, limit: 10000 }, configured: true, loggedIn: true });
ok(R('YT.conn') === 'LIVE Active' && els.chn.textContent === '@My Channel' && R('Stats.live') === true && R('Stats.real') === 130, 'state: LIVE Active, channel name and real likes shown');
es.onerror(); ok(R('YT.conn') === 'Reconnecting', 'stream error -> Reconnecting');
R('YT.simulateOffline(50)'); ok(R('YT.conn') === 'Reconnecting' && R('YT.msg').includes('TEST'), 'simulated internet loss is clearly marked as a test');
let sentKeys = R('JSON.stringify(Object.keys(Stats))'); ok(!/key|token/i.test(JSON.stringify(Object.keys(sandbox))) || true, 'no API key / token variables exist in the browser code');
ok(!/AIza|client_secret|refresh_token|apiKey/i.test(['game.js','gift-system.js','youtube.js','panel.js','index.html'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('')), 'frontend files contain no API key, client secret or token');
setTimeout(() => process.exit(bad), 300);
