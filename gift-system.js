'use strict';
/* Snake LIVE PRO - gift system: gift definitions and mapping, popups, priority queue, history, likes, test events.
 * Real events arrive from youtube.js as normalized objects { kind, user, key, ... } (see backend/server.js classify()).
 * Test events use the same path but are flagged test:true and never touch the real YouTube like counter. */
const ICON=[
`<svg viewBox="0 0 64 64"><path d="M32 5l8 16 17 3-12 12 3 18-16-8-16 8 3-18L7 24l17-3z" fill="#ffe27a" stroke="#f2b90f" stroke-width="3" stroke-linejoin="round"/><circle cx="26" cy="31" r="2.4" fill="#6b4a1a"/><circle cx="38" cy="31" r="2.4" fill="#6b4a1a"/><path d="M28 37q4 3 8 0" stroke="#6b4a1a" stroke-width="2" fill="none"/></svg>`,
`<svg viewBox="0 0 64 64"><g transform="rotate(-35 32 32)" fill="#d9954f" stroke="#a8682a" stroke-width="2"><rect x="12" y="25" width="40" height="14" rx="5"/><circle cx="12" cy="24" r="7"/><circle cx="12" cy="40" r="7"/><circle cx="52" cy="24" r="7"/><circle cx="52" cy="40" r="7"/></g><circle cx="30" cy="30" r="1.6" fill="#7a4a1a"/><circle cx="36" cy="34" r="1.6" fill="#7a4a1a"/></svg>`,
`<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#d9a93d" stroke="#f6dc7a" stroke-width="4"/><circle cx="32" cy="32" r="19" fill="none" stroke="#a87a1d" stroke-width="2"/><g fill="#a87a1d"><circle cx="27" cy="27" r="6"/><circle cx="37" cy="27" r="6"/><circle cx="27" cy="36" r="6"/><circle cx="37" cy="36" r="6"/></g><path d="M32 34l4 12" stroke="#a87a1d" stroke-width="3"/></svg>`,
`<svg viewBox="0 0 64 64"><rect x="6" y="8" width="52" height="48" rx="8" fill="#2f2f2f" stroke="#777" stroke-width="3"/><rect x="12" y="12" width="40" height="34" rx="6" fill="#4a4a4a"/><text x="32" y="39" font-size="30" font-weight="900" fill="#fff" text-anchor="middle" font-family="Arial">F</text></svg>`,
`<svg viewBox="0 0 64 64"><path d="M32 8l19 46H13z" fill="#6d5bff"/><path d="M25 28l-7 17 11 4zM38 32l9 15-10 3z" fill="#ff4d6d"/><ellipse cx="32" cy="54" rx="21" ry="5" fill="#ff4d6d"/><circle cx="32" cy="8" r="6" fill="#ffd23f"/></svg>`,
`<svg viewBox="0 0 64 64"><circle cx="32" cy="40" r="22" fill="#e8a458"/><circle cx="32" cy="40" r="8" fill="#0a0a0a"/><path d="M16 6l9 11h14l9-11 3 17c0 9-9 13-19 13S13 32 13 23z" fill="#f58a2a"/><path d="M24 24q8 12 16 0z" fill="#fff"/><circle cx="25" cy="20" r="2" fill="#222"/><circle cx="39" cy="20" r="2" fill="#222"/></svg>`,
`<svg viewBox="0 0 64 64"><rect x="30" y="1" width="4" height="10" fill="#aaa"/><circle cx="32" cy="36" r="24" fill="#cdd6ff" stroke="#8a96e8" stroke-width="2"/><path d="M10 28h44M10 44h44M20 14v44M32 12v48M44 14v44" stroke="#9aa5f0" stroke-width="1.5"/><circle cx="24" cy="32" r="3" fill="#222"/><circle cx="40" cy="32" r="3" fill="#222"/><path d="M22 40q10 14 20 0z" fill="#7a2cff"/></svg>`,
`<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#5f73ff" stroke="#c9d1ff" stroke-width="4"/><ellipse cx="32" cy="32" rx="27" ry="10" fill="none" stroke="#c9d1ff" stroke-width="2" transform="rotate(-25 32 32)"/><text x="32" y="41" font-size="26" font-weight="900" fill="#fff" text-anchor="middle" font-family="Arial">GG</text></svg>`];
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/* ---------- the 8 game gifts (names are the in-game names; YouTube names are matched through aliases) ---------- */
const GIFT_BASE = [
  { id: "estrella", name: "Estrella", value: 2, label: "CHANGE COLOR SNAKE", fx: "snakeColor", desc: "Snake color changed", cmd: "estrella", pr: 1 },
  { id: "chuche", name: "Chuche", value: 5, label: "CHANGE COLOR APPLES", fx: "appleColor", desc: "Apple color switched (red / green)", cmd: "chuche", pr: 1 },
  { id: "moneda", name: "Moneda dorada", value: 10, label: "SEND +5 APPLES 🍎", fx: "coins", desc: "+5 gold apples", cmd: "moneda", pr: 1 },
  { id: "pulsaf", name: "Pulsa F", value: 10, label: "FART 💨", fx: "fart", desc: "Fart effect 💨", cmd: "f", pr: 1 },
  { id: "gorro", name: "Gorro de fiesta", value: 20, label: "x1 BOMB 💣", fx: "bomb", desc: "Bomb: apples blown up 💣", cmd: "gorro", pr: 1 },
  { id: "zorro", name: "Zorro en un dónut", value: 60, label: "TURBO ⚡", fx: "turbo", desc: "Turbo: {s} seconds ⚡", cmd: "zorro", pr: 2, ms: 10000 },
  { id: "disco", name: "Bola de discoteca", value: 250, label: "GAME OVER 💀", fx: "gameOver", desc: "Game over 💀", cmd: "", pr: 2 },
  { id: "supergg", name: "Súper GG", value: 10000, label: "RIP LIVE ⚰️", fx: "ripLive", desc: "RIP LIVE: back to level 1", cmd: "", pr: 3 }
];
const Gifts = {
  cfg: ld("giftCfg", {}), tierMap: ld("tierMap", { 1: "estrella", 2: "chuche", 3: "moneda", 4: "gorro", 5: "zorro" }), unmapped: [], testCards: ld("testCards", true), chatCommands: ld("chatCommands", false),
  defs: GIFT_BASE.map(b => Object.assign({}, b)),
  c(g) { return this.cfg[g.id] || (this.cfg[g.id] = {}); },
  on(g) { return this.c(g).enabled !== false; }, cooldown(g) { return +this.c(g).cooldown || 0; }, priority(g) { return +this.c(g).priority || g.pr; },
  ms(g) { return +this.c(g).ms || g.ms || 0; }, popupMs(g) { return +this.c(g).popupMs || 0; }, aliases(g) { return String(this.c(g).aliases || ""); },
  save() { sv("giftCfg", this.cfg); sv("tierMap", this.tierMap); sv("testCards", this.testCards); sv("chatCommands", this.chatCommands); },
  byId(id) { return this.defs.find(g => g.id === id); },
  match(name) {       /* match a YouTube giftName by the in-game name or by user-defined aliases; never by price */
    const n = norm(name); if (!n) return null;
    for (const g of this.defs) { const c = [norm(g.name)].concat(this.aliases(g).split(",").map(norm)).filter(Boolean); if (c.some(x => n === x || (x.length >= 4 && n.includes(x)))) return g; }
    return null;
  },
  tier(t) { return this.byId(this.tierMap[Math.min(Math.max(+t || 1, 1), 5)] || "zorro"); }
};

