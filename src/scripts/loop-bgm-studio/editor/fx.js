/*
  トラックごとのエフェクトラック（インサート）。上から順に通る。

  mix[k].rack = [{ type, on, p: {パラメーター} }]

  ループの継ぎ目のために:
    - 揺れもの（LFO）の速さは、1周の長さで割り切れる値に寄せる。書き出しでは 0 秒から動かすので、
      最後と最初で揺れの位置がそろう
    - ディレイのしっぽは、書き出しのしっぽ（tailSeconds）に足して、頭に折り返す
*/
export const FX_CATS = [
  { id: 'drive', name: '歪み' },
  { id: 'dyn', name: 'ダイナミクス' },
  { id: 'eq', name: 'EQ・フィルター' },
  { id: 'mod', name: 'モジュレーション' },
  { id: 'space', name: '空間' },
];
/* 拍の長さ（4分音符いくつぶん）で決める時間 */
export const DIVS = [
  ['1/16', .25], ['1/8', .5], ['1/8.', .75], ['1/4', 1], ['1/4.', 1.5], ['1/2', 2], ['1小節', 'bar'], ['2小節', 'bar2'], ['4小節', 'bar4'],
];
const divQuarters = (v, beats) => v === 'bar' ? beats : v === 'bar2' ? beats * 2 : v === 'bar4' ? beats * 4 : +v;
const divSec = (v, env) => divQuarters(v, env.beats) * 60 / env.bpm;
/* 1周でちょうど何回か揺れる速さに寄せる */
const loopHz = (hz, env) => env.loopSec ? Math.max(1, Math.round(hz * env.loopSec)) / env.loopSec : hz;
const db = x => Math.pow(10, x / 20);

const num = (id, label, min, max, def, o) => Object.assign({ id, label, min, max, def, step: 1 }, o || {});
const div = (id, label, def, opts) => ({ id, label, type: 'div', def, opts: opts || DIVS });
const MIX = num('mix', 'ミックス', 0, 100, 100, { unit: '%' });

