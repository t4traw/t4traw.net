/*
  エディタ版の音色とパターンの一覧。

  レシピコード（engine.js の LEADS / PADS / KITS）は欄の幅が決まっているので、
  エディタでしか選べない音色はここに置く。レシピの音色もそのまま並べて、カテゴリだけ付ける。
  エディタ専用の音色は like（いちばん近いレシピの音色）を持ち、作り直しはその音色の性格で行う。

  メロディ … FMSynth（PolySynth）の設定
  コード   … Synth（PolySynth）の設定。filt はコードの後ろのローパス（Hz）
  ベース   … MonoSynth の設定（BASS_BASE からの差分）
  ドラム   … 各打楽器の声の差分（DRUM_BASE からの差分）
*/
import * as E from "../engine.js";

/* ---------- メロディ ---------- */
export const LEAD_CATS = [
  { id: 'keys', name: '鍵盤・マレット' },
  { id: 'pluck', name: '撥弦' },
  { id: 'wind', name: '管・弦・声' },
  { id: 'synth', name: 'シンセリード' },
  { id: 'chip', name: 'チップ・8bit' },
  { id: 'odd', name: '個性派' },
];
const env = (attack, decay, sustain, release) => ({ attack, decay, sustain, release });
/* FMSynth の設定を全部そろえる（足りない項目が前の音色のまま残らないように） */
const fm = (o) => ({
  harmonicity: o.h ?? 1, modulationIndex: o.m ?? 0,
  oscillator: o.osc || { type: 'sine' },
  envelope: o.env,
  modulation: o.mod || { type: 'sine' },
  modulationEnvelope: o.menv || env(o.env.attack, Math.min(.3, o.env.decay), 0, .1),
});
const LEAD_EXTRA = {
  xylo: { name: 'シロフォン', cat: 'keys', like: 'marimba', gm: 13, vol: -11, cfg: fm({ h: 3.99, m: 7, env: env(.001, .28, 0, .25), menv: env(.001, .06, 0, .06) }) },
  celesta: { name: 'チェレスタ', cat: 'keys', like: 'glock', gm: 8, vol: -12, cfg: fm({ h: 4.01, m: 3, env: env(.002, 1.2, 0, 1), menv: env(.002, .3, 0, .3) }) },
  epiano2: { name: 'FMエレピ', cat: 'keys', like: 'rhodes', gm: 5, vol: -11, cfg: fm({ h: 14, m: 1.6, env: env(.003, 1.4, .1, 1), menv: env(.003, .25, 0, .2) }) },
  wurli: { name: 'ウーリー', cat: 'keys', like: 'rhodes', gm: 4, vol: -12, cfg: fm({ h: 1, m: 5, osc: { type: 'triangle' }, env: env(.004, .9, .15, .6), menv: env(.004, .35, .05, .3) }) },
  toypiano: { name: 'トイピアノ', cat: 'keys', like: 'box', gm: 8, vol: -11, cfg: fm({ h: 7.03, m: 4, env: env(.001, .6, 0, .5), menv: env(.001, .08, 0, .08) }) },
  clav: { name: 'クラビ', cat: 'keys', like: 'pluck', gm: 7, vol: -18, cfg: fm({ h: 1, m: 2.5, osc: { type: 'pulse', width: .3 }, env: env(.001, .22, .05, .1) }) },
  harpsi: { name: 'チェンバロ風', cat: 'keys', like: 'harp', gm: 6, vol: -18, cfg: fm({ h: 2, m: 3, osc: { type: 'sawtooth' }, env: env(.001, .9, 0, .5), menv: env(.001, .2, 0, .2) }) },
  piano: { name: 'ピアノ風', cat: 'keys', like: 'rhodes', gm: 0, vol: -10, cfg: fm({ h: 2, m: 1.2, osc: { type: 'triangle' }, env: env(.002, 1.6, 0, 1.1), menv: env(.002, .5, 0, .4) }) },
  musicbox2: { name: 'きらきらオルゴール', cat: 'keys', like: 'box', gm: 10, vol: -12, cfg: fm({ h: 6.2, m: 6, env: env(.001, 2.2, 0, 1.6), menv: env(.001, .15, 0, .15) }) },

  guitar: { name: 'ナイロンギター風', cat: 'pluck', like: 'pluck', gm: 24, vol: -11, cfg: fm({ h: 1, m: 2.2, osc: { type: 'triangle' }, env: env(.002, .9, 0, .6), menv: env(.002, .12, 0, .1) }) },
  koto: { name: '琴風', cat: 'pluck', like: 'harp', gm: 107, vol: -11, cfg: fm({ h: 3, m: 4, osc: { type: 'triangle' }, env: env(.001, .8, 0, .7), menv: env(.001, .05, 0, .05) }) },
  sitar: { name: 'シタール風', cat: 'pluck', like: 'pluck', gm: 104, vol: -15, cfg: fm({ h: 1.01, m: 9, osc: { type: 'sawtooth' }, env: env(.002, 1.1, .05, .6), menv: env(.002, .9, .2, .5) }) },
  banjo: { name: 'バンジョー風', cat: 'pluck', like: 'pluck', gm: 105, vol: -13, cfg: fm({ h: 2, m: 6, osc: { type: 'triangle' }, env: env(.001, .35, 0, .3), menv: env(.001, .1, 0, .1) }) },

  ocarina: { name: 'オカリナ', cat: 'wind', like: 'whistle', gm: 79, vol: -11, cfg: fm({ h: 1, m: .3, env: env(.05, .2, .75, .25), menv: env(.05, .2, .3, .2) }) },
  recorder: { name: 'リコーダー', cat: 'wind', like: 'flute', gm: 74, vol: -13, cfg: fm({ h: 2, m: .5, osc: { type: 'triangle' }, env: env(.03, .2, .7, .2) }) },
  clarinet: { name: 'クラリネット風', cat: 'wind', like: 'flute', gm: 71, vol: -16, cfg: fm({ h: 2, m: 1.4, osc: { type: 'square' }, env: env(.04, .2, .75, .2), menv: env(.05, .3, .5, .2) }) },
  trumpet: { name: 'トランペット風', cat: 'wind', like: 'brass', gm: 56, vol: -17, cfg: fm({ h: 1, m: 4.5, osc: { type: 'sawtooth' }, env: env(.03, .3, .7, .2), menv: env(.06, .3, .55, .2) }) },
  sax: { name: 'サックス風', cat: 'wind', like: 'brass', gm: 65, vol: -17, cfg: fm({ h: 1, m: 3, osc: { type: 'sawtooth' }, mod: { type: 'square' }, env: env(.04, .3, .7, .25), menv: env(.05, .4, .4, .2) }) },
  voice: { name: 'ボイス', cat: 'wind', like: 'whistle', gm: 53, vol: -12, cfg: fm({ h: 1, m: .9, osc: { type: 'fattriangle', count: 3, spread: 14 }, env: env(.12, .3, .75, .5) }) },
  cello: { name: 'チェロ風', cat: 'wind', like: 'bow', gm: 42, vol: -16, cfg: fm({ h: 1, m: 1, osc: { type: 'sawtooth' }, env: env(.18, .3, .85, .45), menv: env(.25, .3, .6, .3) }) },

  pulse: { name: 'パルスリード', cat: 'synth', like: 'square', gm: 80, vol: -18, cfg: fm({ osc: { type: 'pulse', width: .2 }, env: env(.004, .25, .55, .2) }) },
  fatsq: { name: 'ファットスクエア', cat: 'synth', like: 'square', gm: 80, vol: -21, cfg: fm({ osc: { type: 'fatsquare', count: 3, spread: 20 }, env: env(.006, .3, .6, .25) }) },
  hypersaw: { name: 'ハイパーソウ', cat: 'synth', like: 'supersaw', gm: 81, vol: -23, cfg: fm({ osc: { type: 'fatsawtooth', count: 7, spread: 42 }, env: env(.01, .4, .7, .45) }) },
  softlead: { name: 'ソフトリード', cat: 'synth', like: 'synth', gm: 82, vol: -12, cfg: fm({ m: .4, osc: { type: 'triangle' }, env: env(.02, .3, .6, .3) }) },
  fmlead: { name: 'FMリード', cat: 'synth', like: 'synth', gm: 81, vol: -14, cfg: fm({ h: 2, m: 8, env: env(.004, .35, .5, .2), menv: env(.004, .3, .45, .2) }) },
  sync: { name: 'シンク風', cat: 'synth', like: 'saw', gm: 84, vol: -18, cfg: fm({ h: 2.5, m: 6, osc: { type: 'sawtooth' }, env: env(.003, .3, .55, .2), menv: env(.003, .5, .2, .2) }) },
  pluck2: { name: 'シンセプラック', cat: 'synth', like: 'pluck', gm: 84, vol: -16, cfg: fm({ m: 1.5, osc: { type: 'sawtooth' }, env: env(.002, .22, 0, .2), menv: env(.002, .08, 0, .08) }) },
  lofilead: { name: 'ローファイリード', cat: 'synth', like: 'synth', gm: 81, vol: -13, cfg: fm({ m: .8, osc: { type: 'fattriangle', count: 2, spread: 24 }, env: env(.01, .5, .4, .4) }) },
  bright: { name: 'ブライトリード', cat: 'synth', like: 'saw', gm: 81, vol: -20, cfg: fm({ h: 1, m: 2, osc: { type: 'fatsawtooth', count: 2, spread: 12 }, mod: { type: 'sawtooth' }, env: env(.004, .3, .6, .25) }) },

  nes: { name: 'ファミコン矩形', cat: 'chip', like: 'toy', gm: 80, vol: -19, cfg: fm({ osc: { type: 'pulse', width: .125 }, env: env(.001, .1, .7, .05) }) },
  gb: { name: 'ゲームボーイ風', cat: 'chip', like: 'toy', gm: 80, vol: -18, cfg: fm({ osc: { type: 'pulse', width: .25 }, env: env(.001, .15, .55, .06) }) },
  tri: { name: '三角波', cat: 'chip', like: 'toy', gm: 80, vol: -11, cfg: fm({ osc: { type: 'triangle' }, env: env(.001, .1, .8, .05) }) },
  chipbell: { name: 'ピコベル', cat: 'chip', like: 'toy', gm: 80, vol: -16, cfg: fm({ h: 2, m: 3, osc: { type: 'square' }, mod: { type: 'square' }, env: env(.001, .3, 0, .2), menv: env(.001, .1, 0, .1) }) },

  glass: { name: 'ガラス', cat: 'odd', like: 'bell', gm: 98, vol: -13, cfg: fm({ h: 7.1, m: 3, env: env(.002, 1.6, 0, 1.4), menv: env(.002, .6, 0, .5) }) },
  robot: { name: 'ロボ', cat: 'odd', like: 'synth', gm: 81, vol: -16, cfg: fm({ h: .5, m: 10, osc: { type: 'square' }, mod: { type: 'square' }, env: env(.003, .2, .5, .1), menv: env(.003, .2, .5, .1) }) },
  metal: { name: '金属', cat: 'odd', like: 'bell', gm: 14, vol: -16, cfg: fm({ h: 1.41, m: 18, env: env(.001, .9, 0, .8), menv: env(.001, .5, 0, .4) }) },
  dream: { name: 'ドリーム', cat: 'odd', like: 'vibes', gm: 88, vol: -11, cfg: fm({ h: 3, m: 2, env: env(.25, 1.2, .4, 1.6), menv: env(.3, 1, .3, 1) }) },
  drop: { name: 'しずく', cat: 'odd', like: 'kalimba', gm: 108, vol: -10, cfg: fm({ h: .5, m: 9, env: env(.001, .25, 0, .2), menv: env(.001, .04, 0, .04) }) },
  wobble: { name: 'うねうね', cat: 'odd', like: 'synth', gm: 87, vol: -17, cfg: fm({ h: .501, m: 5, osc: { type: 'sawtooth' }, env: env(.01, .4, .6, .3), menv: env(.2, .4, .8, .3) }) },
};
const LEAD_CAT_OF = {
  marimba: 'keys', box: 'keys', vibes: 'keys', kalimba: 'keys', rhodes: 'keys', bell: 'keys', glock: 'keys', steel: 'keys',
  pluck: 'pluck', harp: 'pluck',
  whistle: 'wind', flute: 'wind', brass: 'wind', organ: 'wind', bow: 'wind',
  synth: 'synth', saw: 'synth', supersaw: 'synth', square: 'synth', grit: 'synth',
  toy: 'chip',
};
export const LEAD_SOUNDS = {};
for (const [k, s] of Object.entries(E.LEADS)) LEAD_SOUNDS[k] = { name: s.name, cat: LEAD_CAT_OF[k] || 'odd', like: k, gm: s.gm, vol: s.vol, cfg: s.cfg };
Object.assign(LEAD_SOUNDS, LEAD_EXTRA);