/* ---------- popups: every field is editable in the panel; all text is inserted with textContent (XSS-safe) ---------- */
const Popup = {
  cfg: Object.assign({ ms: 3000, color: "#ffd23f", scale: 1, pos: "middle", anim: true, tpl: {} }, ld("popup", {})),
  TPL: { gift: "{user}|{gift}|{effect}", unmapped: "{user}|{gift}|no game effect assigned", superchat: "{user}|Super Chat {amount}|{comment}", supersticker: "{user}|Super Sticker {amount}|{alt}",
    subscriber: "New subscriber!|{user}|{msg}", membership: "{user}|Gifted {count} memberships|+{apples} gold apples", member: "{user}|{what}|welcome!",
    likegoal: "Like goal reached!|{likes} likes|+20 gold apples", level: "LEVEL {level}||", win: "YOU WIN! NEXT LEVEL {level}|{tier}", lose: "GAME OVER|LEVEL {level}" },
  ICONS: { superchat: "💬", supersticker: "🏷️", subscriber: "🔔", membership: "🎁", member: "⭐", likegoal: "👍", level: "🏁", unmapped: "🎁" },
  lines(kind, v) { const t = (this.cfg.tpl[kind] !== undefined ? this.cfg.tpl[kind] : this.TPL[kind]) || ""; return t.split("|").map(s => s.replace(/\{(\w+)\}/g, (m, k) => v[k] === undefined ? "" : String(v[k]))); },
  save() { sv("popup", this.cfg); },
  show(kind, vars, o) {
    o = o || {}; const el = $("gn"), L = this.lines(kind, vars || {}), ms = o.ms || this.cfg.ms;
    el.textContent = ""; const gi = document.createElement("div"); gi.className = "gi";
    if (o.icon !== undefined && ICON[o.icon]) gi.innerHTML = ICON[o.icon]; else { gi.textContent = this.ICONS[kind] || "🎁"; gi.style.fontSize = "150px"; }   /* ICON entries are constants of this file */
    const box = document.createElement("div"), b = document.createElement("b"), sp = document.createElement("span"), em = document.createElement("em");
    b.textContent = L[0] || ""; sp.textContent = L[1] || ""; em.textContent = L[2] || ""; box.append(b, sp, em); el.append(gi, box);
    el.style.setProperty("--pc", this.cfg.color); el.style.setProperty("--pfs", this.cfg.scale); el.style.top = { top: "300px", middle: "660px", bottom: "1000px" }[this.cfg.pos] || "660px";
    el.style.display = "flex"; el.classList.remove("pop"); if (this.cfg.anim) { void el.offsetWidth; el.classList.add("pop"); }
    clearTimeout(this.t); this.t = setTimeout(() => { el.style.display = "none"; }, ms); return ms;
  }
};
Hooks.banner = (k, v) => Popup.lines(k, v);
let levelSeen = false;
Hooks.level = l => { if (levelSeen) Popup.show("level", { level: l }, { ms: 1500 }); levelSeen = true; };

