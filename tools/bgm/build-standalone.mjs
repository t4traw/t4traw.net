#!/usr/bin/env node
/*
  build-standalone.mjs — engine.js + controls.js + app.js + standalone.css を
  1枚の loop-bgm-studio.html に焼き込む。オフラインでも開ける（Tone.js は同じフォルダの
  Tone.js → cdnjs → jsdelivr の順に探す）。Claude のプロジェクトに置く用・配布用。
  この HTML は成果物なので手で編集しない。直すのは src/scripts/loop-bgm-studio/ の方。

  node tools/bgm/build-standalone.mjs [出力先]   既定: tools/bgm/out/loop-bgm-studio.html
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const src=path.join(here,'../../src/scripts/loop-bgm-studio');
const out=process.argv[2]||path.join(here,'out/loop-bgm-studio.html');

const E=await import(path.join(src,'engine.js'));
const C=await import(path.join(src,'controls.js'));
const { KEY_NAMES }=await import(path.join(src,'data.js'));
const read=f=>fs.readFileSync(path.join(src,f),'utf8');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ---- scripts: engine stays top level (bgm-test.mjs slices it from there),
   controls + app run inside one function that sees the engine as E ---- */
const stripExports=s=>s.replace(/^export (const|let|function|async function) /gm,'$1 ');
const stripImports=s=>s.replace(/^import[\s\S]*?from\s+"[^"]+";\n/gm,'');
const engine=stripExports(read('engine.js'));
const controls=stripExports(stripImports(read('controls.js')));
const app=stripExports(stripImports(read('app.js')));
for(const [name,body] of [['controls.js',controls],['app.js',app]])
  if(/^\s*(import|export)\b/m.test(body)) throw new Error(name+': import/export が残った');
const engineNames=Object.keys(E);

const script=`
/* ============================================================
   Tone.js loader — local copy first so file:// works offline
   ============================================================ */
function loadScript(src){
  return new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src=src; s.onload=()=>res(true); s.onerror=()=>rej(new Error(src));
    document.head.appendChild(s);
  });
}
async function loadToneScript(){
  const urls=["./Tone.js","./tone.js",
    "https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js",
    "https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.js"];
  for(const u of urls){ try{ await loadScript(u); if(window.Tone) return window.Tone; }catch(e){} }
  return null;
}

/* ============================================================
   engine.js
   ============================================================ */
${engine}

(()=>{
const E={${engineNames.join(',')}};
/* ============================================================
   controls.js
   ============================================================ */
${controls}
/* ============================================================
   app.js
   ============================================================ */
${app}
startStudio({loadTone:loadToneScript});
})();
`;
if(script.includes('</script')) throw new Error('script に </script が入っている');

/* ---- markup, generated from controls.js the same way the Astro page does ---- */
const SPK=`<svg class="i-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5v5h3.8l4.7 4V5.5l-4.7 4z" fill="currentColor" stroke="none"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18.3 6.6a7.6 7.6 0 0 1 0 10.8"/></svg><svg class="i-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5v5h3.8l4.7 4V5.5l-4.7 4z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`;
const options=table=>Object.entries(table).map(([k,v])=>`<option value="${esc(k)}">${esc(v.name)}</option>`).join('');
const knob=k=>`<div class="knob"><label for="${k.id}">${esc(k.label)}</label><output data-knob-out="${k.id}"></output>
      <input type="range" id="${k.id}" data-knob="${k.id}" min="${k.min??0}" max="${k.max??100}" step="1"></div>`;
const seg=s=>`<div class="row"${s.row?` id="${s.row}"`:''}>
    <span class="rowlabel">${esc(s.label)}</span>
    <div class="seg" data-seg="${s.name}">${s.options.map(([,t],i)=>`<button type="button" data-i="${i}">${esc(t)}</button>`).join('')}</div>
    ${s.info?`<span class="status" id="${s.info}"></span>`:''}
  </div>`;
const chips=c=>`<div class="row">
    <span class="rowlabel">${esc(c.label)}</span>
    <div class="chips">${c.items.map(([p,t])=>`<button class="chip" type="button" data-chip="${p}">${esc(t)}</button>`).join('')}</div>
  </div>`;
const help=(ks,foot)=>ks.some(k=>k.help)
  ? `<ul class="status help">${ks.filter(k=>k.help).map(k=>`<li><b>${esc(k.label)}</b>：${esc(k.help)}</li>`).join('')}${foot?`<li>${esc(foot)}</li>`:''}</ul>`:'';
const section=(sec,extraKnobs=[],extra='')=>{
  const S=C.SECTIONS[sec], ks=[...C.knobsIn(sec),...extraKnobs];
  return `<section class="deck">
  <h2>${esc(S.title)}${S.note?`<span class="note">${esc(S.note)}</span>`:''}</h2>
  <div class="knobs">
    ${ks.map(knob).join('\n    ')}
  </div>
  ${extra}
  ${C.segsIn(sec).map(seg).join('\n  ')}
  ${C.chipsIn(sec).map(chips).join('\n  ')}
  ${help(ks,S.foot)}
</section>`;
};

