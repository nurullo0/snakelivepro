'use strict';
/* Snake LIVE PRO - control panel (opened by pressing the top-left corner for 1.5 s) and application start-up. */
const el = (tag, props, ...kids) => { const e = document.createElement(tag); Object.assign(e, props || {}); kids.forEach(k => e.append(k)); return e; };
const Cam = {
  cfg: Object.assign({ w: 260, x: 700, y: 164, on: false }, ld("cam", {})), stream: null,
  apply() { const c = $("cam"); c.style.width = this.cfg.w + "px"; c.style.height = Math.round(this.cfg.w * 9 / 16) + "px"; c.style.left = this.cfg.x + "px"; c.style.top = this.cfg.y + "px"; sv("cam", this.cfg); },
  async toggle() {
    const v = $("vid"), em = document.querySelector("#cam em");
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; v.style.display = "none"; em.style.display = "flex"; em.textContent = "CAMERA"; this.cfg.on = false; this.apply(); return ""; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { em.textContent = "Camera needs HTTPS"; return "Camera is not available: open the game from an https:// address."; }
    try { this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }); v.srcObject = this.stream; v.style.display = "block"; em.style.display = "none"; this.cfg.on = true; this.apply(); return ""; }
    catch (e) { em.textContent = "Camera blocked"; return e.name === "NotAllowedError" ? "Camera permission was denied. Allow it in the browser site settings." : "Camera error: " + e.name; }
  }
};
let WL = null;
async function keepAwake() { try { if ("wakeLock" in navigator && !WL) { WL = await navigator.wakeLock.request("screen"); WL.addEventListener("release", () => { WL = null; }); } } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !S.paused) keepAwake(); });