/* ---------- コード ---------- */
export const CHORD_CATS = [
  { id: 'keys', name: '鍵盤' },
  { id: 'pad', name: 'パッド・ストリングス' },
  { id: 'synth', name: 'シンセ' },
  { id: 'guitar', name: 'ギター' },
  { id: 'chip', name: 'チップ・8bit' },
];
const syn = (osc, e) => ({ oscillator: osc, envelope: e });
const CHORD_EXTRA = {
  wurli: { name: 'ウーリー和音', cat: 'keys', like: 'epiano', gm: 4, vol: -18, filt: 3200, cfg: syn({ type: 'fmtriangle', harmonicity: 1, modulationIndex: 2 }, env(.004, .9, .15, .6)) },
  drawbar: { name: 'ドローバーオルガン', cat: 'keys', like: 'organ', gm: 16, vol: -22, filt: 4200, cfg: syn({ type: 'custom', partials: [1, .7, .5, 0, .3, 0, 0, .25] }, env(.01, .1, .9, .1)) },
  harpsi: { name: 'チェンバロ和音', cat: 'keys', like: 'guitar', gm: 6, vol: -22, filt: 5000, cfg: syn({ type: 'sawtooth' }, env(.001, .8, 0, .4)) },
  bellkeys: { name: 'ベル和音', cat: 'keys', like: 'vibes', gm: 14, vol: -18, filt: 5200, cfg: syn({ type: 'fmsine', harmonicity: 3.5, modulationIndex: 4 }, env(.002, 1.6, 0, 1.2)) },
  toykeys: { name: 'トイピアノ和音', cat: 'keys', like: 'vibes', gm: 8, vol: -16, filt: 5000, cfg: syn({ type: 'fmsine', harmonicity: 7, modulationIndex: 1.5 }, env(.001, .6, 0, .5)) },
  housepiano: { name: 'ハウスピアノ', cat: 'keys', like: 'piano', gm: 1, vol: -19, filt: 4500, cfg: syn({ type: 'fmtriangle', harmonicity: 2, modulationIndex: 1.5 }, env(.002, .5, .1, .3)) },

  glasspad: { name: 'ガラスパッド', cat: 'pad', like: 'pad', gm: 92, vol: -20, filt: 4000, cfg: syn({ type: 'fmsine', harmonicity: 3, modulationIndex: 1.2 }, env(.6, 1, .6, 2)) },
  darkpad: { name: 'ダークパッド', cat: 'pad', like: 'pad', gm: 95, vol: -22, filt: 900, cfg: syn({ type: 'fattriangle', count: 3, spread: 22 }, env(.8, 1.2, .7, 2.2)) },
  swell: { name: 'スウェル', cat: 'pad', like: 'pad', gm: 89, vol: -24, filt: 2400, cfg: syn({ type: 'fatsawtooth', count: 3, spread: 16 }, env(2, .5, .9, 1.6)) },
  airy: { name: 'エアリーパッド', cat: 'pad', like: 'choir', gm: 91, vol: -22, filt: 3200, cfg: syn({ type: 'pwm', modulationFrequency: .4 }, env(.7, 1, .7, 2)) },
  fastrings: { name: 'ストリングス（速め）', cat: 'pad', like: 'strings', gm: 49, vol: -24, filt: 3000, cfg: syn({ type: 'fatsawtooth', count: 3, spread: 12 }, env(.12, .5, .7, .6)) },
  vox: { name: 'ボイスパッド', cat: 'pad', like: 'choir', gm: 54, vol: -18, filt: 1800, cfg: syn({ type: 'fattriangle', count: 3, spread: 10 }, env(.5, 1, .75, 1.8)) },

  pluck: { name: 'プラック和音', cat: 'synth', like: 'stab', gm: 84, vol: -22, filt: 4200, cfg: syn({ type: 'sawtooth' }, env(.002, .25, 0, .2)) },
  houseorgan: { name: 'ハウスオルガン', cat: 'synth', like: 'stab', gm: 17, vol: -23, filt: 3600, cfg: syn({ type: 'custom', partials: [1, .5, .8, .2, .4] }, env(.002, .18, .1, .1)) },
  gate: { name: 'ゲートシンセ', cat: 'synth', like: 'stab', gm: 81, vol: -26, filt: 5200, cfg: syn({ type: 'fatsawtooth', count: 3, spread: 26 }, env(.003, .1, .9, .05)) },
  fatpulse: { name: 'ファットパルス', cat: 'synth', like: 'stab', gm: 80, vol: -25, filt: 3200, cfg: syn({ type: 'fatsquare', count: 2, spread: 18 }, env(.005, .3, .3, .2)) },
  softsq: { name: 'やわらかスクエア', cat: 'synth', like: 'organ', gm: 80, vol: -24, filt: 1600, cfg: syn({ type: 'square' }, env(.02, .4, .5, .4)) },
  hoover: { name: 'フーバー風', cat: 'synth', like: 'brass', gm: 87, vol: -27, filt: 3800, cfg: syn({ type: 'fatsawtooth', count: 5, spread: 45 }, env(.05, .3, .8, .4)) },

  clean: { name: 'クリーンギター', cat: 'guitar', like: 'guitar', gm: 27, vol: -15, filt: 3600, cfg: syn({ type: 'fmtriangle', harmonicity: 2, modulationIndex: .8 }, env(.002, .7, .05, .4)) },
  muted: { name: 'ミュートギター', cat: 'guitar', like: 'clav', gm: 28, vol: -18, filt: 1800, cfg: syn({ type: 'sawtooth' }, env(.001, .07, 0, .05)) },
  power: { name: 'パワーコード風', cat: 'guitar', like: 'brass', gm: 30, vol: -25, filt: 2400, cfg: syn({ type: 'fatsawtooth', count: 2, spread: 14 }, env(.004, .4, .75, .25)) },
  twelve: { name: '12弦ギター風', cat: 'guitar', like: 'guitar', gm: 25, vol: -18, filt: 4200, cfg: syn({ type: 'fattriangle', count: 2, spread: 9 }, env(.002, .9, .05, .6)) },

  tri: { name: '三角波和音', cat: 'chip', like: 'chip', gm: 80, vol: -16, filt: 5000, cfg: syn({ type: 'triangle' }, env(.001, .15, .4, .08)) },
  pulse: { name: 'パルス和音', cat: 'chip', like: 'chip', gm: 80, vol: -25, filt: 5000, cfg: syn({ type: 'pulse', width: .2 }, env(.001, .12, .2, .06)) },
};
const CHORD_CAT_OF = {
  vibes: 'keys', piano: 'keys', organ: 'keys', epiano: 'keys', clav: 'keys',
  pad: 'pad', strings: 'pad', choir: 'pad', warm: 'pad', brass: 'synth',
  stab: 'synth', supersaw: 'synth', square: 'synth', guitar: 'guitar', chip: 'chip',
};
export const CHORD_SOUNDS = {};
for (const [k, s] of Object.entries(E.PADS)) CHORD_SOUNDS[k] = { name: s.name, cat: CHORD_CAT_OF[k] || 'synth', like: k, gm: s.gm, vol: s.vol, cfg: s.cfg };
Object.assign(CHORD_SOUNDS, CHORD_EXTRA);
/* コードの後ろのローパス。決まっていない音色はレシピの音色と同じ値 */
export const chordFilt = s => s.filt || (E.PADS[s.like] && E.PADS[s.like].long ? 2200 : 2600);

