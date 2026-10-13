#!/usr/bin/env node
/*
  composer-test.mjs — エディタの作曲（src/scripts/loop-bgm-studio/editor/composer.js）の検証。改修のたびに通すこと。

  node tools/bgm/composer-test.mjs

  検査:
    cells     リズムの型・ドラムの型の長さが拍子と合っている
    build     全曲調 × 作曲スタイル × 展開 × 拍子 × 長さで、ループ外・音域外・長さ0・NaN がない
    harmony   メロディの強拍（1・3拍目と、4分より長い音）が和音の音（テンションを許すスタイルは9度も）
    resolve   メロディの非和声音（和音にない音）は、次の音へ2度で進む（倚音・半音の寄りを含む）
    leaps     増4度の跳躍がなく、オクターブを超える跳躍もない
    （build の中で）リズムの型で作ったドラムは、同じ瞬間に同じ音色が2回鳴らない
    （build の中で）ループBGMとして段差がない：伴奏のあるトラックは全部の小節で鳴り、ドラムの打数は小節ごとに大きくぶれない
    climb     「ループの中で盛り上げる」：メロディの平均の高さが8小節ごとに上がり（A→A2→B→高まり）、
              ループの最後の音から頭の音へ5半音以内でつながり、8小節目の後ろで和音が動く
    variety   同じ設定でもタネが違えば別のメロディになる。同じタネなら同じ
    tools     選択ツールの変形（音階で上下・反転・逆行・拡大・経過音・ハモり）が音域と長さを壊さない
*/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../../src/scripts/loop-bgm-studio');
const E = await import(path.join(SRC, 'engine.js'));
const C = await import(path.join(SRC, 'editor/composer.js'));
const P = await import(path.join(SRC, 'editor/project.js'));
const { defaultState } = await import(path.join(SRC, 'controls.js'));

let fail = 0;
const ok = (n, m) => console.log('OK   ' + n + (m ? '  ' + m : '')), ng = (n, m) => { fail++; console.log('FAIL ' + n + '  ' + m); };
const mod = x => ((x % 12) + 12) % 12;
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* cells */
{
  let e = null;
  for (const [beats, tab] of Object.entries(C.CELLS)) for (const [k, list] of Object.entries(tab)) for (const s of list)
    if (s.replace(/\|/g, '').length !== +beats * 8) e = beats + '/' + k + ': ' + s;
  for (const [k, D] of Object.entries(C.DRUM_PATTERNS)) for (const bar of [D.a, D.b]) for (const [v, s] of Object.entries(bar))
    if (s.length !== D.beats * 4) e = 'drum ' + k + '.' + v + ': ' + s;
  e ? ng('cells', e) : ok('cells');
}

