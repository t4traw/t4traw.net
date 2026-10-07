/*
  エディタ版のデータ。DOM には触らない。

  レシピコード（ハッシュ）で曲調を作ったら、そこから先は音符そのものを持つ「プロジェクト」になる。
  ノートを1つでも動かすとレシピコードでは戻せないので、保存は JSON で行う。

  {
    format: 'loop-bgm-project', version: 1,
    recipe: 作ったときのレシピコード（由来の記録。読み込みには使わない）
    st:     エンジンの状態（テンポ・キー・音色・タネ…）。作り直しやMIDIの音色番号に使う
    bars, beats, chords: 小節数・拍子・小節ごとの和音（[根音, 種類]、キーからの相対）
    mix:    { lead|chord|bass|drum: {vol, pan, rev, mute, solo, sound, tone, rack} }
              rev   = 共通リバーブへのセンド量（0〜100、50が曲調の標準）
              sound = 音色（sounds.js の表のキー）
              tone  = {bright, attack, length, color}（音作り。0〜100、50でその音色のまま）
              rack  = [{type, on, p}]（エフェクト。上から順に通る。fx.js）
    fx:     { revLen }  共通リバーブのディケイ（秒）
    st.leadStyle / st.chordStyle … エディタで選んだパターン（レシピコードには入らない）
    notes:  {
      lead:  [{t, d, n, v, l}]   t=位置・d=長さ（8分音符単位）n=MIDIノート v=強さ0〜1 l=main/oct/harm/counter
      chord: [{t, d, n, v}]      和音は1音ずつばらして持つ
      bass:  [{t, d, n, v}]
      drum:  [{t, k, v, g?}]     k=音の種類（kick, snare…）g=タム・コンガの音程（GM番号）
    }
  }
*/
import * as E from "../engine.js";
import * as S from "./sounds.js";
import * as F from "./fx.js";

export const FORMAT = 'loop-bgm-project';
export const VERSION = 1;
export const TRACKS = ['lead', 'chord', 'bass', 'drum'];
export const PITCHED = ['lead', 'chord', 'bass'];
export const TRACK_INFO = {
  lead:  { name: 'メロディ', color: '#EC4A3E', key: '1' },
  chord: { name: 'コード',   color: '#7A6CD0', key: '2' },
  bass:  { name: 'ベース',   color: '#3CB98F', key: '3' },
  drum:  { name: 'ドラム',   color: '#B9B39C', key: '4' },
};

/* 音作りのつまみ。どのトラックに出すか */
export const TONE_KNOBS = [
  { id: 'bright', label: 'ブライトネス', tracks: ['lead', 'chord', 'bass', 'drum'], help: '左でこもらせ（ローパス）、右で高域を持ち上げる（ハイシェルフ）' },
  { id: 'attack', label: 'アタック', tracks: ['lead', 'chord', 'bass'], help: '音の立ち上がり。右ほどゆっくり' },
  { id: 'length', label: 'ディケイ／リリース', tracks: ['lead', 'chord', 'bass'], help: '音が減っていく速さと、離してから消えるまでの長さ' },
  { id: 'color', label: 'FM量', tracks: ['lead'], help: 'FMの深さ。右ほど金属っぽく、左ほど丸い' },
  { id: 'color', label: 'フィルターEnv', tracks: ['bass'], help: 'フィルターエンベロープの深さとレゾナンス。右ほど「ビョン」と動く' },
];
export const defaultTone = () => ({ bright: 50, attack: 50, length: 50, color: 50 });
/* 共通リバーブのディケイ（秒） */
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
  for (const k of TRACKS) m[k] = { vol: st.partVol[k], pan: 0, rev: 50, mute: !!st.mute[k], solo: false, tone: defaultTone(), rack: [] };
  m.lead.sound = st.lead; m.chord.sound = st.pad; m.bass.sound = S.DEFAULT_SOUND.bass; m.drum.sound = S.DEFAULT_SOUND.drum;
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
    mix: mix ? carryMix(mix, st) : defaultMix(st),
    fx: { revLen: REV_LEN.def },
    notes: notesFromEvents(song.events),
  };
}

