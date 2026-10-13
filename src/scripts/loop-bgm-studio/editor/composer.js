/*
  作曲（エディタ版）。レシピコードのエンジン（engine.js）は触らず、エディタで作る曲にだけ効かせる。

  考え方：サイコロで1音ずつ決めるのではなく、手で書いた「型」を選んで、曲に合わせて変形する。
    1. 展開（FORMS）… 8小節を1まとまりにして、A・B・サビのような役（ROLES）を並べる。
       ループBGMなので、伴奏の量（ドラム・ベース・コード）はどこでも同じにして、変えるのはメロディと進行だけ。
       抜く・溜める・静かに始める、のような段差は作らない（ループの継ぎ目で温度が変わるため。2026-10-13）
       「ループの中で盛り上げる」（climb）は、ユーザーが作った曲（パズッとの unsolvable_isnt_it?）の作りをまねたもの：
       量は変えずに、メロディが8小節ごとに一段ずつ高くなり、最後で頭の高さへ下りてつながる。区切りでは和音が速く動き、
       4小節ごとにベースが歩いて次の根音へ、8小節ごとにドラムのフィル（16小節ごとはスネアの連打）と頭のクラッシュ
    2. 進行（PROGS）… 役ごとにローマ数字で書いた8小節の進行から選ぶ。和音の色（7th・add9・3和音…）は作曲スタイルで決める
    3. メロディ（STYLES）… 2小節のリズムの型（16分のマス目で書いた文字列）と、輪郭の型（山・上り・跳んで戻る…）を選び、
       8小節を「動機・ずらし（ゼクエンツ）・対比・終止」のように組む。音の高さは音楽理論の決まりで直す：
         - 強拍・長い音は和音の音（コードトーン）
         - 弱拍は音階の音でよいが、和音にない音（非和声音）は次の音へ2度で解決させる
         - 跳躍（5度より大きい）のあとは反対向きに戻す、増4度の跳躍はしない
         - 小節線をまたいで伸びる音は、次の和音の音にする（先取り）
         - スタイルによって、倚音（ぶつけてから下へ解決）や半音下からの寄りを足す
    4. サビの頭にクラッシュ、サビの前の小節の後ろ半分にフィル、サビのメロディにオクターブ上を薄く重ねる（applyForm）

  DOM には触らない。プロジェクト（project.js の形）を受け取ってノートを返す。
*/
import * as E from "../engine.js";

const mod = x => ((x % 12) + 12) % 12;
const r4 = x => Math.round(x * 10000) / 10000;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const pick = (rng, a) => a[Math.floor(rng() * a.length)];

/* ============================================================
   展開：8小節ごとの役
   ============================================================ */
/* mel = メロディの作り方、prog = 進行の種類。サビ（S）だけ、頭のクラッシュと前のフィル、オクターブ上の重ね */
export const ROLES = {
  A: { name: 'A', mel: 'verse', prog: 'A' },
  B: { name: 'B', mel: 'chorus', prog: 'S' },
  P: { name: 'Bメロ', mel: 'pre', prog: 'B' },
  S: { name: 'サビ', mel: 'chorus', prog: 'S', crash: true, oct: true },
  H: { name: '高まり', mel: 'chorus', prog: 'S', lift: 2 },
};
/* 末尾の 2 は「2回目」：同じ動機と進行を使い、終わり方だけ変える */
export const baseRole = r => String(r).replace(/2$/, '');
export const FORMS = {
  climb: { name: 'ループの中で盛り上げる（おすすめ）', desc: '伴奏はずっと同じ量のまま、メロディが8小節ごとに一段ずつ高くなり、最後に頭の高さへ下りてつながる。区切りで和音が速く動き、ベースが歩き、ドラムがフィルを入れる',
    climb: true, roles: { 2: ['A', 'B'], 4: ['A', 'A2', 'B', 'H'], 8: ['A', 'A2', 'B', 'H', 'A', 'A2', 'B', 'H'] } },
  flat: { name: 'なし（同じ調子で）', desc: '8小節の動機をくり返し、2回目は終わり方だけ変える。どこを切っても同じ雰囲気でいちばんループ向き',
    roles: { 2: ['A', 'A2'], 4: ['A', 'A2', 'A', 'A2'], 8: ['A', 'A2', 'A', 'A2', 'A', 'A2', 'A', 'A2'] } },
  ab: { name: 'A→B（交互に）', desc: 'Aと、メロディと進行を変えたBを交互に。伴奏の量は同じなので、ループの継ぎ目で段差がない',
    roles: { 2: ['A', 'B'], 4: ['A', 'B', 'A2', 'B2'], 8: ['A', 'B', 'A2', 'B2', 'A', 'B', 'A2', 'B2'] } },
  abs: { name: 'A→Bメロ→サビ（控えめ）', desc: 'メロディだけAメロ・Bメロ・サビと形を変える。伴奏は同じ量のまま、サビの頭のクラッシュとオクターブ上の重ねだけ',
    roles: { 2: ['A', 'S'], 4: ['A', 'P', 'S', 'S2'], 8: ['A', 'A2', 'P', 'S', 'S2', 'A2', 'P', 'S2'] } },
};
export function rolesOf(form, bars) {
  const F = FORMS[form] || FORMS.flat, n = Math.max(1, Math.round(bars / 8));
  if (F.roles[n]) return F.roles[n].slice();
  const out = []; for (let i = 0; i < n; i++) out.push(F.roles[2][i % 2]);
  return out;
}

/* ============================================================
   進行：ローマ数字で8小節。1小節に2つ置くときは [前半, 後半]
   ============================================================ */
// 主音からの半音と、3和音の種類（M 長・m 短・d 減）
const RN_MAJ = { I: [0, 'M'], ii: [2, 'm'], II: [2, 'M'], iii: [4, 'm'], III: [4, 'M'], IV: [5, 'M'], iv: [5, 'm'],
  V: [7, 'M'], v: [7, 'm'], vi: [9, 'm'], bVI: [8, 'M'], bVII: [10, 'M'], bIII: [3, 'M'], 'vii°': [11, 'd'] };
const RN_MIN = { i: [0, 'm'], 'ii°': [2, 'd'], bII: [1, 'M'], III: [3, 'M'], iv: [5, 'm'], IV: [5, 'M'],
  v: [7, 'm'], V: [7, 'M'], VI: [8, 'M'], VII: [10, 'M'] };
const PROGS = {
  maj: {
    A: [['I', 'vi', 'IV', 'V', 'I', 'vi', 'ii', 'V'], ['I', 'iii', 'IV', 'I', 'vi', 'iii', 'IV', 'V'], ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'],
      ['IV', 'iii', 'vi', 'vi', 'IV', 'iii', 'ii', 'V'], ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'I', 'V'], ['I', 'IV', 'I', 'V', 'I', 'IV', ['ii', 'V'], 'I'],
      ['I', 'bVII', 'IV', 'I', 'I', 'bVII', 'IV', 'V']],
    B: [['IV', 'V', 'iii', 'vi', 'ii', 'iii', 'IV', ['Vsus', 'V']], ['ii', 'iii', 'IV', 'V', 'ii', 'iii', 'IV', ['Vsus', 'V']],
      ['vi', 'V', 'IV', 'V', 'vi', 'V', 'IV', ['Vsus', 'V']], ['IV', 'IV', 'V', 'V', 'iii', 'vi', 'ii', ['Vsus', 'V']], ['IV', 'I', 'ii', 'I', 'IV', 'I', 'ii', 'V']],
    S: [['IV', 'V', 'iii', 'vi', 'IV', 'V', 'I', 'I'], ['I', 'V', 'vi', 'IV', 'I', 'V', 'IV', 'IV'], ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'I', 'V'],
      ['IV', 'V', 'vi', 'vi', 'IV', 'V', 'I', 'I'], ['I', 'iii', 'IV', 'iv', 'I', 'V', 'IV', 'V'], ['IV', 'V', 'III7', 'vi', 'ii', 'V', 'I', 'I'],
      ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'], ['IV', 'I', 'V', 'vi', 'IV', 'I', 'V', 'V']],
    C: [['bVI', 'bVII', 'I', 'I', 'bVI', 'bVII', 'V', 'V'], ['vi', 'iii', 'IV', 'I', 'ii', 'iii', 'IV', 'V'], ['iv', 'iv', 'I', 'I', 'iv', 'iv', 'V', 'V'],
      ['ii', 'V', 'iii', 'vi', 'ii', 'V', 'IV', 'V']],
  },
  min: {
    A: [['i', 'VI', 'III', 'VII', 'i', 'VI', 'iv', 'V'], ['i', 'iv', 'VII', 'III', 'VI', 'iv', 'V', 'V'], ['i', 'i', 'VI', 'VI', 'iv', 'iv', 'V', 'V'],
      ['i', 'VII', 'VI', 'VII', 'i', 'VII', 'VI', 'V'], ['i', 'v', 'VI', 'III', 'iv', 'i', 'iv', 'V']],
    B: [['iv', 'v', 'VI', 'VII', 'iv', 'v', 'VI', 'V'], ['VI', 'VII', 'i', 'i', 'VI', 'VII', ['iv', 'V'], 'V'], ['iv', 'iv', 'VII', 'VII', 'III', 'VI', 'iv', 'V']],
    S: [['VI', 'VII', 'i', 'i', 'VI', 'VII', 'V', 'i'], ['VI', 'VII', 'III', 'VI', 'iv', 'V', 'i', 'i'], ['i', 'VI', 'III', 'VII', 'i', 'VI', 'VII', 'VII'],
      ['VI', 'III', 'VII', 'i', 'VI', 'III', 'VII', 'V'], ['iv', 'V', 'i', 'VI', 'iv', 'V', 'i', 'i'], ['VI', 'VII', 'v', 'i', 'VI', 'VII', 'V', 'V']],
    C: [['VI', 'VI', 'VII', 'VII', 'III', 'III', 'V', 'V'], ['iv', 'III', 'VI', 'V', 'iv', 'III', 'VI', 'V'], ['bII', 'bII', 'i', 'i', 'bII', 'bII', 'V', 'V']],
  },
};
/* 和音の色。先頭から順に、足す音（7度・9度…）がすべて音階に入っている最初のものを使う */
export const COLORS = {
  pop: { name: '7th（ポップ）', M: ['maj7', 'dom7', 'maj'], m: ['m7', 'min'], d: ['m7b5'], sus: ['sus9', 'sus4'], 7: ['dom7'] },
  add9: { name: 'add9（きらきら）', M: ['add9', 'maj'], m: ['madd9', 'm7', 'min'], d: ['m7b5'], sus: ['sus4'], 7: ['dom7'] },
  triad: { name: '3和音（力強く）', M: ['maj'], m: ['min'], d: ['m7b5'], sus: ['sus4'], 7: ['dom7'] },
  rich: { name: '9th・13th（おしゃれ）', M: ['maj9', 'dom9', 'maj7', 'dom7', 'maj'], m: ['m9', 'm7', 'min'], d: ['m7b5'], sus: ['sus9'], 7: ['dom9', 'dom7'] },
};
function chordOf(token, minor, tonic, color) {
  const m = /^(b?[ivIV]+°?)(sus|7)?$/.exec(token);
  const rn = m && (minor ? RN_MIN : RN_MAJ)[m[1]];
  if (!rn) return [mod(tonic), minor ? 'min' : 'maj'];
  const [semi, tri] = rn, kind = m[2] === 'sus' ? 'sus' : m[2] === '7' ? '7' : tri;
  const scale = new Set(E.SCALE_SET.diatonic(minor).map(mod));
  const triadSet = new Set(tri === 'M' ? [0, 4, 7] : tri === 'm' ? [0, 3, 7] : [0, 3, 6]);
  for (const q of (COLORS[color] || COLORS.pop)[kind]) {
    const ok = E.QUAL[q].every(i => triadSet.has(mod(i)) || scale.has(mod(semi + i)));
    if (ok) return [mod(tonic + semi), q];
  }
  return [mod(tonic + semi), (COLORS[color] || COLORS.pop)[kind].slice(-1)[0]];
}
/* 役の並びから、拍ごとの和音（engine の st.slots と同じ形、長さ bars*beats）を作る */
export function composeProgression({ bars, beats, minor, tonic }, roles, color, seed) {
  const rng = E.mulberry32((seed * 31 + 0x6A09) | 0), lib = PROGS[minor ? 'min' : 'maj'], mem = {};
  const slots = [];
  for (let s = 0; s * 8 < bars; s++) {
    const role = ROLES[baseRole(roles[s % roles.length])] || ROLES.A;
    const key = baseRole(roles[s % roles.length]);
    if (!mem[key]) mem[key] = pick(rng, lib[role.prog] || lib.A);
    const prog = mem[key];
    for (let b = 0; b < 8 && s * 8 + b < bars; b++) {
      const cell = prog[b], parts = Array.isArray(cell) ? cell : [cell];
      const split = parts.length === 1 ? [beats] : beats === 4 ? [2, 2] : [2, 1];
      parts.forEach((tk, i) => { const ch = chordOf(tk, minor, tonic, color); for (let q = 0; q < split[i]; q++) slots.push(ch); });
    }
  }
  return slots;
}

