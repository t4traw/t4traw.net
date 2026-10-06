#!/usr/bin/env node
/*
  bgm-tool.mjs — ループBGMスタジオのエンジンをコマンドラインから使う道具。
  src/scripts/loop-bgm-studio/engine.js（正本）を直接 import するので、
  エンジンを改修してもこのファイルは直さなくていい。既定値は controls.js の defaultState。

  使い方（リポジトリの直下で）:
    node tools/bgm/bgm-tool.mjs list                         曲調・音色・音階の一覧
    node tools/bgm/bgm-tool.mjs decode <code>                レシピコードを設定(JSON)に戻す
    node tools/bgm/bgm-tool.mjs describe <code>              人が読める要約（進行・尺・編成）
    node tools/bgm/bgm-tool.mjs encode '<json>'              設定からレシピコードを作る（省略項目は既定値）
    node tools/bgm/bgm-tool.mjs seeds '<json>' [--from N] [--count N] [--top N]
                                                             メロディのタネを採点して上位を出す
    node tools/bgm/bgm-tool.mjs midi <code> <out.mid>        MIDIを書き出す
    node tools/bgm/bgm-tool.mjs check <code>                 往復・生成・範囲の検証
    node tools/bgm/bgm-tool.mjs omakase [--count N]          スタジオの「ランダム生成」と同じ規則で案を出す
*/
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../../src/scripts/loop-bgm-studio/engine.js';
import { defaultState } from '../../src/scripts/loop-bgm-studio/controls.js';

const args=process.argv.slice(2);
const opt=(name,def)=>{ const i=args.indexOf('--'+name); if(i<0) return def; const v=args[i+1]; args.splice(i,2); return v; };

/* 新しく作る曲の既定（スタジオを開いたときと同じ）。タネだけ 1001 に固定 */
function defaults(o){
  const moodKey=(o&&o.preset)||'nonbiri';
  if(!E.PRESETS[moodKey]) throw new Error('unknown preset: '+moodKey+'  (node tools/bgm/bgm-tool.mjs list)');
  const st=defaultState(moodKey); st.seed=1001;
  for(const k of Object.keys(o||{})){
    if(['mel','mute','partVol'].includes(k)) Object.assign(st[k],o[k]); else st[k]=o[k];
  }
  return st;
}
function parseJson(s){
  if(!s) throw new Error('JSON を渡してね');
  if(fs.existsSync(s)) s=fs.readFileSync(s,'utf8');
  return JSON.parse(s);
}
function summary(st){
  const P=E.PRESETS[st.preset], song=E.buildSong(st);
  const tonic=E.PC[(P.tonic+st.key)%12]+(P.minor?'m':'');
  const secs=st.sections*16*P.beats*60/st.bpm;
  const prog=E.PROGS[P.prog].map(c=>E.chordLabel(c,st.key,P.tonic));
  const on=Object.entries(st.mute).filter(([,v])=>!v).map(([k])=>k+'('+st.partVol[k]+')');
  const layers=['octUp','harm','counter'].filter(k=>st.mel[k]);
  const cnt=k=>song.events.filter(e=>e.kind==='lead'&&e.layer==='main').length;
  return [
    `曲調: ${P.label} (${st.preset})  調: ${tonic}  ${P.beats}拍子  ${st.bpm}BPM  はね${st.swing}`,
    `長さ: ${song.bars}小節 = ${secs.toFixed(1)}秒`,
    `音色: メロディ=${E.LEADS[st.lead].name} 伴奏=${E.PADS[st.pad].name} ベース=${E.BASSES[st.bassStyle].name} ドラム=${E.KITS[st.drums].name}`,
    `メロディ: 音階=${E.SCALES[st.scale].name} 音数${st.mel.dens} 幅${st.mel.range} 跳ね${st.mel.leap} 高さ${st.mel.oct} 重ね=[${layers.join(',')||'なし'}]  主旋律${cnt()}音`,
    `鳴らすパート(音量): ${on.join(' ')||'なし'}   伴奏にぎやかさ${st.density} まるさ${st.tone} 出力ピーク${E.PEAKS[st.peak]===null?'そのまま':E.PEAKS[st.peak]+'dBFS'}`,
    `アレンジ: ベースの崩し${st.bassArr} 伴奏のドラマ${st.drama} 曲の展開${st.arrange} ドラムの手数${st.drumBusy} ドラムの展開${st.drumFill} 遊び${st.drumPlay} ノリ${st.drumFeel}`,
    `進行(16小節): ${prog.join(' | ')}`,
    `タネ: ${st.seed}`
  ].join('\n');
}
/* 歌いやすさの目安: 順次進行中心(平均2.4半音)、跳躍は1割強、音高の種類と音域に広がり */
function score(st){
  const s=E.buildSong(st), ns=s.events.filter(e=>e.kind==='lead'&&e.layer==='main').map(e=>e.note);
  if(ns.length<8) return -1e9;
  let tot=0,leaps=0; for(let i=1;i<ns.length;i++){const d=Math.abs(ns[i]-ns[i-1]); tot+=d; if(d>=5) leaps++;}
  const avg=tot/(ns.length-1), span=Math.max(...ns)-Math.min(...ns), pcs=new Set(ns.map(x=>x%12)).size;
  return -E.clashScore(s)*25 -Math.abs(avg-2.4)*3 - Math.abs(leaps/ns.length-0.12)*20 + pcs*0.3 + Math.min(span,19)*0.15;
}
function validate(st){
  const s=E.buildSong(st), total=s.bars*s.epb;
  for(const e of s.events){
    if(e.p8<0||e.p8>=total) throw new Error('event outside loop: '+e.kind+' '+e.p8);
    if(E.GROUP[e.kind]!=='drum') for(const x of (e.notes||[e.note]))
      if(!(x>=20&&x<=108)) throw new Error('note out of range: '+x);
  }
  return s;
}

