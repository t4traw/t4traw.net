/*
  エディタ版のデータ。DOM には触らない。

  レシピコード（ハッシュ）で曲調を作ったら、そこから先は音符そのものを持つ「プロジェクト」になる。
  ノートを1つでも動かすとレシピコードでは戻せないので、保存は JSON で行う。

  {
    format: 'loop-bgm-project', version: 1,
    recipe: 作ったときのレシピコード（由来の記録。読み込みには使わない）
    st:     エンジンの状態（テンポ・キー・音色・タネ…）。作り直しやMIDIの音色番号に使う
    bars, beats, chords: 小節数・拍子・小節ごとの和音（[根音, 種類]、キーからの相対）
    mix:    { lead|chord|bass|drum: {vol, pan, rev, mute, solo, sound?, tone, fx} }
              tone = {bright, attack, length, color}（0〜100、50でその音色のまま）
              fx   = {drive, comp}（0〜100、0でかからない）
    fx:     { revLen }  残響の長さ（秒、全トラック共通）
    notes:  {
      lead:  [{t, d, n, v, l}]   t=位置・d=長さ（8分音符単位）n=MIDIノート v=強さ0〜1 l=main/oct/harm/counter
      chord: [{t, d, n, v}]      和音は1音ずつばらして持つ
      bass:  [{t, d, n, v}]
      drum:  [{t, k, v, g?}]     k=音の種類（kick, snare…）g=タム・コンガの音程（GM番号）
    }
  }
*/
import * as E from "../engine.js";

export const FORMAT = 'loop-bgm-project';
export const VERSION = 1;
export const TRACKS = ['lead', 'chord', 'bass', 'drum'];
export const PITCHED = ['lead', 'chord', 'bass'];
export const TRACK_INFO = {
  lead:  { name: 'メロディ', color: '#EC4A3E', key: '1' },
  chord: { name: '伴奏',     color: '#7A6CD0', key: '2' },
  bass:  { name: 'ベース',   color: '#3CB98F', key: '3' },
  drum:  { name: 'ドラム',   color: '#B9B39C', key: '4' },
};

/* ベースの音源は1つ（MonoSynth）なので、エディタでは波形だけ選べるようにする */
export const BASS_TONES = {
  tri:    { name: 'まるい',   cfg: { oscillator: { type: 'triangle' } } },
  sine:   { name: 'やわらか', cfg: { oscillator: { type: 'sine' } } },
  saw:    { name: 'ぶりぶり', cfg: { oscillator: { type: 'sawtooth' } } },
  square: { name: 'ぴこぴこ', cfg: { oscillator: { type: 'square' } } },
  fat:    { name: '太い',     cfg: { oscillator: { type: 'fatsawtooth', count: 3, spread: 18 } } },
  pwm:    { name: 'うねり',   cfg: { oscillator: { type: 'pwm', modulationFrequency: .35 } } },
  fm:     { name: 'FMベース', cfg: { oscillator: { type: 'fmsine', harmonicity: 1, modulationIndex: 3 } } },
  sub:    { name: 'サブ',     cfg: { oscillator: { type: 'sine' } } },
};
/* rig.bass の作りと同じ値（engine.js の createRig）。音色の傾向はここからの倍率でかける */
const BASS_BASE = {
  envelope: { attack: .012, decay: .3, sustain: .45, release: .35 },
  filterEnvelope: { attack: .01, decay: .2, sustain: .35, release: .3, baseFrequency: 110, octaves: 2.4 },
  filter: { Q: 1.2 },
};
/* 詳細設定のつまみ。どのトラックに出すか */
export const TONE_KNOBS = [
  { id: 'bright', label: '明るさ', tracks: ['lead', 'chord', 'bass', 'drum'], help: '左で暗く、右で高い音を持ち上げてきらびやかに' },
  { id: 'attack', label: 'アタック', tracks: ['lead', 'chord', 'bass'], help: '右ほど音の立ち上がりがゆっくり' },
  { id: 'length', label: '余韻', tracks: ['lead', 'chord', 'bass'], help: '音が消えるまでの長さ' },
  { id: 'color', label: '倍音', tracks: ['lead'], help: '右ほど金属っぽく、左ほど丸い（FMの深さ）' },
  { id: 'color', label: 'うなり', tracks: ['bass'], help: '右ほどフィルターがよく動いて、うなる' },
];
export const FX_KNOBS = [
  { id: 'drive', label: '歪み', help: '0でかからない。右ほど荒く歪む' },
  { id: 'comp', label: 'コンプ', help: '0でかからない。右ほど音量の差がなくなって、前に出る' },
];
export const defaultTone = () => ({ bright: 50, attack: 50, length: 50, color: 50 });
export const defaultFx = () => ({ drive: 0, comp: 0 });
export const REV_LEN = { min: .6, max: 6, def: 2.2 };