/* ============================================================
   メロディのリズムの型：2小節ぶん。16分音符1つが1文字
     x = 音の頭、- = のばす、. = 休み（| は読みやすくするための区切り）
   ============================================================ */
const C4 = {
  verse: ['x-x-x-x-x---x---|x-x-x-x-x-------', '..x-x-x-x---x-x-|x---x-x-x-------', 'x---x-x-x-x-x---|x-x-x---x-------',
    '..x-x-x-x-x-x---|..x-x-x-x-------', 'x--x--x-x---x-x-|x--x--x-x-------', 'x-x-x-x---x-x-x-|x-------........',
    '....x-x-x-x-x-x-|x---x---x-------', 'x-x-x---x-x-x---|x-x-x-x-x-------', 'x---x---x-x-x-x-|x---------------',
    'x-xx-x-xx-x-x---|x-xx-x-xx-------'],
  pre: ['x-x-x-x-x-x-x-x-|x-x-x-x-x-------', '..x-x-x-..x-x-x-|..x-x-x-x-------', 'x--x--x-x--x--x-|x--x--x-x-------',
    'x-x-x---x-x-x---|x-x-x-x-x---x---', 'xxx-x-x-xxx-x-x-|xxx-x-x-x-------'],
  chorus: ['x-------x---x-x-|x---x---x-------', 'x--x--x-x-------|x--x--x-x-------', 'x---x---x--x--x-|x-------x-------',
    '..x-x-x-x-----x-|--x-x-x-x-------', 'x-----x-x-x-x---|x-----x-x-------', 'x---x-x-x---x-x-|x---x-x-x-------',
    'x-------x-x-x-x-|x-------x-------', 'x-x-x-------x-x-|x-x-x-----------'],
  bridge: ['x-----x-x-------|x-----x-x-------', '....x---x---x---|x-----------....', 'x-x-x-x-x-------|....x-x-x-------',
    'x---x---x---x---|x---x---x-------'],
  sparse: ['x-------x-------|x---------------', 'x---------------|x-------x-------', 'x-----------x---|x---------------',
    '........x-------|x---------------', 'x-------x---x---|x---------------'],
  hook: ['x.x.x..x..x.x.x.|x.x.x..x..x.x...', 'x..x..x.x..x..x.|x..x..x.x.x.x...', 'x.xx.x.xx.x.x.x.|x.xx.x.x-x-x----',
    'x--x--x---x-x-x-|x--x--x---x-x---', 'x.x.x.x.x..x.x..|x.x.x.x.x-x.....', '..x..x..x.x.x.x.|..x..x..x---....',
    'x-.x-.x-x-.x-.x-|x-.x-.x-x-------'],
  cad: ['x-x-x-x-x---x---|x---------------', 'x---x---x---x-x-|x---------------', 'x-x-x-x-x-x-x---|x-------........',
    'x--x--x-x-------|x---------------', '..x-x-x-x---x---|x-----------....', 'x-------x---x---|x---------------'],
  epic: ['x-----x-x-------|x-----x-x-------', 'x-------x-------|x---x---x-------', 'x-----x-x---x---|x---------------',
    'x---x---x-------|x-------x-------', 'x--x--x-x-------|x-------x---x---', 'x-----x-x---x-x-|x-------x-------'],
  chip: ['x.x.x.x.x.x.x.x.|x.x.x.x.x---x---', 'x-x.x-x.x-x.x.x.|x-x-x.x.x-------', 'xxx.x.x.xxx.x.x.|x.x.x.x.x-------',
    'x.x-x.x-x.x-x---|x.x-x.x-x-------', 'x---x.x.x---x.x.|x.x.x.x.x-------'],
  jazz: ['..x-x-x-x-x---x-|--x-x-x-x-------', 'x-x-x-..x-x-x-x-|x-----x-x-------', '..x-x-x---x-x---|..x-x-x-x---....',
    'x---..x-x-x-x-x-|x-x-..x-x-------', '....x-x-x-x-x-x-|--x-x-x---------'],
};
const C3 = {
  verse: ['x---x-x-x---|x---x---x---', 'x-x-x-x-x---|x-----x-x---', '..x-x-x---x-|x-----------', 'x---x---x-x-|x---x-------'],
  pre: ['x-x-x-x-x-x-|x-x-x-x-x---', 'x--x--x--x--|x--x--x-----'],
  chorus: ['x-------x-x-|x-----------', 'x-----x---x-|x---x---x---', 'x---x---x---|x-------x---', 'x-------x---|x---x---x---'],
  bridge: ['x-----x-----|x---x-------', '....x---x---|x-----------'],
  sparse: ['x-----------|x-----------', 'x-------x---|x-----------', 'x-----x-----|x-----------'],
  hook: ['x.x.x..x.x..|x.x.x..x.x..', 'x..x..x.x.x.|x..x..x-----', 'x.xx.xx.xx.x|x.xx.xx-----'],
  cad: ['x-x-x-x-x---|x-----------', 'x---x---x---|x-----------', 'x-----x-x---|x-----------'],
  epic: ['x-----x---x-|x-----------', 'x---------x-|x---x---x---'],
  chip: ['x.x.x.x.x.x.|x.x.x.x.x---', 'x-x.x-x.x-x.|x-x-x.x.x---'],
  jazz: ['..x-x-x-x-x-|--x-x-x-----', 'x-x-..x-x-x-|x-----x-----'],
};
export const CELLS = { 4: C4, 3: C3 };
export function parseCell(str) {
  const s = str.replace(/\|/g, ''), out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== 'x') continue;
    let j = i + 1; while (j < s.length && s[j] === '-') j++;
    out.push({ o: i / 2, d: (j - i) / 2 });
  }
  return { notes: out, len: s.length / 2 };
}

/* ============================================================
   作曲スタイル
   cells … 役ごとに使うリズムの型（C4/C3 のどの欄か）、contour … 輪郭の型
   center/span … 音域（MIDI）、leap … 跳躍の大きさ、appo … 倚音の多さ、chrom … 半音下から寄る多さ
   tension … 強拍でも9度に着地してよいか、color … 進行の和音の色
   ============================================================ */
