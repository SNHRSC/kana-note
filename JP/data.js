/* かなノート — ข้อมูลตัวอักษร คำศัพท์ ยศ และภารกิจประจำวัน */
window.KN = window.KN || {};
(() => {
  const H_ROWS = [
    ['あ','い','う','え','お'],['か','き','く','け','こ'],['さ','し','す','せ','そ'],['た','ち','つ','て','と'],
    ['な','に','ぬ','ね','の'],['は','ひ','ふ','へ','ほ'],['ま','み','む','め','も'],['や',null,'ゆ',null,'よ'],
    ['ら','り','る','れ','ろ'],['わ',null,null,null,'を'],['ん',null,null,null,null],
    ['が','ぎ','ぐ','げ','ご'],['ざ','じ','ず','ぜ','ぞ'],['だ','ぢ','づ','で','ど'],['ば','び','ぶ','べ','ぼ'],['ぱ','ぴ','ぷ','ぺ','ぽ']
  ];
  const R_ROWS = [
    ['a','i','u','e','o'],['ka','ki','ku','ke','ko'],['sa','shi','su','se','so'],['ta','chi','tsu','te','to'],
    ['na','ni','nu','ne','no'],['ha','hi','fu','he','ho'],['ma','mi','mu','me','mo'],['ya',null,'yu',null,'yo'],
    ['ra','ri','ru','re','ro'],['wa',null,null,null,'wo'],['n',null,null,null,null],
    ['ga','gi','gu','ge','go'],['za','ji','zu','ze','zo'],['da','ji','zu','de','do'],['ba','bi','bu','be','bo'],['pa','pi','pu','pe','po']
  ];
  const toKata = s => s.replace(/[\u3041-\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const toHira = s => s.replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

  const KANA = [];
  H_ROWS.forEach((row, r) => row.forEach((ch, c) => {
    if (!ch) return;
    const ro = R_ROWS[r][c];
    KANA.push({ text: ch, romaji: ro, sound: ro === 'wo' ? 'o' : ro, row: r, col: c, daku: r >= 11 });
  }));
  const KATA = KANA.map(k => ({ ...k, text: toKata(k.text) }));

  const VOCAB = [
    ['ねこ','neko','แมว'],['いぬ','inu','สุนัข'],['みず','mizu','น้ำ'],['さかな','sakana','ปลา'],['やま','yama','ภูเขา'],
    ['はな','hana','ดอกไม้'],['そら','sora','ท้องฟ้า'],['うみ','umi','ทะเล'],['あめ','ame','ฝน'],['さくら','sakura','ดอกซากุระ'],
    ['たまご','tamago','ไข่'],['ごはん','gohan','ข้าว'],['すし','sushi','ซูชิ'],['くるま','kuruma','รถยนต์'],['ほん','hon','หนังสือ'],
    ['えき','eki','สถานีรถไฟ'],['ともだち','tomodachi','เพื่อน'],['ありがとう','arigatō','ขอบคุณ'],['こんにちは','konnichiwa','สวัสดี (ตอนกลางวัน)'],
    ['おはよう','ohayō','อรุณสวัสดิ์'],['テレビ','terebi','โทรทัศน์'],['カメラ','kamera','กล้องถ่ายรูป'],['ホテル','hoteru','โรงแรม'],
    ['バナナ','banana','กล้วย'],['トマト','tomato','มะเขือเทศ'],['メロン','meron','เมลอน'],['パン','pan','ขนมปัง'],['ペン','pen','ปากกา']
  ].map(([text, romaji, meaning]) => ({ text, romaji, meaning, sound: text }));

  /* ยศ: เลื่อนตาม LV */
  const RANKS = [
    { lv: 1,  jp: '入門',   th: 'ผู้เริ่มต้น' },
    { lv: 5,  jp: '見習い', th: 'ศิษย์ฝึกหัด' },
    { lv: 10, jp: '学徒',   th: 'นักเรียน' },
    { lv: 15, jp: '書生',   th: 'ศิษย์พู่กัน' },
    { lv: 20, jp: '初段',   th: 'สายดำขั้นหนึ่ง' },
    { lv: 25, jp: '達人',   th: 'ผู้เชี่ยวชาญ' },
    { lv: 30, jp: '師範',   th: 'ครูผู้สอน' },
    { lv: 40, jp: '名人',   th: 'ปรมาจารย์' }
  ];

  /* XP ที่ได้จากการฝึก */
  const XP = { hanamaru: 15, pass: 10, try: 3, listenRight: 5, listenWrong: 1, speakHeard: 10, speakSelf: 5, allQuests: 60 };

  /* คลังภารกิจประจำวัน (สุ่ม 3 ข้อต่อวัน) */
  const QUESTS = {
    'write-pass': { group: 'write',  ev: 'write',    n: [5, 8, 10], xp: 40, text: n => `เขียนผ่าน 65 คะแนนขึ้นไป ${n} ตัว`, test: d => d.score >= 65 },
    'hanamaru':   { group: 'write',  ev: 'write',    n: [2, 3, 5],  xp: 50, text: n => `ได้ はなまる ${n} ครั้ง`,          test: d => d.score >= 85 },
    'dict':       { group: 'write',  ev: 'write',    n: [3, 5],     xp: 45, text: n => `ฝึกแบบฟังแล้วเขียน ${n} ตัว`,      test: d => d.mode === 'dict' },
    'word':       { group: 'write',  ev: 'wordDone', n: [1, 2, 3],  xp: 50, text: n => `เขียนคำศัพท์ครบทั้งคำ ${n} คำ` },
    'listen':     { group: 'listen', ev: 'listen',   n: [8, 12, 15],xp: 40, text: n => `ฟังแล้วตอบถูก ${n} ข้อ`,          test: d => d.ok },
    'streak':     { group: 'listen', ev: 'listen',   n: [5, 8],     xp: 50, text: n => `ฟังถูกติดกัน ${n} ข้อ`, max: d => d.streak },
    'speak':      { group: 'speak',  ev: 'speak',    n: [3, 5],     xp: 40, text: n => `ฝึกพูดสำเร็จ ${n} ครั้ง`,          test: d => d.ok }
  };

  Object.assign(KN, { H_ROWS, R_ROWS, toKata, toHira, KANA, KATA, VOCAB, RANKS, XP, QUESTS });
})();