/* ドラム画面の行。上から下へ。g はタム・コンガの音程（GM番号） */
export const DRUM_ROWS = [
  { k: 'crash', label: 'クラッシュ' }, { k: 'ride', label: 'ライド' },
  { k: 'ohat', label: 'オープンHH' }, { k: 'hat', label: 'ハイハット' },
  { k: 'shaker', label: 'シェイカー' }, { k: 'tamb', label: 'タンバリン' },
  { k: 'cowbell', label: 'カウベル' }, { k: 'block', label: 'ブロック' },
  { k: 'perc', g: 63, label: 'コンガ高' }, { k: 'perc', g: 62, label: 'コンガ消' },
  { k: 'perc', g: 64, label: 'コンガ低' },
  { k: 'tom', g: 50, label: 'タム1' }, { k: 'tom', g: 48, label: 'タム2' },
  { k: 'tom', g: 47, label: 'タム3' }, { k: 'tom', g: 45, label: 'タム4' },
  { k: 'tom', g: 43, label: 'タム5' }, { k: 'tom', g: 41, label: 'タム6' },
  { k: 'rim', label: 'リム' }, { k: 'clap', label: 'クラップ' },
  { k: 'snare', label: 'スネア' }, { k: 'boom', label: '808' }, { k: 'kick', label: 'キック' },
];
export const drumRowOf = h => {
  const i = DRUM_ROWS.findIndex(r => r.k === h.k && (r.g === undefined || r.g === h.g));
  return i < 0 ? DRUM_ROWS.findIndex(r => r.k === h.k) : i;
};

const r4 = x => Math.round(x * 10000) / 10000;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const clone = o => JSON.parse(JSON.stringify(o));

/* engine の events → トラックごとのノート */
export function notesFromEvents(events) {
  const notes = { lead: [], chord: [], bass: [], drum: [] };
  for (const e of events) {
    const g = E.GROUP[e.kind];
    if (g === 'lead') notes.lead.push({ t: r4(e.p8), d: e.d8 || 1, n: e.note, v: r4(e.vel ?? .7), l: e.layer || 'main' });
    else if (g === 'chord') for (const n of e.notes) notes.chord.push({ t: r4(e.p8), d: e.d8 || 1, n, v: r4(e.vel ?? .6) });
    else if (g === 'bass') notes.bass.push({ t: r4(e.p8), d: e.d8 || 1, n: e.note, v: r4(e.vel ?? .7) });
    else if (g === 'drum') {
      const h = { t: r4(e.p8), k: e.kind, v: r4(e.vel ?? .6) };
      if (e.gm !== undefined) h.g = e.gm;
      notes.drum.push(h);
    }
  }
  return notes;
}

/* トラックごとのノート → engine の events（MIDI 書き出しやドラムの発音に使う） */
export function eventsFromNotes(notes) {
  const ev = [];
  for (const x of notes.lead) ev.push({ kind: 'lead', p8: x.t, d8: x.d, note: x.n, vel: x.v, layer: x.l || 'main' });
  for (const x of notes.chord) ev.push({ kind: 'chord', p8: x.t, d8: x.d, notes: [x.n], vel: x.v });
  for (const x of notes.bass) ev.push({ kind: 'bass', p8: x.t, d8: x.d, note: x.n, vel: x.v });
  for (const x of notes.drum) {
    const e = { kind: x.k, p8: x.t, vel: x.v };
    if (x.g !== undefined) e.gm = x.g;
    ev.push(e);
  }
  return ev.sort((a, b) => a.p8 - b.p8);
}