export const STYLES = {
  uta: { name: 'うた（J-POP）', desc: 'Aメロは低めに語り、Bメロで上っていき、サビで大きく開く。いちばん「歌」らしい',
    center: 71, span: 16, leap: .35, appo: .12, chrom: 0, tension: false, scale: 'diatonic', color: 'pop',
    cells: { verse: ['verse'], pre: ['pre'], chorus: ['chorus'], bridge: ['bridge'], sparse: ['sparse'], hook: ['chorus'], cad: ['cad'] },
    contour: { verse: ['arch', 'turn', 'rise', 'zigzag', 'valley'], pre: ['rise', 'zigzag'], chorus: ['leapFill', 'arch', 'fall', 'rise'],
      bridge: ['valley', 'fall', 'turn'], sparse: ['arch', 'fall'], hook: ['arch', 'leapFill'] } },
  emo: { name: '感動（エモ）', desc: 'のばす音で歌い上げる。サビの頭は大きく跳び、ぶつかる音（倚音）から解決するため息のような動き',
    center: 72, span: 19, leap: .6, appo: .4, chrom: 0, tension: true, scale: 'diatonic', color: 'add9',
    cells: { verse: ['verse'], pre: ['pre'], chorus: ['chorus'], bridge: ['bridge'], sparse: ['sparse'], hook: ['chorus'], cad: ['cad'] },
    contour: { verse: ['arch', 'sigh', 'turn'], pre: ['rise', 'zigzag'], chorus: ['leapFill', 'sigh', 'arch'],
      bridge: ['valley', 'sigh'], sparse: ['arch', 'sigh'], hook: ['leapFill', 'sigh'] } },
  epic: { name: '壮大（シネマティック）', desc: '付点のリズムと、4度・5度・オクターブの跳躍。ファンファーレのように和音を駆け上がり、山で長くのばす',
    center: 69, span: 20, leap: .75, appo: .15, chrom: 0, tension: false, scale: 'diatonic', color: 'triad',
    cells: { verse: ['epic', 'verse'], pre: ['pre'], chorus: ['epic', 'chorus'], bridge: ['bridge'], sparse: ['sparse'], hook: ['epic'], cad: ['cad'] },
    contour: { verse: ['fanfare', 'arch', 'rise'], pre: ['rise', 'fanfare'], chorus: ['fanfare', 'leapFill', 'arch'],
      bridge: ['valley', 'fall'], sparse: ['arch', 'fanfare'], hook: ['fanfare', 'leapFill'] } },
  edm: { name: 'EDM（フック）', desc: '16分のシンコペーションで、同じ音を刻んだり軸の音と行き来したりする短いフック。コードにつれて形のまま移る',
    center: 74, span: 14, leap: .45, appo: 0, chrom: 0, tension: true, scale: 'diatonic', color: 'add9',
    cells: { verse: ['verse'], pre: ['pre'], chorus: ['hook'], bridge: ['bridge'], sparse: ['sparse'], hook: ['hook'], cad: ['hook'] },
    contour: { verse: ['arch', 'turn', 'pivot'], pre: ['rise', 'pivot'], chorus: ['repeat', 'pivot', 'zigzag'],
      bridge: ['valley', 'turn'], sparse: ['arch'], hook: ['repeat', 'pivot', 'zigzag'] } },
  chip: { name: 'ゲーム（8bit）', desc: '細かい音符で和音を駆け回る、元気なピコピコ。オクターブの跳びも多め',
    center: 76, span: 19, leap: .6, appo: 0, chrom: 0, tension: false, scale: 'diatonic', color: 'triad',
    cells: { verse: ['chip'], pre: ['chip'], chorus: ['chip'], bridge: ['verse'], sparse: ['sparse'], hook: ['chip'], cad: ['cad'] },
    contour: { verse: ['fanfare', 'zigzag', 'turn'], pre: ['rise', 'zigzag'], chorus: ['fanfare', 'pivot', 'zigzag'],
      bridge: ['turn', 'valley'], sparse: ['arch'], hook: ['pivot', 'fanfare'] } },
  jazzy: { name: 'おしゃれ（ジャジー）', desc: '裏から入るフレーズ、9th・13th への着地、半音下から寄る音。スウィングと相性がいい',
    center: 72, span: 16, leap: .45, appo: .1, chrom: .45, tension: true, scale: 'diatonic', color: 'rich',
    cells: { verse: ['jazz'], pre: ['jazz'], chorus: ['jazz', 'chorus'], bridge: ['bridge'], sparse: ['sparse'], hook: ['jazz'], cad: ['cad'] },
    contour: { verse: ['arch', 'valley', 'turn', 'zigzag'], pre: ['rise', 'zigzag'], chorus: ['arch', 'leapFill', 'valley'],
      bridge: ['valley', 'turn'], sparse: ['arch'], hook: ['zigzag', 'turn'] } },
  calm: { name: 'やさしい', desc: 'ペンタトニックで、間をたっぷり残す。ぶつかる音がほとんどない、聴き疲れしない線',
    center: 74, span: 13, leap: .3, appo: 0, chrom: 0, tension: false, scale: 'penta', color: 'add9',
    cells: { verse: ['sparse', 'verse'], pre: ['verse'], chorus: ['chorus'], bridge: ['sparse'], sparse: ['sparse'], hook: ['chorus'], cad: ['cad'] },
    contour: { verse: ['arch', 'fall', 'turn'], pre: ['rise'], chorus: ['arch', 'leapFill'], bridge: ['valley'], sparse: ['arch', 'fall'], hook: ['arch'] } },
};
/* 曲調ごとのおすすめ（null は曲調の反復の型をそのまま使う） */
const AUTO_STYLE = {
  nonbiri: 'jazzy', fuwafuwa: 'calm', pokopoko: 'uta', yofukashi: 'jazzy', oudou: 'uta', omise: 'jazzy', canon: 'emo',
  dorian: 'jazzy', lydian: 'calm', mixo: 'uta', mokumoku: 'calm', waltz: 'uta', sway: 'emo', blue: 'jazzy', chip: 'chip',
  ambi: 'calm', kurikaeshi: null, longrun: 'edm', midnight: null, neon: 'edm', funk: 'jazzy', mellow: 'jazzy',
  dosshiri: 'epic', minimal: null, hiphop: 'jazzy', dnb: 'edm', breakbeat: 'edm', trance: 'edm', hardcore: 'edm',
  uramen: 'uta', shinen: null, uneri: null, hoshizora: null, ginga: null, oozora: null, mugen: null, boss: 'epic', kougeki: 'epic',
};
export const autoStyle = preset => AUTO_STYLE[preset] === undefined ? 'uta' : AUTO_STYLE[preset];
/* 展開は、まかせるときは「ループの中で盛り上げる」。伴奏の量は変えないので、ループとして崩れない */
export const autoForm = () => 'climb';
/* 進行を作曲するか（曲調の進行表を使うか）。ジャジーな曲調は進行表の色を残す */
export const autoProg = (style, form) => form !== 'flat' && ['uta', 'emo', 'epic', 'edm', 'chip'].includes(style);

/* ============================================================
   輪郭：n 音ぶんの、音階上の段（0 が基準）
   ============================================================ */
const CONTOURS = {
  arch: (n, a) => Array.from({ length: n }, (_, k) => Math.round(a * Math.sin(Math.PI * k / Math.max(1, n - 1)))),
  // 2つ上って1つ戻りながら上がる（音が多くても同じ音が続かない）
  rise: (n, a) => Array.from({ length: n }, (_, k) => Math.min(a + 1, Math.floor(k / 3) + [0, 1, 2][k % 3])),
  fall: (n, a) => Array.from({ length: n }, (_, k) => Math.round(a * (1 - k / Math.max(1, n - 1)))),
  valley: (n, a) => Array.from({ length: n }, (_, k) => -Math.round(a * .7 * Math.sin(Math.PI * k / Math.max(1, n - 1)))),
  // 大きく跳んで、順に下りて埋める（ギャップ・フィル）
  leapFill: (n, a) => Array.from({ length: n }, (_, k) => k === 0 ? 0 : Math.max(0, a + 1 - (k - 1))),
  turn: n => Array.from({ length: n }, (_, k) => [0, 1, 0, -1][k % 4]),
  pivot: (n, a) => Array.from({ length: n }, (_, k) => k % 2 === 0 ? 0 : Math.min(a + 1, 1 + (k >> 1))),
  zigzag: (n, a) => Array.from({ length: n }, (_, k) => Math.min(a + 1, [0, 2, 1, 3, 2, 4, 3, 5][k % 8])),
  // ため息：上の音から下の音へ、2音ずつ下りていく
  sigh: (n, a) => Array.from({ length: n }, (_, k) => Math.min(a, 2) - (k >> 1) + (k % 2 === 0 ? 1 : 0)),
  // 同じ音を刻み、ときどき隣へ（フック）
  repeat: (n, a, rng) => { const o = []; let v = 0; for (let k = 0; k < n; k++) { if (k > 0 && rng() < .3) v = clamp(v + pick(rng, [1, -1, 2]), -1, a); o.push(v); } return o; },
  // 和音の音を駆け上がる（ファンファーレ）。値は和音の音の何番目か
  fanfare: n => Array.from({ length: n }, (_, k) => [0, 1, 2, 3, 2, 3, 4, 2][k % 8]),
};
const CHORD_SPACE = new Set(['fanfare']);

/* ============================================================
   音の材料
   ============================================================ */
export function scalePcsOf(ctx, name) {
  const f = E.SCALE_SET[name] || E.SCALE_SET.diatonic;
  return f(ctx.minor).map(i => mod(i + ctx.tonic + ctx.key));
}
export function ctxOf(proj) {
  const P = E.presetOf(proj.st), EPB = proj.beats * 2, end = proj.bars * EPB;
  return {
    bars: proj.bars, beats: proj.beats, EPB, end, key: proj.st.key, tonic: P.tonic, minor: P.minor,
    chordAt: t => {
      const u = ((t % end) + end) % end;
      return proj.slots ? proj.slots[Math.floor(u / 2) % proj.slots.length] : proj.chords[Math.floor(u / EPB) % proj.bars];
    },
  };
}
/* 和音の音（音名）。tension なら9度などのテンションも */
function chordPcs(ctx, ch, tension) {
  const out = E.QUAL[ch[1]].map(i => mod(ch[0] + ctx.key + i));
  if (tension) for (const i of (E.EXT[ch[1]] || []).slice(0, 1)) out.push(mod(ch[0] + ctx.key + i));
  return [...new Set(out)];
}
/* その和音の上で使える音階：和音にある音は必ず入れ、それと半音でぶつかる音階の音は外す */
function localScale(scale, ctPcs) {
  const set = new Set(scale);
  for (const c of ctPcs) if (!set.has(c)) {
    set.delete(mod(c + 1)); set.delete(mod(c - 1)); set.add(c);
  }
  return [...set];
}
/* target にいちばん近い、pcs に入る音（dir があればその向きを優先） */
function nearest(pcs, target, lo, hi, dir) {
  const set = new Set(pcs.map(mod)), tg = Math.round(target);
  for (let d = 0; d <= 12; d++) {
    const order = dir > 0 ? [tg + d, tg - d] : [tg - d, tg + d];
    for (const m of order) if (m >= lo && m <= hi && set.has(mod(m))) return m;
  }
  return clamp(tg, lo, hi);
}
/* 音階の上で steps 段ずらした音 */
function stepFrom(pcs, n, steps, lo, hi) {
  const set = new Set(pcs.map(mod));
  let m = n, k = 0;
  const dir = Math.sign(steps);
  while (k < Math.abs(steps)) { m += dir; if (m < lo - 12 || m > hi + 12) break; if (set.has(mod(m))) k++; }
  return m;
}