/* 曲調を変えてもミキサーは引き継ぐ。メロディとコードの音色だけは新しい曲調のものにする */
function carryMix(mix, st) {
  const m = clone(mix);
  m.lead.sound = st.lead; m.chord.sound = st.pad;
  return m;
}

/* 音色を変える。レシピにある音色ならエンジンの状態にも入れる（作り直しの性格やMIDIの番号に使う） */
export function setSound(proj, k, key) {
  const s = S.SOUND_TABLE[k][key];
  if (!s) return;
  proj.mix[k].sound = key;
  if (k === 'lead') proj.st.lead = s.like;
  if (k === 'chord') proj.st.pad = s.like;
}

/* パターンを変えて、そのトラックを作り直す（メロディ・ベース・ドラムは同じタネで） */
export function setStyle(proj, k, key) {
  if (k === 'lead') {
    proj.st.leadStyle = key;
    regenerateTrack(proj, 'lead', { mel: clone(S.LEAD_STYLES[key].mel), seed: proj.st.seed });
  } else if (k === 'chord') {
    proj.st.chordStyle = key;
    if (key === 'auto') regenerateTrack(proj, 'chord', { seed: proj.st.seed });
    else proj.notes.chord = S.chordPattern(proj, key);
  } else if (k === 'bass') regenerateTrack(proj, 'bass', { bassStyle: key, seed: proj.st.seed });
  else regenerateTrack(proj, 'drum', { drums: key, seed: proj.st.seed });
}

/* いま選ばれているパターン（メロディは作り方の数値が一致するものがあれば） */
export function styleOf(proj, k) {
  if (k === 'bass') return proj.st.bassStyle;
  if (k === 'drum') return proj.st.drums;
  if (k === 'chord') return proj.st.chordStyle || 'auto';
  const m = proj.st.mel;
  const hit = Object.entries(S.LEAD_STYLES).find(([, v]) => Object.keys(v.mel).every(x => v.mel[x] === m[x]));
  return hit ? hit[0] : (proj.st.leadStyle && S.LEAD_STYLES[proj.st.leadStyle] ? proj.st.leadStyle : null);
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
  if (track === 'chord' && (!patch || patch.seed === undefined)) proj.st.chordStyle = 'auto';
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
  // エディタだけの音色は、MIDI の音色番号を音色表から渡す
  st.gm = { lead: soundOf(proj, 'lead').gm, chord: soundOf(proj, 'chord').gm, bass: soundOf(proj, 'bass').gm };
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
  if (st.leadStyle !== undefined && !S.LEAD_STYLES[st.leadStyle]) delete st.leadStyle;
  if (st.chordStyle !== undefined && !S.CHORD_STYLES[st.chordStyle]) delete st.chordStyle;
  delete st.gm;
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
    const tn = m.tone || {};
    mix[k] = { vol: num(m.vol, 0, 100, 80), pan: num(m.pan, -100, 100, 0), rev: num(m.rev, 0, 100, 50),
      mute: !!m.mute, solo: !!m.solo,
      tone: { bright: num(tn.bright, 0, 100, 50), attack: num(tn.attack, 0, 100, 50), length: num(tn.length, 0, 100, 50), color: num(tn.color, 0, 100, 50) },
      rack: F.sanitizeRack(m.rack || oldFx(m.fx)) };
    const def = k === 'lead' ? st.lead : k === 'chord' ? st.pad : S.DEFAULT_SOUND[k];
    mix[k].sound = S.SOUND_TABLE[k][m.sound] ? m.sound : def;
  }
  const fxAll = { revLen: num((o.fx || {}).revLen, REV_LEN.min, REV_LEN.max, REV_LEN.def) };
  return { format: FORMAT, version: VERSION, recipe: String(o.recipe || ''), st, bars, beats, chords, mix, fx: fxAll, notes };
}