/* ---------- notification pill: shows an event for 5 s, then returns to the original "subscribe" text ---------- */
const Note = {
  u: $("nu").textContent, t: $("nt").textContent, tm: 0, ms: 5000,
  show(u, t, ms) { $("nu").textContent = u; $("nt").textContent = t; clearTimeout(this.tm); this.tm = setTimeout(() => this.idle(), ms || this.ms); },
  idle() { $("nu").textContent = this.u; $("nt").textContent = this.t; }
};

/* ---------- likes (real value comes only from YouTube; test likes are separate) ---------- */
const Stats = {
  real: null, test: 0, live: false, subs: null,
  value() { return this.live && this.real !== null ? this.real : this.test; },
  render() { const v = this.value(), goal = (Math.floor(v / 50) + 1) * 50; $("lkt").textContent = "👍 LIKES " + v + " / " + goal + "  +20 apples"; $("lkb").style.width = (v % 50) / 50 * 100 + "%"; },
  bonus(oldV, newV) { if (Math.floor(newV / 50) > Math.floor(oldV / 50)) { addApples(20, true); Snd.play("gift"); Popup.show("likegoal", { likes: newV }); } },
  setReal(n) { if (n === null || n === undefined) return; const old = this.real; this.real = +n; if (old !== null && this.live) this.bonus(old, this.real); this.render(); },
  setLive(b) { this.live = !!b; this.render(); },
  testLike(n) { if (this.live) { Popup.show("gift", { user: "TEST", gift: "Like", effect: "not counted: YouTube is connected" }); return; } const o = this.test; this.test += n; this.bonus(o, this.test); this.render(); }
};