function make(preset, o) {
  const st = defaultState(preset);
  st.seed = o.seed; st.sections = o.bars / 16;
  if (o.beats) { st.beats = o.beats; E.fitMeter(st); }
  Object.assign(st, { compose: o.style, form: o.form, progCompose: o.prog, drumPat: o.drumPat || null });
  st.mel = Object.assign({}, st.mel, { dens: o.dens ?? 55, octUp: !!o.octUp, harm: !!o.harm });
  return P.fromState(st);
}
function checkProj(proj, S) {
  const end = proj.bars * proj.beats * 2, ctx = C.ctxOf(proj), EPB = ctx.EPB;
  for (const k of P.TRACKS) for (const x of proj.notes[k]) {
    if (!(x.t >= 0 && x.t < end)) return 'outside ' + k + ' ' + x.t;
    if (!(x.v > 0 && x.v <= 1)) return 'velocity ' + k + ' ' + x.v;
    if (k !== 'drum') {
      // エンジンのベースは、最後の音がループの頭へまたいで伸びることがある（もとからの作り）。メロディは中に収める
      if (!(x.d > 0) || (k === 'lead' && x.t + x.d > end + 1e-6)) return 'length ' + k + ' ' + x.t + '+' + x.d;
      if (!(x.n >= 24 && x.n <= 108)) return 'note ' + k + ' ' + x.n;
    } else if (!E.GROUP[x.k]) return 'drum kind ' + x.k;
  }
  if (proj.slots && proj.slots.length !== proj.bars * proj.beats) return 'slots length';
  // ループの段差：ベース・コードは全部の小節で鳴る。ドラムは小節ごとの打数が中央値の 1/3〜3倍
  for (const k of ['bass', 'chord', 'drum']) {
    if (!proj.notes[k].length) continue;
    const per = Array.from({ length: proj.bars }, (_, b) => proj.notes[k].filter(x => x.t >= b * EPB - 1e-6 && x.t < (b + 1) * EPB - 1e-6).length);
    const med = per.slice().sort((a, b) => a - b)[Math.floor(per.length / 2)];
    const bad = per.findIndex(c => c === 0 || (k === 'drum' && (c < med / 3 || c > med * 3)));
    if (bad >= 0) return 'loop ' + k + ' bar ' + (bad + 1) + ' count ' + per[bad] + ' (median ' + med + ')';
  }
  if (proj.slots && !proj.slots.every(c => E.QUAL[c[1]])) return 'slots quality';
  // 同じ瞬間の同じ音色（鳴らすときにも強いほうだけにするが、作曲したドラムは最初からかぶらないこと）
  if (proj.st.drumPat) {
    const seen = new Set();
    for (const x of proj.notes.drum) { const key = x.k + '@' + Math.round(x.t * 1000); if (seen.has(key)) return 'drum double ' + key; seen.add(key); }
  }
  return null;
}
/* メロディの質：強拍が和音の音か、非和声音が2度で解決するか、跳躍 */
function melodyStats(proj, style) {
  const S = C.STYLES[style], ctx = C.ctxOf(proj), EPB = ctx.EPB;
  const main = proj.notes.lead.filter(x => x.l === 'main').sort((a, b) => a.t - b.t);
  let strong = 0, strongBad = 0, nct = 0, nctBad = 0, tri = 0, big = 0;
  const pcsAt = (t, ten) => {
    const ch = ctx.chordAt(t), out = E.QUAL[ch[1]].map(i => mod(ch[0] + ctx.key + i));
    if (ten) for (const i of (E.EXT[ch[1]] || []).slice(0, 1)) out.push(mod(ch[0] + ctx.key + i));
    return out;
  };
  for (let k = 0; k < main.length; k++) {
    const x = main[k], nx = main[k + 1], pv = main[k - 1], p = x.t % EPB;
    // 先取りで次の和音の音になっていることがあるので、終わり際の和音も見る
    const ok = pcsAt(x.t, S.tension).includes(mod(x.n)) || pcsAt(x.t + x.d - .01, S.tension).includes(mod(x.n));
    const isStrong = (ctx.beats === 4 ? p % 4 === 0 : p === 0) || x.d >= 2;
    const appoHead = nx && Math.abs(nx.t - (x.t + x.d)) < .01 && nx.n < x.n && x.n - nx.n <= 2;
    if (isStrong) { strong++; if (!ok && !appoHead) strongBad++; }
    if (!ok) { nct++; if (!(nx && Math.abs(nx.n - x.n) >= 1 && Math.abs(nx.n - x.n) <= 2)) nctBad++; }
    if (pv && Math.abs(x.t - (pv.t + pv.d)) < 2.01) { const iv = Math.abs(x.n - pv.n); if (iv === 6) tri++; if (iv > 12) big++; }
  }
  return { n: main.length, strong, strongBad, nct, nctBad, tri, big };
}

/* build / harmony / resolve / leaps / starts */
{
  const R = mulberry(2026), presets = Object.keys(E.PRESETS), styles = Object.keys(C.STYLES), forms = Object.keys(C.FORMS);
  const pats = Object.keys(C.DRUM_PATTERNS);
  let n = 0, err = null, agg = { n: 0, strong: 0, strongBad: 0, nct: 0, nctBad: 0, tri: 0, big: 0 };
  for (const preset of presets) for (const style of styles) {
    if (err) break;
    for (let i = 0; i < 3 && !err; i++) {
      const o = { style, form: forms[(n + i) % forms.length], prog: i !== 1, bars: [16, 32, 64][(n + i) % 3], beats: i === 2 ? 3 : undefined,
        seed: 1000 + Math.floor(R() * 9e6), dens: Math.floor(R() * 101), octUp: R() < .3, harm: R() < .3,
        drumPat: R() < .5 ? pats[Math.floor(R() * pats.length)] : null };
      let proj;
      try { proj = make(preset, o); } catch (e) { err = preset + '/' + style + ' throw ' + e.stack; break; }
      const c = checkProj(proj); if (c) { err = preset + '/' + style + '/' + o.form + '/' + (o.beats || 4) + ': ' + c; break; }
      const m = melodyStats(proj, style); for (const k of Object.keys(agg)) agg[k] += m[k];
      n++;
    }
  }
  err ? ng('build', err) : ok('build', n + '曲');
  const sb = agg.strongBad / Math.max(1, agg.strong), nb = agg.nctBad / Math.max(1, agg.nct);
  sb <= .03 ? ok('harmony', '強拍の和音外 ' + (sb * 100).toFixed(2) + '%（' + agg.strong + '音中）') : ng('harmony', '強拍の和音外が ' + (sb * 100).toFixed(2) + '%');
  nb <= .03 ? ok('resolve', '解決しない非和声音 ' + (nb * 100).toFixed(2) + '%（非和声音 ' + agg.nct + '）') : ng('resolve', '解決しない非和声音が ' + (nb * 100).toFixed(2) + '%');
  (agg.tri === 0 && agg.big === 0) ? ok('leaps', 'メロディ ' + agg.n + '音') : ng('leaps', '増4度 ' + agg.tri + '・オクターブ超え ' + agg.big);
}

