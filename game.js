'use strict';
/* Snake LIVE PRO - game engine.
 * An auto-playing snake follows a random Hamiltonian cycle (a closed path through all 400 cells), so it never
 * hits itself and always ends by filling the whole board. Gifts change the game state through the `Fx` object. */
const N = 20, C = 44, W = N * C, D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const $ = id => document.getElementById(id);
const ld = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const rnd = n => Math.random() * n | 0, sleep = ms => new Promise(r => setTimeout(r, ms));
const cv = $("cv"), cx = cv.getContext("2d"); cv.width = cv.height = W;
const CFG = { gap: 50, stepMs: 164, turboMs: 83, spawnMs: 2000, growEvery: 2 };   /* speed = 30% slower than before (115 / 58 ms) */   /* tunable constants */
const S = { lvl: ld("lvl", 1), snake: [], dir: [1, 0], apples: [], cyc: null, pos: null, pre: 0, cnt: 0, sh: 250, ag: false, turbo: 0, paused: true, lock: 0, fx: [], eaten: 0 };

/* ---------- sound engine: every sound has its own switch and volume ---------- */
const Snd = (() => {
  let ac = null, last = {};
  const cfg = Object.assign({}, ...["move", "eat", "gift", "turbo", "bomb", "win", "lose", "level", "fart"].map(n => ({ [n]: { on: true, vol: .8 } })));
  cfg.move.vol = .6; cfg.eat.vol = .7;   /* gentle defaults */
  const saved = ld("snd", {}); for (const k in saved) if (cfg[k]) Object.assign(cfg[k], saved[k]);
  const ctx = () => ac || (ac = new (window.AudioContext || window.webkitAudioContext)());
  function tone(f, d, type, to, v) { try { const a = ctx(), t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.2 * v, t + .004); g.gain.exponentialRampToValueAtTime(.0005, t + d);   /* soft 4 ms attack: no harsh clicks */ o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d); } catch (e) {} }
  function noise(d, hz, v) { try { const a = ctx(), t = a.currentTime, len = a.sampleRate * d | 0, b = a.createBuffer(1, len, a.sampleRate), x = b.getChannelData(0); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2); const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = "bandpass"; f.frequency.value = hz; g.gain.value = .9 * v; s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); } catch (e) {} }
  const bank = {
    /* turn = premium mechanical keyboard "thock": key-down click + low body + soft key-up, slightly different every time */
    move: v => { const k = 1 + (Math.random() - .5) * .16;
      noise(.012, 2600 * k, v * .55); tone(190 * k, .09, "triangle", 95 * k, v * .9); setTimeout(() => noise(.008, 4200, v * .25), 55); },
    /* apple = soft bubble pop: rising "bloop" and a tiny pop at the end, pitch varies a little */
    eat: v => { const k = 1 + (Math.random() - .5) * .3;
      tone(420 * k, .11, "sine", 980 * k, v * .8); setTimeout(() => tone(1500 * k, .05, "sine", 700, v * .25), 40); noise(.02, 5000, v * .12); },
    gift: v => tone(880, .12, "sine", 0, v),
    turbo: v => tone(500, .4, "square", 1200, v * .6),
    bomb: v => { noise(.5, 300, v); tone(90, .6, "sawtooth", 30, v); },
    win: v => { tone(523, .2, "square", 0, v * .6); setTimeout(() => tone(784, .35, "square", 0, v * .6), 180); },
    lose: v => tone(200, .6, "sawtooth", 60, v),
    level: v => { tone(660, .12, "triangle", 0, v); setTimeout(() => tone(990, .2, "triangle", 0, v), 120); },
    fart: v => tone(140, .5, "sawtooth", 50, v)
  };
  return { cfg, resume() { try { ctx().resume(); } catch (e) {} }, save() { sv("snd", cfg); },
    play(n) { const c = cfg[n]; if (!c || !c.on || !c.vol) return; const now = Date.now(); if (n === "eat" && now - (last.eat || 0) < 60) return; last[n] = now; bank[n](c.vol); } };
})();

