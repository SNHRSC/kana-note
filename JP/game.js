/* かなノート — ระบบผู้เล่น: ชื่อ, XP/LV, ยศ, ภารกิจประจำวัน */
window.KN = window.KN || {};
KN.Game = (() => {
  const KEY = 'kananote-game-v1';
  const $ = s => document.querySelector(s);
  let g = {
    name: '', xp: 0,
    streak: { last: '', count: 0 },
    totals: { pass: 0, hanamaru: 0, listen: 0, speak: 0, words: 0 },
    daily: null
  };
  try { const raw = localStorage.getItem(KEY); if (raw) g = deepMerge(g, JSON.parse(raw)); } catch (e) {}
  function deepMerge(a, b) { for (const k in b) { a[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') ? deepMerge(a[k], b[k]) : b[k]; } return a; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) {} };

  /* ---------- วันที่ ---------- */
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => dayKey(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };

  /* ---------- LV & ยศ ---------- */
  const need = L => 40 + 20 * L;               // XP ที่ต้องใช้จาก LV L ไป L+1
  function levelInfo(xp) {
    let L = 1, rem = xp;
    while (rem >= need(L)) { rem -= need(L); L++; }
    return { L, into: rem, need: need(L) };
  }
  const rankFor = L => KN.RANKS.filter(r => r.lv <= L).pop();
  const nextRank = L => KN.RANKS.find(r => r.lv > L);
  const seal = (jp, size) => `<span class="seal ${size} len${[...jp].length}" aria-hidden="true">${[...jp].map(c => `<span>${c}</span>`).join('')}</span>`;

  /* ---------- ภารกิจประจำวัน ---------- */
  function rng(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  function genDaily(date) {
    const r = rng('kana' + date);
    const pick = a => a[Math.floor(r() * a.length)];
    const ids = Object.keys(KN.QUESTS);
    const writeIds = ids.filter(i => KN.QUESTS[i].group === 'write');
    const listenIds = ids.filter(i => KN.QUESTS[i].group === 'listen');
    const q1 = pick(writeIds), q2 = pick(listenIds);
    const q3 = r() < 0.6 ? 'speak' : pick(writeIds.filter(i => i !== q1));
    return { date, bonus: false, quests: [q1, q2, q3].map(id => ({ id, n: pick(KN.QUESTS[id].n), p: 0, done: false })) };
  }
  function ensureDaily() {
    if (!g.daily || g.daily.date !== today()) { g.daily = genDaily(today()); save(); return true; }
    return false;
  }
  function markStreak() {
    const t = today();
    if (g.streak.last === t) return;
    g.streak.count = g.streak.last === yesterday() ? g.streak.count + 1 : 1;
    g.streak.last = t;
  }
  const streakNow = () => (g.streak.last === today() || g.streak.last === yesterday()) ? g.streak.count : 0;

  /* ---------- รับ XP ---------- */
  let queue = [];
  function award(xp, reason) {
    if (!xp) return;
    const before = levelInfo(g.xp).L;
    g.xp += xp; save();
    popXP(xp);
    const after = levelInfo(g.xp).L;
    if (after > before) queue.push({ before, after });
    renderChip(); renderQuestView();
    if (queue.length) setTimeout(showLevelUp, 650);
  }
  function popXP(xp) {
    const chip = $('#player'); if (!chip) return;
    const el = document.createElement('span');
    el.className = 'xppop'; el.textContent = `+${xp} XP`;
    const r = chip.getBoundingClientRect();
    el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  /* ---------- บันทึกกิจกรรม ---------- */
  function track(ev, d = {}) {
    ensureDaily();
    if (ev === 'write') { if (d.score >= 65) g.totals.pass++; if (d.score >= 85) g.totals.hanamaru++; }
    if (ev === 'listen' && d.ok) g.totals.listen++;
    if (ev === 'speak' && d.ok) g.totals.speak++;
    if (ev === 'wordDone') g.totals.words++;
    const finished = [];
    g.daily.quests.forEach(q => {
      const def = KN.QUESTS[q.id];
      if (q.done || def.ev !== ev) return;
      if (def.max) q.p = Math.max(q.p, Math.min(q.n, def.max(d) || 0));
      else if (!def.test || def.test(d)) q.p = Math.min(q.n, q.p + 1);
      if (q.p >= q.n) { q.done = true; finished.push(q); }
    });
    save();
    finished.forEach((q, i) => setTimeout(() => {
      markStreak(); save();
      KN.toast(`ภารกิจสำเร็จ: ${KN.QUESTS[q.id].text(q.n)}`);
      award(KN.QUESTS[q.id].xp);
    }, 400 + i * 900));
    if (finished.length && g.daily.quests.every(q => q.done) && !g.daily.bonus) {
      g.daily.bonus = true; save();
      setTimeout(() => { KN.toast('ทำภารกิจครบทั้งวันแล้ว รับโบนัสพิเศษ'); award(KN.XP.allQuests); }, 400 + finished.length * 900 + 300);
    }
    renderQuestView();
  }

  /* ---------- UI: แถบผู้เล่นบนหัว ---------- */
  function renderChip() {
    const li = levelInfo(g.xp), rk = rankFor(li.L);
    $('#p-seal').outerHTML = `<span id="p-seal">${seal(rk.jp, 'sm')}</span>`;
    $('#p-name').textContent = g.name || 'ผู้ฝึก';
    $('#p-lv').textContent = `LV ${li.L}`;
    $('#p-xp').style.width = (li.into / li.need * 100).toFixed(1) + '%';
    $('#player').setAttribute('aria-label', `${g.name || 'ผู้ฝึก'} LV ${li.L} ยศ ${rk.th} เปิดหน้าภารกิจ`);
    const badge = $('#q-badge');
    if (badge && g.daily) { const left = g.daily.quests.filter(q => !q.done).length; badge.textContent = left || ''; badge.hidden = !left; }
  }

  /* ---------- UI: หน้าภารกิจ & โปรไฟล์ ---------- */
  function untilMidnight() {
    const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
    const mins = Math.round((m - n) / 60000);
    return `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`;
  }
  function renderQuestView() {
    const box = $('#v-quest'); if (!box) return;
    ensureDaily();
    const li = levelInfo(g.xp), rk = rankFor(li.L), nx = nextRank(li.L);
    const done = g.daily.quests.filter(q => q.done).length;
    box.innerHTML = `
      <div class="qgrid">
        <section class="profile">
          ${seal(rk.jp, 'lg')}
          <div class="pinfo">
            <div class="pname">${esc(g.name || 'ผู้ฝึก')} <button class="link" id="edit-name">แก้ชื่อ</button></div>
            <div class="prank">${rk.th} <span class="jp">${rk.jp}</span></div>
            <div class="plv"><b>LV ${li.L}</b><span>${li.into} / ${li.need} XP</span></div>
            <div class="xpbar lg"><i style="width:${(li.into / li.need * 100).toFixed(1)}%"></i></div>
            <p class="hint">${nx ? `ถึง LV ${nx.lv} จะได้ยศ ${nx.th} (${nx.jp})` : 'ได้ยศสูงสุดแล้ว ฝึกต่อเพื่อเพิ่ม LV ได้เรื่อย ๆ'}</p>
          </div>
          <dl class="totals">
            <div><dt>ฝึกต่อเนื่อง</dt><dd>${streakNow()} วัน</dd></div>
            <div><dt>XP สะสม</dt><dd>${g.xp.toLocaleString()}</dd></div>
            <div><dt>เขียนผ่าน</dt><dd>${g.totals.pass}</dd></div>
            <div><dt>はなまる</dt><dd>${g.totals.hanamaru}</dd></div>
            <div><dt>ฟังถูก</dt><dd>${g.totals.listen}</dd></div>
            <div><dt>พูดสำเร็จ</dt><dd>${g.totals.speak}</dd></div>
          </dl>
        </section>

        <section class="quests">
          <h2>ภารกิจวันนี้ <span class="qcount">${done}/3</span></h2>
          <p class="hint">ภารกิจชุดใหม่จะมาในอีก ${untilMidnight()}</p>
          <ol class="qlist">
            ${g.daily.quests.map(q => { const d = KN.QUESTS[q.id]; return `
              <li class="${q.done ? 'done' : ''}">
                <span class="qcheck" aria-hidden="true">${q.done ? '✓' : ''}</span>
                <div class="qbody">
                  <div class="qtext">${d.text(q.n)}</div>
                  <div class="xpbar"><i style="width:${q.p / q.n * 100}%"></i></div>
                </div>
                <div class="qmeta"><span>${q.p}/${q.n}</span><b>+${d.xp} XP</b></div>
              </li>`; }).join('')}
          </ol>
          <div class="bonus ${g.daily.bonus ? 'got' : ''}">${g.daily.bonus ? `รับโบนัสทำครบทั้งวันแล้ว +${KN.XP.allQuests} XP` : `ทำครบทั้ง 3 ข้อ รับโบนัสเพิ่ม +${KN.XP.allQuests} XP`}</div>

          <h2 style="margin-top:28px">วิธีเก็บ XP</h2>
          <ul class="xpways">
            <li>เขียนได้ はなまる (85+) <b>+${KN.XP.hanamaru}</b></li>
            <li>เขียนผ่าน (65+) <b>+${KN.XP.pass}</b></li>
            <li>เขียนแล้วกดตรวจ <b>+${KN.XP.try}</b></li>
            <li>ฟังแล้วตอบถูก <b>+${KN.XP.listenRight}</b></li>
            <li>ระบบฟังว่าพูดถูก <b>+${KN.XP.speakHeard}</b></li>
            <li>ประเมินตัวเองว่าพูดได้ <b>+${KN.XP.speakSelf}</b></li>
          </ul>
        </section>

        <section class="ranks">
          <h2>ลำดับยศ</h2>
          <ol>
            ${KN.RANKS.map(r => `<li class="${r.lv <= li.L ? 'got' : ''} ${r === rk ? 'cur' : ''}">${seal(r.jp, 'sm')}<span>${r.th}</span><b>LV ${r.lv}</b></li>`).join('')}
          </ol>
          <button class="link danger" id="reset-all">ล้างข้อมูลทั้งหมดแล้วเริ่มใหม่</button>
        </section>
      </div>`;
    $('#edit-name').onclick = askName;
    $('#reset-all').onclick = () => {
      if (!confirm('ลบชื่อ LV ภารกิจ และคะแนนทั้งหมดในเครื่องนี้?')) return;
      try { Object.keys(localStorage).filter(k => k.startsWith('kananote')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      location.reload();
    };
    renderChip();
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- ตั้งชื่อ ---------- */
  function askName() {
    const dlg = $('#namedlg'), inp = $('#name-input');
    inp.value = g.name || '';
    $('#name-title').textContent = g.name ? 'แก้ชื่อผู้ฝึก' : 'ยินดีต้อนรับสู่ かなノート';
    dlg.showModal(); setTimeout(() => inp.focus(), 50);
  }
  function saveName() {
    const v = $('#name-input').value.trim().slice(0, 20);
    if (!v) { $('#name-input').focus(); return; }
    g.name = v; save(); $('#namedlg').close(); renderChip(); renderQuestView();
  }

  /* ---------- เลเวลอัป ---------- */
  function showLevelUp() {
    const dlg = $('#lvdlg'); if (!queue.length || dlg.open) return;
    const { before, after } = queue.shift();
    const r0 = rankFor(before), r1 = rankFor(after);
    const rankUp = r0 !== r1;
    $('#lv-body').innerHTML = `
      <div class="lvseal">${seal(r1.jp, 'xl')}</div>
      <p class="lvnum">LV ${after}</p>
      <p>${rankUp ? `เลื่อนยศเป็น <b>${r1.th}</b> (${r1.jp})` : `ยศ ${r1.th} ฝึกต่ออีกนิดเพื่อเลื่อนยศ`}</p>`;
    dlg.classList.toggle('rankup', rankUp);
    dlg.showModal();
  }

  function init() {
    ensureDaily(); renderChip(); renderQuestView();
    $('#name-save').onclick = saveName;
    $('#name-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });
    $('#namedlg').addEventListener('cancel', e => { if (!g.name) e.preventDefault(); });
    $('#lv-close').onclick = () => { $('#lvdlg').close(); };
    $('#lvdlg').addEventListener('close', () => { if (queue.length) setTimeout(showLevelUp, 200); });
    if (!g.name) askName();
    const tick = () => { if (ensureDaily()) KN.toast('ภารกิจประจำวันใหม่มาแล้ว'); renderQuestView(); };
    setInterval(tick, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }

  return { init, award, track, render: renderQuestView };
})();