/* climb */
{
  const R = mulberry(1013), styles = Object.keys(C.STYLES), presets = ['oudou', 'dosshiri', 'trance', 'canon', 'boss', 'pokopoko', 'yofukashi'];
  let n = 0, rise = 0, seam = 0, turn = 0, total = 0;
  for (const preset of presets) for (const style of styles) for (let i = 0; i < 3; i++) {
    const proj = make(preset, { style, form: 'climb', prog: i === 0, bars: 32, seed: 1 + Math.floor(R() * 9e6) });
    const main = proj.notes.lead.filter(x => x.l === 'main').sort((a, b) => a.t - b.t), EPB = proj.beats * 2;
    const avg = s => { const l = main.filter(x => x.t >= s * 8 * EPB && x.t < (s + 1) * 8 * EPB); return l.reduce((a, x) => a + x.n, 0) / Math.max(1, l.length); };
    const a = [0, 1, 2, 3].map(avg);
    if ((a[2] + a[3]) / 2 > (a[0] + a[1]) / 2 + 1.5 && a[3] >= a[2] - 1) rise++;
    if (main.length && Math.abs(main[main.length - 1].n - main[0].n) <= 5) seam++;
    const sl = proj.slots, b7 = sl.slice(7 * proj.beats, 8 * proj.beats);
    if (b7.some(c => c[0] !== b7[0][0] || c[1] !== b7[0][1])) turn++;
    total++;
  }
  const pr = x => (x / total * 100).toFixed(0) + '%';
  (rise / total >= .9 && seam / total >= .9 && turn / total >= .9) ? ok('climb', total + '曲：上がる ' + pr(rise) + '・つながる ' + pr(seam) + '・区切りで動く ' + pr(turn))
    : ng('climb', '上がる ' + pr(rise) + '・つながる ' + pr(seam) + '・区切りで動く ' + pr(turn));
}

/* variety */
{
  const a = make('oudou', { style: 'uta', form: 'abs', prog: true, bars: 32, seed: 1234 });
  const b = make('oudou', { style: 'uta', form: 'abs', prog: true, bars: 32, seed: 1234 });
  const c = make('oudou', { style: 'uta', form: 'abs', prog: true, bars: 32, seed: 98765 });
  const sig = p => p.notes.lead.filter(x => x.l === 'main').map(x => x.t + ':' + x.n).join(',');
  const prog = p => p.slots.map(c => c.join('')).join(',');
  if (sig(a) !== sig(b)) ng('variety', '同じタネで別のメロディ');
  else if (sig(a) === sig(c)) ng('variety', '別のタネで同じメロディ');
  else {
    // 32曲作って、異なるメロディ・進行の数
    const ms = new Set(), ps = new Set();
    for (let i = 0; i < 32; i++) { const p = make('oudou', { style: 'uta', form: 'abs', prog: true, bars: 32, seed: 5000 + i * 7919 }); ms.add(sig(p)); ps.add(prog(p)); }
    ok('variety', '32曲で メロディ ' + ms.size + '種・進行 ' + ps.size + '種');
  }
}

/* tools */
{
  const proj = make('oudou', { style: 'uta', form: 'abs', prog: true, bars: 16, seed: 77 });
  const end = proj.bars * proj.beats * 2;
  let e = null;
  const sel = () => proj.notes.lead.filter(x => x.l === 'main').slice(0, 12).map(x => Object.assign({}, x));
  const sane = (list, name) => { for (const x of list) if (!(x.n >= 0 && x.n <= 127 && x.t >= 0 && x.t < end && x.d > 0)) e = name + ' ' + JSON.stringify(x); };
  let s = sel(); C.shiftDiatonic(proj, s, 1); sane(s, 'shift+1');
  s = sel(); C.shiftDiatonic(proj, s, -3); sane(s, 'shift-3');
  s = sel(); C.invertDiatonic(proj, s); sane(s, 'invert');
  s = sel(); C.retrograde(s); sane(s, 'retro');
  s = sel(); C.stretch(s, 2, end); sane(s, 'x2');
  s = sel(); C.stretch(s, .5, end); sane(s, '/2');
  s = sel(); C.snapChord(proj, s); sane(s, 'snap');
  s = sel(); const add = C.fillPassing(proj, s); sane(s.concat(add), 'passing');
  s = sel(); sane(C.harmonyBelow(proj, s), 'harmony');
  // 音階で1段上げて1段下げたら戻る（音階の音なら）
  s = sel(); const before = s.map(x => x.n).join(','); C.shiftDiatonic(proj, s, 1); C.shiftDiatonic(proj, s, -1);
  const back = s.map(x => x.n).join(',');
  e ? ng('tools', e) : ok('tools', before === back ? '上げて下げると元どおり' : '（和音で音階が変わる所は元に戻らないことがある）');
}

console.log(fail ? `\n${fail}項目が失敗` : '\nすべて通過');
process.exit(fail ? 1 : 0);