const defaultMix = st => {
  const m = {};
  for (const k of TRACKS) m[k] = { vol: st.partVol[k], pan: 0, rev: 50, mute: !!st.mute[k], solo: false, tone: defaultTone(), fx: defaultFx() };
  m.bass.sound = 'tri';
  return m;
};

/* レシピの状態から新しいプロジェクトを作る */
export function fromState(st, mix) {
  const s = clone(st);
  // ミュートはエディタの mix が持つ。曲調の演奏は全パート作っておく
  s.mute = { lead: false, chord: false, bass: false, drum: false };
  const song = E.buildSong(s);
  return {
    format: FORMAT, version: VERSION,
    recipe: E.encodeRecipe(st),
    st: s, bars: song.bars, beats: song.beats, chords: song.chords,
    mix: mix ? clone(mix) : defaultMix(st),
    fx: { revLen: REV_LEN.def },
    notes: notesFromEvents(song.events),
  };
}

/* 1トラックだけ新しいタネで作り直す（ほかのトラックの編集は残る） */
export function regenerateTrack(proj, track, patch) {
  const st = Object.assign(clone(proj.st), patch || {});
  st.sections = proj.bars / 16;
  st.mute = { lead: false, chord: false, bass: false, drum: false };
  if (!patch || patch.seed === undefined) st.seed = (Math.random() * 9000000 | 0) + 1000;
  const song = E.buildSong(st);
  proj.notes[track] = notesFromEvents(song.events)[track];
  // タネはメロディの作り直しのときだけ本体に残す（ほかは音色や型の選択だけ残す）
  if (track === 'lead') proj.st.seed = st.seed;
  for (const k of Object.keys(patch || {})) if (k !== 'seed') proj.st[k] = st[k];
}

export const endOf = proj => proj.bars * proj.beats * 2;

/* キーを変える：音のあるトラックを半音ずつずらす（ドラムはそのまま） */
export function setKey(proj, key) {
  let d = ((key - proj.st.key) % 12 + 12) % 12;
  if (d > 6) d -= 12;
  for (const k of PITCHED) for (const x of proj.notes[k]) x.n = clamp(x.n + d, 0, 127);
  proj.st.key = key;
}

/* 長さを変える：伸ばすときは今の内容をくり返し、縮めるときははみ出しを落とす */
export function setBars(proj, bars) {
  const oldEnd = endOf(proj), old = proj.bars;
  proj.bars = bars;
  proj.st.sections = bars / 16;
  const end = endOf(proj);
  const chords = [];
  for (let i = 0; i < bars; i++) chords.push(proj.chords[i % old]);
  proj.chords = chords;
  for (const k of TRACKS) {
    const src = proj.notes[k], out = [];
    for (let off = 0; off < end; off += oldEnd)
      for (const x of src) {
        const t = x.t + off;
        if (t >= end) continue;
        const y = Object.assign({}, x, { t });
        if (y.d !== undefined && t + y.d > end) y.d = Math.max(.25, end - t);
        out.push(y);
      }
    proj.notes[k] = out;
  }
}

/* 書き出し用のエンジン状態。ソロは試聴のための一時的なものなので書き出しには効かせない */
export function exportState(proj) {
  const st = clone(proj.st);
  st.mute = {}; st.partVol = {};
  for (const k of TRACKS) { st.mute[k] = !!proj.mix[k].mute; st.partVol[k] = proj.mix[k].vol; }
  st.sections = proj.bars / 16;
  return st;
}

export function buildMidi(proj) {
  const song = { events: eventsFromNotes(proj.notes), beats: proj.beats, epb: proj.beats * 2 };
  return E.buildMidi(song, exportState(proj));
}

/* ---------- JSON ---------- */

export function toJSON(proj) {
  const out = clone(proj);
  out.savedAt = new Date().toISOString();
  return JSON.stringify(out, null, 1);
}