const Panel = (() => {
  const root = $("panel"); let started = false, tmr = 0, goBtn, badge, info, qinfo, hist, statusMsg;
  const row = (label, input) => el("div", { className: "r" }, el("label", { textContent: label }), input);
  const num = (v, min, max, step, fn) => { const i = el("input", { type: "number", value: v, min, max, step: step || 1 }); i.onchange = () => fn(+i.value); return i; };
  const chk = (v, fn) => { const i = el("input", { type: "checkbox", checked: !!v }); i.onchange = () => fn(i.checked); return i; };
  const btn = (t, fn, cls) => el("button", { textContent: t, className: cls || "", onclick: async () => { try { await fn(); } catch (e) { say(e.message); } } });
  const sec = (title, open) => { const d = el("details", { open: !!open }, el("summary", { textContent: title })), inn = el("div", { className: "in" }); d.append(inn); return [d, inn]; };
  const say = t => { statusMsg.textContent = t || ""; };
  function peek(ms) { root.style.display = "none"; clearTimeout(tmr); tmr = setTimeout(() => { root.style.display = "block"; }, ms); }
  function refresh() {
    badge.className = "badge b-" + YT.conn.split(" ")[0]; badge.textContent = YT.conn;
    const q = YT.quota ? "  |  API quota " + YT.quota.used + "/" + YT.quota.limit : "";
    info.textContent = (YT.channel ? "Channel: " + YT.channel.title + "\nChannel ID: " + YT.channel.id : "Channel: not detected") + "\nLIVE: " + (YT.live ? "Video ID " + YT.live.videoId : YT.conn === "LIVE Active" ? "active" : "not live") + "\nLikes: " + (Stats.real === null ? "-" : Stats.real) + "   Subscribers: " + (Stats.subs === null || Stats.subs === undefined ? "-" : Stats.subs) + q + (YT.msg ? "\n" + YT.msg : "");
    qinfo.textContent = "Queue: " + Queue.items.length + " waiting (max " + Queue.max + ")" + (Queue.paused ? "  [PAUSED]" : "");
    hist.textContent = Queue.history.slice(0, 15).map(h => new Date(h.t).toLocaleTimeString() + (h.test ? " [TEST] " : " ") + h.kind + " " + (h.user || "") + " - " + h.text + " -> " + h.status).join("\n") || "No events yet." + (Gifts.unmapped.length ? "" : "");
    if (Gifts.unmapped.length) hist.textContent += "\n\nUnmapped YouTube gift names (add them as aliases in Gift Mapping):\n" + Gifts.unmapped.join(", ");
  }
  function build() {
    root.textContent = "";
    const sheet = el("div", { className: "sheet" });
    badge = el("span", { className: "badge" }); statusMsg = el("div", { className: "msg" });
    goBtn = btn("▶ START GAME", () => { go(); }, "go");
    sheet.append(el("h1", { textContent: "Snake LIVE PRO" }), badge, statusMsg, goBtn);
    /* --- YouTube --- */
    let [d, b] = sec("YouTube connection", true); info = el("pre"); const vid = el("input", { type: "text", placeholder: "Video ID (optional, otherwise detected automatically)" }), pw = el("input", { type: "password", placeholder: "Admin password (set on the server)", value: YT.admin }); pw.onchange = () => YT.setAdmin(pw.value);
    b.append(info, row("Admin password", pw),
      btn("Connect YouTube", async () => { YT.setAdmin(pw.value); say("Opening Google login..."); await YT.login(); }), btn("Disconnect YouTube", () => YT.disconnect(), "warn"),
      btn("Channel Information", async () => { await YT.refresh(); say("Channel information updated."); }), btn("Connect LIVE", async () => { YT.setAdmin(pw.value); await YT.connectLive(vid.value.trim()); say("Looking for the live broadcast..."); }), btn("LIVE Status", async () => { await YT.refresh(); say("Status: " + YT.conn); }),
      row("Video ID", vid), btn("Log out of Google", () => YT.logout(), "warn")); sheet.append(d);
    /* --- Gift reader --- */
    [d, b] = sec("Gift Reader"); qinfo = el("div"); hist = el("pre");
    b.append(qinfo, hist, btn("Pause queue", () => { Queue.paused = true; refresh(); }), btn("Resume queue", () => { Queue.paused = false; refresh(); }), btn("Clear history", () => { Queue.clearHistory(); refresh(); }), row("Queue size", num(Queue.max, 5, 1000, 5, v => { Queue.setMax(v); refresh(); }))); sheet.append(d);
    /* --- Gift mapping --- */
    [d, b] = sec("Gift Mapping");
    Gifts.defs.forEach(g => { const c = Gifts.c(g), box = el("div", { style: "border-top:1px solid #333;padding:8px 0" }, el("b", { textContent: g.name + "  (value " + g.value + ", action: " + g.label + ")" }));
      const al = el("input", { type: "text", value: Gifts.aliases(g), placeholder: "YouTube gift names (comma separated)" }); al.onchange = () => { c.aliases = al.value; Gifts.save(); };
      const pr = el("select", {}, ...[1, 2, 3].map(n => el("option", { value: n, textContent: "priority " + n, selected: Gifts.priority(g) === n }))); pr.onchange = () => { c.priority = +pr.value; Gifts.save(); };
      box.append(row("Enabled", chk(Gifts.on(g), v => { c.enabled = v; Gifts.save(); })), row("Per-viewer cool-down (s)", num(Gifts.cooldown(g), 0, 3600, 1, v => { c.cooldown = v; Gifts.save(); })), row("Priority", pr), row("Popup seconds (0 = default)", num(Gifts.popupMs(g) / 1000, 0, 30, .5, v => { c.popupMs = v * 1000; Gifts.save(); })));
      if (g.fx === "turbo") box.append(row("Effect duration (s)", num((Gifts.ms(g) || 10000) / 1000, 1, 120, 1, v => { c.ms = v * 1000; Gifts.save(); })));
      box.append(row("YouTube names", al)); b.append(box); });
    b.append(row("Allow chat commands (!estrella ...)", chk(Gifts.chatCommands, v => { Gifts.chatCommands = v; Gifts.save(); })), row("Gift cards on stage are test buttons", chk(Gifts.testCards, v => { Gifts.testCards = v; Gifts.save(); })));
    b.append(el("div", { className: "msg", textContent: "Game effects for Super Chat / Super Sticker are our own tier map (tier 1-5 -> Estrella, Chuche, Moneda, Gorro, Zorro); they are not YouTube gifts." })); sheet.append(d);
    /* --- Tests --- */
    [d, b] = sec("Tests (never touch real YouTube statistics)");
    const sel = el("select", {}, ...Gifts.defs.map(g => el("option", { value: g.id, textContent: g.name })));
    b.append(row("Gift", sel), btn("Test Gift", () => { Test.gift(sel.value); peek(5000); }), btn("Test Super Chat", () => { Test.superchat(3); peek(5000); }), btn("Test Super Sticker", () => { Test.supersticker(2); peek(5000); }),
      btn("Test Membership Gift", () => { Test.membershipGift(5); peek(5000); }), btn("Test Like (+10)", () => { Test.like(10); peek(4000); }), btn("Test Subscriber", () => { Test.subscriber(); peek(5000); }),
      btn("Queue stress test (30 gifts)", () => { Test.flood(30); say("30 test gifts queued: watch Gift Reader."); refresh(); }), btn("Simulate internet loss (10 s)", () => { YT.simulateOffline(10000); say("Connection dropped; it will reconnect automatically."); }, "warn")); sheet.append(d);
    /* --- Game --- */
    [d, b] = sec("Game"); b.append(btn("Game Pause", () => Game.pause()), btn("Game Resume", () => { Game.resume(); }), btn("Restart Game", () => Game.restart()), btn("Level +1", () => Game.nextLevel()), btn("Fullscreen", () => document.documentElement.requestFullscreen && document.documentElement.requestFullscreen())); sheet.append(d);
    /* --- Sound --- */
    [d, b] = sec("Sound Settings");
    Object.keys(Snd.cfg).forEach(n => { const c = Snd.cfg[n], v = el("input", { type: "range", min: 0, max: 100, value: c.vol * 100 }); v.onchange = () => { c.vol = v.value / 100; Snd.save(); Snd.resume(); Snd.play(n); };
      b.append(row("Sound: " + n, chk(c.on, x => { c.on = x; Snd.save(); })), v); });
    const mf = el("input", { type: "file", accept: "audio/*" }); mf.onchange = () => { if (mf.files[0]) Music.load(mf.files[0]); };
    const mv = el("input", { type: "range", min: 0, max: 100, value: Music.vol * 100 }); mv.oninput = () => Music.setVol(mv.value / 100);
    b.append(el("div", { textContent: "Background music (loops; choose the file again after reloading)" }), mf, row("Music volume", mv), btn("Music play / pause", () => Music.toggle())); sheet.append(d);
    /* --- Camera --- */
    [d, b] = sec("Camera Settings"); const cm = el("div", { className: "msg" });
    b.append(btn("Camera on / off", async () => { cm.textContent = (await Cam.toggle()) || ""; }), cm, row("Width", num(Cam.cfg.w, 120, 520, 10, v => { Cam.cfg.w = v; Cam.apply(); })), row("Left", num(Cam.cfg.x, 0, 900, 10, v => { Cam.cfg.x = v; Cam.apply(); })), row("Top", num(Cam.cfg.y, 0, 400, 10, v => { Cam.cfg.y = v; Cam.apply(); }))); sheet.append(d);
    /* --- Popups --- */
    [d, b] = sec("Popup Settings"); const P = Popup.cfg, pc = el("input", { type: "color", value: P.color }); pc.onchange = () => { P.color = pc.value; Popup.save(); };
    const pp = el("select", {}, ...["top", "middle", "bottom"].map(x => el("option", { value: x, textContent: x, selected: P.pos === x }))); pp.onchange = () => { P.pos = pp.value; Popup.save(); };
    b.append(row("Seconds on screen", num(P.ms / 1000, .5, 20, .5, v => { P.ms = v * 1000; Popup.save(); })), row("Color", pc), row("Size (1 = normal)", num(P.scale, .5, 1.4, .1, v => { P.scale = v; Popup.save(); })), row("Position", pp), row("Animation", chk(P.anim, v => { P.anim = v; Popup.save(); })));
    Object.keys(Popup.TPL).forEach(k => { const t = el("input", { type: "text", value: P.tpl[k] !== undefined ? P.tpl[k] : Popup.TPL[k] }); t.onchange = () => { P.tpl[k] = t.value; Popup.save(); }; b.append(row("Text: " + k, t)); });
    b.append(el("div", { className: "msg", textContent: "Text: lines are separated by |  and may use {user} {gift} {effect} {amount} {comment} {count} {level} {likes} {tier}." }), btn("Reset popup texts", () => { P.tpl = {}; Popup.save(); build(); open(); })); sheet.append(d);
    root.append(sheet); refresh();
  }
  function open() { root.style.display = "block"; refresh(); }
  function close() { root.style.display = "none"; }
  function go() {
    started = true; Snd.resume(); Game.resume(); keepAwake(); close(); goBtn.textContent = "▶ BACK TO GAME";
    if (Cam.cfg.on && !Cam.stream) Cam.toggle();
  }
  setInterval(() => { if (root.style.display === "block") refresh(); }, 1000);
  YT.onChange(() => { if (root.style.display === "block") refresh(); });
  /* the settings button is not shown on the stage: press the top-left corner for 1.5 s */
  const hot = $("hot"); let t0;
  hot.onpointerdown = () => { t0 = setTimeout(() => { root.style.display === "block" ? close() : open(); }, 1500); };
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => hot.addEventListener(ev, () => clearTimeout(t0))); hot.oncontextmenu = e => e.preventDefault();
  return { build, open, close, peek };
})();

/* ---------- start-up: the panel is the first page, the game starts when "START GAME" is pressed ---------- */
Cam.apply(); Game.start(); Panel.build(); Panel.open();