/* 前の版の「歪み・コンプ」（0〜100）をラックに置き換える */
function oldFx(fx) {
  const out = [];
  if (!fx) return out;
  if (+fx.drive > 0) out.push({ type: 'dist', on: true, p: Object.assign(F.defaultParams('dist'), { drive: +fx.drive }) });
  if (+fx.comp > 0) {
    const c = +fx.comp / 100;
    out.push({ type: 'comp', on: true, p: Object.assign(F.defaultParams('comp'), { threshold: Math.round(-c * 30), ratio: Math.round(1 + c * 7), attack: 8, gain: Math.round(c * 9) }) });
  }
  return out;
}

/* ---------- 発音 ---------- */

/* いま選ばれている音色の定義 */
export function soundOf(proj, k) {
  const t = S.SOUND_TABLE[k];
  return t[proj.mix[k].sound] || t[k === 'lead' ? proj.st.lead : k === 'chord' ? proj.st.pad : S.DEFAULT_SOUND[k]];
}

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
  applySounds(rig, proj, t);
  applyTone(rig, proj, t);
  F.applyRacks(E.getTone(), rig, proj, { bpm: proj.st.bpm, beats: proj.beats, loopSec: loopSeconds(proj) });
}

/* 音色を rig に入れる。発振器の作り直しで音が途切れないよう、変わったときだけ */
function applySounds(rig, proj, t) {
  if (!rig._snd) {
    // rig.apply（曲調の音色に戻す）が呼ばれたら、次はかならず入れ直す
    const a = rig.apply;
    rig.apply = function (...x) { rig._snd = {}; return a.apply(this, x); };
    rig._snd = {};
  }
  const set = (param, v) => { if (t > 0) param.rampTo(v, t); else param.value = v; };
  const L = soundOf(proj, 'lead'), D = soundOf(proj, 'chord');
  if (rig._snd.lead !== proj.mix.lead.sound) { rig.lead.set(L.cfg); set(rig.lead.volume, L.vol); rig._snd.lead = proj.mix.lead.sound; }
  if (rig._snd.chord !== proj.mix.chord.sound) {
    rig.chords.set(D.cfg); set(rig.chords.volume, D.vol);
    if (rig.chFilt) set(rig.chFilt.frequency, S.chordFilt(D));
    rig._snd.chord = proj.mix.chord.sound;
  }
  if (rig._snd.bass !== proj.mix.bass.sound) {
    const b = S.bassCfg(proj.mix.bass.sound);
    rig.bass.set({ oscillator: b.oscillator });
    set(rig.bass.volume, b.vol);
    rig._snd.bass = proj.mix.bass.sound;
  }
  if (rig._snd.drum !== proj.mix.drum.sound) { applyKit(rig, S.drumKit(proj.mix.drum.sound)); rig._snd.drum = proj.mix.drum.sound; }
}
function applyKit(rig, kit) {
  const f = rig.filt || {};
  const vol = (s, v) => { if (s && v !== undefined) s.volume.value = v; };
  const dec = (s, v) => { if (s && v !== undefined) s.envelope.decay = v; };
  rig.kick.pitchDecay = kit.kick.pitchDecay; rig.kick.octaves = kit.kick.octaves; dec(rig.kick, kit.kick.decay); vol(rig.kick, kit.kick.vol);
  dec(rig.snare, kit.snare.decay); vol(rig.snare, kit.snare.vol); if (f.snHP) f.snHP.frequency.value = kit.snare.hp;
  dec(rig.snBody, kit.snBody.decay); vol(rig.snBody, kit.snBody.vol);
  dec(rig.hat, kit.hat.decay); vol(rig.hat, kit.hat.vol); if (f.hatHP) f.hatHP.frequency.value = kit.hat.hp;
  dec(rig.ohat, kit.ohat.decay); vol(rig.ohat, kit.ohat.vol); if (f.ohHP) f.ohHP.frequency.value = kit.ohat.hp;
  dec(rig.clap, kit.clap.decay); vol(rig.clap, kit.clap.vol); if (f.clapBP) f.clapBP.frequency.value = kit.clap.bp;
  dec(rig.rim, kit.rim.decay); vol(rig.rim, kit.rim.vol); if (f.rimBP) f.rimBP.frequency.value = kit.rim.bp;
  rig.tom.pitchDecay = kit.tom.pitchDecay; dec(rig.tom, kit.tom.decay); vol(rig.tom, kit.tom.vol);
  dec(rig.boom, kit.boom.decay); vol(rig.boom, kit.boom.vol);
  dec(rig.crash, kit.crash.decay); vol(rig.crash, kit.crash.vol);
  dec(rig.shaker, kit.shaker.decay); vol(rig.shaker, kit.shaker.vol);
}