/* ---------- ベース ---------- */
export const BASS_CATS = [
  { id: 'synth', name: 'シンセベース' },
  { id: 'deep', name: 'サブ・808' },
  { id: 'real', name: '生っぽい' },
  { id: 'chip', name: 'チップ・8bit' },
];
/* rig.bass の作りと同じ値（engine.js の createRig）。音色ごとの差分と、音作りの倍率はここからかける */
export const BASS_BASE = {
  envelope: env(.012, .3, .45, .35),
  filterEnvelope: { attack: .01, decay: .2, sustain: .35, release: .3, baseFrequency: 110, octaves: 2.4 },
  filter: { Q: 1.2 },
  vol: -9,
};
const bs = (name, cat, gm, osc, o) => Object.assign({ name, cat, gm, osc }, o || {});
export const BASS_SOUNDS = {
  tri: bs('まるい', 'synth', 38, { type: 'triangle' }),
  saw: bs('ぶりぶり', 'synth', 39, { type: 'sawtooth' }),
  fat: bs('太い', 'synth', 39, { type: 'fatsawtooth', count: 3, spread: 18 }),
  pwm: bs('うねり', 'synth', 39, { type: 'pwm', modulationFrequency: .35 }),
  fm: bs('FMベース', 'synth', 38, { type: 'fmsine', harmonicity: 1, modulationIndex: 3 }),
  acid: bs('アシッド', 'synth', 39, { type: 'sawtooth' }, { fenv: { decay: .16, sustain: .1, octaves: 4.2, baseFrequency: 90 }, q: 9, vol: -11 }),
  reese: bs('リース', 'synth', 39, { type: 'fatsawtooth', count: 3, spread: 30 }, { fenv: { baseFrequency: 160, octaves: 1.6, sustain: .6 }, env: { sustain: .8 }, vol: -11 }),
  moog: bs('ムーグ風', 'synth', 39, { type: 'sawtooth' }, { fenv: { decay: .3, octaves: 3, sustain: .25 }, q: 4 }),
  pluck: bs('プラックベース', 'synth', 38, { type: 'square' }, { env: { decay: .16, sustain: .08, release: .12 }, fenv: { decay: .1, octaves: 3 } }),
  organ: bs('オルガンベース', 'synth', 38, { type: 'custom', partials: [1, .6, .3, .2] }, { fenv: { baseFrequency: 400, octaves: 1 }, env: { sustain: .8, release: .1 } }),

  sine: bs('やわらか', 'deep', 38, { type: 'sine' }),
  sub: bs('サブ', 'deep', 38, { type: 'sine' }, { fenv: { baseFrequency: 200, octaves: 0 }, vol: -7 }),
  b808: bs('808', 'deep', 38, { type: 'sine' }, { env: { decay: 1.2, sustain: .25, release: .7 }, fenv: { baseFrequency: 300, octaves: .5 }, vol: -6 }),
  deep: bs('ディープ', 'deep', 38, { type: 'triangle' }, { fenv: { baseFrequency: 70, octaves: 1.2 }, vol: -7 }),
  growl: bs('うなりサブ', 'deep', 39, { type: 'fmsine', harmonicity: .5, modulationIndex: 6 }, { fenv: { baseFrequency: 140, octaves: 2 }, vol: -10 }),

  wood: bs('ウッドベース風', 'real', 32, { type: 'triangle' }, { env: { attack: .008, decay: .5, sustain: .1, release: .25 }, fenv: { baseFrequency: 140, octaves: 1.5, decay: .12 } }),
  finger: bs('エレキベース風', 'real', 33, { type: 'sawtooth' }, { env: { decay: .45, sustain: .3 }, fenv: { baseFrequency: 180, octaves: 1.6, decay: .15 }, q: 1 }),
  slap: bs('スラップ風', 'real', 36, { type: 'square' }, { env: { decay: .3, sustain: .15 }, fenv: { decay: .07, octaves: 3.6, sustain: .2 }, q: 3, vol: -11 }),
  fretless: bs('フレットレス風', 'real', 35, { type: 'triangle' }, { env: { attack: .04, sustain: .6, release: .3 }, fenv: { attack: .05, octaves: 1.2 } }),

  square: bs('ぴこぴこ', 'chip', 38, { type: 'square' }),
  chiptri: bs('三角波ベース', 'chip', 38, { type: 'triangle' }, { env: { attack: .002, sustain: .8, release: .05 }, fenv: { baseFrequency: 4000, octaves: 0 }, vol: -8 }),
  chippulse: bs('パルスベース', 'chip', 38, { type: 'pulse', width: .25 }, { env: { attack: .002, sustain: .7, release: .05 }, fenv: { baseFrequency: 3000, octaves: 0 }, vol: -13 }),
};
/* 音色の差分を BASS_BASE に重ねた MonoSynth の設定 */
export function bassCfg(key) {
  const s = BASS_SOUNDS[key] || BASS_SOUNDS.tri;
  return {
    oscillator: s.osc,
    envelope: Object.assign({}, BASS_BASE.envelope, s.env || {}),
    filterEnvelope: Object.assign({}, BASS_BASE.filterEnvelope, s.fenv || {}),
    filter: { Q: s.q ?? BASS_BASE.filter.Q },
    vol: s.vol ?? BASS_BASE.vol,
  };
}