/* ---------- background music ---------- */
const Music = { el: null, vol: ld("musicVol", .5),
  load(file) { if (this.el) { this.el.pause(); URL.revokeObjectURL(this.el.src); } this.el = new Audio(URL.createObjectURL(file)); this.el.loop = true; this.el.volume = this.vol; if (!S.paused) this.el.play().catch(() => {}); },
  toggle() { if (!this.el) return; this.el.paused ? this.el.play().catch(() => {}) : this.el.pause(); },
  setVol(v) { this.vol = v; sv("musicVol", v); if (this.el) this.el.volume = v; },
  start() { if (this.el && this.el.paused) this.el.play().catch(() => {}); } };

/* hooks are replaced by gift-system.js (popup templates) */
const Hooks = { banner: (k, v) => k === "win" ? ["YOU WIN! NEXT LEVEL " + v.level, v.tier] : ["GAME OVER", "LEVEL " + v.level], level: () => {} };
const tier = l => l < 5 ? "EASY" : l < 10 ? "NORMAL" : l < 20 ? "HARD" : "MAX DIFFICULTY";

/* ---------- Hamiltonian cycle ---------- */
function genCycle(){
 const R=N/2,m=new Uint8Array(R*R),inT=new Uint8Array(R*R),fr=[];
 const add=(X,Y)=>{inT[Y*R+X]=1;for(const[dx,dy,b,o]of[[0,-1,1,4],[1,0,2,8],[0,1,4,1],[-1,0,8,2]]){const a=X+dx,c=Y+dy;if(a>=0&&c>=0&&a<R&&c<R&&!inT[c*R+a])fr.push([X,Y,a,c,b,o])}};
 add(rnd(R),rnd(R));
 while(fr.length){const i=rnd(fr.length),[X,Y,a,c,b,o]=fr[i];fr[i]=fr[fr.length-1];fr.pop();if(inT[c*R+a])continue;m[Y*R+X]|=b;m[c*R+a]|=o;add(a,c)}
 const nb=[];
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const k=m[(y>>1)*R+(x>>1)],qx=x&1,qy=y&1,L=[];
  if(!(k&(qx?2:8)))L.push((y^1)*N+x);
  if(!(k&(qy?4:1)))L.push(y*N+(x^1));
  if(k&(qy?4:1))L.push((qy?y+1:y-1)*N+x);
  if(k&(qx?2:8))L.push(y*N+(qx?x+1:x-1));
  nb[y*N+x]=L}
 const cyc=[0];let p=-1,c=0;
 for(;;){const L=nb[c],nx=L[0]===p?L[1]:L[0];if(nx===0||cyc.length>N*N)break;cyc.push(nx);p=c;c=nx}
 {const M=N*N,P=new Int16Array(M);cyc.forEach((q,i)=>P[q]=i);
  const adj=(a,b)=>Math.abs((a%N)-(b%N))+Math.abs((a/N|0)-(b/N|0))===1;
  for(let it=0;it<30000;it++){
   const u=cyc[rnd(M)],d=D[rnd(4)],vx=(u%N)+d[0],vy=(u/N|0)+d[1];
   if(vx<0||vy<0||vx>=N||vy>=N)continue;
   let i=P[u],j=P[vy*N+vx];if(i>j){const t=i;i=j;j=t}
   if(j-i<2||j-i>M-2||!adj(cyc[i+1],cyc[(j+1)%M]))continue;
   for(let a=i+1,b=j;a<b;a++,b--){const t=cyc[a];cyc[a]=cyc[b];cyc[b]=t;P[cyc[a]]=a;P[cyc[b]]=b}}}
 if(Math.random()<.5)cyc.reverse();
 S.cyc=cyc;S.pos=new Int16Array(N*N);cyc.forEach((q,i)=>S.pos[q]=i)}

/* ---------- apples ---------- */
function trailApple(n, gold) {           /* new apples appear in the free cells right behind the tail */
  if (!S.snake.length || !S.pos) return;
  const M = N * N, P = S.pos, tl = S.snake[S.snake.length - 1], i = P[tl.y * N + tl.x];
  const occ = new Set(S.snake.map(p => p.y * N + p.x)); S.apples.forEach(a => occ.add(a.y * N + a.x));
  for (let k = 1; k < M && n > 0; k++) { const c = S.cyc[(i - k + M) % M]; if (!occ.has(c)) { S.apples.push({ x: c % N, y: c / N | 0, c: gold ? "o" : 0 }); occ.add(c); n--; } }
}
const addApples = (n, gold) => trailApple(n, gold);