export const FX_TYPES = {
  dist: {
    name: 'ディストーション', cat: 'drive', desc: '音を歪ませて、太く荒く',
    params: [num('drive', 'ドライブ', 0, 100, 45), num('tone', 'トーン', 0, 100, 60), num('out', 'アウト', -24, 6, 0, { unit: 'dB' }), MIX],
    make(T) {
      const d = new T.Distortion({ distortion: .4, oversample: '2x' }), lp = new T.Filter({ type: 'lowpass', frequency: 8000, Q: .5 }), g = new T.Gain(1);
      d.chain(lp, g);
      return {
        input: d, output: g, nodes: [d, lp, g],
        apply(p) {
          d.distortion = p.drive / 100 * .9; d.wet.value = p.mix / 100;
          lp.frequency.value = 600 * Math.pow(2, p.tone / 100 * 5);
          // 歪ませるほど大きくなるので、少し下げて釣り合わせる
          g.gain.value = db(p.out - p.drive / 100 * 7 * p.mix / 100);
        },
      };
    },
  },
  crush: {
    name: 'ビットクラッシャー', cat: 'drive', desc: '解像度を落として、ざらざらの8bitに',
    params: [num('bits', 'ビット', 2, 12, 6), MIX],
    make(T) {
      const inp = new T.Gain(1), dry = new T.Gain(0), wet = new T.Gain(1), out = new T.Gain(1);
      const sh = new T.WaveShaper(x => x, 4096);
      inp.connect(dry); inp.connect(sh); sh.connect(wet); dry.connect(out); wet.connect(out);
      let bits = null;
      return {
        input: inp, output: out, nodes: [inp, dry, wet, out, sh],
        apply(p) {
          if (bits !== p.bits) { bits = p.bits; const s = Math.pow(2, p.bits - 1); sh.setMap(x => Math.round(x * s) / s, 4096); }
          dry.gain.value = 1 - p.mix / 100; wet.gain.value = p.mix / 100;
        },
      };
    },
  },
  comp: {
    name: 'コンプレッサー', cat: 'dyn', desc: '音量の差を縮めて、前に出す',
    params: [num('threshold', 'スレッショルド', -60, 0, -18, { unit: 'dB' }), num('ratio', 'レシオ', 1, 20, 4, { unit: ':1' }),
      num('attack', 'アタック', 1, 200, 10, { unit: 'ms' }), num('release', 'リリース', 20, 1000, 160, { unit: 'ms' }),
      num('gain', 'ゲイン', 0, 24, 4, { unit: 'dB' })],
    make(T) {
      const c = new T.Compressor({ threshold: -18, ratio: 4 }), g = new T.Gain(1);
      c.connect(g);
      return {
        input: c, output: g, nodes: [c, g],
        // しきい値などは ramp だと 0 付近で範囲外になることがあるので、直接入れる
        apply(p) {
          c.threshold.value = Math.min(-.1, p.threshold); c.ratio.value = p.ratio;
          c.attack.value = p.attack / 1000; c.release.value = p.release / 1000;
          g.gain.value = db(p.gain);
        },
      };
    },
  },
  eq: {
    name: 'EQ（3バンド）', cat: 'eq', desc: '低・中・高を上げ下げ',
    params: [num('low', 'ロー', -24, 12, 0, { unit: 'dB' }), num('mid', 'ミッド', -24, 12, 0, { unit: 'dB' }), num('high', 'ハイ', -24, 12, 0, { unit: 'dB' }),
      num('lowF', 'ロー／ミッド境目', 80, 1000, 300, { unit: 'Hz', step: 10 }), num('highF', 'ミッド／ハイ境目', 1000, 10000, 2800, { unit: 'Hz', step: 100 })],
    make(T) {
      const q = new T.EQ3();
      return {
        input: q, output: q, nodes: [q],
        apply(p) { q.low.value = p.low; q.mid.value = p.mid; q.high.value = p.high; q.lowFrequency.value = p.lowF; q.highFrequency.value = Math.max(p.lowF + 100, p.highF); },
      };
    },
  },
  filter: {
    name: 'フィルター', cat: 'eq', desc: '決めた周波数より上（下）を切る',
    params: [{ id: 'kind', label: 'タイプ', type: 'select', def: 'lowpass', opts: [['lowpass', 'ローパス'], ['highpass', 'ハイパス'], ['bandpass', 'バンドパス']] },
      num('cutoff', 'カットオフ', 0, 100, 60, { fmt: 'hz' }), num('res', 'レゾナンス', 0, 100, 15)],
    make(T) {
      const f = new T.Filter({ type: 'lowpass', frequency: 2000, rolloff: -24 });
      return {
        input: f, output: f, nodes: [f],
        apply(p) { f.type = p.kind; f.frequency.value = cutoffHz(p.cutoff); f.Q.value = .5 + p.res / 100 * 14; },
      };
    },
  },
  autofilter: {
    name: 'オートフィルター', cat: 'mod', desc: 'フィルターが拍に合わせて開いたり閉じたり',
    params: [div('rate', 'レート', 'bar'), num('depth', 'デプス', 0, 100, 70), num('cutoff', 'カットオフ', 0, 100, 30, { fmt: 'hz' }), num('range', 'レンジ', 1, 6, 3, { unit: 'oct' }), num('res', 'レゾナンス', 0, 100, 20)],
    make(T) {
      const a = new T.AutoFilter({ frequency: 1, baseFrequency: 300, octaves: 3 }).start(0);
      return {
        input: a, output: a, nodes: [a],
        apply(p, env) {
          a.frequency.value = 1 / divSec(p.rate, env); a.depth.value = p.depth / 100;
          a.baseFrequency = cutoffHz(p.cutoff); a.octaves = p.range; a.filter.Q.value = .5 + p.res / 100 * 10;
        },
      };
    },
  },
  chorus: {
    name: 'コーラス', cat: 'mod', desc: '少しずらした音を重ねて、広く厚く',
    params: [num('rate', 'レート', 1, 80, 15, { fmt: 'tenth', unit: 'Hz' }), num('depth', 'デプス', 0, 100, 60), num('delay', 'ディレイ', 2, 20, 4, { unit: 'ms' }), num('mix', 'ミックス', 0, 100, 50, { unit: '%' })],
    make(T) {
      const c = new T.Chorus({ frequency: 1.5, delayTime: 4, depth: .6, spread: 180 }).start(0);
      return {
        input: c, output: c, nodes: [c],
        apply(p, env) { c.frequency.value = loopHz(p.rate / 10, env); c.depth = p.depth / 100; c.delayTime = p.delay; c.wet.value = p.mix / 100; },
      };
    },
  },
  phaser: {
    name: 'フェイザー', cat: 'mod', desc: 'しゅわしゅわと回るような揺れ',
    params: [num('rate', 'レート', 1, 80, 5, { fmt: 'tenth', unit: 'Hz' }), num('range', 'レンジ', 1, 5, 3, { unit: 'oct' }), num('base', 'ベース周波数', 100, 1500, 350, { unit: 'Hz', step: 10 }), num('mix', 'ミックス', 0, 100, 50, { unit: '%' })],
    make(T) {
      const ph = new T.Phaser({ frequency: .5, octaves: 3, baseFrequency: 350 });
      return {
        input: ph, output: ph, nodes: [ph],
        apply(p, env) { ph.frequency.value = loopHz(p.rate / 10, env); ph.octaves = p.range; ph.baseFrequency = p.base; ph.wet.value = p.mix / 100; },
      };
    },
  },
  tremolo: {
    name: 'トレモロ', cat: 'mod', desc: '音量が拍に合わせて揺れる',
    params: [div('rate', 'レート', .5), num('depth', 'デプス', 0, 100, 60), num('spread', 'ステレオ', 0, 100, 0)],
    make(T) {
      const t = new T.Tremolo({ frequency: 4, depth: .6, spread: 0 }).start(0);
      return {
        input: t, output: t, nodes: [t],
        apply(p, env) { t.frequency.value = 1 / divSec(p.rate, env); t.depth.value = p.depth / 100; t.spread = p.spread / 100 * 180; },
      };
    },
  },
  autopan: {
    name: 'オートパン', cat: 'mod', desc: '左右に行ったり来たり',
    params: [div('rate', 'レート', 'bar'), num('depth', 'デプス', 0, 100, 70)],
    make(T) {
      const a = new T.AutoPanner({ frequency: 1, depth: .7 }).start(0);
      return {
        input: a, output: a, nodes: [a],
        apply(p, env) { a.frequency.value = 1 / divSec(p.rate, env); a.depth.value = p.depth / 100; },
      };
    },
  },
  delay: {
    name: 'ディレイ', cat: 'space', desc: '拍に合わせたやまびこ',
    params: [div('time', 'タイム', .75, DIVS.slice(0, 6)), num('feedback', 'フィードバック', 0, 90, 35, { unit: '%' }), num('tone', 'トーン', 0, 100, 55), num('mix', 'ミックス', 0, 100, 25, { unit: '%' })],
    make(T) {
      const inp = new T.Gain(1), d = new T.FeedbackDelay({ delayTime: .3, feedback: .35, maxDelay: 4, wet: 1 }), lp = new T.Filter({ type: 'lowpass', frequency: 5000 });
      const dry = new T.Gain(1), wet = new T.Gain(.25), out = new T.Gain(1);
      inp.connect(dry); dry.connect(out); inp.chain(d, lp, wet, out);
      return {
        input: inp, output: out, nodes: [inp, d, lp, dry, wet, out],
        apply(p, env) { d.delayTime.value = divSec(p.time, env); d.feedback.value = p.feedback / 100; lp.frequency.value = 800 * Math.pow(2, p.tone / 100 * 4.5); wet.gain.value = p.mix / 100; },
      };
    },
    tail: (p, env) => tailOf(divSec(p.time, env), p.feedback),
  },
  pingpong: {
    name: 'ピンポンディレイ', cat: 'space', desc: 'やまびこが左右に跳ねる',
    params: [div('time', 'タイム', .5, DIVS.slice(0, 6)), num('feedback', 'フィードバック', 0, 90, 35, { unit: '%' }), num('mix', 'ミックス', 0, 100, 25, { unit: '%' })],
    make(T) {
      const d = new T.PingPongDelay({ delayTime: .3, feedback: .35, maxDelay: 4, wet: .25 });
      return {
        input: d, output: d, nodes: [d],
        apply(p, env) { d.delayTime.value = divSec(p.time, env); d.feedback.value = p.feedback / 100; d.wet.value = p.mix / 100; },
      };
    },
    tail: (p, env) => tailOf(divSec(p.time, env), p.feedback),
  },
  widener: {
    name: 'ステレオワイド', cat: 'space', desc: '左右の広がりを足す（引く）',
    params: [num('width', 'ワイド', 0, 100, 70)],
    make(T) {
      const w = new T.StereoWidener({ width: .7 });
      return { input: w, output: w, nodes: [w], apply(p) { w.width.value = p.width / 100; } };
    },
  },
};
export const MAX_RACK = 6;
/* カットオフ 0〜100 → 30Hz〜18kHz（耳の感じに合わせて対数） */
export const cutoffHz = v => Math.round(30 * Math.pow(600, v / 100));
/* やまびこが -60dB まで消える時間（長すぎるものは打ち切る） */
const tailOf = (sec, fb) => fb <= 0 ? sec : Math.min(12, sec * Math.log(.001) / Math.log(Math.max(.01, fb / 100)));