/* ---------- queue: priority, de-duplication, per-user cool-down, history ---------- */
const Queue = {
  items: [], history: ld("giftHistory", []), seen: new Map(), max: ld("queueMax", 100), paused: false, busyUntil: 0, cool: new Map(), dirty: false,
  log(job, status) { this.history.unshift({ t: Date.now(), kind: job.kind, user: job.user, text: job.text, status, test: !!job.test }); if (this.history.length > 200) this.history.length = 200; this.dirty = true; },
  job(ev) {
    const user = String(ev.user || "").slice(0, 40), test = !!ev.test, base = { kind: ev.kind, user, test, key: ev.key };
    switch (ev.kind) {
      case "gift": { const g = Gifts.match(ev.giftName); if (!g) { if (ev.giftName && !Gifts.unmapped.includes(ev.giftName)) { Gifts.unmapped.unshift(ev.giftName); Gifts.unmapped.length = Math.min(Gifts.unmapped.length, 20); } return Object.assign(base, { text: "unmapped gift: " + ev.giftName, pk: "unmapped", vars: { user, gift: ev.giftName || "gift" }, pr: 1 }); }
        return this.fromDef(base, g, ev.combo > 1 ? " x" + ev.combo : ""); }
      case "superchat": return Object.assign(this.fromDef(base, Gifts.tier(ev.tier)), { pk: "superchat", vars: { user, amount: ev.amount || "", comment: ev.comment || "" }, text: "Super Chat " + (ev.amount || "") });
      case "supersticker": return Object.assign(this.fromDef(base, Gifts.tier(ev.tier)), { pk: "supersticker", vars: { user, amount: ev.amount || "", alt: ev.alt || "" }, text: "Super Sticker " + (ev.amount || "") });
      case "membership_gift": { const n = Math.max(1, +ev.count || 1), a = Math.min(n * 2, 40); return Object.assign(base, { text: "Membership gift x" + n, pk: "membership", vars: { user, count: n, apples: a }, pr: 2, run: () => { addApples(a, true); Snd.play("gift"); } }); }
      case "gift_membership_received": return Object.assign(base, { text: "gift membership received", pk: "member", vars: { user, what: "Received a gift membership" }, pr: 1 });
      case "new_member": return Object.assign(base, { text: "new member", pk: "member", vars: { user, what: "New member " + (ev.level || "") }, pr: 1, note: true });
      case "member_milestone": return Object.assign(base, { text: "member milestone", pk: "member", vars: { user, what: (ev.months || "") + " months a member" }, pr: 1 });
      case "subscriber": return Object.assign(base, { text: "new subscriber" + (ev.approx ? " (approximate)" : ""), pk: "subscriber", vars: { user: user || "A viewer", msg: test ? "Please subscribe!" : "thanks for subscribing!" }, pr: 1, note: true });
      case "chat_command": { if (!Gifts.chatCommands) return null; const g = Gifts.defs.find(x => x.cmd && "!" + x.cmd === ev.text); if (!g) return null; return this.fromDef(Object.assign(base, { cmdOnly: true }), g, " (chat command)"); }
      default: return null;
    }
  },
  fromDef(base, g, suffix) {
    const ms = Gifts.ms(g) || 10000, eff = g.desc.replace("{s}", Math.round(ms / 1000));
    return Object.assign(base, { def: g, text: g.name + (suffix || ""), pk: "gift", vars: { user: base.user, gift: g.name + (suffix || ""), effect: eff }, pr: Gifts.priority(g), run: () => { (Fx[g.fx] || Fx.none)(g.fx === "turbo" ? ms : undefined); if (g.id === "supergg" && base.user) $("ggu").textContent = base.user; } });
  },
  push(ev) {
    if (!ev || !ev.kind) return;
    if (ev.key) { if (this.seen.has(ev.key)) return; this.seen.set(ev.key, 1); if (this.seen.size > 5000) { let i = 0; for (const k of this.seen.keys()) { this.seen.delete(k); if (++i > 2500) break; } } }
    const j = this.job(ev); if (!j) return;
    if (j.def) {
      if (!Gifts.on(j.def)) return this.log(j, "skipped: gift disabled");
      const cd = j.cmdOnly ? Math.max(20, Gifts.cooldown(j.def)) : Gifts.cooldown(j.def), ck = j.user + ":" + j.def.id, now = Date.now();
      if (cd && j.user && now - (this.cool.get(ck) || 0) < cd * 1000) return this.log(j, "skipped: cool-down " + cd + "s");
      this.cool.set(ck, now); if (this.cool.size > 3000) this.cool.clear();
    }
    if (this.items.length >= this.max) {     /* never silently lose a gift: the drop is written to the history */
      let low = 0; this.items.forEach((x, i) => { if (x.pr <= this.items[low].pr) low = i; });
      if (j.pr > this.items[low].pr) { this.log(this.items[low], "dropped: queue full"); this.items.splice(low, 1); } else return this.log(j, "dropped: queue full");
    }
    let i = this.items.length; while (i > 0 && this.items[i - 1].pr < j.pr) i--; this.items.splice(i, 0, j);   /* priority first, then first-come first-served */
    this.log(j, "queued");
  },
  tick() {
    if (this.paused || Date.now() < this.busyUntil || !this.items.length) return;
    const j = this.items.shift(); let ms = Popup.cfg.ms;
    try {
      if (j.note) Note.show(j.user || "@viewer", j.kind === "subscriber" ? j.vars.msg : "welcome!");
      if (j.def) Note.show(j.user || "@viewer", j.def.name);
      ms = Popup.show(j.pk, j.vars, { icon: j.def ? Gifts.defs.indexOf(j.def) : undefined, ms: j.def ? Gifts.popupMs(j.def) || undefined : undefined });
      if (j.def) Snd.play("gift"); j.run && j.run(); this.log(j, "done");
    } catch (e) { this.log(j, "error: " + e.message); }
    this.busyUntil = Date.now() + ms;
  },
  setMax(n) { this.max = Math.max(5, Math.min(1000, +n || 100)); sv("queueMax", this.max); },
  clearHistory() { this.history = []; this.dirty = true; }
};
setInterval(() => Queue.tick(), 200);
setInterval(() => { if (Queue.dirty) { Queue.dirty = false; sv("giftHistory", Queue.history.slice(0, 100)); } }, 3000);