/* 0〜100（50がそのまま）を倍率に */
const curve = (v, span) => Math.pow(2, (v - 50) / 50 * span);
function scaleEnv(env, tn) {
  const a = tn.attack <= 50 ? env.attack * (.25 + .75 * tn.attack / 50) : env.attack + Math.pow((tn.attack - 50) / 50, 2) * .9;
  const m = curve(tn.length, 2.3);
  return Object.assign({}, env, { attack: Math.max(.001, a), decay: Math.max(.01, env.decay * m), release: Math.max(.01, env.release * m) });
}
/* 音作りのつまみを rig に流す（applyMix から呼ぶ） */
function applyTone(rig, proj, t) {
  if (!rig.fx || !rig.fx.lead) return;
  const set = (param, v) => { if (!param) return; if (t > 0) param.linearRampTo(v, t); else param.value = v; };
  for (const k of TRACKS) {
    const tn = proj.mix[k].tone || defaultTone(), f = rig.fx[k];
    // ブライトネス：50より下はローパスでこもらせ、上はハイシェルフで持ち上げる
    set(f.lp.frequency, tn.bright < 50 ? 380 * Math.pow(2, tn.bright / 50 * 5.7) : 20000);
    set(f.shelf.gain, tn.bright > 50 ? (tn.bright - 50) / 50 * 10 : 0);
  }
  // エンベロープと FM・フィルターの深さ。50 なら音色表の値そのもの
  const L = soundOf(proj, 'lead').cfg, D = soundOf(proj, 'chord').cfg, B = S.bassCfg(proj.mix.bass.sound);
  const tl = proj.mix.lead.tone || defaultTone(), tc = proj.mix.chord.tone || defaultTone(), tb = proj.mix.bass.tone || defaultTone();
  const mi = L.modulationIndex > 0 ? L.modulationIndex * curve(tl.color, 2) : Math.max(0, (tl.color - 50) / 50 * 3);
  rig.lead.set({ envelope: scaleEnv(L.envelope, tl), modulationIndex: mi });
  rig.chords.set({ envelope: scaleEnv(D.envelope, tc) });
  rig.bass.set({
    envelope: scaleEnv(B.envelope, tb),
    filterEnvelope: Object.assign({}, B.filterEnvelope, { octaves: B.filterEnvelope.octaves * curve(tb.color, 1.3) }),
    filter: { Q: B.filter.Q + Math.max(0, tb.color - 50) / 50 * 6 },
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

/* 1周ぶんをオフラインで合成（リバーブのしっぽ込み） */
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
/* 書き出しで合成するしっぽ。リバーブやディレイが長いほど伸ばして、頭に折り返すぶんを取りこぼさない */
export const tailSeconds = proj => Math.min(16, Math.max(3.4, revLen(proj) + 1.4,
  F.rackTail(proj, { bpm: proj.st.bpm, beats: proj.beats }) + 1));