/* ---------- levels ---------- */
function showBanner(kind, extra) { const [a, b] = Hooks.banner(kind, Object.assign({ level: S.lvl }, extra || {})); $("b1").textContent = a; $("b2").textContent = b || ""; $("ban").style.display = "block"; }
function newLevel() {
  S.eaten = 0; S.cnt = 0; S.apples = []; genCycle();
  const M = N * N, s = rnd(M);
  S.snake = [0, 1, 2].map(i => { const q = S.cyc[(s - i + M) % M]; return { x: q % N, y: q / N | 0 }; });
  S.dir = [S.snake[0].x - S.snake[1].x, S.snake[0].y - S.snake[1].y];
  const skip = new Set(); for (let j = 0; j < CFG.gap; j++) skip.add(1 + Math.floor((j + Math.random()) * (M - 3) / CFG.gap));   /* apple-less cells, spread over the whole path */
  for (let k = 1; k <= M - 3; k++) { if (skip.has(k)) continue; const q = S.cyc[(s + k) % M]; S.apples.push({ x: q % N, y: q / N | 0, c: 0 }); }
  S.pre = S.apples.length;
  $("lvl").textContent = "LEVEL " + S.lvl; sv("lvl", S.lvl); S.lock = 0; $("ban").style.display = "none"; Hooks.level(S.lvl);
}
function win() { S.lock = 1; Snd.play("win"); showBanner("win", { level: S.lvl + 1, tier: tier(S.lvl + 1) }); setTimeout(() => { S.lvl++; newLevel(); }, 2200); }
function die() { if (S.lock) return; S.lock = 1; Snd.play("lose"); showBanner("lose"); setTimeout(newLevel, 1800); }
function rip() { const o = $("over"); o.textContent = ""; o.append("RIP", document.createElement("br"), "LIVE ⚰️"); o.style.display = "flex"; Snd.play("lose"); S.lock = 1; setTimeout(() => { o.style.display = "none"; S.lvl = 1; newLevel(); }, 3500); }
function bomb() { const x = rnd(N), y = rnd(N); Snd.play("bomb"); S.fx.push({ t: "boom", x, y, u: Date.now() + 700 }); S.apples = S.apples.filter(a => Math.hypot(a.x - x, a.y - y) > 3); S.pre = Math.min(S.pre, S.apples.length); }

/* ---------- one game step ---------- */
function step() {
  if (S.paused || S.lock) return;
  const M = N * N, h = S.snake[0], ih = S.pos[h.y * N + h.x];
  if (S.snake.length >= M) return win();
  const c = S.cyc[(ih + 1) % M], pk = { x: c % N, y: c / N | 0 }, d = [pk.x - h.x, pk.y - h.y];
  if (d[0] !== S.dir[0] || d[1] !== S.dir[1]) Snd.play("move");
  S.dir = d; S.snake.unshift(pk);
  const ai = S.apples.findIndex(a => a.x === pk.x && a.y === pk.y); let grow = false;
  if (ai >= 0) { S.apples.splice(ai, 1); S.eaten++; Snd.play("eat"); if (S.pre > 0) { S.pre--; grow = true; } else { S.cnt++; grow = S.cnt % CFG.growEvery === 0; } }
  if (!grow) S.snake.pop();
}

/* ---------- effects used by gifts ---------- */
const Fx = {
  snakeColor() { S.sh = rnd(360); },
  appleColor() { S.ag = !S.ag; },
  coins() { addApples(5, true); Snd.play("gift"); },
  fart() { Snd.play("fart"); S.fx.push({ t: "em", e: "💨", x: S.snake[0].x, y: S.snake[0].y, u: Date.now() + 1200 }); },
  bomb,
  turbo(ms) { S.turbo = Date.now() + (ms || 10000); Snd.play("turbo"); },
  gameOver: die,
  ripLive: rip,
  none() {}
};