/* ============================================================
   メロディ
   ============================================================ */
/* 2小節ぶんの音を、拍の強さに合わせて直す。notes は [{t, d, want(希望の高さ), strong, last}] */
function realize(ctx, S, list, opt) {
  const { lo, hi, scale, tension, mode } = opt;
  for (let k = 0; k < list.length; k++) {
    const x = list[k];
    // 小節線をまたいで、後ろの和音で鳴っている時間のほうが長ければ、後ろの和音の音にする（先取り）
    const ch0 = ctx.chordAt(x.t), chEnd = ctx.chordAt(x.t + x.d - .01);
    const changes = ch0[0] !== chEnd[0] || ch0[1] !== chEnd[1];
    let ch = ch0;
    if (changes) {
      let cut = x.t; while (cut < x.t + x.d) { const c = ctx.chordAt(cut); if (c[0] !== ch0[0] || c[1] !== ch0[1]) break; cut += .5; }
      if (x.t + x.d - cut > cut - x.t) ch = chEnd;
    }
    const ct = chordPcs(ctx, ch, tension && !x.last), ls = localScale(scale, chordPcs(ctx, ch, false));
    x.ct = ct; x.ls = ls;
    const prev = k ? list[k - 1].n : null, dir = prev === null ? 0 : Math.sign(x.want - prev);
    if (mode === 'chord' || mode === 'triad') {
      const pool = mode === 'triad' ? E.QUAL[ch[1]].slice(0, 3).map(i => mod(ch[0] + ctx.key + i)) : ct;
      x.n = nearest(pool, x.want, lo, hi, dir);
    } else if (x.strong) x.n = nearest(ct, x.want, lo, hi, dir);
    else x.n = nearest(ls, x.want, lo, hi, dir);
  }
  // 非和声音は次の音へ2度（2半音以内）で解決させる。できないなら和音の音にする
  for (let k = 0; k < list.length; k++) {
    const x = list[k], nx = list[k + 1];
    if (x.ct.includes(mod(x.n))) continue;
    const gap = nx ? Math.abs(nx.n - x.n) : 99, touching = nx && nx.t - (x.t + x.d) < 1.01;
    if (!(touching && gap >= 1 && gap <= 2)) x.n = nearest(x.ct, x.n, lo, hi, nx ? Math.sign(nx.n - x.n) : 0);
  }
  return list;
}
/* 旋律の決まり：大きく跳んだら反対へ戻す、増4度で跳ばない、オクターブより広く跳ばない */
function smooth(list, lo, hi, leap) {
  for (let k = 1; k < list.length; k++) {
    const a = list[k - 1], x = list[k];
    let iv = x.n - a.n;
    if (Math.abs(iv) > 12) { x.n -= 12 * Math.sign(iv); iv = x.n - a.n; }
    if (Math.abs(iv) === 6) { x.n = nearest(x.ct.filter(p => Math.abs(mod(p - a.n)) !== 6 && mod(p - a.n) !== 6), x.n + Math.sign(iv), lo, hi, -Math.sign(iv)); iv = x.n - a.n; }
    // 跳躍の大きさ：スタイルが控えめなら、5度を超える跳躍は和音の音で近づける
    if (Math.abs(iv) > 7 && leap < .55) { x.n = nearest(x.ct, a.n + Math.sign(iv) * 4, lo, hi, -Math.sign(iv)); iv = x.n - a.n; }
    const nx = list[k + 1];
    if (nx && Math.abs(iv) >= 5 && Math.sign(nx.n - x.n) === Math.sign(iv)) {
      // 跳んだ向きにさらに進むなら、反対へ1〜2段戻す
      const pool = nx.strong ? nx.ct : nx.ls;
      const back = nearest(pool, x.n - Math.sign(iv) * 2, lo, hi, -Math.sign(iv));
      if (back !== x.n) nx.n = back;
    }
  }
  return list;
}
/* 倚音：強拍の長い音を、上の隣の音から始めて下へ解決させる */
function appoggiatura(list, rng, p, scale, lo, hi) {
  const out = [];
  for (const x of list) {
    if (x.strong && x.d >= 3 && rng() < p) {
      const up = stepFrom(x.ls || scale, x.n, 1, lo, hi);
      if (up <= hi && !x.ct.includes(mod(up)) && up - x.n <= 2) {
        const d1 = x.d >= 4 ? 2 : 1;
        out.push(Object.assign({}, x, { n: up, d: d1, appo: true }));
        out.push(Object.assign({}, x, { t: x.t + d1, d: x.d - d1, strong: false }));
        continue;
      }
    }
    out.push(x);
  }
  return out;
}
/* 半音下から寄る：強拍の音の直前の短い弱拍を、その半音下にする（その前の音から増4度・6度より広くならないときだけ） */
function chromatic(list, rng, p) {
  for (let k = 1; k < list.length; k++) {
    const a = list[k - 1], x = list[k], b = list[k - 2], n = x.n - 1;
    if (!(x.strong && !a.strong && a.d <= 1 && Math.abs(a.t + a.d - x.t) < .01 && rng() < p)) continue;
    if (b && (Math.abs(n - b.n) === 6 || Math.abs(n - b.n) > 9)) continue;
    a.n = n; a.chrom = true;
  }
  return list;
}
/* 仕上げ：曲全体を通して、非和声音の解決と跳躍の決まりをもう一度確かめる（直すと隣が変わるので2回まわす） */
const near2 = (a, b) => a && b && b.t - (a.t + a.d) < 2.01;
function polish(list, lo, hi) {
  for (let round = 0; round < 3; round++) {
    for (let k = 0; k < list.length; k++) {
      const x = list[k], nx = list[k + 1], pv = list[k - 1];
      // 非和声音は、すぐ次の音へ2度で進むときだけ残す
      if (!x.ct.includes(mod(x.n))) {
        const iv = nx ? Math.abs(nx.n - x.n) : 0, touching = nx && nx.t - (x.t + x.d) < 1.01;
        if (!(touching && iv >= 1 && iv <= 2)) x.n = nearest(x.ct, x.n, lo, hi, nx ? Math.sign(nx.n - x.n) : 0);
      }
      if (near2(pv, x)) {
        let iv = x.n - pv.n;
        if (Math.abs(iv) > 12) { x.n -= 12 * Math.sign(iv); iv = x.n - pv.n; }
        if (Math.abs(iv) === 6) {
          // 増4度：和音の音のうち、前の音から増4度にならない近いものへ
          const cands = E.notesInRange(x.ct, lo, hi).filter(m => Math.abs(m - pv.n) !== 6 && Math.abs(m - pv.n) <= 12);
          if (cands.length) x.n = cands.reduce((b, m) => Math.abs(m - x.n) < Math.abs(b - x.n) ? m : b, cands[0]);
        }
      }
    }
  }
  return list;
}