/* ---------- ドラム ---------- */
export const DRUM_CATS = [{ id: 'all', name: 'キット' }];
/* engine.js の createRig と同じ値。ここから音色ごとの差分を重ねる */
export const DRUM_BASE = {
  kick: { pitchDecay: .035, octaves: 5.5, decay: .28, vol: -11 },
  snare: { decay: .13, vol: -17, hp: 1500 },
  snBody: { decay: .09, vol: -21 },
  hat: { decay: .035, vol: -24, hp: 7200 },
  ohat: { decay: .26, vol: -27, hp: 6400 },
  clap: { decay: .14, vol: -14, bp: 1200 },
  rim: { decay: .08, vol: -14, bp: 1700 },
  tom: { pitchDecay: .05, decay: .34, vol: -15 },
  boom: { decay: 1.0, vol: -10 },
  crash: { decay: 1.5, vol: -31 },
  shaker: { decay: .045, vol: -20 },
};
export const DRUM_KITS = {
  std: { name: 'スタンダード', desc: 'いつもの音' },
  k808: { name: '808風', desc: '長く沈むキックと、軽いハット', d: { kick: { pitchDecay: .08, octaves: 4, decay: .75, vol: -9 }, snare: { decay: .17, hp: 1100 }, snBody: { decay: .14, vol: -19 }, hat: { decay: .03, hp: 8000 }, clap: { decay: .2 } } },
  k909: { name: '909風', desc: 'パンチのあるキック、明るいハット', d: { kick: { pitchDecay: .025, octaves: 6, decay: .42, vol: -9 }, snare: { decay: .17, hp: 1200, vol: -16 }, hat: { decay: .05, hp: 8200, vol: -23 }, ohat: { decay: .34 }, clap: { decay: .18, vol: -13 } } },
  acoustic: { name: 'アコースティック風', desc: '胴鳴りのあるスネア、やわらかいキック', d: { kick: { pitchDecay: .05, octaves: 3.2, decay: .35 }, snare: { decay: .2, hp: 900 }, snBody: { decay: .12, vol: -18 }, hat: { decay: .05, hp: 6200 }, tom: { decay: .5 }, crash: { decay: 2 } } },
  lofi: { name: 'ローファイ', desc: 'こもって、ざらっと', d: { kick: { octaves: 4, decay: .3, vol: -12 }, snare: { hp: 800, decay: .15 }, hat: { hp: 4200, vol: -26 }, ohat: { hp: 3800 }, clap: { bp: 900 }, rim: { bp: 1200 }, crash: { vol: -34 } } },
  chip: { name: 'ピコピコ', desc: '短く硬い、ゲーム機の打楽器', d: { kick: { pitchDecay: .012, octaves: 8, decay: .12, vol: -12 }, snare: { decay: .07, hp: 2400 }, snBody: { vol: -30 }, hat: { decay: .02, hp: 9000 }, ohat: { decay: .12 }, clap: { decay: .08 }, crash: { decay: .6 } } },
  hard: { name: 'ハード', desc: '硬く強いキックと太いスネア', d: { kick: { pitchDecay: .02, octaves: 7, decay: .5, vol: -8 }, snare: { decay: .2, vol: -15, hp: 1000 }, snBody: { vol: -18 }, clap: { decay: .22, vol: -12 }, hat: { vol: -22 } } },
  tight: { name: 'タイト', desc: '全部を短く切りそろえる', d: { kick: { decay: .18 }, snare: { decay: .08 }, snBody: { decay: .06 }, hat: { decay: .022 }, ohat: { decay: .14 }, clap: { decay: .09 }, tom: { decay: .2 }, crash: { decay: .9 } } },
  big: { name: 'ビッグルーム', desc: '大きく響くキックとクラップ', d: { kick: { pitchDecay: .04, octaves: 5, decay: .6, vol: -8 }, snare: { decay: .26 }, clap: { decay: .28, vol: -12 }, crash: { decay: 2.4, vol: -28 }, ohat: { decay: .4 } } },
  soft: { name: 'ソフト', desc: '小さく、やさしく', d: { kick: { octaves: 4, decay: .24, vol: -14 }, snare: { vol: -20 }, hat: { vol: -28 }, ohat: { vol: -31 }, clap: { vol: -17 }, crash: { vol: -35 } } },
};
export function drumKit(key) {
  const k = DRUM_KITS[key] || DRUM_KITS.std, out = {};
  for (const [v, b] of Object.entries(DRUM_BASE)) out[v] = Object.assign({}, b, (k.d || {})[v] || {});
  return out;
}

