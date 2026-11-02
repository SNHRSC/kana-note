/* かなノート — ฝึกเขียน ฟัง พูด */
(() => {
const { H_ROWS, KANA, KATA, VOCAB, toHira, XP } = KN;
const Game = KN.Game;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

/* ---------- storage ---------- */
const KEY = 'kananote-v1';
let prog = { w: {}, l: {}, s: {} };
try { const raw = localStorage.getItem(KEY); if (raw) prog = Object.assign(prog, JSON.parse(raw)); } catch (e) {}
let settings = { set: 'hira', daku: false, slow: true, wm: 'trace' };
try { const raw = localStorage.getItem(KEY + '-settings'); if (raw) settings = Object.assign(settings, JSON.parse(raw)); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prog)); localStorage.setItem(KEY + '-settings', JSON.stringify(settings)); } catch (e) {} };

const st = { tab: 'write', idx: 0, pos: 0, passScores: [], graded: false, lAnswer: null, lDone: false, lStreak: 0, lRight: 0, lTotal: 0, sIdx: 0, sScored: false };
const pool = () => settings.set === 'vocab' ? VOCAB : (settings.set === 'kata' ? KATA : KANA).filter(k => settings.daku || !k.daku);
const pkey = it => settings.set + ':' + it.text;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
KN.toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(KN.toast.t); KN.toast.t = setTimeout(() => t.classList.remove('on'), 2600); };
const toast = KN.toast;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- speech ---------- */
let jaVoice = null;
const pickVoice = () => { try { const vs = speechSynthesis.getVoices(); jaVoice = vs.find(v => /ja[-_]JP/i.test(v.lang) && /Kyoko|O-ren|Google/i.test(v.name)) || vs.find(v => /^ja/i.test(v.lang)) || null; } catch (e) {} };
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!('speechSynthesis' in window)) { toast('อุปกรณ์นี้ยังเล่นเสียงพูดไม่ได้'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; if (jaVoice) u.voice = jaVoice;
  u.rate = settings.slow ? 0.7 : 0.95; speechSynthesis.speak(u);
}

/* ---------- header ---------- */
function updateProgress() {
  const p = pool(); const done = p.filter(it => (prog.w[pkey(it)] || 0) >= 65).length;
  $('#progress').textContent = `เขียนผ่านแล้ว ${done} จาก ${p.length}`;
}
function showTab(tab) {
  st.tab = tab; $$('#tabs button').forEach(x => x.setAttribute('aria-pressed', x.dataset.tab === tab));
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + tab));
  document.body.classList.toggle('questmode', tab === 'quest');
  if (tab === 'listen') newListen(true);
  if (tab === 'speak') showSpeak();
  if (tab === 'write') sizeCanvases();
  if (tab === 'quest') Game.render();
  window.scrollTo({ top: 0 });
}
$$('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
$('#player').onclick = () => showTab('quest');
$$('#sets button').forEach(b => b.onclick = () => { settings.set = b.dataset.set; save(); syncHeader(); st.idx = 0; st.sIdx = 0; st.pos = 0; st.passScores = []; resetAll(); });
$('#daku').onclick = () => { settings.daku = !settings.daku; save(); syncHeader(); st.idx = 0; resetAll(); };
$('#slow').onclick = () => { settings.slow = !settings.slow; save(); syncHeader(); };
function syncHeader() {
  $$('#sets button').forEach(x => x.setAttribute('aria-pressed', x.dataset.set === settings.set));
  $('#daku').setAttribute('aria-pressed', settings.daku); $('#daku').hidden = settings.set === 'vocab';
  $('#slow').setAttribute('aria-pressed', settings.slow);
  $$('#wmodes button').forEach(x => x.setAttribute('aria-pressed', x.dataset.wm === settings.wm));
  updateProgress();
}
function resetAll() { loadTarget(); buildPicker(); if (st.tab === 'listen') newListen(true); if (st.tab === 'speak') showSpeak(); }

/* ---------- writing canvas ---------- */
const sheet = $('#sheet'), trace = $('#trace'), ink = $('#ink'), mark = $('#mark');
let strokes = [], cur = null, penSeen = false, S = 400, dpr = 1;
function sizeCanvases() {
  const r = sheet.getBoundingClientRect(); if (!r.width) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3); S = r.width;
  [trace, ink].forEach(c => { c.width = Math.round(S * dpr); c.height = Math.round(S * dpr); });
  drawTrace(); renderInk();
}
new ResizeObserver(sizeCanvases).observe(sheet);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawTrace(); renderInk(); });