/* ---------- test events (flagged test:true; they use the same pipeline as real events) ---------- */
let testSeq = 0;
const Test = {
  ev(o) { return Object.assign({ user: "@test_user", test: true, key: "test:" + Date.now() + ":" + (++testSeq) }, o); },
  gift(id) { const g = Gifts.byId(id); if (g) Queue.push(this.ev({ kind: "gift", giftName: g.name })); },
  superchat(t) { Queue.push(this.ev({ kind: "superchat", tier: t || 3, amount: "$5.00", comment: "Test Super Chat" })); },
  supersticker(t) { Queue.push(this.ev({ kind: "supersticker", tier: t || 2, amount: "$2.00", alt: "Test sticker" })); },
  membershipGift(n) { Queue.push(this.ev({ kind: "membership_gift", count: n || 5 })); },
  subscriber() { Queue.push(this.ev({ kind: "subscriber", user: "@new_subscriber" })); },
  like(n) { Stats.testLike(n || 10); },
  flood(n) { for (let i = 0; i < (n || 30); i++) Queue.push(this.ev({ kind: "gift", giftName: Gifts.defs[rnd(6)].name, user: "@user" + (i % 7) })); }
};

/* ---------- gift cards on the stage ---------- */
(() => {
  const cards = $("cards");
  Gifts.defs.forEach((g, i) => { const x = 96 + i * 111.5; cards.insertAdjacentHTML("beforeend", '<div class="card abs" style="left:' + x + 'px" data-i="' + i + '"><div class="ic">' + ICON[i] + '</div><div class="nm">' + g.name + '</div><div class="pr">🔹' + g.value + '</div></div><div class="lab abs" style="left:' + x + 'px">' + g.label + '</div>'); });
  cards.addEventListener("click", e => { const c = e.target.closest(".card"); if (c && Gifts.testCards) Test.gift(Gifts.defs[+c.dataset.i].id); });
  Stats.render();
})();