/* ---------- drawing (limited to about 30 fps to save battery) ---------- */
function draw(t){
 if(t&&t-(draw.l||0)<30){requestAnimationFrame(draw);return}draw.l=t||0;
 cx.clearRect(0,0,W,W);const now=Date.now();
 cx.font=(C*.78)+"px serif";cx.textAlign="center";cx.textBaseline="middle";
 for(const a of S.apples){const px=a.x*C+C/2,py=a.y*C+C/2;
  if(a.c==="o"){cx.fillStyle="#ffd23f";cx.strokeStyle="#c98f00";cx.lineWidth=3;cx.beginPath();cx.arc(px,py+2,C*.33,0,7);cx.fill();cx.stroke();
   cx.fillStyle="#fff9";cx.beginPath();cx.arc(px-C*.1,py-C*.02,C*.08,0,7);cx.fill();
   cx.fillStyle="#8a5a00";cx.fillRect(px-1.5,py-C*.42,3,C*.14);
   cx.fillStyle="#7bd84a";cx.beginPath();cx.ellipse(px+C*.12,py-C*.32,C*.12,C*.06,-.5,0,7);cx.fill()}
  else cx.fillText(S.ag?"🍏":"🍎",px,py+2)}
 const sn=S.snake;
 if(sn.length){
  const pts=sn.map(p=>[p.x*C+C/2,p.y*C+C/2]);if(pts.length<2)pts.push([pts[0][0]+.1,pts[0][1]]);
  cx.lineCap="round";cx.lineJoin="round";cx.beginPath();
  pts.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1]));
  cx.strokeStyle=`hsl(${S.sh} 100% 55%)`;cx.lineWidth=C*.92;cx.stroke();
  cx.fillStyle="#000";cx.beginPath();
  for(const p of pts)for(const[a,b]of[[-1,-1],[1,-1],[-1,1],[1,1]]){const dx=p[0]+a*C*.2,dy=p[1]+b*C*.2;cx.moveTo(dx+3.2,dy);cx.arc(dx,dy,3.2,0,7)}
  cx.fill();
  const px=pts[0][0],py=pts[0][1],d=S.dir,ex=-d[1],ey=d[0];
  cx.fillStyle="#ff2fa8";for(const s of[-1,1]){cx.beginPath();cx.arc(px+d[0]*7+ex*s*9,py+d[1]*7+ey*s*9,8,0,7);cx.fill()}
  cx.fillStyle="#fff";for(const s of[-1,1]){cx.beginPath();cx.arc(px+d[0]*9+ex*s*9,py+d[1]*9+ey*s*9,3,0,7);cx.fill()}}
 S.fx=S.fx.filter(f=>f.u>now);
 for(const f of S.fx){const k=(f.u-now)/700;
  if(f.t==="boom"){cx.fillStyle=`rgba(255,${150*k|0},0,${k})`;cx.beginPath();cx.arc(f.x*C+C/2,f.y*C+C/2,C*3.5*(1.2-k*.6),0,7);cx.fill()}
  else{cx.font=(C*1.3)+"px serif";cx.fillText(f.e,f.x*C+C/2,f.y*C-(1-(f.u-now)/1200)*30)}}
 requestAnimationFrame(draw)}

/* ---------- main loop: constant speed, independent of the frame rate ---------- */
let lastT = 0, acc = 0;
function loop(t) {
  const sp = Date.now() < S.turbo ? CFG.turboMs : CFG.stepMs;
  acc += Math.min(t - lastT, 200); lastT = t; let n = 0;
  while (acc >= sp && n++ < 4) { step(); acc -= sp; }
  if (acc >= sp) acc = 0;
  requestAnimationFrame(loop);
}
let spawnTimer = null;
const Game = {
  pause() { S.paused = true; }, resume() { S.paused = false; Music.start(); },
  restart() { S.lvl = 1; newLevel(); }, nextLevel() { S.lvl++; newLevel(); },
  start() {
    newLevel(); draw(); requestAnimationFrame(t => { lastT = t; loop(t); });
    if (!spawnTimer) spawnTimer = setInterval(() => { if (!S.paused && !S.lock && (S.pre <= 0 || !S.apples.length)) trailApple(1); }, CFG.spawnMs);
    fit(); addEventListener("resize", fit);
  }
};
function fit() { const s = Math.min(innerWidth / 1080, innerHeight / 1920); $("stage").style.transform = "scale(" + s + ") translate(-50%,-50%)"; }