function glyph(ctx, size, ch, { fill, stroke, lw } = {}) {
  ctx.save();
  ctx.font = `600 ${Math.round(size * 0.72)}px "Klee One","Zen Kaku Gothic New",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(ch);
  const x = size / 2 + (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2;
  const y = size / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  if (lw) { ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.strokeText(ch, x, y); }
  if (fill) { ctx.fillStyle = fill; ctx.fillText(ch, x, y); }
  ctx.restore();
}
const curItem = () => { const p = pool(); return p[((st.idx % p.length) + p.length) % p.length]; };
const curChar = () => curItem().text[st.pos];

function drawTrace() {
  const ctx = trace.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, S, S);
  const ch = curChar(); if (!ch) return;
  if (st.graded) { ctx.globalAlpha = .32; glyph(ctx, S, ch, { fill: css('--shu') }); ctx.globalAlpha = 1; return; }
  if (settings.wm === 'trace') { ctx.globalAlpha = .14; glyph(ctx, S, ch, { fill: css('--ink') }); ctx.globalAlpha = 1; }
}
function drawStroke(ctx, pts, size, base) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (pts.length === 1) { const p = pts[0]; ctx.beginPath(); ctx.arc(p.x * size, p.y * size, base * (0.55 + p.p * 0.6) / 2, 0, Math.PI * 2); ctx.fill(); return; }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    ctx.lineWidth = base * (0.55 + ((a.p + b.p) / 2) * 0.6);
    ctx.beginPath(); ctx.moveTo(a.x * size, a.y * size); ctx.lineTo(b.x * size, b.y * size); ctx.stroke();
  }
}
function renderInk() {
  const ctx = ink.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, S, S);
  const c = css('--ink'); ctx.strokeStyle = c; ctx.fillStyle = c;
  strokes.forEach(s => drawStroke(ctx, s, S, S * 0.034));
}
function pt(e) {
  const r = ink.getBoundingClientRect();
  const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.55;
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p };
}
ink.addEventListener('pointerdown', e => {
  if (e.pointerType === 'pen') penSeen = true;
  if (penSeen && e.pointerType === 'touch') return; // กันฝ่ามือเมื่อใช้ Apple Pencil
  e.preventDefault();
  if (st.graded) clearAttempt(true);
  ink.setPointerCapture(e.pointerId); cur = [pt(e)]; strokes.push(cur); renderInk();
});
ink.addEventListener('pointermove', e => {
  if (!cur) return; e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  const ctx = ink.getContext('2d'); const c = css('--ink'); ctx.strokeStyle = c; ctx.fillStyle = c;
  for (const ev of evs) { const p = pt(ev); const last = cur[cur.length - 1]; cur.push(p); drawStroke(ctx, [last, p], S, S * 0.034); }
});
const endStroke = () => { cur = null; };
ink.addEventListener('pointerup', endStroke); ink.addEventListener('pointercancel', endStroke);
['touchstart', 'touchmove'].forEach(t => ink.addEventListener(t, e => e.preventDefault(), { passive: false }));

function clearAttempt(keepFeedback) { strokes = []; st.graded = false; mark.innerHTML = ''; if (!keepFeedback) $('#feedback').innerHTML = ''; drawTrace(); renderInk(); updateInfo(); }
$('#w-undo').onclick = () => { if (st.graded) { st.graded = false; mark.innerHTML = ''; drawTrace(); updateInfo(); } strokes.pop(); renderInk(); };
$('#w-clear').onclick = () => clearAttempt();
$('#w-listen').onclick = () => speak(settings.set === 'vocab' ? curItem().text : curChar());

/* ให้คะแนน: ปรับขนาดลายมือให้เท่ากับตัวต้นแบบ แล้ววัดว่าเส้นทับกันแค่ไหน */
async function grade() {
  if (st.graded) { toast('ตรวจตัวนี้แล้ว เขียนใหม่หรือไปตัวถัดไปได้เลย'); return; }
  const totalPts = strokes.reduce((a, s) => a + s.length, 0);
  if (!strokes.length || totalPts < 3) { toast('เขียนตัวอักษรในช่องก่อน แล้วค่อยกดตรวจ'); return; }
  const ch = curChar();
  try { await document.fonts.load('600 100px "Klee One"', ch); } catch (e) {}
  const N = 160;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c.getContext('2d', { willReadFrequently: true }); };
  const tThin = mk(), tThick = mk(), uThin = mk(), uThick = mk();
  glyph(tThin, N, ch, { fill: '#000' }); glyph(tThick, N, ch, { fill: '#000', stroke: '#000', lw: N * 0.09 });
  const A = ctx => ctx.getImageData(0, 0, N, N).data;
  const td = A(tThin);
  let tx0 = N, ty0 = N, tx1 = 0, ty1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (td[(y * N + x) * 4 + 3] > 100) { tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); ty0 = Math.min(ty0, y); ty1 = Math.max(ty1, y); }
  let ux0 = 1, uy0 = 1, ux1 = 0, uy1 = 0; strokes.flat().forEach(p => { ux0 = Math.min(ux0, p.x); ux1 = Math.max(ux1, p.x); uy0 = Math.min(uy0, p.y); uy1 = Math.max(uy1, p.y); });
  const tw = (tx1 - tx0) / N, th = (ty1 - ty0) / N, uw = Math.max(ux1 - ux0, .02), uh = Math.max(uy1 - uy0, .02);
  const sc = Math.min(2, Math.max(.5, Math.max(tw, th) / Math.max(uw, uh)));
  const tcx = (tx0 + tx1) / 2 / N, tcy = (ty0 + ty1) / 2 / N, ucx = (ux0 + ux1) / 2, ucy = (uy0 + uy1) / 2;
  const norm = strokes.map(s => s.map(p => ({ x: (p.x - ucx) * sc + tcx, y: (p.y - ucy) * sc + tcy, p: .6 })));
  [[uThin, .045], [uThick, .12]].forEach(([ctx, w]) => { ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; norm.forEach(s => drawStroke(ctx, s, N, N * w)); });
  const tk = A(tThick), ut = A(uThin), uk = A(uThick);
  let u = 0, uIn = 0, t = 0, tCov = 0;
  for (let i = 3; i < td.length; i += 4) {
    if (ut[i] > 100) { u++; if (tk[i] > 100) uIn++; }
    if (td[i] > 100) { t++; if (uk[i] > 100) tCov++; }
  }
  const P = u ? uIn / u : 0, R = t ? tCov / t : 0;
  const f = (P + R) ? 2 * P * R / (P + R) : 0;
  showGrade(Math.max(0, Math.min(100, Math.round((f - 0.15) / 0.7 * 100))));
}
$('#w-check').onclick = grade;

function showGrade(score) {
  st.graded = true; drawTrace(); updateInfo();
  const it = curItem(), word = settings.set === 'vocab';
  st.passScores[st.pos] = score; renderWordTrack();
  const k = word ? pkey(it) + '#' + st.pos : pkey(it);
  prog.w[k] = Math.max(prog.w[k] || 0, score);
  let wordDone = false;
  if (word && st.pos === it.text.length - 1 && st.passScores.filter(s => s != null).length === it.text.length) {
    const avg = Math.round(st.passScores.reduce((a, b) => a + (b || 0), 0) / it.text.length);
    prog.w[pkey(it)] = Math.max(prog.w[pkey(it)] || 0, avg); wordDone = true;
  }
  save(); buildPicker(); updateProgress();

  Game.award(score >= 85 ? XP.hanamaru : score >= 65 ? XP.pass : XP.try);
  Game.track('write', { score, mode: settings.wm });
  if (wordDone) Game.track('wordDone');

  const shu = css('--shu');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shape = '', msg = '';
  if (score >= 85) { shape = `<path d="${hanamaru()}" fill="none" stroke="${shu}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`; msg = `<b>${score} คะแนน</b><br>はなまる! เส้นตรงกับต้นแบบดีมาก`; }
  else if (score >= 65) { shape = `<circle cx="60" cy="60" r="40" fill="none" stroke="${shu}" stroke-width="5"/>`; msg = `<b>${score} คะแนน</b><br>ผ่านแล้ว ลองดูเงาสีแดงเทียบตำแหน่งเส้นอีกนิด`; }
  else { shape = `<path d="M60 22 L98 90 L22 90 Z" fill="none" stroke="${shu}" stroke-width="5" stroke-linejoin="round"/>`; msg = `<b>${score} คะแนน</b><br>ลองอีกครั้ง เงาสีแดงคือรูปที่ถูกต้อง เริ่มเขียนใหม่ได้เลย`; }
  mark.innerHTML = `<g transform="translate(262,8) scale(1.1)">${shape}<text x="60" y="68" text-anchor="middle" font-family="IBM Plex Sans Thai, sans-serif" font-weight="600" font-size="22" fill="${shu}">${score}</text></g>`;
  const p = mark.querySelector('path,circle');
  if (p && !reduce && p.getTotalLength) { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.getBoundingClientRect(); p.style.transition = 'stroke-dashoffset .9s ease-out'; p.style.strokeDashoffset = 0; }
  $('#feedback').innerHTML = msg;
  if (settings.wm === 'dict') speak(curChar());
}
function hanamaru() {
  const pts = []; const turns = 2.4 * Math.PI * 2;
  for (let t = 0; t <= turns; t += .12) { const r = 3 + t * 2.1; pts.push([60 + r * Math.cos(t), 60 + r * Math.sin(t)]); }
  for (let u = 0; u <= Math.PI * 2 + .05; u += .04) { const r = 40 + 11 * Math.abs(Math.sin(3 * u)); pts.push([60 + r * Math.cos(turns + u), 60 + r * Math.sin(turns + u)]); }
  return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
}