export const defaultParams = type => Object.fromEntries(FX_TYPES[type].params.map(p => [p.id, p.def]));
export function newUnit(type) { return { type, on: true, p: defaultParams(type) }; }

/* JSON から読んだラックを確かめる */
export function sanitizeRack(list) {
  const out = [];
  for (const u of Array.isArray(list) ? list : []) {
    const T = u && FX_TYPES[u.type];
    if (!T || out.length >= MAX_RACK) continue;
    const p = {};
    for (const d of T.params) {
      const v = (u.p || {})[d.id];
      if (d.type === 'select') p[d.id] = d.opts.some(o => o[0] === v) ? v : d.def;
      else if (d.type === 'div') p[d.id] = d.opts.some(o => o[1] === v) ? v : d.def;
      else p[d.id] = Number.isFinite(+v) ? Math.max(d.min, Math.min(d.max, +v)) : d.def;
    }
    out.push({ type: u.type, on: u.on !== false, p });
  }
  return out;
}

/* 表示用の値 */
export function fmtParam(d, v) {
  if (d.type === 'select') return (d.opts.find(o => o[0] === v) || d.opts[0])[1];
  if (d.type === 'div') return (d.opts.find(o => o[1] === v) || d.opts[0])[0];
  if (d.fmt === 'hz') { const h = cutoffHz(v); return h >= 1000 ? (h / 1000).toFixed(1) + 'k' : h + ''; }
  if (d.fmt === 'tenth') return (v / 10).toFixed(1) + (d.unit || '');
  return v + (d.unit && d.unit !== '%' ? d.unit : '');
}