/* ---------- パターン ---------- */
/* メロディ：メロディの作り方（st.mel）の組み合わせ。選ぶと同じタネで作り直す */
const mel = (dens, range, leap, o) => Object.assign({ dens, range, leap, oct: 0, octUp: false, harm: false, counter: false }, o || {});
export const LEAD_STYLES = {
  // うた：1小節の動機をくり返し・ずらし・対比させて、8小節で問いと答えを作る（エンジンの plan:'motif'）
  sing: { name: 'うたう', cat: 'song', desc: '動機をくり返したりずらしたりして、問いと答えで8小節を組む。いちばん「曲」らしい', mel: mel(55, 55, 40), plan: 'motif' },
  singBounce: { name: 'はずむ', cat: 'song', desc: '細かいリズムの動機で、軽快に', mel: mel(82, 55, 50), plan: 'motif' },
  singSlow: { name: 'ゆったり歌う', cat: 'song', desc: '長い音の動機で、ゆっくり大きく', mel: mel(25, 60, 40), plan: 'motif' },
  singBold: { name: '堂々と', cat: 'song', desc: '広い音域を大きく跳ぶ動機。ボスや見せ場に', mel: mel(60, 85, 75), plan: 'motif' },
  std: { name: 'ふつう', cat: 'basic', desc: '歌いやすい、ほどよい動き', mel: mel(60, 55, 45) },
  busy: { name: '細かく', cat: 'basic', desc: '音数を増やして、よく動く', mel: mel(90, 55, 40) },
  sparse: { name: 'ゆったり', cat: 'basic', desc: '音数を減らして、間を残す', mel: mel(28, 45, 35) },
  smooth: { name: 'なめらか', cat: 'basic', desc: '隣の音へ順に動く', mel: mel(60, 45, 8) },
  jumpy: { name: '跳ねる', cat: 'basic', desc: '大きく跳ぶ、元気な線', mel: mel(62, 80, 92) },
  wide: { name: '広い音域', cat: 'basic', desc: '上から下まで大きく使う', mel: mel(60, 95, 55) },
  narrow: { name: '狭い音域', cat: 'basic', desc: '同じあたりをくり返す、ミニマルな線', mel: mel(66, 12, 30) },
  high: { name: '高め', cat: 'basic', desc: '1オクターブ上で', mel: mel(60, 50, 45, { oct: 1 }) },
  octave: { name: 'オクターブ重ね', cat: 'layer', desc: '1オクターブ上を薄く重ねる', mel: mel(60, 55, 45, { octUp: true }) },
  harm: { name: 'ハモり', cat: 'layer', desc: '下に3度のハーモニー', mel: mel(60, 55, 45, { harm: true }) },
  counter: { name: '対旋律つき', cat: 'layer', desc: '低い所で、すき間に答える線', mel: mel(55, 55, 45, { counter: true }) },
  full: { name: 'にぎやか', cat: 'layer', desc: 'オクターブ上とハモりを両方', mel: mel(65, 55, 45, { octUp: true, harm: true }) },
  // 反復：エンジンの「反復の型」(st.plan) ごと切り替える。plan のない型を選ぶと 'free'（ふつうの作り方）になる
  minimal: { name: 'くりかえし', cat: 'repeat', desc: '短い動機を少しずつ形を変えて重ねる。休符の入り方だけ周回ごとに変わる（ミニマル）', mel: mel(60, 55, 45), plan: 'minimal' },
  ostinato: { name: 'オスティナート', cat: 'repeat', desc: '2小節の音型を一言一句そのまま回し続ける。8小節目だけ少し変わる。暗い映画のような場面に', mel: mel(70, 30, 40), plan: 'ostinato' },
  ostinatoDense: { name: 'オスティナート（ぎっしり）', cat: 'repeat', desc: '8分音符をほぼ埋めて回し続ける。速い曲で追い立てる反復に', mel: mel(92, 30, 40), plan: 'ostinato' },
  arp: { name: '分散和音（8分）', cat: 'repeat', desc: '和音の音を規則的な形（上り・上り下り・とび・低い音に戻る）で8分に鳴らし続ける。宇宙や無重力の面に', mel: mel(70, 55, 45), plan: 'arp' },
  arpSlow: { name: '分散和音（4分）', cat: 'repeat', desc: '同じ形を4分でゆっくり。遅い曲や静かな場面に', mel: mel(45, 55, 45), plan: 'arp' },
};
export const LEAD_STYLE_CATS = [{ id: 'song', name: 'うた' }, { id: 'basic', name: 'フレーズ' }, { id: 'layer', name: '重ね' }, { id: 'repeat', name: '反復' }];