/* 読み込んだ JSON を確かめて、足りない所は既定値で埋める。読めないときは理由つきで throw */
export function parseProject(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { throw new Error('JSONとして読めなかった'); }
  if (!o || o.format !== FORMAT) throw new Error('ループBGMスタジオのプロジェクトじゃないみたい');
  if ((o.version | 0) > VERSION) throw new Error('新しい版で保存されたファイルだから、このページじゃ開けない');
  const st = o.st || {};
  if (!E.PRESETS[st.preset]) throw new Error('曲調（ジャンル）の情報が壊れてる');
  const P = E.PRESETS[st.preset];
  const bars = [16, 32, 64].includes(o.bars) ? o.bars : 32;
  const beats = o.beats === 3 ? 3 : (o.beats === 4 ? 4 : P.beats);
  st.lead = E.LEADS[st.lead] ? st.lead : P.lead;
  st.pad = E.PADS[st.pad] ? st.pad : P.pad;
  st.bassStyle = E.BASSES[st.bassStyle] ? st.bassStyle : P.bass;
  st.drums = E.KITS[st.drums] ? st.drums : P.drums;
  st.key = clamp(st.key | 0, 0, 11);
  st.bpm = clamp(+st.bpm || P.bpm, 52, 176);
  st.swing = clamp(+st.swing || 0, 0, 100);
  st.tone = clamp(st.tone ?? 55, 0, 100);
  st.sections = bars / 16;
  st.mute = st.mute || {}; st.partVol = st.partVol || {};
  st.mel = Object.assign({ dens: 60, range: 55, leap: 45, oct: 0, octUp: false, harm: false, counter: false }, st.mel || {});
  for (const k of ['density', 'bassArr', 'drama', 'arrange', 'drumBusy', 'drumFill', 'drumPlay', 'drumFeel'])
    st[k] = clamp(+st[k] || 0, 0, 100);
  st.scale = E.SCALES[st.scale] ? st.scale : P.scale;
  st.seed = (+st.seed | 0) || 1000;
  for (const k of TRACKS) { st.mute[k] = false; st.partVol[k] = st.partVol[k] ?? 80; }

  const end = bars * beats * 2;
  const num = (x, lo, hi, def) => Number.isFinite(+x) ? clamp(+x, lo, hi) : def;
  const notes = { lead: [], chord: [], bass: [], drum: [] };
  const src = o.notes || {};
  for (const k of PITCHED) for (const x of (Array.isArray(src[k]) ? src[k] : [])) {
    const t = num(x.t, 0, end, null), n = num(x.n, 0, 127, null);
    if (t === null || n === null || t >= end) continue;
    const y = { t: r4(t), d: r4(num(x.d, .125, end, 1)), n: Math.round(n), v: r4(num(x.v, 0, 1, .7)) };
    if (k === 'lead') y.l = ['main', 'oct', 'harm', 'counter'].includes(x.l) ? x.l : 'main';
    if (k === 'lead' && x.brush) y.brush = 1;   // ドラマのブラシで重ねたオクターブ上（弱めたときに外す目印）
    notes[k].push(y);
  }
  for (const x of (Array.isArray(src.drum) ? src.drum : [])) {
    const t = num(x.t, 0, end, null);
    if (t === null || t >= end || E.GROUP[x.k] !== 'drum') continue;
    const h = { t: r4(t), k: x.k, v: r4(num(x.v, 0, 1, .6)) };
    if (x.g !== undefined && Number.isFinite(+x.g)) h.g = +x.g;
    notes.drum.push(h);
  }
  const chords = [];
  for (let i = 0; i < bars; i++) {
    const c = Array.isArray(o.chords) ? o.chords[i % Math.max(1, o.chords.length)] : null;
    chords.push(Array.isArray(c) && E.QUAL[c[1]] ? [c[0] | 0, c[1]] : [0, 'maj']);
  }
  const mix = {};
  for (const k of TRACKS) {
    const m = (o.mix || {})[k] || {};
    const tn = m.tone || {}, fx = m.fx || {};
    mix[k] = { vol: num(m.vol, 0, 100, 80), pan: num(m.pan, -100, 100, 0), rev: num(m.rev, 0, 100, 50),
      mute: !!m.mute, solo: !!m.solo,
      tone: { bright: num(tn.bright, 0, 100, 50), attack: num(tn.attack, 0, 100, 50), length: num(tn.length, 0, 100, 50), color: num(tn.color, 0, 100, 50) },
      fx: { drive: num(fx.drive, 0, 100, 0), comp: num(fx.comp, 0, 100, 0) } };
  }
  mix.bass.sound = BASS_TONES[(o.mix || {}).bass?.sound] ? o.mix.bass.sound : 'tri';
  const fxAll = { revLen: num((o.fx || {}).revLen, REV_LEN.min, REV_LEN.max, REV_LEN.def) };
  return { format: FORMAT, version: VERSION, recipe: String(o.recipe || ''), st, bars, beats, chords, mix, fx: fxAll, notes };
}