const cmd=args[0];
try{
  if(cmd==='list'){
    console.log('== 曲調 (preset) ==');
    for(const k of E.MOOD_KEYS){const P=E.PRESETS[k];
      console.log(`${k.padEnd(11)} ${P.label}\t${P.beats}拍子 ${P.bpm}BPM はね${P.swing} ${E.PC[P.tonic]}${P.minor?'m':''} 既定[${P.lead}/${P.pad}/${P.bass}/${P.drums}/${P.scale}] ${P.plan==='minimal'?'反復型':''}\n            ${P.desc}`);}
    const t=(n,o)=>console.log(`== ${n} ==\n`+Object.entries(o).map(([k,v])=>`${k}=${v.name}`).join('  '));
    t('メロディ音色 (lead)',E.LEADS); t('伴奏 (pad)',E.PADS); t('ベース (bassStyle)',E.BASSES);
    t('ドラム (drums)',E.KITS); t('音階 (scale)',E.SCALES);
  }else if(cmd==='decode'){
    const r=E.decodeRecipe(args[1]); if(!r) throw new Error('読めないコード');
    console.log(JSON.stringify(r,null,2));
  }else if(cmd==='describe'){
    const r=E.decodeRecipe(args[1]); if(!r) throw new Error('読めないコード');
    console.log(summary(defaults(r)));
  }else if(cmd==='encode'){
    const st=defaults(parseJson(args[1])); validate(st);
    console.log(E.prettyCode(E.encodeRecipe(st))); console.log(summary(st));
  }else if(cmd==='seeds'){
    const from=+opt('from',1001), count=+opt('count',300), top=+opt('top',5);
    const base=parseJson(args[1]); const out=[];
    for(let seed=from;seed<from+count;seed++){ const st=defaults(Object.assign({},base,{seed})); out.push([score(st),st]); }
    out.sort((a,b)=>b[0]-a[0]);
    for(const [sc,st] of out.slice(0,top)) console.log(`${E.prettyCode(E.encodeRecipe(st))}  seed=${st.seed}  score=${sc.toFixed(2)}`);
  }else if(cmd==='midi'){
    const r=E.decodeRecipe(args[1]); if(!r) throw new Error('読めないコード');
    const st=defaults(r), bytes=E.buildMidi(validate(st),st);
    const outPath=args[2]||('loop-'+st.preset+'-'+st.bpm+'bpm-'+E.encodeRecipe(st)+'.mid');
    fs.writeFileSync(outPath,Buffer.from(bytes)); console.log('wrote',outPath,bytes.length,'bytes');
  }else if(cmd==='check'){
    const r=E.decodeRecipe(args[1]); if(!r) throw new Error('読めないコード');
    const st=defaults(r); validate(st);
    // レシピに入る項目は decodeRecipe が返すものすべて。往復で1つでもずれたらNG
    const same=JSON.stringify(E.decodeRecipe(E.encodeRecipe(st)))===JSON.stringify(r);
    console.log(same?'OK: 生成・範囲・往復すべて正常':'NG: 往復で値がずれた');
    console.log('ぶつかり度: '+(E.clashScore(E.buildSong(st))*100).toFixed(0)+'（0=和音と完全に合う。18前後までが目安、ブルース・ファンク系は意図的に高め）');
    if(!same) process.exit(1);
  }else if(cmd==='omakase'){
    const count=+opt('count',5);
    for(let i=0;i<count;i++){ const st=defaults(E.omakase(Math.random)); validate(st);
      console.log(E.prettyCode(E.encodeRecipe(st))+'  ぶつかり'+(E.clashScore(E.buildSong(st))*100).toFixed(0)+'\n'+summary(st)+'\n'); }
  }else{
    console.log(fs.readFileSync(fileURLToPath(import.meta.url),'utf8').split('*/')[0]);
  }
}catch(e){ console.error('エラー:',e.message); process.exit(1); }