const html=`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ループBGMスタジオ</title>
<!-- built by tools/bgm/build-standalone.mjs — 手で編集しない -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
${fs.readFileSync(path.join(here,'standalone.css'),'utf8')}
</style>
</head>
<body>
<div class="wrap">

<header class="top">
  <h1>ループBGMスタジオ<span class="sub">土台から組み替えて、飽きないループをつくる</span></h1>
  <button class="themebtn" id="theme" type="button">表示を切り替え</button>
</header>

<section class="deck">
  <div class="stage">
    <canvas id="roll" width="1400" height="420" aria-label="演奏中のノートの流れ"></canvas>
    <div class="readout"><span class="chordname" id="chordname"></span><span class="barcount" id="barcount"></span></div>
    <div class="hint" id="hint">再生ボタンを押すと、その場で曲がひとつ組み上がる</div>
  </div>
  <div class="transport">
    <button class="play" id="play" type="button" aria-label="再生">
      <svg id="iconPlay" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>
      <svg id="iconPause" class="hidden" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>
    </button>
    <button class="ghost dice" id="dice" type="button">🎲 ぜんぶおまかせ</button>
    <button class="ghost" id="reroll" type="button">メロディだけ引き直す</button>
  </div>
</section>

<section class="deck">
  <h2>土台<span class="note">コード進行・拍子・テンポ・編成のひな型</span></h2>
  <div class="moods" id="moods">
    ${Object.entries(E.PRESETS).map(([k,p])=>`<button type="button" class="mood" data-k="${k}" aria-pressed="false"><b>${esc(p.label)}</b><i>${p.beats}拍子 · ${p.bpm} BPM${p.swing?' · はねる':''}</i><span>${esc(p.desc)}</span></button>`).join('\n    ')}
  </div>
  <div class="picks" style="margin-top:14px">
    <div class="pick"><label for="selKey">キー（移調）</label><select id="selKey">${KEY_NAMES.map((n,i)=>`<option value="${i}">${esc(n)}${i?`（+${i}）`:'（原調）'}</option>`).join('')}</select></div>
    <div class="pick"><label for="selScale">メロディの音階</label><select id="selScale">${options(E.SCALES)}</select></div>
  </div>
  <p class="status" id="scaleNote" style="margin:10px 0 0"></p>
</section>

<section class="deck">
  <h2>音色<span class="note">パートごとに、楽器・鳴らすかどうか・音量</span></h2>
  <div class="parts">
    ${C.PARTS.map(p=>`<div class="part" data-part="${p.key}" data-off="false">
      <label class="pname" for="${p.selId}">${esc(p.name)}</label>
      <select id="${p.selId}">${options(E[p.table])}</select>
      <button class="spk" type="button" data-spk="${p.key}" aria-pressed="true">${SPK}</button>
      <input class="pvol" type="range" min="0" max="100" step="1" data-pvol="${p.key}" aria-label="${esc(p.name)}の音量">
      <output class="pout" data-pout="${p.key}"></output>
    </div>`).join('\n    ')}
  </div>
</section>

${section('melody')}

${section('arrange')}

${section('mix',C.knobsIn('transport'),'<p class="status" style="margin:10px 0 0">音量はこの画面で聴くときだけのもの。書き出される音源のレベルには影響しない。</p>')}

<section class="deck">
  <h2>レシピコード<span class="note">この1行で、いまの設定がまるごと戻る</span></h2>
  <div class="codewrap">
    <input class="code" id="codeIn" spellcheck="false" autocomplete="off" aria-label="レシピコード">
    <button class="ghost" id="codeApply" type="button">読み込む</button>
    <button class="ghost" id="codeCopy" type="button">コピー</button>
  </div>
  <p class="status" id="codeStatus" style="margin:10px 0 0">書き出したファイル名の末尾にも同じコードが入るから、あとから音源だけ見つけても完全に復元できる。</p>
</section>

<section class="deck">
  <h2>書き出し</h2>
  ${C.segsIn('export').map(s=>seg(s)+(s.name==='fmt'?'\n  <p class="status" id="fmtNote" style="margin:10px 0 0"></p>':'')).join('\n  ')}
  <div class="row" style="margin-top:18px">
    <button class="primary" id="export" type="button">書き出す</button>
    <p class="status" id="exportStatus" style="margin:0">いま鳴っているのと同じ演奏を保存する。</p>
  </div>
</section>

<footer>
  <b>ループのつなぎ目</b>：残響が末尾で切れないよう、はみ出た分を先頭に折り返してある。さらに長さをIMA4のパケット境界（64フレーム）に合わせてあるので、無限ループしても継ぎ目は出ない。<br>
  <b>権利</b>：鳴っているのは全部その場で生成されたオリジナル。商用でも自由に使ってOK。
</footer>

</div>

<script>${script}</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,html);
console.log('wrote',path.relative(process.cwd(),out),(html.length/1024).toFixed(0)+'KB');