/* コード：曲調どおり（エンジンで作り直す）か、小節ごとの和音をリズムに並べる */
export const CHORD_STYLES = {
  auto: { name: '曲調どおり', cat: 'basic', desc: '曲調のいつもの弾き方で作り直す' },
  whole: { name: 'のばし', cat: 'basic', desc: '1小節ずっと鳴らす' },
  half: { name: '2分', cat: 'basic', desc: '小節の頭とまん中' },
  quarter: { name: '4分刻み', cat: 'rhythm', desc: '1拍ずつ刻む' },
  eighth: { name: '8分刻み', cat: 'rhythm', desc: '8分音符で刻む。ゲートシンセと合わせるとトランスっぽい' },
  offbeat: { name: '裏打ち', cat: 'rhythm', desc: '拍の裏だけ。ハウスやスカの定番' },
  push: { name: 'シンコペ', cat: 'rhythm', desc: '3+3+2 で前のめりに' },
  charleston: { name: 'チャールストン', cat: 'rhythm', desc: '頭と、2拍目の裏' },
  strum: { name: 'ストローク', cat: 'rhythm', desc: 'ギターのようにずらして、ダウン・アップ' },
  arpUp: { name: 'アルペジオ（上り）', cat: 'arp', desc: '和音を下から1音ずつ' },
  arpUpDown: { name: 'アルペジオ（上下）', cat: 'arp', desc: '上って下りる' },
  arp16: { name: '16分アルペジオ', cat: 'arp', desc: '細かく速い分散和音' },
};
export const CHORD_STYLE_CATS = [{ id: 'basic', name: 'のばす' }, { id: 'rhythm', name: '刻む' }, { id: 'arp', name: '分散和音' }];