function updateInfo() {
  const it = curItem(), ch = curChar(), word = settings.set === 'vocab', hide = settings.wm === 'dict' && !st.graded;
  const ref = $('#ref');
  ref.textContent = hide ? '?' : ch;
  ref.style.color = hide ? 'var(--muted)' : '';
  $('#romaji').textContent = hide ? 'ฟังแล้วเขียน' : it.romaji;
  $('#meaning').textContent = word ? (hide ? '' : `${it.text} แปลว่า ${it.meaning}`) : (settings.set === 'kata' ? 'คาตาคานะ' : 'ฮิรางานะ');
  const hints = { trace: 'เขียนตามเงาจาง ๆ ในช่อง เหมาะกับตัวที่เพิ่งเริ่มจำ', copy: 'ช่องจะว่างเปล่า ดูตัวต้นแบบด้านบนแล้วเขียนเองให้เต็มช่อง', dict: 'ระบบจะอ่านออกเสียง แล้วให้เขียนจากความจำ กดฟังเสียงซ้ำได้' };
  $('#wm-hint').textContent = hints[settings.wm];
  $('#w-next').textContent = word && st.pos < it.text.length - 1 ? 'ตัวถัดไปในคำ' : (word ? 'คำถัดไป' : 'ตัวถัดไป');
}
function renderWordTrack() {
  const wt = $('#wordtrack'); const it = curItem();
  if (settings.set !== 'vocab') { wt.innerHTML = ''; wt.style.display = 'none'; return; }
  wt.style.display = 'flex';
  wt.innerHTML = [...it.text].map((c, i) => {
    const shown = i < st.pos || (i === st.pos && st.graded) || settings.wm !== 'dict';
    const s = st.passScores[i]; return `<span class="${i === st.pos ? 'cur' : ''}">${shown ? c : ''}${s != null ? `<i>${s}</i>` : ''}</span>`;
  }).join('');
}
function loadTarget() {
  strokes = []; st.graded = false; mark.innerHTML = ''; $('#feedback').innerHTML = '';
  drawTrace(); renderInk(); updateInfo(); renderWordTrack();
}
function goNext() {
  const it = curItem();
  if (settings.set === 'vocab' && st.pos < it.text.length - 1) st.pos++;
  else { st.idx = (st.idx + 1) % pool().length; st.pos = 0; st.passScores = []; }
  loadTarget(); buildPicker();
  if (settings.wm === 'dict') setTimeout(() => speak(settings.set === 'vocab' && st.pos === 0 ? curItem().text : curChar()), 150);
}
$('#w-next').onclick = goNext;
$$('#wmodes button').forEach(b => b.onclick = () => { settings.wm = b.dataset.wm; save(); syncHeader(); loadTarget(); if (settings.wm === 'dict') speak(settings.set === 'vocab' ? curItem().text : curChar()); });