/* ---------- 発音 ---------- */

/* いま鳴らすトラック（ミュートとソロを反映） */
export function audible(proj) {
  const solo = TRACKS.some(k => proj.mix[k].solo);
  const out = {};
  for (const k of TRACKS) out[k] = !proj.mix[k].mute && (!solo || proj.mix[k].solo);
  return out;
}

/* ミキサーの値を rig に流す。rig.apply（音色とリバーブの基準）の後に呼ぶ */
export function applyMix(rig, proj, on, ramp) {
  const t = ramp ?? .06;
  const P = E.PRESETS[proj.st.preset];
  const set = (param, v) => { if (!param) return; if (t > 0) param.rampTo(v, t); else param.value = v; };
  const base = { lead: P.rev, chord: P.rev * 1.15, bass: P.rev * .25 };
  for (const k of TRACKS) {
    const m = proj.mix[k], g = on[k] ? E.partGain(m.vol) : 0;
    set(rig.bus[k].gain, g);
    if (rig.pans[k]) set(rig.pans[k].pan, m.pan / 100);
    if (k === 'drum') set(rig.drumWet.gain, g * m.rev / 50);
    else set(rig.sends[k].gain, base[k] * m.rev / 50);
  }
  rig.bass.set(BASS_TONES[proj.mix.bass.sound]?.cfg || BASS_TONES.tri.cfg);
  applyTone(rig, proj, t);
}

/* 0〜100（50がそのまま）を倍率に */
const curve = (v, span) => Math.pow(2, (v - 50) / 50 * span);
function scaleEnv(env, tn) {
  const a = tn.attack <= 50 ? env.attack * (.25 + .75 * tn.attack / 50) : env.attack + Math.pow((tn.attack - 50) / 50, 2) * .9;
  const m = curve(tn.length, 2.3);
  return Object.assign({}, env, { attack: Math.max(.001, a), decay: Math.max(.01, env.decay * m), release: Math.max(.01, env.release * m) });
}
/* 音色の傾向とエフェクトを rig に流す（applyMix から呼ぶ） */
function applyTone(rig, proj, t) {
  if (!rig.fx || !rig.fx.lead) return;
  // 直線で動かす（rampTo は指数カーブなので、0 を含む範囲のしきい値などでエラーになる）
  const set = (param, v) => { if (!param) return; if (t > 0) param.linearRampTo(v, t); else param.value = v; };
  for (const k of TRACKS) {
    const tn = proj.mix[k].tone || defaultTone(), fx = proj.mix[k].fx || defaultFx(), f = rig.fx[k];
    // 明るさ：50より下はローパスで暗く、上はハイシェルフで持ち上げる
    set(f.lp.frequency, tn.bright < 50 ? 380 * Math.pow(2, tn.bright / 50 * 5.7) : 20000);
    set(f.shelf.gain, tn.bright > 50 ? (tn.bright - 50) / 50 * 10 : 0);
    // 歪み：かけるほど音量が上がるので、少し下げて釣り合わせる
    const d = fx.drive / 100;
    f.dist.distortion = d * .85;
    set(f.dist.wet, d > 0 ? Math.min(1, .35 + d) : 0);
    // コンプ：しきい値を下げて比率を上げ、下がったぶんを持ち上げる
    const c = fx.comp / 100;
    // しきい値は 0 以下しか取れず、ramp は始点の 0 を 1e-7 に置き換えて範囲外になるので直接入れる
    f.comp.threshold.value = Math.min(-.1, -c * 30);
    f.comp.ratio.value = 1 + c * 7;
    set(f.makeup.gain, Math.pow(10, (c * 9 - d * 5) / 20));
  }
  // 音の形（立ち上がり・余韻・倍音）。50 なら音色表の値そのもの
  const L = E.LEADS[proj.st.lead].cfg, D = E.PADS[proj.st.pad].cfg;
  const tl = proj.mix.lead.tone || defaultTone(), tc = proj.mix.chord.tone || defaultTone(), tb = proj.mix.bass.tone || defaultTone();
  const mi = L.modulationIndex > 0 ? L.modulationIndex * curve(tl.color, 2) : Math.max(0, (tl.color - 50) / 50 * 3);
  rig.lead.set({ envelope: scaleEnv(L.envelope, tl), modulationIndex: mi });
  rig.chords.set({ envelope: scaleEnv(D.envelope, tc) });
  rig.bass.set({
    envelope: scaleEnv(BASS_BASE.envelope, tb),
    filterEnvelope: Object.assign({}, BASS_BASE.filterEnvelope, { octaves: BASS_BASE.filterEnvelope.octaves * curve(tb.color, 1.3) }),
    filter: { Q: BASS_BASE.filter.Q + Math.max(0, tb.color - 50) / 50 * 6 },
  });
}