/* rig の各トラックのラックを組み直す。並びと オン／オフが同じなら、値だけ流す */
export function applyRacks(T, rig, proj, env) {
  for (const [k, f] of Object.entries(rig.fx || {})) {
    const rack = (proj.mix[k].rack || []).filter(u => u.on && FX_TYPES[u.type]);
    const sig = rack.map(u => u.type).join(',');
    if (f.sig !== sig) {
      f.rackFrom.disconnect();
      for (const u of f.units || []) { if (u) try { u.nodes.forEach(n => n.dispose()); } catch (e) { } }
      f.units = [];
      let at = f.rackFrom;
      for (const u of rack) {
        // 作れなかったものは飛ばして（位置はそろえたまま）つなぐ
        try { const n = FX_TYPES[u.type].make(T); at.connect(n.input); at = n.output; f.units.push(n); } catch (e) { f.units.push(null); }
      }
      at.connect(f.rackTo);
      f.sig = sig;
    }
    rack.forEach((u, i) => { try { f.units[i] && f.units[i].apply(u.p, env); } catch (e) { } });
  }
}

/* ラックのしっぽ（書き出しで足す秒数） */
export function rackTail(proj, env) {
  let t = 0;
  for (const m of Object.values(proj.mix))
    for (const u of m.rack || []) if (u.on && FX_TYPES[u.type] && FX_TYPES[u.type].tail) t = Math.max(t, FX_TYPES[u.type].tail(u.p, env));
  return t;
}