function buildPicker() {
  const box = $('#picker'), p = pool();
  const cls = it => { const s = prog.w[pkey(it)] || 0; return s >= 85 ? 'top' : s >= 65 ? 'pass' : ''; };
  if (settings.set === 'vocab') {
    $('#picker-title').textContent = 'เลือกคำศัพท์';
    box.className = 'words';
    box.innerHTML = p.map((it, i) => `<button class="cell ${cls(it)} ${i === st.idx ? 'cur' : ''}" data-i="${i}">${it.text}<small>${it.meaning}</small></button>`).join('');
  } else {
    $('#picker-title').textContent = 'เลือกตัวอักษร';
    box.className = 'gojuon';
    const rows = settings.daku ? H_ROWS.length : 11; let html = '';
    for (let r = 0; r < rows; r++) {
      if (r === 11) html += '<div class="gap"></div>';
      for (let c = 0; c < 5; c++) {
        const i = p.findIndex(k => k.row === r && k.col === c);
        if (i < 0) { html += '<span class="cell empty"></span>'; continue; }
        const it = p[i]; html += `<button class="cell ${cls(it)} ${i === st.idx ? 'cur' : ''}" data-i="${i}" aria-label="${it.text} ${it.romaji}">${it.text}<small>${it.romaji}</small></button>`;
      }
    }
    box.innerHTML = html;
  }
  box.querySelectorAll('button').forEach(b => b.onclick = () => { st.idx = +b.dataset.i; st.pos = 0; st.passScores = []; loadTarget(); buildPicker(); if (settings.wm === 'dict') speak(settings.set === 'vocab' ? curItem().text : curChar()); });
}