export function rigState(proj) {
  const st = exportState(proj);
  for (const k of TRACKS) st.mute[k] = false;
  return st;
}

/* ノートを transport に並べる。長さは8分の升目に丸めずそのまま鳴らす */
export function schedule(transport, rig, proj) {
  const epb = proj.beats * 2, ppq = transport.PPQ;
  const dur = d => Math.max(1, Math.round(d * ppq / 2)) + 'i';
  const sch = (fn, t) => transport.schedule(time => { try { fn(time); } catch (e) { } }, E.posOf(t, epb));
  for (const x of proj.notes.lead)
    sch(time => rig.lead.triggerAttackRelease(E.midiName(x.n), dur(x.d), time, x.v), x.t);
  // 同じ瞬間・同じ長さの和音は1回でまとめて鳴らす
  const groups = new Map();
  for (const x of proj.notes.chord) {
    const id = x.t + '/' + x.d;
    if (!groups.has(id)) groups.set(id, { t: x.t, d: x.d, ns: [], v: 0 });
    const g = groups.get(id); g.ns.push(E.midiName(x.n)); g.v = Math.max(g.v, x.v);
  }
  for (const g of groups.values())
    sch(time => rig.chords.triggerAttackRelease(g.ns, dur(g.d), time, g.v), g.t);
  // ベースは単音。同じ瞬間に2つあると止まるので強いほうだけ
  const bass = new Map();
  for (const x of proj.notes.bass) {
    const id = Math.round(x.t * 64);
    if (!bass.has(id) || bass.get(id).v < x.v) bass.set(id, x);
  }
  for (const x of bass.values())
    sch(time => rig.bass.triggerAttackRelease(E.midiName(x.n), dur(x.d), time, x.v), x.t);
  const drum = eventsFromNotes({ lead: [], chord: [], bass: [], drum: proj.notes.drum });
  E.scheduleAll(transport, rig, { events: drum, epb }, { mute: {} });
}

/* 1周ぶんをオフラインで合成（残響のしっぽ込み） */
export async function renderOffline(proj, loopSec, tail, onRetry) {
  const Tone = E.getTone();
  const liveRate = Tone.getContext().sampleRate || 44100;
  const st = rigState(proj), on = {};
  for (const k of TRACKS) on[k] = !proj.mix[k].mute;
  const render = noVerb => Tone.Offline(({ transport }) => {
    E.setupTransport(transport, st);
    transport.timeSignature = proj.beats;
    const rig = E.createRig({ noVerb, pan: true });
    rig.apply(st, 0);
    applyMix(rig, proj, on, 0);
    rig.setReverb(revLen(proj));
    rig.master.volume.value = -4;
    schedule(transport, rig, proj);
    transport.start(0);
  }, loopSec + tail, 2, liveRate);
  let buf, dry = false;
  try { buf = await render(false); }
  catch (e1) { if (onRetry) await onRetry(); buf = await render(true); dry = true; }
  return { buf, dry, liveRate };
}

export const loopSeconds = proj => proj.bars * proj.beats * 60 / proj.st.bpm;
export const revLen = proj => (proj.fx && proj.fx.revLen) || REV_LEN.def;
/* 書き出しで合成するしっぽ。残響が長いほど伸ばして、頭に折り返すぶんを取りこぼさない */
export const tailSeconds = proj => Math.max(3.4, revLen(proj) + 1.4);
