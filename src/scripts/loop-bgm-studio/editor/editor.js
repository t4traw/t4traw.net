/*
  ループBGMスタジオ エディタ版の画面。
  曲調はレシピ（ジャンル＋タネ）から作り、そこから先はノートを直接いじる。保存は JSON。

  canvas の中の縦の並び:
    メロディ・伴奏・ベース … 定規（小節番号・和音）/ ピアノロール / ドラムのしるし / 強さのレーン
    ドラム               … 小節の一覧（ページ選び）/ ステップシーケンサー / 強さのレーン
  追尾がオンで再生中は、ピアノロールは再生位置を左寄りに止めて譜面を流し（オルゴールのように）、
  ドラムは再生中の小節へページをめくる。ループの継ぎ目でも途切れないよう、流すときは前後の周回も描く。
*/
import * as E from "../engine.js";
import { defaultState } from "../controls.js";
import * as P from "./project.js";

const { TRACKS, PITCHED, TRACK_INFO, DRUM_ROWS } = P;
const STORE = 'loop-bgm-editor:v1';
const PMAX = 108, PMIN = 24, NROWS = PMAX - PMIN + 1;
const RULER = 26, DSTRIP = 16, LANE = 58;
const ANCHOR = .22;
/* ジャンル選択で「その他」にしまっておく曲調。おまかせでも選ばない */
const MORE_GENRES = ['omise', 'canon', 'sway', 'ambi', 'kurikaeshi'];                  // 追尾中の再生位置（ノート欄の幅に対する割合）
const KEY_NAMES = ['C', 'C#/D♭', 'D', 'D#/E♭', 'E', 'F', 'F#/G♭', 'G', 'G#/A♭', 'A', 'A#/B♭', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const C = {
  bg: '#121212', row: '#151515', rowScale: '#191919', bar: '#343434', beat: '#232323', sub: '#1a1a1a',
  ruler: '#171717', text: '#9a978c', textHi: '#e9e6dc', key: '#1f1f1f', keyBlack: '#141414',
  red: '#EC4A3E', band: 'rgba(233,230,220,.12)',
  padA: '#1e1e1e', padB: '#252525', lit: '#C9C3A6',
};

export function startEditor({ loadTone }) {
  const $ = id => document.getElementById(id);
  const cv = $('roll'), cx = cv.getContext('2d');
  const pref = (k, def) => { try { const v = localStorage.getItem(STORE + ':' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } };
  const setPref = (k, v) => { try { localStorage.setItem(STORE + ':' + k, JSON.stringify(v)); } catch (e) { } };
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /* ---------------- state ---------------- */
  let proj = null;
  let cur = 'lead';
  let sel = new Set();
  // スナップ（8分音符単位）。ドラムはステップの細かさ
  const grids = Object.assign({ lead: 1, chord: 1, bass: 1, drum: .5 }, pref('grids', {}));
  let zoomX = 16, rowH = 8;           // ピアノロールの 8分音符1つの幅・半音1つの高さ（px）
  let scrollX = 0, scrollY = 0;
  let wrapOff = 0;                    // 描画・当たり判定で何周目を見ているか（8分単位のずれ）
  let undoStack = [], redoStack = [];
  let clipNotes = null;               // ピアノロールのコピー
  let clipPage = null;                // ドラムのページのコピー
  let cursorT = 0;                    // 最後に触った位置（貼り付け先）
  const lastLen = { lead: 2, chord: 4, bass: 2 };
  const audio = { ready: false, loading: null, rig: null, playing: false, vol: clamp(+pref('vol', 72), 0, 100) };
  let follow = pref('follow', true);
  let compact = pref('compact', true);    // ドラムで使っている行だけ出す
  let tool = 'edit';                      // edit / melody / mood / rhythm（ブラシ）
  let brushR = clamp(+pref('brushR', 18), 6, 48);   // ブラシの半径（px）
  let hoverPt = null;                     // ブラシの丸を出す位置
  let fading = [];                        // 塗り終わって消えていく線
  let visRows = DRUM_ROWS.map((_, i) => i);
  let focusRow = null;                    // 強さのレーンで扱うドラムの行（DRUM_ROWS の添字）
  let page = 0;                           // ドラムのページ
  let pageBars = [1, 2, 4].includes(pref('pageBars', 1)) ? pref('pageBars', 1) : 1;

  /* ---------------- helpers ---------------- */
  const isDrum = () => cur === 'drum';
  const grid = () => grids[cur];
  const end = () => P.endOf(proj);
  const epb = () => proj.beats * 2;
  const gutter = () => isDrum() ? 92 : 42;
  const viewW = () => cv.clientWidth;
  const viewH = () => cv.clientHeight;
  const laneTop = () => viewH() - LANE;
  const areaBottom = () => laneTop() - (isDrum() ? 0 : DSTRIP);
  const pageLen = () => pageBars * epb();
  const pages = () => Math.ceil(proj.bars / pageBars);
  const pageStart = () => page * pageLen();
  // ドラムはページの幅にぴったり収める。ピアノロールは拡大率とスクロールのまま
  const zx = () => isDrum() ? (viewW() - gutter() - 8) / pageLen() : zoomX;
  const sx = () => isDrum() ? pageStart() * zx() : scrollX;
  // ドラムの行の高さ。行が少ないときは画面の高さいっぱいに広げる
  const drow = () => Math.max(20, Math.min(46, Math.floor((areaBottom() - RULER - 4) / Math.max(1, visRows.length))));
  const contentH = () => isDrum() ? visRows.length * drow() + 4 : NROWS * rowH;
  const X = t => gutter() + (t + wrapOff) * zx() - sx();
  const T = x => (x - gutter() + sx()) / zx() - wrapOff;
  const Yp = n => RULER + (PMAX - n) * rowH - scrollY;
  const Np = y => PMAX - Math.floor((y - RULER + scrollY) / rowH);
  const Yd = vi => RULER + 2 + vi * drow() - scrollY;
  const rowAt = y => { const vi = Math.floor((y - RULER - 2 + scrollY) / drow()); return vi >= 0 && vi < visRows.length ? visRows[vi] : -1; };
  const snapFloor = t => Math.floor(t / grid() + 1e-6) * grid();
  const snapRound = t => Math.round(t / grid()) * grid();
  const following = () => follow && audio.playing;
  const smooth = () => following() && !isDrum();
  const mod = t => ((t % end()) + end()) % end();
  /* 譜面が流れているときは、画面の位置 x が何周目にあたるかを決めてから当たり判定する */
  const lapAt = px => smooth() ? Math.floor(((px - gutter() + scrollX) / zoomX) / end()) * end() : 0;
  /* 見えている周回ぶん fn をくり返す（ふだんは1回） */
  function eachLap(fn) {
    if (!smooth()) { wrapOff = 0; fn(); return; }
    const raw0 = scrollX / zoomX, raw1 = (viewW() - gutter() + scrollX) / zoomX;
    for (let k = Math.floor(raw0 / end()); k <= Math.floor(raw1 / end()); k++) { wrapOff = k * end(); fn(); }
    wrapOff = 0;
  }

  function clampScroll() {
    if (!smooth()) scrollX = clamp(scrollX, 0, Math.max(0, end() * zoomX - (viewW() - gutter()) + 40));
    scrollY = clamp(scrollY, 0, Math.max(0, contentH() - (areaBottom() - RULER)));
    page = clamp(page, 0, pages() - 1);
  }
  function computeRows() {
    if (!compact) { visRows = DRUM_ROWS.map((_, i) => i); return; }
    const used = new Set(proj.notes.drum.map(P.drumRowOf));
    // キック・スネア・ハットは空でも残す（そこから打ち込み始めることが多いので）
    for (const k of ['kick', 'snare', 'hat']) used.add(DRUM_ROWS.findIndex(r => r.k === k));
    visRows = DRUM_ROWS.map((_, i) => i).filter(i => used.has(i));
  }
  function setStatus(text, bad) {
    const s = $('status');
    s.textContent = text || '';
    s.dataset.bad = bad ? 'true' : 'false';
  }

  /* ---------------- undo ---------------- */
  const snap = () => JSON.stringify({ st: proj.st, bars: proj.bars, beats: proj.beats, chords: proj.chords, notes: proj.notes, recipe: proj.recipe });
  function pushUndo(s) {
    undoStack.push(s || snap());
    if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
  }
  function restore(s) {
    Object.assign(proj, JSON.parse(s));
    sel.clear();
    changed({ sound: true, rows: true });
  }
  function undo() { if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); setStatus('ひとつ戻した'); }
  function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); setStatus('やり直した'); }
  function edit(fn) { pushUndo(); fn(); changed(); }

  /* ---------------- change propagation ---------------- */
  let saveTimer = 0, schedPending = 0;
  function changed(opts) {
    if (opts && opts.sound) applySound();
    if (opts && opts.rows) computeRows();
    clampScroll();
    if (!schedPending) schedPending = requestAnimationFrame(() => { schedPending = 0; reschedule(); });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLocal, 500);
    syncStrip(); syncTracks(); syncSel(); draw();
  }
  function saveLocal() {
    try { localStorage.setItem(STORE, P.toJSON(proj)); } catch (e) { }
  }

  /* ---------------- audio ---------------- */
  async function ensureAudio() {
    if (audio.ready) return true;
    if (!audio.loading) audio.loading = (async () => {
      try {
        const Tn = await loadTone();
        E.useTone(Tn);
        await Tn.start();
        audio.rig = E.createRig({ pan: true });
        audio.ready = true;
        applySound(0);
        audio.rig.master.volume.value = E.masterDb(audio.vol);
        reschedule();
        if (!audio.rig.hasVerb) setStatus('この環境では残響が作れなかったから、ドライで鳴らしてる');
        return true;
      } catch (e) {
        setStatus('音源を読み込めなかった。通信環境を変えて開き直してみて', true);
        audio.loading = null;
        return false;
      }
    })();
    return audio.loading;
  }
  function applySound(ramp) {
    if (!audio.ready) return;
    const t = E.TR();
    E.setupTransport(t, proj.st);
    t.timeSignature = proj.beats;
    audio.rig.apply(P.rigState(proj), ramp);
    P.applyMix(audio.rig, proj, P.audible(proj), ramp);
    if (audio.revLen !== P.revLen(proj)) { audio.revLen = P.revLen(proj); audio.rig.setReverb(audio.revLen); }
  }
  function applyMixOnly() { if (audio.ready) P.applyMix(audio.rig, proj, P.audible(proj)); }
  /* 詳細設定を動かしたら、止まっているときだけ短く鳴らして確かめる */
  let auditionTimer = 0;
  function auditionSoon(k) {
    if (audio.playing) return;
    clearTimeout(auditionTimer);
    auditionTimer = setTimeout(() => {
      if (k === 'drum') { previewDrum({ k: 'kick', v: .8 }); setTimeout(() => previewDrum({ k: 'snare', v: .7 }), 180); return; }
      const ns = proj.notes[k].filter(x => k !== 'lead' || x.l === 'main');
      preview(k, ns.length ? ns[Math.floor(ns.length / 2)].n : (k === 'bass' ? 40 : 72), .75);
    }, 140);
  }
  function reschedule() {
    if (!audio.ready) return;
    const t = E.TR();
    t.cancel(0);
    t.timeSignature = proj.beats;
    t.loop = true; t.loopStart = 0; t.loopEnd = proj.bars + 'm';
    P.schedule(t, audio.rig, proj);
  }
  function playheadT() {
    if (!audio.ready) return cursorT;
    const t = E.TR();
    return mod(t.ticks / (t.PPQ / 2));
  }
  async function togglePlay() {
    if (!(await ensureAudio())) return;
    const t = E.TR();
    if (audio.playing) { t.pause(); audio.playing = false; scrollX = mod(scrollX / zoomX) * zoomX; clampScroll(); }
    else {
      t.start(); audio.playing = true; tick();
    }
    syncPlay(); draw();
  }
  /* 先頭に戻る（再生中ならそのまま頭から鳴らし続ける） */
  function stop() {
    cursorT = 0; scrollX = 0; page = 0;
    if (audio.ready) E.TR().ticks = 0;
    clampScroll(); syncPage(); draw();
  }
  function seek(t8) {
    cursorT = clamp(mod(t8), 0, end() - .001);
    if (audio.ready) E.TR().ticks = Math.round(cursorT * E.TR().PPQ / 2);
    draw();
  }
  function tick() {
    if (!audio.playing) return;
    const ph = playheadT();
    if (isDrum()) {
      if (follow && !drag) {
        const p = Math.floor(ph / pageLen());
        if (p !== page) { page = p; syncPage(); }
      }
    } else if (follow) {
      // 再生位置を左寄りに止めて、譜面を流す。周回が変わっても scrollX は連続させる
      const want = ph * zoomX - ANCHOR * (viewW() - gutter());
      const lap = end() * zoomX;
      scrollX = want + Math.round((scrollX - want) / lap) * lap;
    } else if (!drag) {
      const x = X(ph);
      if (x > viewW() - 30 || x < gutter()) { scrollX += x - gutter() - 40; clampScroll(); }
    }
    paint();
    requestAnimationFrame(tick);
  }
  function setFollow(on) {
    follow = on; setPref('follow', on);
    $('btnFollow').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!on) { scrollX = mod(scrollX / zoomX) * zoomX; clampScroll(); }
    draw();
  }
  function preview(track, n, v) {
    if (!audio.ready) { ensureAudio(); return; }
    const r = audio.rig;
    try {
      if (track === 'lead') r.lead.triggerAttackRelease(E.midiName(n), '8n', undefined, v ?? .7);
      else if (track === 'chord') r.chords.triggerAttackRelease(E.midiName(n), '8n', undefined, v ?? .6);
      else if (track === 'bass') r.bass.triggerAttackRelease(E.midiName(n), '8n', undefined, v ?? .7);
    } catch (e) { }
  }
  function previewDrum(h) {
    if (!audio.ready) { ensureAudio(); return; }
    // scheduleAll の一発ぶんだけを、いまの時刻で鳴らす
    const Tn = E.getTone(), now = Tn.now() + .01, r = audio.rig, v = h.v ?? .7;
    try {
      switch (h.k) {
        case 'kick': r.kick.triggerAttackRelease('C1', '8n', now, v); break;
        case 'shaker': r.shaker.triggerAttackRelease('32n', now, v); break;
        case 'rim': r.rim.triggerAttackRelease('32n', now, v); break;
        case 'clap': r.clap.triggerAttackRelease('16n', now, v); break;
        case 'hat': r.hat.triggerAttackRelease('64n', now, v); break;
        case 'snare': r.snare.triggerAttackRelease('16n', now, v); r.snBody.triggerAttackRelease('G3', '32n', now, v); break;
        case 'ohat': r.ohat.triggerAttackRelease('8n', now, v); break;
        case 'crash': r.crash.triggerAttackRelease('2n', now, v); break;
        case 'tom': r.tom.triggerAttackRelease(E.TOM_PITCH[h.g] || 'C3', '8n', now, v); break;
        case 'perc': r.perc.triggerAttackRelease(E.PERC_PITCH[h.g] || 'D4', '16n', now, v); break;
        case 'boom': r.boom.triggerAttackRelease('G1', '2n', now, v); break;
        case 'ride': r.ride.triggerAttackRelease('4n', now, v); break;
        case 'tamb': r.tamb.triggerAttackRelease('16n', now, v); break;
        case 'cowbell': r.cbA.triggerAttackRelease('C#5', '16n', now, v); r.cbB.triggerAttackRelease('G#5', '16n', now, v); break;
        case 'block': r.block.triggerAttackRelease('A5', '32n', now, v); break;
      }
    } catch (e) { }
  }

  /* ---------------- drawing ---------------- */
  function rr(x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, h / 2, w / 2));
    cx.beginPath();
    cx.moveTo(x + rad, y); cx.arcTo(x + w, y, x + w, y + h, rad); cx.arcTo(x + w, y + h, x, y + h, rad);
    cx.arcTo(x, y + h, x, y, rad); cx.arcTo(x, y, x + w, y, rad); cx.closePath();
  }
  function clipRect(x, y, w, h) { cx.save(); cx.beginPath(); cx.rect(x, y, w, h); cx.clip(); }
  function scalePcs() {
    const Pr = E.PRESETS[proj.st.preset];
    return new Set((Pr.minor ? MINOR : MAJOR).map(i => (i + Pr.tonic + proj.st.key) % 12));
  }
  function fit() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clampScroll(); draw();
  }
  let drawPending = 0;
  function draw() {
    if (drawPending || audio.playing) return;   // 再生中は tick が毎フレーム描く
    drawPending = requestAnimationFrame(() => { drawPending = 0; paint(); });
  }
  /* 強さのレーンで扱うノート */
  function laneTargets() {
    if (sel.size) return { list: [...sel], label: '選択中' };
    if (isDrum() && focusRow !== null)
      return { list: proj.notes.drum.filter(d => P.drumRowOf(d) === focusRow), label: DRUM_ROWS[focusRow].label };
    return { list: proj.notes[cur], label: isDrum() ? 'ぜんぶ' : TRACK_INFO[cur].name };
  }
  // レーンの棒の位置（ドラムはステップのまん中）
  const laneX = x => X(x.t) + (isDrum() ? zx() * grid() / 2 : 1);

  function paint() {
    if (!proj) return;
    const W = viewW(), H = viewH(), G = gutter(), bottom = areaBottom(), lt = laneTop();
    const on = P.audible(proj), ph = playheadT();
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = C.bg; cx.fillRect(0, 0, W, H);

    if (isDrum()) paintSteps(on, ph);
    else paintRoll(on);

    // 強さのレーン
    cx.fillStyle = '#0e0e0e'; cx.fillRect(0, lt, W, LANE);
    cx.fillStyle = '#262626'; cx.fillRect(0, lt, W, 1);
    const LT = laneTargets(), tset = new Set(LT.list), col = TRACK_INFO[cur].color;
    clipRect(G, lt + 1, W - G, LANE - 1);
    eachLap(() => paintGrid(lt + 1, H));
    const lh = LANE - 12;
    eachLap(() => {
      for (const x of LT.list.length < proj.notes[cur].length && !isDrum() ? proj.notes[cur] : LT.list) {
        const px = laneX(x);
        if (px < G - 4 || px > W + 4) continue;
        const target = tset.has(x), h = Math.max(2, x.v * lh);
        cx.globalAlpha = target ? 1 : .18;
        cx.fillStyle = sel.has(x) ? '#fff' : col;
        cx.fillRect(Math.round(px) - 1, H - 5 - h, 2, h);
        if (target) { cx.beginPath(); cx.arc(Math.round(px), H - 5 - h, 2.4, 0, Math.PI * 2); cx.fill(); }
      }
    });
    cx.globalAlpha = 1; cx.restore();
    cx.fillStyle = '#171717'; cx.fillRect(0, lt + 1, G, LANE - 1);
    cx.font = '600 10px ui-sans-serif, system-ui, sans-serif'; cx.textBaseline = 'top';
    cx.fillStyle = C.text; cx.fillText('強さ', 8, lt + 9);
    cx.fillStyle = '#6d6a60'; cx.fillText(LT.label, 8, lt + 24);

    // 再生位置（ピアノロール。追尾中は何周目でも同じ場所に出るよう、いちばん近い周回で描く）
    if (!isDrum()) {
      wrapOff = smooth() ? lapAt(G + ANCHOR * (W - G)) : 0;
      const px = X(ph);
      wrapOff = 0;
      if (px >= G - 1 && px <= W) {
        cx.fillStyle = C.red; cx.globalAlpha = .55; cx.fillRect(px - .75, RULER, 1.5, H - RULER); cx.globalAlpha = 1;
        cx.beginPath(); cx.arc(px, RULER - 7, 4.5, 0, Math.PI * 2); cx.fill();
      }
    }

    paintBrush();

    // 縦スクロールのしるし
    const ch = contentH(), vh = bottom - RULER;
    if (ch > vh) {
      const h = Math.max(24, vh * vh / ch), y = RULER + (vh - h) * (scrollY / Math.max(1, ch - vh));
      cx.fillStyle = 'rgba(233,230,220,.16)'; rr(W - 4, y, 3, h, 1.5); cx.fill();
    }

    // いまの和音と小節
    const bar = Math.floor(ph / epb());
    $('chordName').textContent = E.chordLabel(proj.chords[bar % proj.bars], proj.st.key, E.PRESETS[proj.st.preset].tonic);
    $('barCount').textContent = (bar + 1) + ' / ' + proj.bars;
  }

  /* ---- ピアノロール ---- */
  function paintRoll(on) {
    const W = viewW(), H = viewH(), G = gutter(), bottom = areaBottom();
    clipRect(G, RULER, W - G, bottom - RULER);
    const sc = scalePcs();
    for (let n = PMIN; n <= PMAX; n++) {
      const y = Yp(n);
      if (y > bottom || y + rowH < RULER) continue;
      cx.fillStyle = sc.has(n % 12) ? C.rowScale : C.row;
      cx.fillRect(G, y, W - G, rowH);
      if (n % 12 === 0) { cx.fillStyle = '#202020'; cx.fillRect(G, y + rowH - 1, W - G, 1); }
    }
    eachLap(() => paintGrid(RULER, bottom));
    eachLap(() => {
      for (const k of PITCHED) if (k !== cur) paintPitched(k, on[k] ? .42 : .14);
      paintPitched(cur, on[cur] ? 1 : .35);
    });
    cx.restore();

    // ドラムのしるし
    cx.fillStyle = '#101010'; cx.fillRect(G, bottom, W - G, DSTRIP);
    clipRect(G, bottom, W - G, DSTRIP);
    cx.fillStyle = '#5a5850'; cx.globalAlpha = on.drum ? 1 : .35;
    eachLap(() => {
      for (const h of proj.notes.drum) {
        const x = X(h.t);
        if (x < G - 4 || x > W + 4) continue;
        const low = h.k === 'kick' || h.k === 'boom', hi = h.k === 'hat' || h.k === 'shaker';
        cx.beginPath(); cx.arc(x, bottom + DSTRIP / 2 + (low ? 2 : hi ? -3 : 0), low ? 2.2 : 1.5, 0, Math.PI * 2); cx.fill();
      }
    });
    cx.restore(); cx.globalAlpha = 1;

    // 範囲選択
    if (drag && drag.mode === 'band') {
      const x0 = Math.min(drag.x0, drag.x), y0 = Math.min(drag.y0, drag.y);
      cx.fillStyle = C.band; cx.fillRect(x0, y0, Math.abs(drag.x - drag.x0), Math.abs(drag.y - drag.y0));
      cx.strokeStyle = 'rgba(233,230,220,.5)'; cx.strokeRect(x0 + .5, y0 + .5, Math.abs(drag.x - drag.x0), Math.abs(drag.y - drag.y0));
    }

    // 定規（小節番号と和音）
    cx.fillStyle = C.ruler; cx.fillRect(0, 0, W, RULER);
    cx.fillStyle = '#262626'; cx.fillRect(0, RULER - 1, W, 1);
    clipRect(G, 0, W - G, RULER);
    const barW = zoomX * epb(), step = barW < 34 ? 4 : barW < 60 ? 2 : 1;
    const tonic = E.PRESETS[proj.st.preset].tonic;
    cx.font = '600 10px ui-sans-serif, system-ui, sans-serif'; cx.textBaseline = 'middle';
    eachLap(() => {
      for (let b = 0; b < proj.bars; b++) {
        const x = X(b * epb());
        if (x > W || x + barW < G) continue;
        if (b === 0 && wrapOff !== 0) { cx.fillStyle = '#3a3a3a'; cx.fillRect(x, 3, 2, RULER - 6); }
        if (b % step === 0) { cx.fillStyle = b % 4 === 0 ? C.textHi : C.text; cx.fillText(String(b + 1), x + 5, RULER / 2); }
        if (barW >= 64) { cx.fillStyle = '#7f7b6c'; cx.fillText(E.chordLabel(proj.chords[b], proj.st.key, tonic), x + 23, RULER / 2); }
      }
    });
    cx.restore();

    // 左の鍵盤
    cx.fillStyle = '#171717'; cx.fillRect(0, RULER, G, bottom - RULER);
    clipRect(0, RULER, G, bottom - RULER);
    for (let n = PMIN; n <= PMAX; n++) {
      const y = Yp(n);
      if (y > bottom || y + rowH < RULER) continue;
      cx.fillStyle = BLACK.has(n % 12) ? C.keyBlack : C.key;
      cx.fillRect(0, y, G - 2, rowH - (rowH > 5 ? 1 : 0));
      if (n % 12 === 0 && rowH >= 6) { cx.fillStyle = C.text; cx.fillText(E.midiName(n), 6, y + rowH / 2); }
    }
    cx.restore();
    cx.fillStyle = '#171717'; cx.fillRect(0, 0, G, RULER);
    cx.fillStyle = '#101010'; cx.fillRect(0, bottom, G, DSTRIP);
    if (smooth()) { cx.fillStyle = C.red; cx.font = '700 9px ui-sans-serif, system-ui, sans-serif'; cx.fillText('追尾', 9, RULER / 2); }

    // 横スクロールのしるし
    const cw = end() * zoomX, vw = W - G;
    if (cw > vw && !smooth()) {
      const w = Math.max(30, vw * vw / cw), x = G + (vw - w) * (scrollX / Math.max(1, cw - vw + 40));
      cx.fillStyle = 'rgba(233,230,220,.16)'; rr(x, laneTop() - DSTRIP - 5, w, 3, 1.5); cx.fill();
    }
    void H;
  }
  function paintGrid(top, bot) {
    const W = viewW(), G = gutter(), z = zx();
    const t0 = Math.max(0, T(G)), t1 = Math.min(end(), T(W));
    const g = grid(), sub = z * g >= 7 ? g : (z >= 5 ? 1 : 2);
    for (let t = Math.floor(t0 / sub) * sub; t <= t1; t += sub) {
      const x = Math.round(X(t)) + .5;
      const isBar = Math.abs(t / epb() - Math.round(t / epb())) < 1e-6;
      const isBeat = Math.abs(t / 2 - Math.round(t / 2)) < 1e-6;
      cx.fillStyle = isBar ? C.bar : isBeat ? C.beat : C.sub;
      cx.fillRect(x - .5, top, 1, bot - top);
    }
    const xe = X(end());
    if (xe > G && xe < W) { cx.fillStyle = '#3a3a3a'; cx.fillRect(xe, top, 2, bot - top); }
  }
  function paintPitched(k, alpha) {
    const col = TRACK_INFO[k].color, W = viewW(), G = gutter();
    const h = Math.max(3, rowH - 2), mine = k === cur;
    for (const x of proj.notes[k]) {
      const x0 = X(x.t), x1 = X(x.t + x.d);
      if (x1 < G || x0 > W) continue;
      const y = Yp(x.n);
      if (y > viewH() || y + rowH < RULER) continue;
      const isSel = mine && sel.has(x);
      const layerA = k === 'lead' && x.l !== 'main' ? .62 : 1;
      cx.globalAlpha = alpha * layerA * (mine ? (.55 + .45 * x.v) : 1);
      cx.fillStyle = !isSel ? col : k === 'lead' ? '#ffd9d5' : k === 'chord' ? '#d8d0ff' : '#c9f5e3';
      // ノートは角を丸めない四角
      cx.beginPath(); cx.rect(x0 + .5, y + (rowH - h) / 2, Math.max(3, x1 - x0 - 1.5), h); cx.fill();
      if (isSel) { cx.globalAlpha = 1; cx.strokeStyle = '#fff'; cx.lineWidth = 1; cx.stroke(); }
    }
    cx.globalAlpha = 1;
  }

  /* ---- ステップシーケンサー ---- */
  /* ページの中のドラムを「行 × ステップ」のマスに振り分ける */
  function stepCells() {
    const st = grid(), p0 = pageStart(), p1 = Math.min(end(), p0 + pageLen());
    const cells = new Map();
    for (const h of proj.notes.drum) {
      if (h.t < p0 - 1e-6 || h.t >= p1) continue;
      const s = Math.floor((h.t - p0) / st + 1e-6), id = P.drumRowOf(h) * 1000 + s;
      if (!cells.has(id)) cells.set(id, []);
      cells.get(id).push(h);
    }
    return cells;
  }
  function paintSteps(on, ph) {
    const W = viewW(), H = viewH(), G = gutter(), bottom = areaBottom();
    const st = grid(), p0 = pageStart(), z = zx(), cw = st * z;
    const nSteps = Math.round(Math.min(pageLen(), end() - p0) / st);
    const playing = audio.playing && ph >= p0 && ph < p0 + pageLen() ? Math.floor((ph - p0) / st) : -1;
    const cells = stepCells(), dh = drow(), gap = cw > 14 ? 3 : 1.5;
    const beatSteps = Math.max(1, Math.round(2 / st));   // 1拍が何ステップか

    clipRect(G, RULER, W - G, bottom - RULER);
    // 再生中の列
    if (playing >= 0) { cx.fillStyle = 'rgba(236,74,62,.10)'; cx.fillRect(X(p0 + playing * st), RULER, cw, bottom - RULER); }
    visRows.forEach((ri, vi) => {
      const y = Yd(vi);
      if (y > bottom || y + dh < RULER) return;
      if (ri === focusRow) { cx.fillStyle = 'rgba(201,195,166,.06)'; cx.fillRect(G, y, W - G, dh); }
      for (let s = 0; s < nSteps; s++) {
        const x = X(p0 + s * st) + gap / 2, w = cw - gap, yy = y + gap / 2, hh = dh - gap;
        const list = cells.get(ri * 1000 + s);
        const beat = Math.floor(s / beatSteps);
        cx.globalAlpha = 1;
        cx.fillStyle = beat % 2 ? C.padB : C.padA;
        rr(x, yy, w, hh, 3); cx.fill();
        if (!list) continue;
        const v = Math.max(...list.map(h => h.v));
        const live = on.drum ? 1 : .4;
        // 点いたマス：うすく全体＋強さぶんだけ下から濃く
        cx.globalAlpha = .32 * live; cx.fillStyle = C.lit; rr(x, yy, w, hh, 3); cx.fill();
        cx.globalAlpha = live; const fh = Math.max(4, hh * v);
        rr(x, yy + hh - fh, w, fh, 3); cx.fill();
        if (s === playing) { cx.globalAlpha = 1; cx.strokeStyle = '#fff'; cx.lineWidth = 1.5; rr(x, yy, w, hh, 3); cx.stroke(); }
        // マスの頭からずれている音（ノリ・ハネ）と、1マスに2つ以上ある音のしるし
        cx.globalAlpha = 1; cx.fillStyle = '#121212';
        const off = list.filter(h => Math.abs(h.t - (p0 + s * st)) > .02);
        if (off.length) { cx.beginPath(); cx.arc(x + w - 5, yy + 5, 1.8, 0, Math.PI * 2); cx.fill(); }
        if (list.length > 1 && w > 14) { cx.beginPath(); cx.arc(x + 5, yy + 5, 1.8, 0, Math.PI * 2); cx.arc(x + 10, yy + 5, 1.8, 0, Math.PI * 2); cx.fill(); }
      }
    });
    cx.globalAlpha = 1;
    // 小節の区切り
    for (let b = 1; b < pageBars; b++) {
      const x = X(p0 + b * epb()) - 1;
      cx.fillStyle = '#4a4a40'; cx.fillRect(x, RULER + 2, 2, bottom - RULER - 4);
    }
    cx.restore();

    // 上：小節の一覧（いまのページ・再生中の小節・打数）
    cx.fillStyle = C.ruler; cx.fillRect(0, 0, W, RULER);
    const n = proj.bars, bw = (W - G - 8) / n, perBar = new Array(n).fill(0);
    for (const h of proj.notes.drum) perBar[Math.min(n - 1, Math.floor(h.t / epb()))]++;
    const mx = Math.max(1, ...perBar), pb = Math.floor(ph / epb());
    cx.font = '600 9px ui-sans-serif, system-ui, sans-serif'; cx.textBaseline = 'middle';
    for (let b = 0; b < n; b++) {
      const x = G + b * bw, inPage = Math.floor(b / pageBars) === page;
      cx.fillStyle = inPage ? '#4d4b3c' : '#1f1f1f';
      rr(x + 1, 4, bw - 2, RULER - 8, 2); cx.fill();
      cx.fillStyle = inPage ? C.lit : '#5d5a50'; cx.globalAlpha = .25 + .75 * perBar[b] / mx;
      cx.fillRect(x + 3, RULER - 7, Math.max(1, bw - 6), 2); cx.globalAlpha = 1;
      if (bw >= 16 && (b % (bw >= 26 ? 1 : 4) === 0)) { cx.fillStyle = inPage ? C.textHi : C.text; cx.fillText(String(b + 1), x + 4, RULER / 2 - 2); }
      if (audio.playing && b === pb) { cx.fillStyle = C.red; cx.fillRect(x + 1, RULER - 3, bw - 2, 2); }
    }
    cx.fillStyle = '#262626'; cx.fillRect(0, RULER - 1, W, 1);

    // 左：行の名前
    cx.fillStyle = '#171717'; cx.fillRect(0, RULER, G, bottom - RULER);
    clipRect(0, RULER, G, bottom - RULER);
    const used = new Set(proj.notes.drum.map(P.drumRowOf));
    cx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; cx.textBaseline = 'middle';
    visRows.forEach((ri, vi) => {
      const y = Yd(vi);
      if (y > bottom || y + dh < RULER) return;
      const f = ri === focusRow;
      cx.fillStyle = f ? '#33322a' : '#1b1b1b'; rr(4, y + 1.5, G - 10, dh - 3, 4); cx.fill();
      if (f) { cx.fillStyle = C.lit; cx.fillRect(4, y + 4, 2, dh - 8); }
      cx.fillStyle = f ? C.textHi : used.has(ri) ? C.text : '#56544c';
      cx.fillText(DRUM_ROWS[ri].label, 12, y + dh / 2);
    });
    cx.restore();
    cx.fillStyle = '#171717'; cx.fillRect(0, 0, G, RULER);
    cx.font = '700 9px ui-sans-serif, system-ui, sans-serif'; cx.textBaseline = 'middle';
    cx.fillStyle = following() ? C.red : C.text; cx.fillText(following() ? '追尾' : '小節', 9, RULER / 2);
    void H;
  }

  /* ---------------- hit testing（ピアノロール） ---------------- */
  function hitNote(px, py) {
    const n = Np(py), list = proj.notes[cur];
    for (let i = list.length - 1; i >= 0; i--) {
      const x = list[i];
      if (x.n !== n) continue;
      const x0 = X(x.t), x1 = X(x.t + x.d);
      if (px >= x0 - 1 && px <= x1 + 1) return { note: x, edge: x1 - x0 > 12 && px > x1 - 7 };
    }
    return null;
  }
  /* ステップのマス（ドラム） */
  function cellAt(px, py) {
    const ri = rowAt(py), st = grid();
    const s = Math.floor((T(px) - pageStart()) / st + 1e-6), t = pageStart() + s * st;
    if (ri < 0 || s < 0 || t >= Math.min(end(), pageStart() + pageLen()) - 1e-6) return null;
    const hits = proj.notes.drum.filter(h => P.drumRowOf(h) === ri && h.t >= t - 1e-6 && h.t < t + st - 1e-6);
    return { ri, s, t, hits };
  }

  /* ---------------- pointer ---------------- */
  let drag = null, lastDown = { key: null, at: 0 };
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const isDouble = key => {
    const now = performance.now(), d = lastDown.key === key && now - lastDown.at < 320;
    lastDown = { key, at: now };
    return d;
  };

  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (!proj) return;
    const [px, py] = pos(e);
    cv.setPointerCapture(e.pointerId);
    wrapOff = lapAt(px);
    const touch = e.pointerType === 'touch';
    const base = { id: e.pointerId, x0: px, y0: py, x: px, y: py, moved: false, touch, sx: scrollX, sy: scrollY, lap: wrapOff };

    // 強さのレーン
    if (py >= laneTop()) {
      if (px < gutter()) { drag = Object.assign(base, { mode: 'none' }); return; }
      drag = Object.assign(base, { mode: 'vel', snap: snap(), lx: px });
      velPaint(px, py, px);
      return;
    }
    // ブラシ：ノートの欄を塗る
    if (tool !== 'edit' && e.button === 0 && py >= RULER && py < areaBottom() && px >= gutter()) {
      drag = Object.assign(base, { mode: 'brush', stroke: { tool, alt: e.altKey, lap: wrapOff, drum: isDrum(), pts: [] } });
      brushMove(px, py);
      return;
    }
    if (isDrum()) { downSteps(e, px, py, base); return; }

    if (py < RULER) { drag = Object.assign(base, { mode: 'seek' }); seek(T(px)); return; }
    if (px < gutter()) { preview(cur, Np(py)); drag = Object.assign(base, { mode: 'none' }); return; }
    if (py > areaBottom()) { drag = Object.assign(base, { mode: 'pan' }); return; }

    const hit = hitNote(px, py);
    const t = T(px);
    cursorT = clamp(snapFloor(t), 0, end() - grid());

    // 右ボタン・⌥ は消しゴム（なぞった音をどんどん消す）
    if (e.button === 2 || e.altKey) {
      drag = Object.assign(base, { mode: 'erase', snap: snap(), n: 0 });
      eraseAt(px, py);
      return;
    }
    if (hit) {
      if (isDouble(hit.note)) { edit(() => removeNotes([hit.note])); drag = Object.assign(base, { mode: 'none' }); return; }
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (sel.has(hit.note)) sel.delete(hit.note); else sel.add(hit.note);
      } else if (!sel.has(hit.note)) { sel.clear(); sel.add(hit.note); }
      const orig = new Map();
      for (const x of sel) orig.set(x, Object.assign({}, x));
      drag = Object.assign(base, { mode: hit.edge ? 'resize' : 'move', note: hit.note, orig, snap: snap(), t0: t });
      preview(cur, hit.note.n, hit.note.v);
      syncSel(); draw();
      return;
    }
    if (touch && !e.shiftKey) { drag = Object.assign(base, { mode: 'pan', tapCreate: true }); return; }
    if (e.shiftKey) { drag = Object.assign(base, { mode: 'band', keep: new Set(sel) }); return; }
    const created = createAt(px, py);
    drag = Object.assign(base, created ? { mode: 'grow', note: created } : { mode: 'none' });
  });

  /* ドラム：マスを押す。点いていれば消す（縦にドラッグで強さ、横になぞると消していく）。
     空いていれば点ける（横になぞると点けていく。⇧ で強く） */
  function downSteps(e, px, py, base) {
    if (py < RULER) {
      const b = Math.floor((px - gutter()) / ((viewW() - gutter() - 8) / proj.bars));
      if (b >= 0 && b < proj.bars) {
        if (isDouble('bar' + b)) seek(b * epb());
        setPage(Math.floor(b / pageBars));
      }
      drag = Object.assign(base, { mode: 'pages' });
      return;
    }
    if (px < gutter()) {
      const ri = rowAt(py);
      if (ri >= 0) {
        previewDrum({ k: DRUM_ROWS[ri].k, g: DRUM_ROWS[ri].g, v: .8 });
        focusRow = focusRow === ri ? null : ri;
        draw();
      }
      drag = Object.assign(base, { mode: 'none' });
      return;
    }
    const c = cellAt(px, py);
    if (!c) { drag = Object.assign(base, { mode: 'none' }); return; }
    focusRow = c.ri;
    if (e.button === 2 || e.altKey) {
      drag = Object.assign(base, { mode: 'stepErase', snap: snap(), ri: c.ri, n: 0 });
      stepErase(c);
      return;
    }
    if (c.hits.length) {
      previewDrum(c.hits[0]);
      drag = Object.assign(base, { mode: 'stepHit', snap: snap(), cell: c, v0: Math.max(...c.hits.map(h => h.v)), axis: null });
      draw();
      return;
    }
    if (base.touch) { drag = Object.assign(base, { mode: 'stepTouch', cell: c, accent: e.shiftKey }); return; }
    pushUndo();
    stepAdd(c, e.shiftKey);
    drag = Object.assign(base, { mode: 'stepPaint', ri: c.ri, lastS: c.s, accent: e.shiftKey });
  }
  function stepAdd(c, accent) {
    const r = DRUM_ROWS[c.ri], h = { t: Math.round(c.t * 10000) / 10000, k: r.k, v: accent ? 1 : .75 };
    if (r.g !== undefined) h.g = r.g;
    proj.notes.drum.push(h);
    previewDrum(h);
    changed();
  }
  function stepErase(c) {
    if (!c || !c.hits.length) return;
    if (drag.snap) { pushUndo(drag.snap); drag.snap = null; }
    const s = new Set(c.hits);
    proj.notes.drum = proj.notes.drum.filter(h => !s.has(h));
    drag.n += c.hits.length;
    changed();
  }
  /* 横になぞったとき、前のマスから今のマスまでを順に処理する（速く動かしても抜けないように） */
  function sweepRow(lastS, s, ri, fn) {
    const dir = s > lastS ? 1 : -1;
    for (let i = lastS + dir; dir > 0 ? i <= s : i >= s; i += dir) {
      const t = pageStart() + i * grid();
      if (i < 0 || t >= Math.min(end(), pageStart() + pageLen()) - 1e-6) continue;
      fn({ ri, s: i, t, hits: proj.notes.drum.filter(h => P.drumRowOf(h) === ri && h.t >= t - 1e-6 && h.t < t + grid() - 1e-6) });
    }
  }
  function moveSteps(px, py) {
    const st = grid(), s = Math.floor((T(px) - pageStart()) / st + 1e-6);
    switch (drag.mode) {
      case 'pages': {
        const b = Math.floor((px - gutter()) / ((viewW() - gutter() - 8) / proj.bars));
        if (b >= 0 && b < proj.bars) setPage(Math.floor(b / pageBars));
        break;
      }
      case 'stepPaint':
        if (s !== drag.lastS) { sweepRow(drag.lastS, s, drag.ri, c => { if (!c.hits.length) stepAdd(c, drag.accent); }); drag.lastS = s; }
        break;
      case 'stepErase': {
        const c = cellAt(px, drag.y0);
        if (c) stepErase(c);
        break;
      }
      case 'stepTouch': {
        // タッチ：縦に動かしたらスクロール、横ならなぞって点ける
        const dx = px - drag.x0, dy = py - drag.y0;
        if (Math.abs(dy) > Math.abs(dx)) { drag.mode = 'pan'; drag.tapCreate = false; }
        else { pushUndo(); stepAdd(drag.cell, drag.accent); drag.mode = 'stepPaint'; drag.ri = drag.cell.ri; drag.lastS = drag.cell.s; moveSteps(px, py); }
        break;
      }
      case 'stepHit': {
        if (!drag.axis) drag.axis = Math.abs(py - drag.y0) > Math.abs(px - drag.x0) ? 'v' : 'h';
        if (drag.axis === 'v') {
          if (drag.snap) { pushUndo(drag.snap); drag.snap = null; }
          const v = clamp(drag.v0 + (drag.y0 - py) / 110, .05, 1);
          for (const h of drag.cell.hits) h.v = Math.round(v * 100) / 100;
          $('status').textContent = '強さ ' + Math.round(v * 100);
          changed();
        } else {
          drag.mode = 'stepErase'; drag.ri = drag.cell.ri; drag.n = 0;
          stepErase(drag.cell);
          sweepRow(drag.cell.s, s, drag.cell.ri, c => stepErase(c));
          drag.lastS = s;
        }
        break;
      }
      case 'pan':
        scrollY = drag.sy - (py - drag.y0); clampScroll(); draw();
        break;
    }
  }

  function createAt(px, py) {
    const t = clamp(snapFloor(T(px)), 0, end() - grid());
    const n = Np(py);
    if (n < PMIN || n > PMAX) return null;
    pushUndo();
    const x = { t, d: Math.min(lastLen[cur], end() - t), n, v: cur === 'chord' ? .6 : .75 };
    if (cur === 'lead') x.l = 'main';
    proj.notes[cur].push(x);
    sel.clear(); sel.add(x);
    preview(cur, n, x.v);
    changed();
    return x;
  }
  function eraseAt(px, py) {
    const hit = hitNote(px, py);
    if (!hit) return;
    if (drag.snap) { pushUndo(drag.snap); drag.snap = null; }
    removeNotes([hit.note]); drag.n++;
    changed();
  }
  /* 強さのレーンをなぞる：前の位置から今の位置までにある音を、指の高さの強さにする */
  function velPaint(xa, py, xb) {
    const v = clamp((viewH() - 5 - py) / (LANE - 12), .03, 1);
    const lo = Math.min(xa, xb) - 3, hi = Math.max(xa, xb) + 3;
    let n = 0;
    for (const x of laneTargets().list) {
      const px = laneX(x);
      if (px >= lo && px <= hi) { x.v = Math.round(v * 100) / 100; n++; }
    }
    if (n) {
      if (drag && drag.snap) { pushUndo(drag.snap); drag.snap = null; }
      changed();
    }
    $('status').textContent = '強さ ' + Math.round(v * 100);
  }

  cv.addEventListener('pointermove', e => {
    const [px, py] = pos(e);
    if (!drag) { wrapOff = lapAt(px); hover(px, py); wrapOff = 0; return; }
    if (e.pointerId !== drag.id) return;
    wrapOff = drag.lap;
    try { onDragMove(px, py); } finally { wrapOff = 0; }
  });
  function onDragMove(px, py) {
    if (drag.mode === 'brush') { drag.moved = true; brushMove(px, py); return; }
    const dist = Math.hypot(px - drag.x0, py - drag.y0);
    if (!drag.moved && dist < 4 && !['vel', 'erase', 'stepErase', 'pages'].includes(drag.mode)) return;
    drag.moved = true; drag.x = px; drag.y = py;
    if (drag.mode === 'vel') { velPaint(drag.lx, py, px); drag.lx = px; return; }
    if (isDrum()) { moveSteps(px, py); return; }
    const g = grid();

    switch (drag.mode) {
      case 'seek': seek(T(px)); break;
      case 'erase': eraseAt(px, py); break;
      case 'pan':
        drag.tapCreate = false;
        if (!smooth()) scrollX = drag.sx - (px - drag.x0);
        scrollY = drag.sy - (py - drag.y0);
        clampScroll(); draw(); break;
      case 'move': {
        if (drag.snap) { pushUndo(drag.snap); drag.snap = null; }
        let dt = snapRound(T(px) - drag.t0);
        const os = [...drag.orig.values()];
        const minT = Math.min(...os.map(o => o.t)), maxT = Math.max(...os.map(o => o.t + o.d));
        dt = clamp(dt, -minT, end() - Math.max(maxT, minT + .001));
        let dn = Math.round((drag.y0 - py) / rowH);
        const ns = os.map(o => o.n);
        dn = clamp(dn, PMIN - Math.min(...ns), PMAX - Math.max(...ns));
        for (const [x, o] of drag.orig) { x.t = o.t + dt; x.n = o.n + dn; }
        if (drag.lastDn !== dn) { preview(cur, drag.note.n, drag.note.v); drag.lastDn = dn; }
        changed(); break;
      }
      case 'resize': {
        if (drag.snap) { pushUndo(drag.snap); drag.snap = null; }
        const dd = snapRound(T(px) - drag.t0);
        for (const [x, o] of drag.orig) x.d = clamp(o.d + dd, Math.min(g, o.d), end() - x.t);
        lastLen[cur] = drag.note.d;
        changed(); break;
      }
      case 'grow': {
        const x = drag.note;
        x.d = clamp(Math.ceil((T(px) - x.t) / g - 1e-6) * g, g, end() - x.t);
        lastLen[cur] = x.d;
        changed(); break;
      }
      case 'band': {
        const tA = T(Math.min(drag.x0, px)), tB = T(Math.max(drag.x0, px));
        const yA = Math.min(drag.y0, py), yB = Math.max(drag.y0, py);
        sel = new Set(drag.keep);
        for (const x of proj.notes[cur]) {
          const y = Yp(x.n) + rowH / 2;
          if (x.t + x.d >= tA && x.t <= tB && y >= yA && y <= yB) sel.add(x);
        }
        syncSel(); draw(); break;
      }
    }
  }
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (d.mode === 'brush') { applyBrush(d.stroke); draw(); return; }
    wrapOff = d.lap;
    // タッチは空いた所をなぞるとスクロール、トンと触ると音を置く（選択中なら選択を外す）
    if (d.mode === 'pan' && d.tapCreate && !d.moved) {
      if (sel.size) { sel.clear(); syncSel(); } else createAt(d.x0, d.y0);
    }
    if (d.mode === 'stepTouch' && !d.moved) { pushUndo(); stepAdd(d.cell, d.accent); }
    // 点いたマスを押して離しただけ → 消す
    if (d.mode === 'stepHit' && !d.moved) {
      pushUndo();
      const s = new Set(d.cell.hits);
      proj.notes.drum = proj.notes.drum.filter(h => !s.has(h));
      changed();
    }
    wrapOff = 0;
    if ((d.mode === 'erase' || d.mode === 'stepErase') && d.n) setStatus(d.n + '個けした');
    if (d.mode === 'vel' || (d.mode === 'stepHit' && d.axis === 'v')) setStatus('');
    if ((d.mode === 'move' || d.mode === 'resize') && d.moved)
      for (const x of proj.notes[cur]) x.t = Math.round(x.t * 10000) / 10000;
    draw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  function hover(px, py) {
    const inArea = py >= RULER && py < areaBottom() && px >= gutter();
    if (tool !== 'edit') { hoverPt = inArea ? [px, py] : null; cv.style.cursor = inArea ? 'none' : 'pointer'; draw(); if (inArea) return; }
    if (py < RULER || px < gutter()) { cv.style.cursor = 'pointer'; return; }
    if (py >= laneTop()) { cv.style.cursor = 'ns-resize'; return; }
    if (isDrum()) { const c = cellAt(px, py); cv.style.cursor = c && c.hits.length ? 'ns-resize' : 'pointer'; return; }
    const hit = hitNote(px, py);
    cv.style.cursor = hit ? (hit.edge ? 'ew-resize' : 'grab') : 'crosshair';
  }

  let wheelAcc = 0;
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const [px, py] = pos(e);
    if (isDrum()) {
      // 横のホイールでページ送り、縦は行のスクロール
      let dx = e.deltaX, dy = e.deltaY;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      wheelAcc += dx;
      if (Math.abs(wheelAcc) > 60) { setPage(page + Math.sign(wheelAcc)); wheelAcc = 0; if (following()) setFollow(false); }
      scrollY += dy; clampScroll(); draw();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const t = T(px);
      zoomX = clamp(zoomX * Math.exp(-e.deltaY * .01), 3, 96);
      if (!smooth()) scrollX = gutter() + t * zoomX - px;
    } else if (e.altKey) {
      const n = (py - RULER + scrollY) / rowH;
      rowH = clamp(rowH * Math.exp(-e.deltaY * .01), 3, 22);
      scrollY = n * rowH - (py - RULER);
    } else {
      let dx = e.deltaX, dy = e.deltaY;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      // 横に動かしたら追尾はやめる（自分で見たい所を見ているので）
      if (Math.abs(dx) > 2 && smooth()) setFollow(false);
      scrollX += dx; scrollY += dy;
    }
    clampScroll(); draw();
  }, { passive: false });

  new ResizeObserver(fit).observe(cv);

  /* ---------------- brushes ----------------
     塗った範囲（時間。メロディは縦の幅も音域の目安にする）に表現をかける。
     重ね塗りするほど強くなり（3段階）、⌥ を押しながら塗ると弱まる。
       メロディ変更 … その範囲のメロディを新しいタネで作り直す。塗った縦の幅に音域を寄せる
                      伴奏を選んでいるときは、和音のまま「てっぺんの音の流れ」だけを作り直す
       ドラマ       … 伴奏・ベースを、和音のつなぎと盛り上がりを強めて作り直す。強弱も大きく、
                      いちばん強いとメロディにオクターブ上を重ねる
       ハネ         … 裏の8分・16分を後ろにずらして跳ねさせる（全トラック）
     ※ ハネはいまは非表示（2026-10-07）。ずれが小さくてピアノロール・ステップ上で見た目がほとんど
       変わらず「効いてない？」と感じるため。処理は残してあるので、使うときは editor.astro の
       data-tool="hane" ボタンの hidden を外し、下の SHOWN_TOOLS に 'hane' を戻す */
  const TOOLS = ['edit', 'melody', 'drama', 'hane'];
  const SHOWN_TOOLS = ['edit', 'melody', 'drama'];      // B キーで回すブラシ
  const TOOL_INFO = {
    edit: { name: '編集', hint: '' },
    melody: { name: 'メロディ変更', hint: 'メロディ変更：変えたい所をざっくり塗って。塗った縦の幅がだいたいの音域になる。伴奏を選んでいれば、和音のままてっぺんの音だけ変わる' },
    drama: { name: 'ドラマ', hint: 'ドラマ：塗った所の伴奏とベースが盛り上がる。重ねて塗るほど強く、⌥ を押しながら塗ると落ち着く' },
    hane: { name: 'ハネ', hint: 'ハネ：塗った所が跳ねる。重ねて塗るほど強く、⌥ を押しながら塗るとまっすぐに戻る' },
  };
  const MAXLV = 3;
  const levels = { drama: new Map(), hane: new Map() };   // 拍ごとの強さ（0〜3）。この画面を開いている間だけ覚える
  const BRUSH = 'rgba(214,207,134,';
  function setTool(t) {
    tool = t;
    document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false'));
    if (t === 'melody' && (isDrum() || cur === 'bass')) setTrack('lead');
    if (t === 'edit') { hoverPt = null; cv.style.cursor = ''; }
    setStatus(TOOL_INFO[t].hint + (t !== 'edit' ? '（[ ] で太さ、V か Esc で編集に戻る）' : ''));
    draw();
  }
  function setBrushR(r) {
    brushR = clamp(r, 6, 48); setPref('brushR', brushR);
    $('brushSize').value = brushR; draw();
  }
  function brushMove(px, py) {
    const st = drag.stroke, last = st.pts[st.pts.length - 1];
    if (last && Math.hypot(px - last.px, py - last.py) < 2) return;
    const top = RULER, bot = areaBottom();
    st.pts.push({
      px, py, t: T(px),
      n: PMAX - (py - RULER + scrollY) / rowH + .5,             // 音程（ピアノロールで塗ったとき）
      e: clamp(1 - (py - top) / Math.max(1, bot - top), 0, 1),  // 画面の高さ（上=1）
    });
    hoverPt = [px, py];
    draw();
  }
  /* 線が通った升目（res は8分単位）と、升目ごとに塗った音程の範囲 */
  function cover(stroke, res) {
    const rT = brushR / zx(), rN = brushR / rowH, cells = new Set(), band = new Map(), n = end() / res;
    const mark = (t, pitch) => {
      for (let c = Math.floor((t - rT) / res); c <= Math.floor((t + rT) / res); c++) {
        const id = ((c % n) + n) % n;
        cells.add(id);
        const bd = band.get(id) || [1e9, -1e9];
        band.set(id, [Math.min(bd[0], pitch - rN), Math.max(bd[1], pitch + rN)]);
      }
    };
    const P_ = stroke.pts;
    if (P_.length === 1) mark(P_[0].t, P_[0].n);
    for (let i = 1; i < P_.length; i++) {
      const a = P_[i - 1], b = P_[i], k = Math.max(1, Math.ceil(Math.abs(b.t - a.t) / (res / 4)));
      for (let j = 0; j <= k; j++) { const f = j / k; mark(a.t + (b.t - a.t) * f, a.n + (b.n - a.n) * f); }
    }
    const cellOf = t => Math.floor(mod(t) / res + 1e-6) % n;
    return { cells, band, cellOf, inC: t => cells.has(cellOf(t)) };
  }
  const newSeed = () => (Math.random() * 9000000 | 0) + 1000;
  function buildWith(patch) {
    const st = Object.assign(JSON.parse(JSON.stringify(proj.st)), patch);
    st.sections = proj.bars / 16;
    st.mute = { lead: false, chord: false, bass: false, drum: false };
    return P.notesFromEvents(E.buildSong(st).events);
  }
  /* 塗った拍の強さを1段上げ下げして、上げ下げ前と後の強さ（0〜1）を返す */
  function bumpLevels(kind, cells, down) {
    const L = levels[kind];
    let before = 0, after = 0;
    for (const c of cells) {
      const v = L.get(c) || 0, nv = clamp(v + (down ? -1 : 1), 0, MAXLV);
      before = Math.max(before, v); after = Math.max(after, nv);
      L.set(c, nv);
    }
    return { before: before / MAXLV, after: after / MAXLV, prev: c => (L.get(c) || 0) };
  }
  function applyBrush(stroke) {
    fading.push({ stroke, at: performance.now() });
    fadeLoop();
    if (!stroke.pts.length) return;
    if (stroke.tool === 'melody') (cur === 'chord' ? brushChordTop : brushMelody)(stroke);
    else if (stroke.tool === 'drama') brushDrama(stroke);
    else brushHane(stroke);
  }
  const lvName = e => ['なし', '弱', '中', '強'][Math.round(e * MAXLV)];

  /* メロディ変更：新しいタネのメロディを持ってきて、塗った音域に寄せる */
  function brushMelody(stroke) {
    const { cells, band, cellOf, inC } = cover(stroke, 1);
    const old = proj.notes.lead.filter(x => inC(x.t));
    const oldMain = old.filter(x => x.l === 'main');
    // 塗る前の重ね方を覚える（曲調のオクターブ上・ハモリ・裏メロと、自分で積んだ和音）
    const empty = !old.length, M = proj.st.mel;
    const has = l => old.some(x => x.l === l) || (empty && M[{ oct: 'octUp', harm: 'harm', counter: 'counter' }[l]]);
    const layers = { oct: has('oct'), harm: has('harm'), counter: has('counter'), stack: stackShape(oldMain) };
    const before = new Set(oldMain.map(x => x.t)).size;
    const want = before || Math.max(1, Math.round(cells.size * .4));
    let best = null, bestAll = null, bd = 1e9;
    for (let i = 0; i < 8; i++) {
      const all = buildWith({ seed: newSeed(), mel: Object.assign({}, M, { counter: true }) }).lead;
      const cand = all.filter(x => x.l === 'main' && inC(x.t));
      const d = Math.abs(cand.length - want);
      if (d < bd) { bd = d; best = cand; bestAll = all; }
      if (!d) break;
    }
    const sc = scalePcs();
    const fit = x => {
      const [lo, hi] = band.get(cellOf(x.t)) || [PMIN, PMAX];
      let n = x.n;
      // まずオクターブで寄せる。音域がせまくて入らなければ、範囲の中の音階の音に
      while (n > hi && n - 12 >= PMIN) n -= 12;
      while (n < lo && n + 12 <= PMAX) n += 12;
      if (n > hi + 1 || n < lo - 1) {
        const mid = (lo + hi) / 2;
        let bestN = n, bdist = 1e9;
        for (let m = Math.ceil(lo); m <= Math.floor(hi); m++)
          if (sc.has(((m % 12) + 12) % 12) && Math.abs(m - mid) < bdist) { bdist = Math.abs(m - mid); bestN = m; }
        n = bestN;
      }
      return n;
    };
    pushUndo();
    proj.notes.lead = proj.notes.lead.filter(x => !inC(x.t));
    const added = best.map(x => Object.assign({}, x, { n: fit(x) }));
    proj.notes.lead.push(...added);
    // 新しい音が次の音にかぶらないように長さを詰める
    const main = proj.notes.lead.filter(x => x.l === 'main').sort((a, b) => a.t - b.t);
    for (const x of added) {
      const nx = main.find(y => y.t > x.t + 1e-6);
      if (nx) x.d = Math.max(.25, Math.min(x.d, nx.t - x.t));
    }
    // 覚えておいた重ね方を、新しい主旋律に付け直す
    const extra = [];
    for (const x of added) {
      if (layers.oct && x.n + 12 <= 103) extra.push({ t: x.t, d: x.d, n: x.n + 12, v: r2(x.v * .42), l: 'oct' });
      if (layers.harm) { const h = poolBelow(x.t, x.n, 2); if (h !== null) extra.push({ t: x.t, d: x.d, n: h, v: r2(x.v * .52), l: 'harm' }); }
      if (layers.stack) for (const off of layers.stack) {
        const h = poolNear(x.t, x.n - off, x.n);
        if (h !== null) extra.push({ t: x.t, d: x.d, n: h, v: r2(x.v * .85), l: 'main' });
      }
    }
    if (layers.counter) for (const x of bestAll) if (x.l === 'counter' && inC(x.t)) extra.push(Object.assign({}, x));
    proj.notes.lead.push(...extra);
    sel.clear();
    changed();
    const kept = [layers.oct && 'オクターブ上', layers.harm && 'ハモリ', layers.counter && '裏メロ', layers.stack && '和音'].filter(Boolean);
    setStatus('メロディを ' + Math.ceil(cells.size / 2) + ' 拍ぶん作り直した（' + added.length + '音' + (kept.length ? '・' + kept.join('と') + 'も付け直した' : '') + '）。気に入るまで何回でも塗ってみて');
  }

  const r2 = v => Math.round(v * 100) / 100;
  /* その位置でメロディが使える音（曲調の音階の決め方と同じ：コード音／決まった音階／3和音） */
  function poolPcs(t) {
    const Pr = E.PRESETS[proj.st.preset], key = proj.st.key;
    const ch = proj.chords[Math.floor(t / epb()) % proj.bars];
    if (E.SCALE_SET[proj.st.scale]) return new Set(E.SCALE_SET[proj.st.scale](Pr.minor).map(i => (i + Pr.tonic + key + 120) % 12));
    if (proj.st.scale === 'triad') return new Set(E.QUAL[ch[1]].slice(0, 3).map(i => (i + ch[0] + key) % 12));
    return new Set(E.chordPool(ch[0] + key, ch[1], 0, 127).map(n => n % 12));
  }
  /* n から下へ数えて steps 番目の、使える音（曲調のハモリと同じ「2つ下」） */
  function poolBelow(t, n, steps) {
    const pcs = poolPcs(t);
    for (let m = n - 1, k = 0; m >= PMIN; m--) if (pcs.has(m % 12) && ++k === steps) return m;
    return null;
  }
  /* 目標の高さにいちばん近い、使える音（top より下に限る） */
  function poolNear(t, target, top) {
    const pcs = poolPcs(t);
    for (let d = 0; d <= 3; d++) for (const m of [target - d, target + d])
      if (m < top && m >= PMIN && pcs.has(m % 12)) return m;
    return null;
  }
  /* 自分で積んだ和音の形：同じ瞬間に2音以上ある所で、いちばん多い「てっぺんから何半音下か」の組 */
  function stackShape(mains) {
    const at = new Map();
    for (const x of mains) { const k = Math.round(x.t * 1000); if (!at.has(k)) at.set(k, []); at.get(k).push(x.n); }
    const shapes = new Map();
    for (const ns of at.values()) {
      if (ns.length < 2) continue;
      ns.sort((a, b) => b - a);
      const key = ns.slice(1).map(n => ns[0] - n).join(',');
      shapes.set(key, (shapes.get(key) || 0) + 1);
    }
    if (!shapes.size) return null;
    // 和音になっている所が単音より少なければ、たまたま重なっただけとみなす
    const stacked = [...shapes.values()].reduce((a, b) => a + b, 0);
    if (stacked * 2 < at.size) return null;
    const top = [...shapes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return top.split(',').map(Number);
  }

  /* 伴奏のてっぺん：同じ瞬間に鳴る音のまとまり（和音）ごとに、てっぺんの音を選び直して積み直す。
     音の数と、使っている音の種類（響き）はそのまま */
  function brushChordTop(stroke) {
    const { band, cellOf, inC } = cover(stroke, 1);
    const stacks = new Map();
    for (const x of proj.notes.chord) if (inC(x.t)) {
      const id = Math.round(x.t * 1000);
      if (!stacks.has(id)) stacks.set(id, []);
      stacks.get(id).push(x);
    }
    const list = [...stacks.values()].sort((a, b) => a[0].t - b[0].t);
    if (!list.length) { setStatus('塗った所に伴奏の和音がなかった'); return; }
    pushUndo();
    let prevTop = null;
    for (const st of list) {
      st.sort((a, b) => b.n - a.n);
      const pcs = [...new Set(st.map(x => ((x.n % 12) + 12) % 12))];
      const [lo0, hi0] = band.get(cellOf(st[0].t)) || [st[0].n - 6, st[0].n + 6];
      // てっぺんの候補：和音の音で、塗った音域の中（せまければ少し広げる）
      let cand = [];
      for (let w = 0; w <= 12 && cand.length < 2; w += 3) {
        cand = [];
        for (let n = Math.ceil(lo0 - w); n <= Math.floor(hi0 + w); n++)
          if (n >= 52 && n <= 100 && pcs.includes(((n % 12) + 12) % 12)) cand.push(n);
      }
      if (!cand.length) continue;
      // 前のてっぺんから1〜2段ずつ動く（たまに同じ音、たまに跳ぶ）
      let i;
      if (prevTop === null) i = Math.floor(cand.length / 2 + (Math.random() - .5) * cand.length * .6);
      else {
        const near = cand.reduce((b, n, k) => Math.abs(n - prevTop) < Math.abs(cand[b] - prevTop) ? k : b, 0);
        const r = Math.random();
        const step = r < .2 ? 0 : r < .62 ? 1 : r < .9 ? 2 : 3;
        i = near + step * (Math.random() < .5 ? -1 : 1);
        if (i < 0) i = -i; if (i >= cand.length) i = 2 * (cand.length - 1) - i;
      }
      const top = cand[clamp(i, 0, cand.length - 1)];
      // てっぺんから下へ、元の和音の音を順に詰めて積む
      const topPc = ((top % 12) + 12) % 12;
      const rest = st.map(x => ((x.n % 12) + 12) % 12);
      rest.splice(rest.indexOf(topPc), 1);
      // てっぺんの下へ、すぐ下にある音から順に詰めて積む（密集した形になる）
      const below = (from, pc) => { let n = from - 1; while (((n % 12) + 12) % 12 !== pc) n--; return n; };
      const voiced = [top];
      let last = top;
      while (rest.length) {
        let k = 0;
        for (let j = 1; j < rest.length; j++) if (below(last, rest[j]) > below(last, rest[k])) k = j;
        last = below(last, rest[k]); voiced.push(last); rest.splice(k, 1);
      }
      // 低くなりすぎたら全体をオクターブ上げる（てっぺんが音域を出ない範囲で）
      while (voiced[voiced.length - 1] < 43 && voiced[0] + 12 <= 100) for (let k = 0; k < voiced.length; k++) voiced[k] += 12;
      st.forEach((x, k) => { x.n = voiced[k]; });
      prevTop = voiced[0];
    }
    sel.clear();
    changed();
    setStatus('伴奏の和音 ' + list.length + ' 個のてっぺんを作り直した（和音の数と響きはそのまま）。気に入るまで何回でも塗ってみて');
  }

  /* ドラマ：伴奏・ベースを作り直し、強弱を広げる。いちばん強いとメロディにオクターブ上 */
  function brushDrama(stroke) {
    const { cells, cellOf, inC } = cover(stroke, 2);
    const { before, after } = bumpLevels('drama', cells, stroke.alt);
    if (before === after && !stroke.alt && after === 1) { setStatus('ドラマはもう最大だよ（⌥ を押しながら塗ると落ち着く）'); return; }
    const e = after;
    const notes = buildWith({
      seed: newSeed(), drama: Math.round(100 * e), density: Math.round(25 + 70 * e),
      bassArr: Math.round(80 * e), arrange: 0,
    });
    pushUndo();
    const gain = (.8 + .4 * e) / (.8 + .4 * before);
    for (const k of ['chord', 'bass']) {
      proj.notes[k] = proj.notes[k].filter(x => !inC(x.t));
      for (const x of notes[k]) if (inC(x.t)) { x.v = Math.round(Math.min(1, x.v * (.8 + .4 * e)) * 100) / 100; proj.notes[k].push(x); }
    }
    for (const k of ['lead', 'drum']) for (const x of proj.notes[k]) if (inC(x.t)) x.v = Math.round(clamp(x.v * gain, .03, 1) * 100) / 100;
    // メロディのオクターブ上：強のときだけ重ねる。弱めたら外す
    proj.notes.lead = proj.notes.lead.filter(x => !(x.l === 'oct' && x.brush && inC(x.t)));
    if (e >= 1) for (const x of proj.notes.lead.filter(y => y.l === 'main' && inC(y.t)))
      if (x.n + 12 <= PMAX) proj.notes.lead.push({ t: x.t, d: x.d, n: x.n + 12, v: Math.round(x.v * .55 * 100) / 100, l: 'oct', brush: 1 });
    void cellOf;
    sel.clear();
    changed();
    setStatus('ドラマ「' + lvName(e) + '」で ' + cells.size + ' 拍ぶん作り直した');
  }

  /* ハネ：裏の8分は最大で3連符ぶん、裏の16分は半分だけ後ろへ。前の強さのぶんを戻してからかけ直す */
  const HANE8 = 1 / 3, HANE16 = 1 / 6;
  function brushHane(stroke) {
    const { cells, cellOf } = cover(stroke, 2);
    const L = levels.hane, prevLv = new Map([...cells].map(c => [c, (L.get(c) || 0) / MAXLV]));
    const { after } = bumpLevels('hane', cells, stroke.alt);
    const near = (a, b) => Math.abs(a - b) < .012;
    pushUndo();
    let n = 0;
    for (const k of TRACKS) for (const x of proj.notes[k]) {
      const c = cellOf(x.t);
      if (!cells.has(c)) continue;
      const pe = prevLv.get(c), ne = (L.get(c) || 0) / MAXLV;
      // 今の位置から、ハネる前の升目の位置を探す
      let base = null, kind = null;
      const g16 = Math.round(x.t * 2) / 2;
      if (near(x.t, g16)) { base = g16; }
      else if (Number.isInteger(Math.round(x.t - HANE8 * pe)) && near(x.t - HANE8 * pe, Math.round(x.t - HANE8 * pe))) base = Math.round(x.t - HANE8 * pe);
      else { const b16 = Math.round((x.t - HANE16 * pe) * 2) / 2; if (near(x.t - HANE16 * pe, b16)) base = b16; }
      if (base === null) continue;
      const frac = base - Math.floor(base);
      if (frac === 0) kind = Math.floor(base) % 2 === 1 ? 8 : null; else kind = 16;
      if (!kind) continue;
      const nt = base + (kind === 8 ? HANE8 : HANE16) * ne;
      if (Math.abs(nt - x.t) < 1e-6) continue;
      if (x.d !== undefined) x.d = Math.max(.25, x.d - (nt - x.t));
      x.t = Math.round(clamp(nt, 0, end() - .01) * 10000) / 10000;
      n++;
    }
    if (!n) undoStack.pop();
    sel.clear();
    changed();
    setStatus(n ? 'ハネ「' + lvName(after) + '」：' + n + '個の音をずらした' : 'ここには跳ねさせる裏拍の音がなかった');
  }
  let fadeRaf = 0;
  function fadeLoop() {
    if (fadeRaf) return;
    const step = () => {
      fading = fading.filter(f => performance.now() - f.at < 700);
      paint();
      fadeRaf = fading.length ? requestAnimationFrame(step) : 0;
    };
    fadeRaf = requestAnimationFrame(step);
  }
  function strokePath(stroke) {
    wrapOff = stroke.lap;
    cx.beginPath();
    stroke.pts.forEach((p, i) => {
      const x = X(p.t);
      const y = stroke.drum || isDrum() ? RULER + (1 - p.e) * (areaBottom() - RULER) : Yp(p.n) + rowH / 2;
      if (i) cx.lineTo(x, y); else { cx.moveTo(x, y); cx.lineTo(x + .01, y); }
    });
    wrapOff = 0;
  }
  function paintBrush() {
    const G = gutter();
    clipRect(G, RULER, viewW() - G, areaBottom() - RULER);
    cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.lineWidth = brushR * 2;
    for (const f of fading) {
      cx.strokeStyle = BRUSH + (.5 * (1 - (performance.now() - f.at) / 700)) + ')';
      strokePath(f.stroke); cx.stroke();
    }
    if (drag && drag.mode === 'brush') { cx.strokeStyle = BRUSH + '.5)'; strokePath(drag.stroke); cx.stroke(); }
    if (tool !== 'edit' && hoverPt) {
      cx.lineWidth = 1.5; cx.strokeStyle = BRUSH + '.9)';
      cx.beginPath(); cx.arc(hoverPt[0], hoverPt[1], brushR, 0, Math.PI * 2); cx.stroke();
    }
    cx.restore();
  }

  /* ---------------- editing ops（ピアノロール） ---------------- */
  function removeNotes(list) {
    const s = new Set(list);
    proj.notes[cur] = proj.notes[cur].filter(x => !s.has(x));
    for (const x of list) sel.delete(x);
  }
  function deleteSel() { if (!sel.size) return; const n = sel.size; edit(() => removeNotes([...sel])); setStatus(n + '個けした'); }
  function selectAll() { sel = new Set(proj.notes[cur]); syncSel(); draw(); }
  function nudge(dt, dn) {
    if (!sel.size) return;
    edit(() => {
      const list = [...sel];
      if (dn) {
        const ns = list.map(x => x.n);
        const d = clamp(dn, PMIN - Math.min(...ns), PMAX - Math.max(...ns));
        list.forEach(x => { x.n += d; });
      }
      if (dt) {
        const lo = Math.min(...list.map(x => x.t)), hi = Math.max(...list.map(x => x.t + x.d));
        const d = clamp(dt, -lo, end() - Math.max(hi, lo + .001));
        list.forEach(x => { x.t += d; });
      }
    });
    const first = [...sel][0];
    if (first && dn) preview(cur, first.n, first.v);
  }
  function copySel() {
    if (!sel.size) return false;
    const list = [...sel], lo = Math.min(...list.map(x => x.t));
    clipNotes = list.map(x => Object.assign({}, x, { t: x.t - lo }));
    setStatus(list.length + '個コピーした（貼り付けは最後にクリックした位置へ）');
    return true;
  }
  function pasteAt(t0) {
    if (!clipNotes) return;
    edit(() => {
      sel.clear();
      for (const x of clipNotes) {
        const y = Object.assign({}, x, { t: x.t + t0 });
        if (y.t >= end()) continue;
        y.d = Math.min(y.d, end() - y.t);
        if (cur === 'lead' && !y.l) y.l = 'main';
        if (cur !== 'lead') delete y.l;
        proj.notes[cur].push(y); sel.add(y);
      }
    });
  }
  /* 選んだ音の範囲（小節単位） */
  function selSpan() {
    const list = [...sel];
    const lo = Math.min(...list.map(x => x.t)), hi = Math.max(...list.map(x => x.t + x.d));
    const start = Math.floor(lo / epb() + 1e-6) * epb();
    return { list, lo, start, span: Math.max(1, Math.ceil((hi - start) / epb() - 1e-6)) * epb() };
  }
  function duplicateSel() {
    if (!sel.size) return;
    const { lo, span } = selSpan();
    const saved = clipNotes; copySel(); pasteAt(lo + span); clipNotes = saved;
    setStatus('すぐ後ろに複製した');
  }
  /* 選んだ小節ぶんを、曲の最後まで敷き詰める。その先にあった同じトラックの音は置き換える */
  function repeatSel() {
    if (!sel.size) return;
    const { list, start, span } = selSpan();
    if (start + span >= end()) { setStatus('もう曲の最後まで届いてる', true); return; }
    edit(() => {
      const from = start + span;
      proj.notes[cur] = proj.notes[cur].filter(x => !(x.t >= from && !sel.has(x)));
      for (let off = from; off < end(); off += span)
        for (const x of list) {
          const y = Object.assign({}, x, { t: x.t - start + off });
          if (y.t >= end()) continue;
          y.d = Math.min(y.d, end() - y.t);
          proj.notes[cur].push(y);
        }
    });
    setStatus((span / epb()) + '小節ぶんを最後までくり返した（⌘Z で戻せる）');
  }
  function quantizeSel() {
    if (!sel.size) return;
    const g = grid();
    edit(() => { for (const x of sel) { x.t = clamp(snapRound(x.t), 0, end() - g); x.d = Math.max(g, snapRound(x.d)); } });
    setStatus('グリッドにそろえた');
  }
  function shiftOct(dir) {
    const list = sel.size ? [...sel] : proj.notes[cur];
    const ns = list.map(x => x.n);
    if (!ns.length || Math.min(...ns) + dir * 12 < PMIN || Math.max(...ns) + dir * 12 > PMAX) { setStatus('これ以上は音域の外になっちゃう', true); return; }
    edit(() => { for (const x of list) x.n += dir * 12; });
  }

  /* ---------------- editing ops（ドラムのページ） ---------------- */
  const inPage = h => h.t >= pageStart() - 1e-6 && h.t < pageStart() + pageLen() - 1e-6;
  const pageName = () => {
    const a = page * pageBars + 1, b = Math.min(proj.bars, a + pageBars - 1);
    return a === b ? a + '小節目' : a + '〜' + b + '小節目';
  };
  function setPage(p) {
    const np = clamp(p, 0, pages() - 1);
    if (np === page) return;
    page = np; syncPage(); draw();
  }
  function copyPage() {
    clipPage = { len: pageLen(), hits: proj.notes.drum.filter(inPage).map(h => Object.assign({}, h, { t: h.t - pageStart() })) };
    setStatus(pageName() + 'をコピーした（' + clipPage.hits.length + '打）');
    syncPage();
  }
  function pastePage() {
    if (!clipPage) return;
    edit(() => {
      proj.notes.drum = proj.notes.drum.filter(h => !inPage(h));
      for (const h of clipPage.hits) {
        if (h.t >= pageLen()) continue;
        const y = Object.assign({}, h, { t: h.t + pageStart() });
        if (y.t < end()) proj.notes.drum.push(y);
      }
    });
    setStatus(pageName() + 'に貼り付けた');
  }
  function clearPage() {
    const n = proj.notes.drum.filter(inPage).length;
    if (!n) return;
    edit(() => { proj.notes.drum = proj.notes.drum.filter(h => !inPage(h)); });
    setStatus(pageName() + 'を空にした（⌘Z で戻せる）');
  }
  /* このページを、曲の最後まで（every=1）か、この先の n ページおきに敷き詰める */
  function repeatPage() {
    const from = pageStart() + pageLen();
    if (from >= end()) { setStatus('もう曲の最後のページだよ', true); return; }
    const src = proj.notes.drum.filter(inPage).map(h => Object.assign({}, h, { t: h.t - pageStart() }));
    edit(() => {
      proj.notes.drum = proj.notes.drum.filter(h => h.t < from - 1e-6);
      for (let off = from; off < end(); off += pageLen())
        for (const h of src) { const y = Object.assign({}, h, { t: h.t + off }); if (y.t < end()) proj.notes.drum.push(y); }
    });
    setStatus(pageName() + 'を曲の最後までくり返した（⌘Z で戻せる）');
  }
  function syncPage() {
    $('pageLabel').textContent = pageName() + ' / ' + proj.bars;
    $('pgPrev').disabled = page <= 0;
    $('pgNext').disabled = page >= pages() - 1;
    $('pgPaste').disabled = !clipPage;
    $('pageBars').value = String(pageBars);
  }

  /* ---------------- keyboard ---------------- */
  /* スペースは再生・停止だけに使う。フォーカスの残ったボタンやメニューが押されないよう、
     文字を打つ欄の外では必ずここで止める（ボタンは keyup で押されるブラウザもあるので両方） */
  const typing = el => {
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'textarea' || (tag === 'input' && !['range', 'checkbox', 'radio', 'button', 'file'].includes(el.type));
  };
  document.addEventListener('keyup', e => { if (e.key === ' ' && !typing(e.target)) e.preventDefault(); });
  document.addEventListener('keydown', e => {
    if (e.key === ' ' && !typing(e.target)) {
      e.preventDefault();
      if (!e.repeat) togglePlay();
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag)) return;
    if (tag === 'button' && e.key === 'Enter') return;
    if ($('genreDlg').open) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); exportAs('json'); return; }
    if (isDrum()) {
      if (mod && k === 'c') { e.preventDefault(); copyPage(); return; }
      if (mod && k === 'v') { e.preventDefault(); pastePage(); return; }
      if (mod) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPage(page - 1); if (following()) setFollow(false); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPage(page + 1); if (following()) setFollow(false); return; }
      if (k === 'r') { repeatPage(); return; }
    } else {
      if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod && k === 'c') { if (copySel()) e.preventDefault(); return; }
      if (mod && k === 'x') { if (copySel()) { e.preventDefault(); deleteSel(); } return; }
      if (mod && k === 'v') { e.preventDefault(); pasteAt(cursorT); return; }
      if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
      if (k === 'q') { quantizeSel(); return; }
      if (k === 'r') { repeatSel(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, e.shiftKey ? 12 : 1); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, e.shiftKey ? -12 : -1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-(e.shiftKey ? epb() : grid()), 0); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudge(e.shiftKey ? epb() : grid(), 0); return; }
    }
    if (mod) return;
    if (e.key === '[') { setBrushR(brushR - 4); return; }
    if (e.key === ']') { setBrushR(brushR + 4); return; }
    if (k === 'b') { const br = SHOWN_TOOLS.slice(1); setTool(br[(br.indexOf(tool) + 1) % br.length]); return; }
    if (k === 'v') { setTool('edit'); return; }
    if (e.key === 'Escape' && tool !== 'edit') { setTool('edit'); return; }
    if (e.key === 'Escape') { sel.clear(); focusRow = null; syncSel(); draw(); closeMenu(); return; }
    if (e.key === 'Enter') { e.preventDefault(); stop(); return; }
    if (['1', '2', '3', '4'].includes(e.key)) { setTrack(TRACKS[+e.key - 1]); return; }
    if (k === 'f') { setFollow(!follow); return; }
  });

  /* ---------------- tracks panel ---------------- */
  const opts = (tbl, v) => Object.entries(tbl).map(([k, o]) => `<option value="${k}"${k === v ? ' selected' : ''}>${o.name}</option>`).join('');
  function buildTracks() {
    const box = $('tracks');
    box.innerHTML = TRACKS.map(k => {
      const I = TRACK_INFO[k];
      let sound = '';
      if (k === 'lead') sound = `<label class="fld"><span>音色</span><select data-f="lead"></select></label>`;
      if (k === 'chord') sound = `<label class="fld"><span>音色</span><select data-f="pad"></select></label>`;
      if (k === 'bass') sound = `<label class="fld"><span>音色</span><select data-f="bassTone"></select></label>
        <label class="fld"><span>弾き方</span><select data-f="bassStyle"></select></label>`;
      if (k === 'drum') sound = `<label class="fld"><span>キット</span><select data-f="drums"></select></label>`;
      return `<div class="trk" data-track="${k}" style="--c:${I.color}">
        <button type="button" class="trk-name" data-act="select" title="${I.key} キーでも切り替え">
          <i></i><b>${I.name}</b><kbd>${I.key}</kbd><small></small>
        </button>
        <div class="trk-sound">${sound}
          <button type="button" class="adv" data-act="adv" aria-expanded="false" title="音色の詳細とエフェクト">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
        </div>
        <div class="trk-mix">
          <label class="knob"><span>音量</span><input type="range" min="0" max="100" data-m="vol"><output data-o="vol"></output></label>
          <label class="knob"><span>左右</span><input type="range" min="-100" max="100" data-m="pan"><output data-o="pan"></output></label>
          <label class="knob"><span>残響</span><input type="range" min="0" max="100" data-m="rev"><output data-o="rev"></output></label>
        </div>
        <div class="trk-btns">
          <button type="button" class="ms" data-act="mute" title="ミュート">M</button>
          <button type="button" class="ms" data-act="solo" title="ソロ">S</button>
          <button type="button" class="regen" data-act="regen" title="このトラックだけ新しく作り直す">作り直す</button>
        </div>
        <div class="trk-adv" hidden>
          <div class="adv-col">
            <h4>音色の傾向<small>まん中でその音色のまま</small></h4>
            ${P.TONE_KNOBS.filter(t => t.tracks.includes(k)).map(t => `<label class="knob" title="${t.help}"><span>${t.label}</span><input type="range" min="0" max="100" data-tone="${t.id}"><output data-to="${t.id}"></output></label>`).join('')}
          </div>
          <div class="adv-col">
            <h4>エフェクト</h4>
            ${P.FX_KNOBS.map(f => `<label class="knob" title="${f.help}"><span>${f.label}</span><input type="range" min="0" max="100" data-fx="${f.id}"><output data-fo="${f.id}"></output></label>`).join('')}
            <label class="knob" title="全トラックで共通の残響の長さ。量は上の行の「残響」で決める"><span>残響の長さ</span><input type="range" min="${P.REV_LEN.min * 10}" max="${P.REV_LEN.max * 10}" data-g="revLen"><output data-go="revLen"></output></label>
            <p class="adv-note">残響の長さは全トラック共通。量は行の「残響」で。</p>
          </div>
          <div class="adv-foot"><button type="button" class="regen" data-act="advReset">このトラックを元に戻す</button></div>
        </div>
      </div>`;
    }).join('');
    box.querySelectorAll('.trk').forEach(row => {
      const k = row.dataset.track;
      row.addEventListener('pointerdown', e => { if (!e.target.closest('input,select,button.ms,button.regen')) setTrack(k); });
      row.querySelectorAll('[data-m]').forEach(inp => {
        inp.addEventListener('input', () => {
          proj.mix[k][inp.dataset.m] = +inp.value;
          applyMixOnly(); syncTracks(); clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 500);
        });
        inp.addEventListener('dblclick', () => {
          proj.mix[k][inp.dataset.m] = inp.dataset.m === 'vol' ? 80 : inp.dataset.m === 'pan' ? 0 : 50;
          applyMixOnly(); syncTracks();
        });
      });
      row.querySelector('[data-act="mute"]').addEventListener('click', () => { proj.mix[k].mute = !proj.mix[k].mute; applyMixOnly(); changed(); });
      row.querySelector('[data-act="solo"]').addEventListener('click', () => { proj.mix[k].solo = !proj.mix[k].solo; applyMixOnly(); changed(); });
      row.querySelector('[data-act="regen"]').addEventListener('click', () => regen(k));
      const adv = row.querySelector('.trk-adv'), advBtn = row.querySelector('[data-act="adv"]');
      advBtn.addEventListener('click', () => {
        adv.hidden = !adv.hidden;
        advBtn.setAttribute('aria-expanded', adv.hidden ? 'false' : 'true');
      });
      const tweak = () => { applyMixOnly(); syncTracks(); clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 500); auditionSoon(k); };
      row.querySelectorAll('[data-tone]').forEach(inp => {
        inp.addEventListener('input', () => { proj.mix[k].tone[inp.dataset.tone] = +inp.value; tweak(); });
        inp.addEventListener('dblclick', () => { proj.mix[k].tone[inp.dataset.tone] = 50; tweak(); });
      });
      row.querySelectorAll('[data-fx]').forEach(inp => {
        inp.addEventListener('input', () => { proj.mix[k].fx[inp.dataset.fx] = +inp.value; tweak(); });
        inp.addEventListener('dblclick', () => { proj.mix[k].fx[inp.dataset.fx] = 0; tweak(); });
      });
      const rl = row.querySelector('[data-g="revLen"]');
      rl.addEventListener('input', () => { proj.fx.revLen = +rl.value / 10; syncTracks(); });
      // 残響はインパルスを作り直すので、離したときだけ
      rl.addEventListener('change', () => { if (audio.ready) audio.rig.setReverb(P.revLen(proj)); tweak(); });
      row.querySelector('[data-act="advReset"]').addEventListener('click', () => {
        proj.mix[k].tone = P.defaultTone(); proj.mix[k].fx = P.defaultFx(); tweak();
      });
      row.querySelectorAll('select[data-f]').forEach(s => s.addEventListener('change', () => {
        const f = s.dataset.f;
        if (f === 'lead' || f === 'pad') { proj.st[f] = s.value; changed({ sound: true }); preview(k, k === 'lead' ? 76 : 64); }
        else if (f === 'bassTone') { proj.mix.bass.sound = s.value; applyMixOnly(); changed(); preview('bass', 40); }
        else if (f === 'bassStyle' || f === 'drums') {
          // 弾き方・キットは演奏の型なので、選ぶとそのトラックを作り直す
          pushUndo();
          P.regenerateTrack(proj, k, { [f]: s.value, seed: proj.st.seed });
          sel.clear(); changed({ rows: true });
          setTrack(k);
          setStatus(TRACK_INFO[k].name + 'を「' + s.selectedOptions[0].textContent + '」で作り直した（⌘Z で戻せる）');
        }
      }));
    });
  }
  function syncTracks() {
    const on = P.audible(proj);
    document.querySelectorAll('.trk').forEach(row => {
      const k = row.dataset.track, m = proj.mix[k];
      row.dataset.cur = k === cur ? 'true' : 'false';
      row.dataset.silent = on[k] ? 'false' : 'true';
      row.querySelectorAll('[data-m]').forEach(inp => { if (document.activeElement !== inp) inp.value = m[inp.dataset.m]; });
      row.querySelector('[data-o="vol"]').textContent = m.vol;
      row.querySelector('[data-o="pan"]').textContent = m.pan === 0 ? 'C' : (m.pan < 0 ? 'L' + (-m.pan) : 'R' + m.pan);
      row.querySelector('[data-o="rev"]').textContent = m.rev;
      row.querySelector('[data-act="mute"]').setAttribute('aria-pressed', m.mute ? 'true' : 'false');
      row.querySelector('[data-act="solo"]').setAttribute('aria-pressed', m.solo ? 'true' : 'false');
      row.querySelector('.trk-name small').textContent = proj.notes[k].length + (k === 'drum' ? '打' : '音');
      const tn = m.tone, fx = m.fx;
      row.querySelectorAll('[data-tone]').forEach(inp => { if (document.activeElement !== inp) inp.value = tn[inp.dataset.tone]; });
      row.querySelectorAll('[data-to]').forEach(o => { const v = tn[o.dataset.to]; o.textContent = v === 50 ? '−' : (v > 50 ? '+' : '') + (v - 50); });
      row.querySelectorAll('[data-fx]').forEach(inp => { if (document.activeElement !== inp) inp.value = fx[inp.dataset.fx]; });
      row.querySelectorAll('[data-fo]').forEach(o => { const v = fx[o.dataset.fo]; o.textContent = v ? v : 'なし'; });
      const rl = row.querySelector('[data-g="revLen"]');
      if (document.activeElement !== rl) rl.value = Math.round(P.revLen(proj) * 10);
      row.querySelector('[data-go="revLen"]').textContent = P.revLen(proj).toFixed(1) + '秒';
      // 50から動かしたつまみがあれば、詳細ボタンに印
      const changedTone = Object.values(tn).some(v => v !== 50) || Object.values(fx).some(v => v !== 0);
      row.querySelector('[data-act="adv"]').dataset.on = changedTone ? 'true' : 'false';
      row.querySelectorAll('select[data-f]').forEach(s => {
        const f = s.dataset.f;
        const tbl = f === 'lead' ? E.LEADS : f === 'pad' ? E.PADS : f === 'bassTone' ? P.BASS_TONES : f === 'bassStyle' ? E.BASSES : E.KITS;
        const v = f === 'bassTone' ? proj.mix.bass.sound : proj.st[f];
        if (!s.options.length) s.innerHTML = opts(tbl, v);
        s.value = v;
      });
    });
  }
  function setTrack(k) {
    if (cur === k) return;
    const wasDrum = isDrum();
    cur = k; sel.clear();
    if (k === 'drum') {
      computeRows(); scrollY = 0;
      page = Math.floor((audio.playing ? playheadT() : Math.max(cursorT, T(gutter()))) / pageLen());
    } else if (wasDrum) { scrollY = 0; centerOn(k); }
    else centerOn(k, true);
    clampScroll();
    $('regenLabel').textContent = TRACK_INFO[k].name + '再生成';
    $('grid').value = String(grids[k]);
    $('gridLabel').textContent = k === 'drum' ? 'ステップ' : 'グリッド';
    document.body.dataset.track = k;
    syncTracks(); syncSel(); syncPage(); syncStrip(); draw();
  }
  function regen(k) {
    pushUndo();
    P.regenerateTrack(proj, k);
    sel.clear(); changed({ rows: true });
    setTrack(k);
    setStatus(TRACK_INFO[k].name + 'を新しいタネで作り直した。ほかのトラックはそのまま（⌘Z で戻せる）');
  }
  /* そのトラックの音が画面に収まるように縦位置を合わせる */
  function centerOn(k, soft) {
    const ns = (k === 'all' ? PITCHED.flatMap(t => proj.notes[t]) : proj.notes[k]).map(x => x.n);
    if (!ns.length) return;
    const lo = Math.min(...ns), hi = Math.max(...ns), vh = areaBottom() - RULER;
    const top = (PMAX - hi) * rowH, bot = (PMAX - lo + 1) * rowH;
    if (soft && top >= scrollY && bot <= scrollY + vh) return;
    scrollY = (top + bot) / 2 - vh / 2;
    clampScroll();
  }
  function fitView() {
    if (isDrum()) return;
    const ns = PITCHED.flatMap(t => proj.notes[t]).map(x => x.n);
    const vh = Math.max(120, areaBottom() - RULER);
    if (ns.length) rowH = clamp(Math.floor(vh / (Math.max(...ns) - Math.min(...ns) + 5)), 4, 12);
    centerOn('all');
  }

  /* ---------------- strip / selection UI ---------------- */
  function syncStrip() {
    $('bpm').value = proj.st.bpm;
    $('key').value = proj.st.key;
    $('swing').value = proj.st.swing; $('swingOut').textContent = proj.st.swing || 'なし';
    $('tone').value = proj.st.tone; $('toneOut').textContent = proj.st.tone;
    $('bars').value = proj.bars;
    $('genreName').textContent = E.PRESETS[proj.st.preset].label;
    $('lenInfo').textContent = P.loopSeconds(proj).toFixed(1) + '秒';
    $('btnUndo').disabled = !undoStack.length;
    $('btnRedo').disabled = !redoStack.length;
    $('btnCompact').setAttribute('aria-pressed', compact ? 'true' : 'false');
  }
  function syncSel() {
    const n = sel.size;
    $('selBar').dataset.on = n ? 'true' : 'false';
    $('selCount').textContent = n ? n + '音を選択中' : '';
    if (n) {
      const v = [...sel].reduce((a, x) => a + x.v, 0) / n;
      if (document.activeElement !== $('selVel')) $('selVel').value = Math.round(v * 100);
      $('selVelOut').textContent = Math.round(v * 100);
    }
  }
  function syncPlay() {
    $('playBig').querySelector('.i-play').classList.toggle('hide', audio.playing);
    $('playBig').querySelector('.i-pause').classList.toggle('hide', !audio.playing);
    $('playBig').setAttribute('aria-label', audio.playing ? '一時停止' : '再生');
  }

  $('playBig').addEventListener('click', togglePlay);
  $('toStart').addEventListener('click', stop);
  $('btnFollow').addEventListener('click', () => setFollow(!follow));
  $('btnCompact').addEventListener('click', () => {
    compact = !compact; setPref('compact', compact);
    computeRows(); scrollY = 0; clampScroll(); syncStrip(); draw();
  });
  $('vol').addEventListener('input', e => {
    audio.vol = +e.target.value; $('volOut').textContent = audio.vol;
    if (audio.rig) audio.rig.master.volume.rampTo(E.masterDb(audio.vol), .08);
    setPref('vol', audio.vol);
  });
  $('bpm').addEventListener('change', e => {
    const v = clamp(Math.round(+e.target.value || proj.st.bpm), 52, 176);
    edit(() => { proj.st.bpm = v; });
    if (audio.ready) E.TR().bpm.value = v;
  });
  $('key').addEventListener('change', e => {
    edit(() => P.setKey(proj, +e.target.value));
    if (!isDrum()) centerOn(cur, true);
    setStatus('キーを ' + KEY_NAMES[proj.st.key] + ' にして全部の音をずらした');
  });
  $('swing').addEventListener('input', e => {
    proj.st.swing = +e.target.value;
    if (audio.ready) E.TR().swing = proj.st.swing / 100 * .6;
    changed();
  });
  $('tone').addEventListener('input', e => { proj.st.tone = +e.target.value; applySound(); changed(); });
  $('bars').addEventListener('change', e => { edit(() => P.setBars(proj, +e.target.value)); syncPage(); });
  $('grid').addEventListener('change', e => { grids[cur] = +e.target.value; setPref('grids', grids); draw(); });
  $('zoomIn').addEventListener('click', () => zoomBy(1.4));
  $('zoomOut').addEventListener('click', () => zoomBy(1 / 1.4));
  $('zoomFit').addEventListener('click', () => {
    if (smooth()) setFollow(false);
    zoomX = clamp((viewW() - gutter() - 8) / end(), 3, 96); scrollX = 0;
    fitView(); clampScroll(); draw();
  });
  function zoomBy(f) {
    const mid = T(gutter() + (viewW() - gutter()) / 2);
    zoomX = clamp(zoomX * f, 3, 96);
    if (!smooth()) scrollX = mid * zoomX - (viewW() - gutter()) / 2;
    clampScroll(); draw();
  }
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('selVel').addEventListener('input', e => {
    if (!sel.size) return;
    if (!$('selVel').dataset.pushed) { pushUndo(); $('selVel').dataset.pushed = '1'; }
    for (const x of sel) x.v = +e.target.value / 100;
    $('selVelOut').textContent = e.target.value;
    changed();
  });
  $('selVel').addEventListener('change', () => { delete $('selVel').dataset.pushed; });
  $('selDel').addEventListener('click', deleteSel);
  $('selDup').addEventListener('click', duplicateSel);
  $('selRepeat').addEventListener('click', repeatSel);
  $('selQuant').addEventListener('click', quantizeSel);
  $('selOctUp').addEventListener('click', () => shiftOct(1));
  $('selOctDown').addEventListener('click', () => shiftOct(-1));
  $('btnRegen').addEventListener('click', () => regen(cur));
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('brushSize').value = brushR;
  $('brushSize').addEventListener('input', e => setBrushR(+e.target.value));
  cv.addEventListener('pointerleave', () => { if (hoverPt) { hoverPt = null; draw(); } });
  $('pgPrev').addEventListener('click', () => { setPage(page - 1); if (following()) setFollow(false); });
  $('pgNext').addEventListener('click', () => { setPage(page + 1); if (following()) setFollow(false); });
  $('pageBars').addEventListener('change', e => {
    const start = pageStart();
    pageBars = +e.target.value; setPref('pageBars', pageBars);
    page = Math.floor(start / pageLen()); clampScroll(); syncPage(); draw();
  });
  $('pgCopy').addEventListener('click', copyPage);
  $('pgPaste').addEventListener('click', pastePage);
  $('pgRepeat').addEventListener('click', repeatPage);
  $('pgClear').addEventListener('click', clearPage);

  /* ---------------- genre dialog ---------------- */
  const dlg = $('genreDlg');
  const genreBtn = ([k, p]) =>
    `<button type="button" class="genre" data-k="${k}"><b>${p.label}</b><span>${p.desc}</span><em>${p.beats}/4・${p.bpm}</em></button>`;
  const presets = Object.entries(E.PRESETS);
  $('genreList').innerHTML = presets.filter(([k]) => !MORE_GENRES.includes(k)).map(genreBtn).join('');
  $('genreMore').innerHTML = presets.filter(([k]) => MORE_GENRES.includes(k)).map(genreBtn).join('');
  $('btnGenre').addEventListener('click', () => {
    dlg.querySelectorAll('.genre').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === proj.st.preset ? 'true' : 'false'));
    if (MORE_GENRES.includes(proj.st.preset)) dlg.querySelector('.more').open = true;
    $('dlgBars').value = proj.bars;
    $('codeStatus').textContent = '';
    dlg.showModal();
  });
  $('dlgClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  const dlgSections = () => +$('dlgBars').value / 16;
  function startFrom(st, msg) {
    pushUndo();
    const mix = proj ? proj.mix : null;
    const fresh = P.fromState(st, mix);
    if (mix) for (const k of TRACKS) fresh.mix[k].solo = false;
    proj = fresh;
    sel.clear(); focusRow = null; page = 0;
    dlg.close();
    changed({ sound: true, rows: true });
    scrollX = 0; fitView(); syncPage(); draw();
    setStatus(msg + '（前の曲には ⌘Z で戻れる）');
  }
  dlg.querySelectorAll('.genre').forEach(b => b.addEventListener('click', () => {
    const st = defaultState(b.dataset.k); st.sections = dlgSections();
    startFrom(st, '「' + E.PRESETS[b.dataset.k].label + '」で新しく作った');
  }));
  /* おまかせ：「その他」の曲調は選ばず、テンポはいまのまま */
  function dice(sections) {
    let o = E.omakase(Math.random);
    for (let i = 0; i < 30 && MORE_GENRES.includes(o.preset); i++) o = E.omakase(Math.random);
    const st = Object.assign(defaultState(o.preset), o, { sections, bpm: proj.st.bpm });
    startFrom(st, 'おまかせで「' + E.PRESETS[st.preset].label + '」にした（テンポは ' + st.bpm + ' のまま）');
  }
  $('dlgDice').addEventListener('click', () => dice(dlgSections()));
  $('btnDice').addEventListener('click', () => dice(proj.bars / 16));
  $('codeApply').addEventListener('click', () => {
    const r = E.decodeRecipe($('codeIn').value);
    if (!r) { $('codeStatus').textContent = 'そのコードは読めなかった。文字の抜けがないか見てみて'; return; }
    startFrom(Object.assign(defaultState(r.preset), r), 'レシピコードから作った');
  });

  /* ---------------- files ---------------- */
  function closeMenu() { $('saveMenu').hidden = true; $('btnSave').setAttribute('aria-expanded', 'false'); }
  $('btnSave').addEventListener('click', e => {
    e.stopPropagation();
    const m = $('saveMenu'); m.hidden = !m.hidden;
    $('btnSave').setAttribute('aria-expanded', m.hidden ? 'false' : 'true');
  });
  document.addEventListener('click', e => { if (!e.target.closest('#saveMenu')) closeMenu(); });
  $('saveMenu').querySelectorAll('[data-exp]').forEach(b => b.addEventListener('click', () => { closeMenu(); exportAs(b.dataset.exp); }));
  $('btnLoad').addEventListener('click', () => $('fileIn').click());
  $('fileIn').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) loadFile(f);
  });
  document.addEventListener('dragover', e => { e.preventDefault(); document.body.dataset.drop = 'true'; });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.dataset.drop = 'false'; });
  document.addEventListener('drop', e => {
    e.preventDefault(); document.body.dataset.drop = 'false';
    const f = e.dataTransfer.files[0]; if (f) loadFile(f);
  });
  async function loadFile(f) {
    try {
      const p = P.parseProject(await f.text());
      pushUndo();
      proj = p; sel.clear(); focusRow = null; page = 0;
      changed({ sound: true, rows: true });
      scrollX = 0; fitView(); syncPage(); draw();
      setStatus('「' + f.name + '」を開いた');
    } catch (err) { setStatus('開けなかった：' + err.message, true); }
  }
  function download(name, bytes, mime) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }
  const baseName = () => {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    return 'loop-' + proj.st.preset + '-' + proj.st.bpm + 'bpm-' + proj.bars + 'bars-'
      + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes());
  };
  let exporting = false;
  async function exportAs(kind) {
    if (exporting) return;
    const name = baseName();
    if (kind === 'json') { download(name + '.json', P.toJSON(proj), 'application/json'); setStatus('JSONで保存した。左のボタンから読み込めばこの続きから編集できる'); return; }
    if (kind === 'mid') {
      try { download(name + '.mid', P.buildMidi(proj), 'audio/midi'); setStatus('MIDIで書き出した（ミュート中のトラックは入れてない）'); }
      catch (err) { setStatus('MIDIの組み立てでつまずいた：' + (err.message || '不明'), true); }
      return;
    }
    exporting = true;
    let stage = '音源の準備';
    try {
      if (!(await ensureAudio())) return;
      const loopSec = P.loopSeconds(proj), tail = P.tailSeconds(proj);
      stage = '合成';
      setStatus('合成中…（' + loopSec.toFixed(0) + '秒ぶん）');
      await new Promise(r => setTimeout(r, 30));
      const { buf, dry, liveRate } = await P.renderOffline(proj, loopSec, tail, async () => {
        setStatus('残響ありで合成できなかったから、残響なしでやり直してる…');
        await new Promise(r => setTimeout(r, 30));
      });
      stage = '後処理';
      const { outs, sr, n, peak } = E.finishLoop(buf, liveRate, loopSec, 2, 0);
      stage = '符号化';
      const bytes = kind === 'wav' ? E.encodeWav(outs, sr) : kind === 'ima4' ? E.encodeCaf(outs, sr) : E.encodeCafPcm(outs, sr);
      const ext = kind === 'wav' ? 'wav' : 'caf';
      download(name + (kind === 'ima4' ? '-ima4' : '') + '.' + ext, bytes, kind === 'wav' ? 'audio/wav' : 'audio/x-caf');
      const mb = (bytes.length / 1048576).toFixed(1);
      setStatus('書き出した（' + mb + 'MB・' + (n / sr).toFixed(2) + '秒・ピーク ' + (20 * Math.log10(Math.max(peak, 1e-9))).toFixed(1) + ' dBFS'
        + (dry ? '・残響なし' : '') + '）。継ぎ目なくループする');
    } catch (err) {
      setStatus(stage + 'でつまずいた：' + ((err && (err.code || err.message)) || '不明') + '。もう一度押してみて', true);
    } finally { exporting = false; }
  }

  /* ---------------- boot ---------------- */
  $('key').innerHTML = KEY_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  $('vol').value = audio.vol; $('volOut').textContent = audio.vol;
  $('btnFollow').setAttribute('aria-pressed', follow ? 'true' : 'false');
  $('grid').value = String(grids[cur]);
  document.body.dataset.track = cur;

  try {
    const s = localStorage.getItem(STORE);
    if (s) proj = P.parseProject(s);
  } catch (e) { proj = null; }
  if (!proj) proj = P.fromState(defaultState('nonbiri'));

  buildTracks();
  computeRows();
  fit();
  fitView();
  changed();
  syncPlay(); syncPage();
}