/* ---------- listening ---------- */
function newListen(silent) {
  const p = pool(); let a; do { a = p[Math.random() * p.length | 0]; } while (p.length > 1 && st.lAnswer && a.text === st.lAnswer.text);
  st.lAnswer = a; st.lDone = false;
  const seen = new Set([a.sound]); const others = [];
  shuffle([...p]).forEach(x => { if (others.length < 3 && !seen.has(x.sound)) { seen.add(x.sound); others.push(x); } });
  const opts = shuffle([a, ...others]); const word = settings.set === 'vocab';
  $('#l-choices').innerHTML = opts.map(o => `<button class="choice ${word ? 'word' : ''}" data-s="${o.sound}">${o.text}<small></small></button>`).join('');
  $('#l-choices').querySelectorAll('.choice').forEach((b, i) => b.onclick = () => answer(b, opts[i], opts));
  $('#l-feedback').textContent = ''; $('#l-next').disabled = true;
  if (!silent) speak(a.text); else setTimeout(() => speak(a.text), 200);
}
function answer(btn, o, opts) {
  if (st.lDone) return; st.lDone = true; const a = st.lAnswer; const ok = o.sound === a.sound;
  const k = pkey(a); const rec = prog.l[k] || [0, 0]; rec[1]++; if (ok) rec[0]++; prog.l[k] = rec; save();
  st.lTotal++; if (ok) { st.lRight++; st.lStreak++; } else st.lStreak = 0;
  $('#l-choices').querySelectorAll('.choice').forEach((b, i) => {
    const it = opts[i]; b.querySelector('small').textContent = it.meaning ? `${it.romaji} — ${it.meaning}` : it.romaji;
    if (b.dataset.s === a.sound) b.classList.add('right');
  });
  if (!ok) btn.classList.add('wrong');
  $('#l-feedback').innerHTML = ok ? `<b style="color:var(--ai)">ถูกต้อง</b> เสียง “${a.romaji}”` : `<b>ยังไม่ถูก</b> ที่ได้ยินคือ ${a.text} (${a.romaji})`;
  $('#l-streak').textContent = st.lStreak; $('#l-right').textContent = st.lRight; $('#l-total').textContent = st.lTotal;
  $('#l-next').disabled = false; $('#l-next').focus();
  Game.award(ok ? XP.listenRight : XP.listenWrong);
  Game.track('listen', { ok, streak: st.lStreak });
}
$('#l-play').onclick = () => st.lAnswer && speak(st.lAnswer.text);
$('#l-next').onclick = () => newListen(false);