/* セクション1つぶんの「動機の記憶」：同じ役が2回目に来たら、同じ動機を使う */
function motifFor(S, kind, cells, rng, dens) {
  const pool = kind => S.cells[kind].flatMap(c => cells[c] || []);
  const want = dens; // 0〜1
  const byDensity = list => {
    const parsed = list.map(s => parseCell(s));
    const counts = parsed.map(p => p.notes.length), lo = Math.min(...counts), hi = Math.max(...counts);
    const tgt = lo + (hi - lo) * want;
    const sorted = parsed.map((p, i) => [p, Math.abs(counts[i] - tgt)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
    return sorted.slice(0, Math.max(2, Math.ceil(sorted.length * .5)));
  };
  const main = byDensity(pool(kind));
  const M = pick(rng, main), N = pick(rng, main.filter(c => c !== M).concat(main.length < 2 ? [M] : []));
  const cad = pick(rng, byDensity(pool('cad')));
  const cn = S.contour[kind] || ['arch'];
  const cM = pick(rng, cn), cN = pick(rng, cn.filter(c => c !== cM).concat([cM]));
  const amp = 2 + Math.round(S.leap * 3 + rng() * 1.5);
  const flipN = rng() < .5;
  const PH = {
    verse: [['m', 'h', 'm', 'c'], ['m', 's', 'n', 'c'], ['m', 'n', 's', 'c']],
    pre: [['m', 's', 's2', 'c'], ['m', 's', 'n', 'h']],
    chorus: [['m', 'h', 'm', 'c'], ['m', 'm', 'n', 'c'], ['m', 's', 'n', 'c']],
    bridge: [['m', 'n', 's', 'h'], ['m', 's', 'n', 'c']],
    sparse: [['m', 'h', 'm', 'c'], ['m', 'm', 'n', 'c']],
    hook: [['m', 'm', 'm', 'v'], ['m', 'v', 'm', 'v']],
  }[kind] || [['m', 'h', 'm', 'c']];
  return { M, N, cad, cM, cN, amp, flipN, phrase: pick(rng, PH), seq: kind === 'bridge' ? -1 : pick(rng, [1, 1, 2]), cseed: (rng() * 1e9) | 0 };
}
const LIFT = { verse: 0, pre: 1, chorus: 3, bridge: -1, sparse: 2, hook: 2, build: 1 };
const ARC = { verse: [0, 1, 0, -1], pre: [0, 1, 2, 3], chorus: [0, 1, 2, 0], bridge: [0, -1, 1, 0], sparse: [0, 1, 0, 0], hook: [0, 0, 0, 0] };

/*
  曲全体のメロディを作る。
  opt: { style, seed, dens(0〜100), roles, oct(-1/0/1), octUp, harm, scale（音階の名前。無ければスタイルの既定）}
  返り値は lead のノート [{t, d, n, v, l}]
*/
export function composeMelody(proj, opt) {
  const ctx = ctxOf(proj), S = STYLES[opt.style] || STYLES.uta, rng = E.mulberry32(((opt.seed | 0) * 37 + 0x3C1) | 0);
  const EPB = ctx.EPB, cells = ctx.beats === 3 ? C3 : C4, dens = clamp((opt.dens ?? 55) / 100, 0, 1);
  const center = S.center + 12 * (opt.oct || 0);
  // 上は、8小節ごとに一段ずつ上がるぶんの余裕をとる
  const lo = Math.max(48, center - Math.round(S.span * .55)), hi = Math.min(100, center + Math.round(S.span * .6) + 3);
  const scaleName = opt.scale && E.SCALE_SET[opt.scale] ? opt.scale : S.scale;
  const mode = opt.scale === 'chord' || opt.scale === 'triad' ? opt.scale : 'scale';
  const scale = scalePcsOf(ctx, E.SCALE_SET[scaleName] ? scaleName : 'diatonic');
  const sc = E.notesInRange(scale, lo, hi);
  const a0 = sc.reduce((b, m, i) => Math.abs(m - center) < Math.abs(sc[b] - center) ? i : b, 0);
  const roles = opt.roles || rolesOf('flat', ctx.bars);
  const mem = {}, out = [], all = [];
  for (let s = 0; s * 8 < ctx.bars; s++) {
    const rname = roles[s % roles.length], R = ROLES[baseRole(rname)] || ROLES.A, kind = R.mel, second = /2$/.test(rname);
    const from = s * 8 * EPB;
    const key = baseRole(rname) + ':' + kind;
    if (!mem[key]) mem[key] = motifFor(S, kind, cells, rng, kind === 'sparse' ? dens * .4 : dens);
    const m = mem[key], arc = ARC[kind] || ARC.verse;
    const notes = [];
    for (let slot = 0; slot < 4; slot++) {
      // ループの最後の2小節は、頭の音へ下りて（上って）つなぐ（r）
      const loopEnd = (s + 1) * 8 >= ctx.bars && slot === 3;
      const op = loopEnd ? 'r' : (second && slot === 3 && m.phrase[3] === 'c') ? 'v' : m.phrase[slot];
      const base = from + slot * 2 * EPB;
      if (base >= ctx.end) break;
      const cell = op === 'c' || op === 'r' ? m.cad : op === 'n' ? m.N : m.M;
      const cname = op === 'n' ? m.cN : m.cM;
      const n = cell.notes.length;
      // 同じ動機なら毎回同じ輪郭（覚えられるメロディになる）
      let cont = CONTOURS[cname](n, m.amp, E.mulberry32(m.cseed + n * 7 + (op === 'n' ? 1 : 0)));
      if (op === 'n' && m.flipN && !CHORD_SPACE.has(cname)) cont = cont.map(v => -v);
      // 同じ段が3つ以上続く所（輪郭の平らな所）は、まん中を隣の音にして刺繍音にする
      if (cname !== 'repeat' && cname !== 'pivot')
        for (let k = 1; k + 1 < cont.length; k++) if (cont[k - 1] === cont[k] && cont[k] === cont[k + 1]) cont[k] += 1;
      if (op === 'c') cont = CONTOURS.fall(n, 2);
      let anchor = a0 + (LIFT[kind] || 0) + (R.lift || 0) + arc[slot] + (second && slot === 2 ? 1 : 0);
      if (op === 's') anchor += m.seq;
      if (op === 's2') anchor += 2 * m.seq;
      const list = cell.notes.map((c, k) => {
        const t = base + c.o, p = c.o % EPB;
        const strongPos = ctx.beats === 4 ? p % 4 === 0 : p === 0;
        let want;
        if (CHORD_SPACE.has(cname) && op !== 'c') {
          // 和音の音の何番目か：基準の高さに近い和音の音から数える
          const ch = ctx.chordAt(t), ct = E.notesInRange(chordPcs(ctx, ch, false), lo, hi);
          const b = ct.reduce((q, mm, i) => Math.abs(mm - sc[clamp(anchor, 0, sc.length - 1)]) < Math.abs(ct[q] - sc[clamp(anchor, 0, sc.length - 1)]) ? i : q, 0);
          want = ct[clamp(b + cont[k], 0, ct.length - 1)];
        } else want = sc[clamp(anchor + cont[k], 0, sc.length - 1)];
        return { t, d: c.d, want, strong: strongPos || c.d >= 2 || k === 0, last: k === n - 1 };
      });
      // ループの終わり：いまの高さから、曲の最初の音のすぐ隣（和音の音）まで順に下りて（上って）頭へつなぐ
      if (op === 'r' && list.length) {
        const first = all.length ? all[0] : notes[0];
        const firstN = first ? first.n : sc[clamp(a0, 0, sc.length - 1)];
        const lastX = list[list.length - 1], ct = chordPcs(ctx, ctx.chordAt(lastX.t), false);
        const tgt = nearest(ct, firstN, lo, hi, 0);
        const from0 = sc[clamp(anchor, 0, sc.length - 1)];
        list.forEach((x, k) => { x.want = Math.round(from0 + (tgt - from0) * k / Math.max(1, list.length - 1)); });
        lastX.want = tgt; lastX.strong = true;
      }
      // 終わりの型：問い（h）は根音以外の和音の音で長く止め、終止（c）・変化（v）は主音へ向かって着地する
      if ((op === 'h' || op === 'c' || op === 'v') && list.length) {
        const lastX = list[list.length - 1], ch = ctx.chordAt(lastX.t);
        const root = mod(ch[0] + ctx.key), tonicPc = mod(ctx.tonic + ctx.key);
        const pcs = chordPcs(ctx, ch, false);
        let tgtPcs;
        if (op === 'h') tgtPcs = pcs.filter(p => p !== root);
        else tgtPcs = pcs.includes(tonicPc) ? [tonicPc] : [root];
        const tgt = nearest(tgtPcs, sc[clamp(a0 + (LIFT[kind] || 0) + (op === 'h' ? 1 : 0), 0, sc.length - 1)], lo, hi, 0);
        lastX.want = tgt; lastX.strong = true;
        // 着地の前の2音は、音階を順にたどって近づける
        for (let j = list.length - 2, st = 1; j >= Math.max(0, list.length - 3); j--, st++)
          list[j].want = stepFrom(scale, tgt, (op === 'h' ? -1 : 1) * st, lo, hi);
      }
      notes.push(...realize(ctx, S, list, { lo, hi, scale, tension: S.tension, mode }));
    }
    let line = smooth(notes, lo, hi, S.leap);
    if (S.appo) line = appoggiatura(line, rng, S.appo * (kind === 'chorus' || kind === 'sparse' ? 1 : .5), scale, lo, hi);
    all.push(...line);
  }
  all.sort((a, b) => a.t - b.t);
  let line = smooth(all, lo, hi, S.leap);
  if (S.chrom) line = chromatic(line, rng, S.chrom);
  line = polish(line, lo, hi);
  for (const x of line) {
    const p = x.t % EPB, off16 = p % 1 !== 0;
    let v = (x.strong ? .74 : .6) + (off16 && x.d >= 1 ? .06 : 0) + (x.appo ? .05 : 0) + (rng() - .5) * .06;
    out.push({ t: r4(x.t), d: r4(Math.min(x.d, ctx.end - x.t)), n: x.n, v: r4(clamp(v, .2, 1)), l: 'main' });
  }
  return addLayers(ctx, out, roles, opt, scale, lo, hi);
}
/* 重ね：オクターブ上（スタイルの指定か、サビのとき）と、3度下のハモり */
function addLayers(ctx, main, roles, opt, scale, lo, hi) {
  const out = main.slice(), SEC = 8 * ctx.EPB;
  for (const x of main) {
    const R = ROLES[baseRole(roles[Math.floor(x.t / SEC) % roles.length])] || ROLES.A;
    if ((opt.octUp || R.oct) && x.n + 12 <= 103) out.push({ t: x.t, d: x.d, n: x.n + 12, v: r4(x.v * .42), l: 'oct' });
    if (opt.harm) {
      const ch = ctx.chordAt(x.t), ct = chordPcs(ctx, ch, false);
      let h = stepFrom(scale, x.n, -2, lo - 12, hi);
      if (!ct.includes(mod(h)) && x.d >= 2) h = nearest(ct, h, lo - 12, x.n - 1, -1);
      if (h < x.n) out.push({ t: x.t, d: x.d, n: h, v: r4(x.v * .52), l: 'harm' });
    }
  }
  return out;
}

/* ============================================================
   アレンジブラシ用：範囲の中だけ作り直す
     inC(t) … 塗った所か、at(t) … なぞった線の高さ（無ければ null）
     keep  … いまのリズム（[{t, d, v}]）。無ければスタイルのリズムの型で新しく
   ============================================================ */
export function composeRegion(proj, { inC, at, style, scale, keep, seed, dens }) {
  const ctx = ctxOf(proj), S = STYLES[style] || STYLES.uta, rng = E.mulberry32(((seed | 0) * 41 + 0x77) | 0);
  const EPB = ctx.EPB, cells = ctx.beats === 3 ? C3 : C4;
  const lo = 48, hi = 103;
  const mode = scale === 'chord' || scale === 'triad' ? scale : 'scale';
  const pcs = scalePcsOf(ctx, E.SCALE_SET[scale] ? scale : (E.SCALE_SET[S.scale] ? S.scale : 'diatonic'));
  let rhythm = keep;
  if (!rhythm) {
    rhythm = [];
    const kinds = ['verse', 'chorus', 'hook', 'pre'], kind = pick(rng, kinds.filter(k => S.cells[k]));
    const pool = S.cells[kind].flatMap(c => cells[c] || []).map(parseCell);
    const want = clamp((dens ?? 55) / 100, 0, 1), counts = pool.map(p => p.notes.length);
    const tgt = Math.min(...counts) + (Math.max(...counts) - Math.min(...counts)) * want;
    const near = pool.map((p, i) => [p, Math.abs(counts[i] - tgt)]).sort((a, b) => a[1] - b[1]).map(x => x[0]).slice(0, 4);
    const cell = pick(rng, near);
    for (let base = 0; base < ctx.end; base += cell.len)
      for (const c of cell.notes) { const t = base + c.o; if (inC(t)) rhythm.push({ t, d: Math.min(c.d, ctx.end - t), v: .7 }); }
  }
  rhythm = rhythm.slice().sort((a, b) => a.t - b.t);
  let prev = null;
  const list = rhythm.map((x, k) => {
    const p = x.t % EPB, strongPos = ctx.beats === 4 ? p % 4 === 0 : p === 0;
    const tg = at(x.t);
    const want = tg === null ? (prev ?? 72) : tg;
    prev = want;
    return { t: x.t, d: x.d, v: x.v, want, strong: strongPos || x.d >= 2 || k === 0, last: k === rhythm.length - 1 };
  });
  let line = realize(ctx, S, list, { lo, hi, scale: pcs, tension: S.tension, mode });
  line = smooth(line, lo, hi, Math.max(S.leap, .6));
  if (S.chrom) line = chromatic(line, rng, S.chrom * .6);
  line = polish(line, lo, hi);
  return line.map(x => ({ t: r4(x.t), d: r4(x.d), n: x.n, v: r4(x.v ?? .7), l: 'main' }));
}

/* ============================================================
   選んだ音を、音楽理論に沿って動かす（選択ツールの「変形」）
   どれも notes（lead/chord/bass のノート配列の一部）をその場で書き換える
   ============================================================ */
function poolAtFor(proj, scaleName) {
  const ctx = ctxOf(proj);
  const scale = scalePcsOf(ctx, E.SCALE_SET[scaleName] ? scaleName : 'diatonic');
  return t => localScale(scale, chordPcs(ctx, ctx.chordAt(t), false));
}
/* 音階にそって steps 段ずらす（その位置の和音でぶつかる音は避ける） */
export function shiftDiatonic(proj, notes, steps, scaleName) {
  const at = poolAtFor(proj, scaleName);
  for (const x of notes) x.n = clamp(stepFrom(at(x.t), x.n, steps, 0, 127), 0, 127);
}
/* 反転：最初の音を軸に、上下をひっくり返す（音階の段で数える） */
export function invertDiatonic(proj, notes, scaleName) {
  if (!notes.length) return;
  const at = poolAtFor(proj, scaleName), s = notes.slice().sort((a, b) => a.t - b.t || b.n - a.n), axis = s[0].n;
  for (const x of s) {
    const pool = E.notesInRange(at(x.t), 0, 127);
    const ia = pool.reduce((b, m, i) => Math.abs(m - axis) < Math.abs(pool[b] - axis) ? i : b, 0);
    const ix = pool.reduce((b, m, i) => Math.abs(m - x.n) < Math.abs(pool[b] - x.n) ? i : b, 0);
    x.n = pool[clamp(2 * ia - ix, 0, pool.length - 1)];
  }
}
/* 逆行：リズムはそのまま、音の高さの並びを後ろから */
export function retrograde(notes) {
  const s = notes.slice().sort((a, b) => a.t - b.t || b.n - a.n), ns = s.map(x => x.n).reverse();
  s.forEach((x, i) => { x.n = ns[i]; });
}
/* 拡大・縮小：最初の音の位置を軸に、位置と長さを f 倍 */
export function stretch(notes, f, end) {
  if (!notes.length) return;
  const t0 = Math.min(...notes.map(x => x.t));
  for (const x of notes) {
    x.t = r4(clamp(t0 + (x.t - t0) * f, 0, end - .25));
    if (x.d !== undefined) x.d = r4(Math.max(.25, Math.min(x.d * f, end - x.t)));
  }
}
/* 和音の音へ寄せる：強拍・長い音だけ（弱拍の経過音は残す）。all なら全部 */
export function snapChord(proj, notes, all) {
  const ctx = ctxOf(proj);
  for (const x of notes) {
    const p = x.t % ctx.EPB, strong = (ctx.beats === 4 ? p % 4 === 0 : p === 0) || (x.d || 0) >= 2;
    if (!all && !strong) continue;
    x.n = nearest(chordPcs(ctx, ctx.chordAt(x.t), false), x.n, 0, 127, 0);
  }
}
/* 経過音で埋める：3度以上離れた2音の間に、音階をたどる音を足す（前の音の長さを分ける）。足したノートを返す */
export function fillPassing(proj, notes, scaleName) {
  const at = poolAtFor(proj, scaleName), s = notes.slice().sort((a, b) => a.t - b.t), add = [];
  for (let k = 0; k + 1 < s.length; k++) {
    const a = s[k], b = s[k + 1];
    if (Math.abs(b.t - (a.t + a.d)) > .01 || a.d < 1) continue;
    const dir = Math.sign(b.n - a.n), path = [];
    let m = a.n;
    for (let i = 0; i < 4; i++) { m = stepFrom(at(a.t), m, dir, 0, 127); if (dir > 0 ? m >= b.n : m <= b.n) break; path.push(m); }
    if (!path.length) continue;
    const seg = Math.max(.5, Math.floor((a.d / (path.length + 1)) * 2) / 2);
    if (seg * (path.length + 1) > a.d + 1e-6) continue;
    const keep = a.d - seg * path.length;
    path.forEach((n, i) => add.push(Object.assign({}, a, { t: r4(a.t + keep + seg * i), d: seg, n, v: r4((a.v ?? .7) * .9) })));
    a.d = r4(keep);
  }
  return add;
}
/* ハモり：音階で3度下（和音の音に寄せる）を足す。足したノートを返す */
export function harmonyBelow(proj, notes, scaleName) {
  const ctx = ctxOf(proj), at = poolAtFor(proj, scaleName), add = [];
  for (const x of notes) {
    let h = stepFrom(at(x.t), x.n, -2, 0, 127);
    const ct = chordPcs(ctx, ctx.chordAt(x.t), false);
    if (!ct.includes(mod(h)) && (x.d || 0) >= 2) h = nearest(ct, h, 0, x.n - 1, -1);
    add.push(Object.assign({}, x, { n: h, v: r4((x.v ?? .7) * .7) }));
  }
  return add;
}

/* ============================================================
   ドラムのパターン（エディタ専用）。1小節を16分（3拍子は12）の文字で書く
     X 強く・x ふつう・o 弱く・g ゴースト（ごく小さく）
   声：k キック s スネア c クラップ h ハット O オープンハット r リム sh シェイカー rd ライド
       tl/tm/th タム（低・中・高）cg コンガ bm 808
   a がいつもの小節、b が4小節目・8小節目の変化
   ============================================================ */
const VOICE = { k: ['kick'], s: ['snare'], c: ['clap'], h: ['hat'], O: ['ohat'], r: ['rim'], sh: ['shaker'], rd: ['ride'],
  tl: ['tom', 43], tm: ['tom', 47], th: ['tom', 50], cg: ['perc', 63], bm: ['boom'], tb: ['tamb'] };
const VEL = { X: .9, x: .7, o: .45, g: .2 };
export const DRUM_PATTERNS = {
  eightbeat: { name: '8ビート', desc: 'ロック・ポップの基本。まっすぐな8分のハット', beats: 4, fill: 'snare',
    a: { k: 'X.....x.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
    b: { k: 'X.....x.X.x.....', s: '....X.......X.g.', h: 'x.x.x.x.x.x.x.O.' } },
  sixteen: { name: 'ポップ16', desc: '16分のハットで軽く前へ。J-POP のサビに', beats: 4, fill: 'snare',
    a: { k: 'X.....x...X.....', s: '....X.......X...', h: 'xoxoxoxoxoxoxoxo' },
    b: { k: 'X.....x...X..x..', s: '....X.......X..g', h: 'xoxoxoxoxoxoxoO.' } },
  bigroom: { name: 'ビッグルーム', desc: '4つ打ちのキックとクラップ、裏のオープンハット。EDM の定番', beats: 4, fill: 'snare',
    a: { k: 'X...X...X...X...', c: '....X.......X...', O: '..x...x...x...x.', sh: 'o.o.o.o.o.o.o.o.' },
    b: { k: 'X...X...X...X...', c: '....X.......X.xx', O: '..x...x...x.....', sh: 'o.o.o.o.o.o.o.o.' } },
  futurebass: { name: 'フューチャーベース', desc: 'ハーフタイムの重いスネアに、細かいハットとリム。感動系EDMに', beats: 4, fill: 'snare',
    a: { k: 'X.........X.....', s: '........X.......', h: 'o.o.o.o.o.o.o.o.', r: '...g......g..g..' },
    b: { k: 'X.........X..x..', s: '........X.....x.', h: 'o.o.o.o.o.o.oooo', r: '...g......g.....' } },
  trapish: { name: 'トラップ風', desc: '808とハーフタイムのスネア、ときどき細かく転がるハット', beats: 4, fill: 'snare',
    a: { bm: 'X......x..x.....', s: '........X.......', h: 'x.x.x.x.x.xxx.x.' },
    b: { bm: 'X......x..x...x.', s: '........X.......', h: 'x.x.xxxxx.x.xxxx' } },
  dancepop: { name: 'ダンスポップ', desc: '4つ打ちに2・4拍のスネア、裏のハット。明るく踊れる', beats: 4, fill: 'snare',
    a: { k: 'X...X...X...X...', s: '....X.......X...', h: '..x...x...x...x.', sh: 'o.o.o.o.o.o.o.o.' },
    b: { k: 'X...X...X...X...', s: '....X.......X.xx', h: '..x...x...x...x.', sh: 'o.o.o.o.o.o.o.o.' } },
  ballad: { name: 'バラード', desc: 'ゆっくりの2・4拍。キックは少なく、やわらかいハット', beats: 4, fill: 'toms',
    a: { k: 'X.......x.x.....', s: '....x.......x...', h: 'o.o.o.o.o.o.o.o.' },
    b: { k: 'X.......x.x...x.', s: '....x.......x.g.', h: 'o.o.o.o.o.o.o.o.' } },
  epic: { name: 'シネマ（タム）', desc: '太鼓の連打で押し寄せる、映画の予告のようなリズム', beats: 4, fill: 'toms',
    a: { k: 'X.......X.......', tl: 'X..x..X.X..x....', tm: '............x.x.' },
    b: { k: 'X.......X.......', tl: 'X..x..X.X..x....', th: '............xxxx' } },
  brave: { name: 'マーチ（勇ましく）', desc: 'スネアの細かい刻みと、1・3拍のキック。勇者の行進に', beats: 4, fill: 'snare',
    a: { k: 'X.......X.......', s: 'X.xxX.x.X.xxX.x.' },
    b: { k: 'X.......X.......', s: 'X.xxX.x.X.xxxxxx' } },
  halfheavy: { name: 'ハーフタイム（重く）', desc: '3拍目だけのスネアで、ゆっくり大きく揺れる', beats: 4, fill: 'toms',
    a: { k: 'X.......x.......', s: '........X.......', h: 'x...x...x...x...' },
    b: { k: 'X.......x.x.....', s: '........X.......', h: 'x...x...x...x.x.' } },
  dembow: { name: 'デンボウ', desc: 'レゲトンの「ドン・ツ・タ・ドン」。南国や陽気な場面に', beats: 4, fill: 'snare',
    a: { k: 'X...X...X...X...', s: '...x..x....x..x.', h: 'o.o.o.o.o.o.o.o.' },
    b: { k: 'X...X...X...X...', s: '...x..x....x.xx.', h: 'o.o.o.o.o.o.o.o.' } },
  afrobeats: { name: 'アフロビーツ', desc: '3+3+2のキックと、細かいシェイカー、リムの合いの手', beats: 4, fill: 'toms',
    a: { k: 'X..x..x.X.......', r: '...x..x....x..x.', sh: 'xoxoxoxoxoxoxoxo', cg: '......x.......x.' },
    b: { k: 'X..x..x.X..x....', r: '...x..x....x..x.', sh: 'xoxoxoxoxoxoxoxo', cg: '......x....x..x.' } },
  waltzpop: { name: '3拍子ポップ', desc: '「ドン・タ・タ」。明るいワルツ', beats: 3, fill: 'snare',
    a: { k: 'X...........', s: '....x...x...', h: 'x.x.x.x.x.x.' },
    b: { k: 'X.......x...', s: '....x...x.g.', h: 'x.x.x.x.x.x.' } },
  sixeight: { name: '6/8 バラード', desc: '大きく2つに揺れる6/8。感動的な場面に', beats: 3, fill: 'toms',
    a: { k: 'X.....x.....', s: '......X.....', h: 'x.x.x.x.x.x.' },
    b: { k: 'X.....x...x.', s: '......X...g.', h: 'x.x.x.x.x.x.' } },
  epic68: { name: '6/8 シネマ', desc: '6/8で押し寄せるタム。壮大な3拍子に', beats: 3, fill: 'toms',
    a: { k: 'X.....X.....', tl: 'X.xX.xX.xX.x' },
    b: { k: 'X.....X.....', tl: 'X.xX.xX.x...', th: '.........xxx' } },
  jig: { name: '6/8 はずむ', desc: 'スキップするような6/8。冒険の始まりに', beats: 3, fill: 'snare',
    a: { k: 'X.....X.....', s: '...x.....x..', h: 'x.xx.xx.xx.x' },
    b: { k: 'X.....X..x..', s: '...x.....xxx', h: 'x.xx.xx.xx.x' } },
};
function drumBar(pat, base, step, out, scale) {
  for (const [vk, str] of Object.entries(pat)) {
    const [kind, g] = VOICE[vk] || [];
    if (!kind) continue;
    for (let i = 0; i < str.length; i++) {
      const c = str[i]; if (!VEL[c]) continue;
      const h = { t: r4(base + i * step), k: kind, v: r4(VEL[c] * (scale || 1)) };
      if (g !== undefined) h.g = g;
      out.push(h);
    }
  }
}
/* フィル：小節の後ろ半分。snare は16分のスネアを強めながら、toms は高いタムから低いタムへ */
function fillHalf(kind, from, to, out) {
  const n = Math.round((to - from) * 2);
  for (let i = 0; i < n; i++) {
    const t = r4(from + i * .5), v = r4(.35 + .55 * i / Math.max(1, n - 1));
    if (kind === 'toms') { const g = [50, 50, 47, 47, 45, 45, 43, 43][Math.floor(i * 8 / n)]; out.push({ t, k: 'tom', g, v }); }
    else out.push({ t, k: 'snare', v });
  }
}
export function drumPattern(proj, key) {
  const D = DRUM_PATTERNS[key];
  if (!D) return null;
  const EPB = proj.beats * 2, steps = proj.beats * 4, out = [];
  for (let b = 0; b < proj.bars; b++) {
    const base = b * EPB, useB = b % 4 === 3;
    // 拍子が違うパターンは、1小節の長さに合わせて切る・くり返す
    const pat = {};
    for (const [vk, str] of Object.entries(useB ? D.b : D.a)) {
      let s = str; while (s.length < steps) s += str;
      pat[vk] = s.slice(0, steps);
    }
    drumBar(pat, base, .5, out);
    if (b % 8 === 7) {
      const from = base + EPB / 2;
      for (let i = out.length - 1; i >= 0; i--) if (out[i].t >= from - 1e-6 && ['snare', 'clap', 'tom', 'kick'].includes(out[i].k) && out[i].t !== from) out.splice(i, 1);
      fillHalf(D.fill, from, base + EPB, out);
    }
  }
  return dedupe(out);
}
/* アレンジブラシ用：from〜to（8分単位）をフィルかビルドアップにする */
export function drumRoll(kind, from, to) {
  const out = [];
  if (kind === 'build') {
    // キックは4分、スネアは前半4分→8分→最後の1/4は16分。だんだん強く
    const len = to - from;
    for (let t = from; t < to - 1e-6; t += 2) out.push({ t: r4(t), k: 'kick', v: .8 });
    for (let t = from; t < to - 1e-6;) {
      const f = (t - from) / len, step = f < .5 ? 2 : f < .75 ? 1 : .5;
      out.push({ t: r4(t), k: 'snare', v: r4(.25 + .65 * f) });
      t += step;
    }
  } else {
    out.push({ t: r4(from), k: 'kick', v: .8 });
    fillHalf((to - from) > 4 ? 'snare' : 'toms', from, to, out);
  }
  return dedupe(out);
}
/* 同じ瞬間に同じ種類の音が2つあると発音で止まるので、強いほうだけ残す */
function dedupe(list) {
  const m = new Map();
  for (const h of list) {
    const k = h.k + '@' + Math.round(h.t * 1000);
    if (!m.has(k) || m.get(k).v < h.v) m.set(k, h);
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}

/* ============================================================
   展開の仕上げ：伴奏の量は変えない。サビの頭のクラッシュ、サビの前の小節の後ろ半分のフィル、
   サビのメロディのオクターブ上だけ。tracks を渡すとそのトラックだけ（作り直したトラックにかけ直すとき）
   ============================================================ */
export function applyForm(proj, roles, tracks) {
  const EPB = proj.beats * 2, SEC = 8 * EPB, MID = Math.floor(EPB / 2), end = proj.bars * EPB;
  const want = k => !tracks || tracks.includes(k);
  if ((FORMS[proj.st.form] || {}).climb) { climbEvents(proj, want); return; }
  const n = Math.ceil(proj.bars / 8), N = proj.notes;
  for (let s = 0; s < n; s++) {
    const R = ROLES[baseRole(roles[s % roles.length])] || ROLES.A, nextR = ROLES[baseRole(roles[(s + 1) % roles.length])] || ROLES.A;
    const from = s * SEC, to = Math.min(end, from + SEC);
    const inS = x => x.t >= from - 1e-6 && x.t < to - 1e-6;
    if (want('drum') && N.drum.length) {
      // サビの前（サビが続くときは除く）：最後の小節の後ろ半分をフィルに
      if (nextR.crash && !R.crash) {
        const fs = to - EPB + MID;
        N.drum = N.drum.filter(x => !(x.t >= fs - 1e-6 && x.t < to - 1e-6 && ['snare', 'clap', 'tom', 'kick'].includes(x.k)));
        fillHalf('snare', fs, to, N.drum);
      }
      if (R.crash && !N.drum.some(x => x.k === 'crash' && Math.abs(x.t - from) < 1e-6)) N.drum.push({ t: from, k: 'crash', v: .45 });
      N.drum = dedupe(N.drum);
    }
    if (want('lead') && R.oct) {
      const has = new Set(N.lead.filter(x => x.l === 'oct' && inS(x)).map(x => Math.round(x.t * 1000)));
      for (const x of N.lead.filter(y => y.l === 'main' && inS(y)))
        if (!has.has(Math.round(x.t * 1000)) && x.n + 12 <= 103) N.lead.push({ t: x.t, d: x.d, n: x.n + 12, v: r4(x.v * .38), l: 'oct' });
    }
  }
}

/* 「ループの中で盛り上げる」の区切り：伴奏の量はそのままで、
   8小節ごとに頭のクラッシュと最後の小節のフィル（16小節ごと・ループの終わりはスネアの連打、ほかはハットの16分）、
   4小節ごとに最後の小節の後ろ半分でベースが音階を歩いて次の根音へ */
function climbEvents(proj, want) {
  const EPB = proj.beats * 2, MID = Math.floor(EPB / 2), end = proj.bars * EPB, N = proj.notes;
  const inBar = (x, b) => x.t >= b * EPB - 1e-6 && x.t < (b + 1) * EPB - 1e-6;
  if (want('drum') && N.drum.length) {
    for (let b = 0; b < proj.bars; b++) {
      const bar = N.drum.filter(x => inBar(x, b));
      if (!bar.length) continue;
      if (b % 8 === 0 && !bar.some(x => x.k === 'crash' && Math.abs(x.t - b * EPB) < 1e-6)) N.drum.push({ t: b * EPB, k: 'crash', v: .42 });
      if (b % 8 !== 7) continue;
      const big = b % 16 === 15 || b === proj.bars - 1, base = b * EPB;
      if (big) {
        // スネアの16分の連打。にぎやかなキットは小節の後ろ3/4、静かなキットは後ろ1拍半
        const from = base + (bar.length >= 16 ? EPB / 4 : EPB - 3);
        N.drum = N.drum.filter(x => !(x.t >= from - 1e-6 && x.t < base + EPB - 1e-6 && ['snare', 'clap', 'tom', 'kick', 'hat'].includes(x.k)));
        N.drum.push({ t: from, k: 'kick', v: .7 });
        fillHalf('snare', from, base + EPB, N.drum);
      } else {
        // ハットを16分にして細かく
        const from = base + MID;
        for (let t = from; t < base + EPB - 1e-6; t += .5)
          if (!N.drum.some(x => x.k === 'hat' && Math.abs(x.t - t) < 1e-6)) N.drum.push({ t: r4(t), k: 'hat', v: r4(.28 + .25 * (t - from) / (EPB - MID)) });
      }
    }
    N.drum = dedupe(N.drum);
  }
  if (want('bass') && N.bass.length) {
    const ctx = ctxOf(proj), sc = scalePcsOf(ctx, 'diatonic');
    for (let b = 3; b < proj.bars; b += 4) {
      const bar = N.bass.filter(x => inBar(x, b)).sort((a, c) => a.t - c.t);
      // もう動いている小節（音が3つ以上）はそのまま
      if (!bar.length || bar.length > 2) continue;
      const nb = (b + 1) % proj.bars, next = N.bass.filter(x => inBar(x, nb)).sort((a, c) => a.t - c.t)[0];
      const from = b * EPB + MID, start = bar[0].n;
      let tgt = next ? next.n : start;
      while (tgt - start > 7) tgt -= 12; while (start - tgt > 7) tgt += 12;
      // 後ろ半分を4つ（3拍子は2つ）の8分で、次の根音の隣まで歩く
      const steps = EPB - MID, dir = tgt === start ? (b % 8 === 7 ? 1 : -1) : Math.sign(tgt - start), path = [];
      let m = start;
      for (let i = 0; i < steps; i++) {
        if (i === steps - 1 && tgt !== start) m = stepFrom(sc, tgt, -dir, 0, 127);
        else m = i === 0 ? start : stepFrom(sc, m, dir, 0, 127);
        path.push(m);
      }
      N.bass = N.bass.filter(x => !(inBar(x, b) && x.t >= from - 1e-6));
      for (const x of N.bass) if (inBar(x, b) && x.t + x.d > from) x.d = r4(Math.max(.5, from - x.t));
      path.forEach((n, i) => N.bass.push({ t: r4(from + i), d: .9, n: clamp(n, 28, 62), v: r4(.6 + .08 * i) }));
    }
  }
}

/* ============================================================
   新しい曲調：エンジンの曲調（base）を土台に、作曲スタイル・展開・リズムの型・音色をまとめて決めたもの
   st … 曲の状態に重ねる値、sound … 音色（sounds.js の表のキー）、chordStyle … コードの弾き方
   ============================================================ */
export const GENRES = {
  kandoEdm: { label: '感動EDM', desc: 'フューチャーベースの刻んだ和音とハーフタイムのビートの上で、短いフックがくり返す。add9 のきらきらした進行',
    base: 'trance', bpm: 140, st: { compose: 'edm', form: 'climb', progCompose: true, progColor: 'add9', drumPat: 'futurebass', bassStyle: 'whole' },
    sound: { lead: 'futurelead', chord: 'futurechord', bass: 'sub', drum: 'k808' }, chordStyle: 'chop' },
  bigroom: { label: 'ビッグルーム', desc: '4つ打ちとクラップ、裏のオープンハット。ポンプする和音の上で、短いフックがくり返す',
    base: 'trance', bpm: 128, st: { compose: 'edm', form: 'climb', progCompose: true, progColor: 'triad', drumPat: 'bigroom', bassStyle: 'offbeat' },
    sound: { lead: 'bright', chord: 'gate', bass: 'fat', drum: 'big' }, chordStyle: 'pump' },
  orchestra: { label: '壮大オーケストラ', desc: '弦のギャロップとホルンの旋律、太鼓の連打。付点のリズムで、ずっと勇ましく',
    base: 'boss', bpm: 96, st: { compose: 'epic', form: 'climb', progCompose: true, progColor: 'triad', drumPat: 'epic', bassStyle: 'octave' },
    sound: { lead: 'horn', chord: 'fastrings', bass: 'deep', drum: 'acoustic' }, chordStyle: 'gallop' },
  cinematic: { label: 'シネマティック', desc: 'チェロの長い旋律と、あたたかいパッド。ハーフタイムの重いビートで、ゆっくり大きく揺れる',
    base: 'shinen', bpm: 80, st: { compose: 'epic', form: 'climb', progCompose: true, progColor: 'add9', drumPat: 'halfheavy', bassStyle: 'whole' },
    sound: { lead: 'cello', chord: 'warm', bass: 'sub', drum: 'hard' }, chordStyle: 'whole' },
  emoPiano: { label: 'エモ・ピアノ', desc: 'ピアノの伴奏と、のばして歌う旋律。ため息のように下りて解決する動き',
    base: 'canon', bpm: 78, st: { compose: 'emo', form: 'climb', progCompose: true, progColor: 'add9', drumPat: 'ballad', bassStyle: 'whole' },
    sound: { lead: 'piano', chord: 'piano', bass: 'finger', drum: 'acoustic' }, chordStyle: 'ballad' },
  jpop: { label: 'J-POP', desc: '12弦ギターのストロークと16ビート。サビのような高めの旋律がずっと続く',
    base: 'oudou', bpm: 136, st: { compose: 'uta', form: 'climb', progCompose: true, progColor: 'pop', drumPat: 'sixteen', bassStyle: 'bounce' },
    sound: { lead: 'softlead', chord: 'twelve', bass: 'finger', drum: 'acoustic' }, chordStyle: 'strum' },
  hero: { label: '勇者のテーマ', desc: 'スネアの刻みのマーチに、トランペットのファンファーレ。付点のリズムで駆け上がる',
    base: 'oudou', bpm: 120, st: { compose: 'epic', form: 'climb', progCompose: true, progColor: 'triad', drumPat: 'brave', bassStyle: 'octave' },
    sound: { lead: 'trumpet', chord: 'brass', bass: 'finger', drum: 'acoustic' }, chordStyle: 'gallop' },
  ballad68: { label: '6/8 バラード', desc: '大きく2つに揺れる6/8。フルートの旋律とピアノの分散和音で、やさしく',
    base: 'canon', bpm: 132, st: { beats: 3, compose: 'emo', form: 'climb', progCompose: true, progColor: 'add9', drumPat: 'sixeight', bassStyle: 'whole' },
    sound: { lead: 'flute', chord: 'piano', bass: 'finger', drum: 'soft' }, chordStyle: 'ballad' },
  adventure: { label: '8bitアドベンチャー', desc: 'ピコピコの矩形波で駆け回る旋律。ファンファーレのように和音を駆け上がる',
    base: 'chip', bpm: 150, st: { compose: 'chip', form: 'climb', progCompose: true, progColor: 'triad', drumPat: null },
    sound: { lead: 'nes', chord: 'pulse', bass: 'chiptri', drum: 'chip' }, chordStyle: 'arpUp' },
  epic68: { label: '6/8 シネマ', desc: '6/8で押し寄せるタムと、ハープの分散和音。冒険や決戦の場面に',
    base: 'boss', bpm: 126, st: { beats: 3, compose: 'epic', form: 'climb', progCompose: true, progColor: 'triad', drumPat: 'epic68', bassStyle: 'whole' },
    sound: { lead: 'strlead', chord: 'harpchord', bass: 'deep', drum: 'acoustic' }, chordStyle: 'arpUpDown' },
};

/* ============================================================
   プロジェクトにまとめてかける
   st.compose（作曲スタイル。null ならエンジンの作り方）、st.form（展開）、st.drumPat（ドラムのパターン）
   ============================================================ */
export const rolesFor = proj => rolesOf(proj.st.form || 'flat', proj.bars);
/* buildSong の前：進行を作曲するなら、拍ごとの和音を st.slots に入れる */
export function prepareState(st) {
  const F = FORMS[st.form] || FORMS.flat, P = E.presetOf(st), bars = (st.sections || 2) * 16;
  if (st.progCompose)
    st.slots = composeProgression({ bars, beats: P.beats, minor: P.minor, tonic: P.tonic }, rolesOf(st.form || 'flat', bars),
      st.progColor || (STYLES[st.compose] || STYLES.uta).color, st.harmSeed || st.seed);
  else if (F.climb) st.slots = presetSlots(st, P, bars);
  // ループの中で盛り上げる：8小節の区切りの小節は、後ろで次の和音へ向かうドミナントを入れて和音を速く動かす
  if (F.climb && st.slots) st.slots = turnarounds(st.slots, P.beats, bars);
  return st;
}
/* 曲調の進行表から、エンジンと同じ手順で拍ごとの和音を作る（和音の動き・コードのゆらぎも同じ乱数で） */
function presetSlots(st, P, bars) {
  const prog = E.PROGS[P.prog], motion = st.chordMotion || 'auto';
  const progAt = i => motion === 'hold' ? prog[0] : motion === 'quarter' ? prog[i - (i % 4)] : motion === 'half' ? prog[i - (i % 2)] : prog[i];
  const chords = [];
  for (let b = 0; b < bars; b++) chords.push(progAt(b % 16));
  if ((st.harmVary | 0) > 0 && motion !== 'hold')
    return E.harmonize(chords, P, Math.min(100, st.harmVary | 0) / 100 * (P.pedal ? .5 : 1), E.mulberry32(((st.harmSeed || st.seed) * 23 + 0x7A3D) | 0));
  return chords.flatMap(c => Array(P.beats).fill(c));
}
function turnarounds(slots, beats, bars) {
  const out = slots.slice(), half = beats === 4 ? 2 : 1;
  for (let b = 7; b < bars; b += 8) {
    const i0 = b * beats, cur = out[i0], next = out[((b + 1) % bars) * beats];
    // もう小節の中で動いている所はそのまま
    if (out.slice(i0, i0 + beats).some(c => c[0] !== cur[0] || c[1] !== cur[1])) continue;
    const dom = [mod(next[0] + 7), 'dom7'];
    // もう次の和音のドミナントなら、前半をその ii にする（ツーファイブ）
    const pre = dom[0] === mod(cur[0]) ? [mod(next[0] + 2), E.MINOR_Q[next[1]] ? 'm7b5' : 'm7'] : null;
    for (let q = 0; q < beats; q++) {
      if (q >= beats - half) out[i0 + q] = dom;
      else if (pre) out[i0 + q] = pre;
    }
  }
  return out;
}
/* 作ったあと：メロディ・ドラムのパターン・展開 */
export function finish(proj, tracks) {
  const want = k => !tracks || tracks.includes(k);
  // エンジンのノリ（タイミングの揺れ）で、ループの終わりちょうどに丸まった音は頭へ折り返す
  const end = proj.bars * proj.beats * 2;
  for (const k of Object.keys(proj.notes)) if (want(k)) for (const x of proj.notes[k]) if (x.t >= end) x.t = r4(x.t - end);
  const roles = rolesFor(proj);
  if (want('lead') && proj.st.compose && STYLES[proj.st.compose]) {
    const M = proj.st.mel || {};
    proj.notes.lead = composeMelody(proj, { style: proj.st.compose, seed: proj.st.seed, dens: M.dens, roles, oct: M.oct, octUp: M.octUp, harm: M.harm,
      scale: proj.st.composeScale });
  }
  if (want('drum') && proj.st.drumPat && DRUM_PATTERNS[proj.st.drumPat]) proj.notes.drum = drumPattern(proj, proj.st.drumPat);
  if (proj.st.form && proj.st.form !== 'flat') applyForm(proj, roles, tracks);
}