/* コードの響き（和音の積み方）と音域。弾き方（CHORD_STYLES）と組み合わせて並べる。曲調どおりのときは使わない */
export const CHORD_VOICES = {
  std: { name: 'ふつう', desc: '7thまで入れた、まとまった響き' },
  simple: { name: 'シンプル', desc: '3和音だけ。素朴で明るい' },
  tension: { name: 'おしゃれ', desc: '9th・13thを足して、ジャズっぽく浮かせる' },
  open: { name: 'ひろがり', desc: '音の間を広げて、大きく響かせる' },
  power: { name: 'パワー', desc: '根音と5度だけ。ロックっぽく力強く' },
  air: { name: 'すかす', desc: '3度を抜いて5度と9度だけ。コード感が薄い、いまどきのパッドの響き' },
  shell: { name: 'シェル', desc: '3度と7度の2音だけ。輪郭だけで軽い' },
};
/* コードの動き：進行表をどれだけ動かすか。エンジンの st.chordMotion（ジャンル選択の「アレンジ」で使う） */
export const CHORD_MOTIONS = {
  auto: { name: '曲調どおり', desc: '進行表のまま' },
  half: { name: 'ゆっくり（2小節ごと）', desc: '2小節に1回しか変わらない' },
  quarter: { name: 'ほぼ止める（4小節ごと）', desc: '4小節に1回。コード感がぐっと薄くなる' },
  hold: { name: '止める（最初の和音だけ）', desc: '1つの和音で通す。主音固定のベースと合わせると現代風' },
};
export const CHORD_RANGES = {
  low: { name: '低め', desc: '太く、落ち着いた感じ', shift: -12 },
  mid: { name: 'まん中', desc: 'いつもの高さ', shift: 0 },
  high: { name: '高め', desc: 'きらっと軽く', shift: 12 },
};

/* ベースの土台：小節の和音の根音を弾くか、主音に固定（ペダルポイント）か。曲調に pedal があれば既定で固定 */
export const BASS_PEDALS = {
  chord: { name: 'コードどおり', desc: '小節ごとの和音の根音を弾く。いつもの土台' },
  pedal: { name: '主音に固定', desc: '和音が変わっても主音に居座る（ペダルポイント）。上だけが動いて、不穏さや緊張が出る' },
};
/* ベースの遊び：エンジンの bassArr（経過音・オクターブ跳び・次の根音への寄り・4小節目のフィル） */
export const BASS_PLAYS = {
  none: { name: 'なし', desc: 'パターンどおりに弾く', v: 0 },
  some: { name: 'すこし', desc: 'ときどき経過音や、次の根音への寄りが入る', v: 35 },
  lots: { name: 'たっぷり', desc: '4小節目のフィル、オクターブ跳び、経過音がたくさん', v: 75 },
};
export const bassPlayOf = v => (v | 0) <= 0 ? 'none' : (v | 0) < 55 ? 'some' : 'lots';
/* コードの変化：進行表の骨はそのままに、1小節にいくつ和音を置くか・途中に入れる和音・代理をタネで選ぶ（エンジンの harmVary） */
export const CHORD_VARIES = {
  none: { name: '進行表どおり', desc: '1小節に1つ、曲調の進行表のまま', v: 0 },
  lite: { name: 'すこし', desc: 'ときどき小節の後ろに、次の和音へ向かう和音が入る', v: 30 },
  mid: { name: 'ふつう', desc: '1・1・2・2 のように変わる数が揺れて、代理の和音も入る', v: 60 },
  wild: { name: 'たっぷり', desc: '1・2・3・3 のように細かく動く。ジャズっぽい寄り道も', v: 90 },
};
export const BASS_STYLE_CATS = [{ id: 'all', name: 'パターン' }];
export const DRUM_STYLE_CATS = [{ id: 'all', name: 'パターン' }];

const r4 = x => Math.round(x * 10000) / 10000;
/* 1小節ぶんの和音を、響きに合わせて積む（まん中の音域で）。前の小節から近い形でつなぐ */
function chordTones(ch, key, voice, prev) {
  const q = E.QUAL[ch[1]], root = ch[0] + key;
  if (voice === 'power') { const r = 48 + ((root % 12) + 12) % 12; return [r, r + 7, r + 12]; }
  let ints;
  if (voice === 'air') ints = [q[2], 12, 14];          // 5度・根音（上）・9度。3度なし
  else if (voice === 'shell') ints = [q[1], q[3]];     // 3度と7度
  else if (voice === 'simple') ints = q.slice(0, 3);
  else if (voice === 'tension') {
    // 5度を抜いて、3rd・7th にテンションを2つ（9th・13th など）。m7♭5 の ♭9 は濁るので 11th にする
    const [x, y] = E.EXT[ch[1]].map(i => i === 1 ? 5 : i);
    ints = [q[1], q[3], x + 12, y + 12].sort((a, b) => a % 12 - b % 12);
  } else ints = q.slice(1);
  const vc = E.leadVoice(ints.map(i => i + root), prev || [65], 53, 77);
  return vc && vc.length ? vc : E.voicing(root, ch[1], 55, 74);
}
/* 小節ごとの和音（proj.chords。拍ごとの和音 proj.slots があればそちら）を、選んだリズムでコードのノートにする。
   小節の途中で和音が変わるときは、和音ごとに同じリズムを敷いてその範囲だけ使い、
   変わり目をまたいで伸びている音は変わり目で新しい和音に弾き直す */