/* ---------- speaking ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, mediaRec = null, chunks = [];
const sItem = () => { const p = pool(); return p[st.sIdx % p.length]; };
function showSpeak() {
  const it = sItem(); st.sScored = false;
  $('#s-text').textContent = it.text; $('#s-romaji').textContent = it.romaji;
  $('#s-meaning').textContent = it.meaning || ''; $('#s-heard').innerHTML = '';
  const au = $('#s-audio'); au.hidden = true; au.removeAttribute('src');
  $('#s-recog').disabled = !SR; if (!SR) $('#s-recog').title = 'เบราว์เซอร์นี้ยังไม่รองรับการฟังเสียงพูด';
  $('#s-rec').disabled = !(navigator.mediaDevices && window.MediaRecorder);
  $('#s-note').hidden = settings.set === 'vocab';
  $('#s-ok').disabled = false;
}
function speakSuccess(heard) {
  if (st.sScored) return; st.sScored = true;
  const k = pkey(sItem()); prog.s[k] = (prog.s[k] || 0) + 1; save();
  Game.award(heard ? XP.speakHeard : XP.speakSelf);
  Game.track('speak', { ok: true });
  $('#s-ok').disabled = true;
}
$('#s-model').onclick = () => speak(sItem().text);
const clean = s => toHira(s).replace(/[\s、。！？!?.,ー・]/g, '');
$('#s-recog').onclick = () => {
  if (!SR) return;
  if (recog) { recog.stop(); return; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const btn = $('#s-recog'), label = $('#s-recog-label'); const target = clean(sItem().text);
  try { recog = new SR(); } catch (e) { $('#s-heard').textContent = 'เปิดระบบฟังเสียงไม่ได้ ลองใช้ปุ่มอัดเสียงตัวเองแทน'; return; }
  recog.lang = 'ja-JP'; recog.interimResults = false; recog.maxAlternatives = 5;
  btn.classList.add('rec-on'); label.textContent = 'กำลังฟัง… แตะเพื่อหยุด';
  $('#s-heard').textContent = 'พูดได้เลย';
  recog.onresult = e => {
    const alts = [...e.results[0]].map(r => r.transcript);
    const ok = alts.some(a => { const c = clean(a); return c === target || c.includes(target); });
    if (ok) speakSuccess(true);
    $('#s-heard').innerHTML = ok ? `<span class="ok">ชัดเจน ระบบได้ยินว่า “${alts[0]}”</span>`
      : `<span class="no">ระบบได้ยินว่า “${alts[0]}”</span><br><span class="hint">ลองฟังตัวอย่างอีกครั้งแล้วพูดช้า ๆ ให้ครบทุกพยางค์</span>`;
  };
  recog.onerror = e => {
    const m = { 'not-allowed': 'ยังไม่ได้อนุญาตไมโครโฟน ให้อนุญาตใน Safari หรือใช้วิธีประเมินตัวเองด้านล่าง', 'no-speech': 'ไม่ได้ยินเสียง ลองพูดใกล้ไมค์มากขึ้น', 'service-not-allowed': 'ต้องเปิด Siri หรือการป้อนตามคำบอก ในการตั้งค่า iPad ก่อน' };
    $('#s-heard').textContent = m[e.error] || ('ฟังเสียงไม่สำเร็จ (' + e.error + ')');
  };
  recog.onend = () => { recog = null; btn.classList.remove('rec-on'); label.textContent = 'ให้ระบบฟังฉันพูด'; };
  try { recog.start(); } catch (e) { recog = null; btn.classList.remove('rec-on'); label.textContent = 'ให้ระบบฟังฉันพูด'; }
};
$('#s-rec').onclick = async () => {
  const btn = $('#s-rec');
  if (mediaRec && mediaRec.state === 'recording') { mediaRec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = []; mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = e => chunks.push(e.data);
    mediaRec.onstop = () => {
      stream.getTracks().forEach(t => t.stop()); btn.classList.remove('rec-on'); btn.textContent = 'อัดเสียงตัวเอง';
      const au = $('#s-audio'); au.src = URL.createObjectURL(new Blob(chunks, { type: mediaRec.mimeType })); au.hidden = false;
      $('#s-heard').innerHTML = '<span class="hint">ฟังเสียงตัวเองเทียบกับตัวอย่าง แล้วกด “พูดได้แล้ว” ถ้าใกล้เคียง</span>';
    };
    mediaRec.start(); btn.classList.add('rec-on'); btn.textContent = 'กำลังอัด… แตะเพื่อหยุด';
    setTimeout(() => mediaRec && mediaRec.state === 'recording' && mediaRec.stop(), 6000);
  } catch (e) { $('#s-heard').textContent = 'เปิดไมโครโฟนไม่ได้ ใช้ปุ่มฟังตัวอย่างแล้วพูดตาม และประเมินตัวเองได้'; }
};
$('#s-ok').onclick = () => { speakSuccess(false); toast('บันทึกแล้ว ไปคำถัดไปกัน'); st.sIdx++; showSpeak(); };
$('#s-again').onclick = () => { $('#s-heard').innerHTML = ''; speak(sItem().text); };
$('#s-next').onclick = () => { st.sIdx++; showSpeak(); };

/* ---------- init ---------- */
syncHeader(); buildPicker(); loadTarget();
Game.init();
if (document.fonts) {
  document.fonts.ready.then(drawTrace);
  document.fonts.load('600 100px "Klee One"', 'あア').then(drawTrace).catch(() => {});
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
})();