export function chordPattern(proj, style) {
  const EPB = proj.beats * 2, MID = Math.floor(EPB / 2), key = proj.st.key, out = [];
  const voice = CHORD_VOICES[proj.st.chordVoice] ? proj.st.chordVoice : 'std';
  const shift = (CHORD_RANGES[proj.st.chordRange] || CHORD_RANGES.mid).shift;
  let prev = null;
  for (let b = 0; b < proj.bars; b++) {
    const base = b * EPB, segs = [];
    for (let q = 0; q < (proj.slots ? proj.beats : 1); q++) {
      const ch = proj.slots ? proj.slots[b * proj.beats + q] : proj.chords[b];
      const last = segs[segs.length - 1];
      if (!last || last.ch[0] !== ch[0] || last.ch[1] !== ch[1]) segs.push({ t: q * 2, ch });
    }
    segs.forEach((g, i) => {
      const from = g.t, to = i < segs.length - 1 ? segs[i + 1].t : EPB;
      const close = chordTones(g.ch, key, voice, prev);
      prev = close;
      let vc = close.slice();
      // ひろがり：上から2番目を1オクターブ下げる（ドロップ2）
      if (voice === 'open' && vc.length >= 3) { vc[vc.length - 2] -= 12; vc.sort((a, b) => a - b); }
      // 低めでもベースとぶつからないよう、低すぎる音は1オクターブ上げる
      vc = vc.map(n => n + shift).map(n => n < 45 ? n + 12 : n).sort((a, b) => a - b);
      vc = [...new Set(vc)];
      const bar = barPattern(style, EPB, MID, vc);
      const startsAtFrom = bar.some(x => Math.abs(x.t - from) < 1e-6);
      for (const x of bar) {
        let t = x.t, d = x.d;
        if (t < from - 1e-6) {
          // 変わり目の前から伸びている音：変わり目に頭があるリズムでなければ、変わり目から弾き直す
          if (i === 0 || startsAtFrom || t + d <= from + 1e-6) continue;
          const t2 = from + (x.o || 0);
          d = t + d - t2; t = t2;
        } else if (t >= to - 1e-6) continue;
        d = Math.min(d, to - t - (to < EPB ? .05 : 0));
        if (d <= 0) continue;
        out.push({ t: r4(base + t), d: r4(d), n: x.n, v: r4(x.v) });
      }
    });
  }
  return out;
}
/* 1小節ぶんのリズム（小節の頭からの位置）。o はストロークで少しずらして鳴らす音のずれ */
function barPattern(style, EPB, MID, vc) {
  const out = [];
  const top = vc.includes(vc[0] + 12) ? [] : [vc[0] + 12];
  const hit = (p, d, v, ns) => { for (const n of ns || vc) out.push({ t: p, d, n, v }); };
  const arp = (seq, step) => { let i = 0; for (let p = 0; p < EPB - 1e-6; p += step, i++) out.push({ t: p, d: step * .95, n: seq[i % seq.length], v: i % (2 / step) === 0 ? .4 : .32 }); };
  switch (style) {
    case 'whole': hit(0, EPB, .32); break;
    case 'half': if (EPB % 4 === 0) { hit(0, MID, .34); hit(MID, MID, .3); } else hit(0, EPB, .32); break;
    case 'quarter': for (let p = 0; p < EPB; p += 2) hit(p, 1.8, p === 0 ? .38 : .3); break;
    case 'eighth': for (let p = 0; p < EPB; p++) hit(p, .85, p % 2 ? .27 : .34); break;
    case 'offbeat': for (let p = 1; p < EPB; p += 2) hit(p, .9, .34); break;
    case 'push': { const pts = EPB === 8 ? [0, 3, 6] : [0, 3]; pts.forEach((p, i) => hit(p, (pts[i + 1] ?? EPB) - p - .1, i ? .3 : .38)); break; }
    case 'charleston': hit(0, 2.6, .38); hit(3, 1, .32); break;
    case 'strum': {
      // ダウンは低い音から、アップは高い音から少しずつずらす
      const pts = EPB === 8 ? [0, 2, 3, 5, 6, 7] : [0, 2, 3, 5];
      pts.forEach((p, i) => {
        const up = p % 2 === 1, ns = up ? vc.slice().reverse() : vc;
        const d = (pts[i + 1] ?? EPB) - p;
        ns.forEach((n, j) => out.push({ t: p + j * .07, d: Math.max(.3, d - j * .07 - .05), n, v: (up ? .26 : .34) + (p === 0 ? .04 : 0), o: j * .07 }));
      });
      break;
    }
    case 'arpUp': arp(vc.concat(top), 1); break;
    case 'arpUpDown': { const s = vc.concat(top); arp(s.concat(s.slice(1, -1).reverse()), 1); break; }
    case 'arp16': arp(vc.concat(top), .5); break;
    default: hit(0, EPB, .32);
  }
  return out;
}

/* ---------- 音色の取り出し ---------- */
export const SOUND_TABLE = { lead: LEAD_SOUNDS, chord: CHORD_SOUNDS, bass: BASS_SOUNDS, drum: DRUM_KITS };
export const SOUND_CATS = { lead: LEAD_CATS, chord: CHORD_CATS, bass: BASS_CATS, drum: DRUM_CATS };
export const STYLE_TABLE = { lead: LEAD_STYLES, chord: CHORD_STYLES, bass: E.BASSES, drum: E.KITS };
export const STYLE_CATS = { lead: LEAD_STYLE_CATS, chord: CHORD_STYLE_CATS, bass: BASS_STYLE_CATS, drum: DRUM_STYLE_CATS };
export const DEFAULT_SOUND = { bass: 'tri', drum: 'std' };
