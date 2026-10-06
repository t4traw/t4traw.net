#!/usr/bin/env node
/*
  bgm-test.mjs — ループBGMスタジオのエンジン検証。改修のたびに全部通すこと。

  node tools/bgm/bgm-test.mjs [engine]        engine = src/scripts/loop-bgm-studio/engine.js（既定）か、
                                              ビルドした単体HTML（dist-standalone/loop-bgm-studio.html）
  node tools/bgm/bgm-test.mjs --golden-print  いまのエンジンで指紋を計算して表示（意図して演奏を変えたときだけ更新）

  検査:
    golden    互換コードと固定乱数の設定500件が、記録した「演奏の指紋」と完全一致（＝同じ演奏）
    roundtrip レシピコードの往復（ランダム3000件）
    range     全曲調×全ドラム×全音階（ベースは巡回）で、ループ外・音域外・長さ0・NaN がない
    starts    単音の楽器（ベースと全ドラム）で同じ瞬間の発音がない（Tone.js が書き出しで止まる原因）
    omakase   おまかせ1000件のぶつかり度が曲調の上限以内、3拍子に4拍子専用ドラムなし
*/
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));

const NAMES='PRESETS,PROGS,LEADS,PADS,BASSES,KITS,SCALES,MOOD_KEYS,LEAD_KEYS,PAD_KEYS,BASS_KEYS,KIT_KEYS,SCALE_KEYS,'+
  'GROUP,buildSong,encodeRecipe,decodeRecipe,prettyCode,buildMidi,clashScore,omakase,scaleLimit,OMAKASE,posOf,playableEvents';
async function loadEngine(p){
  if(/\.m?js$/.test(p)){ const m=await import(path.resolve(p)); return m.default||m; }
  const s=fs.readFileSync(p,'utf8');
  const js=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].pop()[1];
  const a=js.indexOf('const PC=['), b=js.indexOf('function setupTransport');
  if(a<0||b<0) throw new Error('engine markers not found');
  const ex=NAMES.split(',').map(n=>n+':typeof '+n+"!=='undefined'?"+n+':undefined').join(',');
  return vm.runInNewContext(js.slice(a,b)+';({'+ex+'})',{console});
}
const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const r6=x=>Math.round(x*1e6)/1e6;
/* key order and event order are not part of the music, so the fingerprint ignores them */
function fingerprint(song){
  const rows=song.events.map(e=>[e.kind,r6(e.p8),e.d8===undefined?'':r6(e.d8),
    e.notes?e.notes.join('.'):(e.note===undefined?'':e.note),r6(e.vel),e.layer||'',e.gm||''].join('|')).sort();
  return crypto.createHash('sha256').update(rows.join('\n')+'#'+song.bars+'#'+song.epb+'#'+song.key).digest('hex').slice(0,16);
}
function base(E,k,x){ const P=E.PRESETS[k]; return Object.assign({preset:k,lead:P.lead,pad:P.pad,bassStyle:P.bass,drums:P.drums,
  key:0,scale:P.scale,swing:P.swing,seed:1001,sections:2,density:55,tone:55,bpm:P.bpm,peak:0,
  mel:{dens:60,range:55,leap:45,oct:0,octUp:false,harm:false,counter:false},
  mute:{lead:false,chord:false,bass:false,drum:false},partVol:{lead:80,chord:80,bass:80,drum:80},
  bassArr:0,drama:0,arrange:0,drumBusy:0,drumFill:0,drumPlay:0,drumFeel:0},x); }
function randomState(E,R){
  const r=a=>a[Math.floor(R()*a.length)], n=m=>Math.floor(R()*(m+1));
  return base(E,r(E.MOOD_KEYS),{lead:r(E.LEAD_KEYS),pad:r(E.PAD_KEYS),bassStyle:r(E.BASS_KEYS),drums:r(E.KIT_KEYS),
    scale:r(E.SCALE_KEYS),key:n(11),swing:n(100),bpm:52+n(124),sections:r([1,2,4]),density:n(100),tone:n(100),peak:n(3),
    seed:1000+Math.floor(R()*9000000),
    mel:{dens:n(100),range:n(100),leap:n(100),oct:r([-1,0,1]),octUp:R()<.5,harm:R()<.5,counter:R()<.5},
    mute:{lead:R()<.2,chord:R()<.2,bass:R()<.2,drum:R()<.2},partVol:{lead:n(100),chord:n(100),bass:n(100),drum:n(100)},
    bassArr:n(100),drama:n(100),arrange:n(100),drumBusy:n(100),drumFill:n(100),drumPlay:n(100),drumFeel:n(100)});
}
/* recipe codes from every layout version plus the songs recorded in the guide */
const CODES=['0ASFDP-DF84AR-5HJF3P-4BR7R','0UB7W4Q-TUUYLA9-FTAM93V-VWLLC','2HPLFGIH-JTD8HKED-LPBUYRXH-UI2YS4LS',
  '1I5Q5MU73FR-18Z02RX23X0-H653TXJ53YE','1I1MYKBI2TF-C6R2398D7WB-2UJIB8GS094','1I2KM97Z1NI-XVM8D5N1TTU-ECK0OPL99P0',
  '1HH68QNHT04-DXX9920RUPN-HAPZ4HKW1MK','1HJJ47EUGDT-Q6JKJ9P206A-4HN5MFP3B68','1HC15VXQ6WT-BMKDL90XBHK-0K17X695M4W',
  '1HORKVF43KF-3ULTU79VYZO-MWCC6QHVQDS','1I8X30QTO20-8GVYT5O0EZA-TBGE6XI8EA8','1I9PYH2E8Q2-19SLXZO7UIQ-OGOARF0REXC',
  '1IB81BVIS67-N4DYVF8CZMP-O5Q3NH26ZPS','8BMU3L81AFY-C9A6OZ80Q8R-OQ8D35UABU2-CNGOS','8BUU53NPMPZ-VHY629QYN47-XYTMNU2CJKO-CMZVX',
  'DYRVWVIPI2O-I1WATAMQ3IK-WLSHOQPPFLS-83X6BCBS','E0E95DC3Y1G-PV4GCGQ5JQ6-MZZTTXKHMX6-2J6SMKVC','DZRI4CTWG6Q-B1V520QNUEZ-GUMAC2P6SY9-NHHTWPX3',
  'A5MBXU5XA-ZCCYKEHRF-HX10TJJYP-DYBJ93Y5J-0VYUWZ21Q','A68KEXJBN-3VUBGXNSV-746R14U80-2SQPOHHHH-YTLHHS8X9',
  'A6FL091XO-N1E841I6P-YSULVA9YE-MIQ29KFLR-EZPOW66NW','A407FO9QB-0H0P3EC98-EJNRZJEQL-5XFROHGIL-8L6Y8KU8U',
  'A50P5MEMX-B6M5L04BK-LFDDDQ28L-FSB14QFJY-EPDHD8KQO'];
/* GOLDEN_BEGIN — 2026-10-01 v7 で記録（random500 は 2026-10-06 に曲調6つ・キット5つ、2026-10-07 に音色11個を足して更新） */
const GOLDEN={
  "codes": {
    "0ASFDP-DF84AR-5HJF3P-4BR7R": "6a8be5e7ab9e973a",
    "0UB7W4Q-TUUYLA9-FTAM93V-VWLLC": "6a8be5e7ab9e973a",
    "2HPLFGIH-JTD8HKED-LPBUYRXH-UI2YS4LS": "2e2e4b75586551e7",
    "1I5Q5MU73FR-18Z02RX23X0-H653TXJ53YE": "53aaf0f77370f6cf",
    "1I1MYKBI2TF-C6R2398D7WB-2UJIB8GS094": "72ab6e8cb05377b4",
    "1I2KM97Z1NI-XVM8D5N1TTU-ECK0OPL99P0": "75326737cb3b3477",
    "1HH68QNHT04-DXX9920RUPN-HAPZ4HKW1MK": "1a92da33f5403908",
    "1HJJ47EUGDT-Q6JKJ9P206A-4HN5MFP3B68": "f6ac832265e5eb12",
    "1HC15VXQ6WT-BMKDL90XBHK-0K17X695M4W": "4d9409aa69e144c6",
    "1HORKVF43KF-3ULTU79VYZO-MWCC6QHVQDS": "b3542bbc5044f488",
    "1I8X30QTO20-8GVYT5O0EZA-TBGE6XI8EA8": "71a3d79f1f21f567",
    "1I9PYH2E8Q2-19SLXZO7UIQ-OGOARF0REXC": "917357acd1ec3f15",
    "1IB81BVIS67-N4DYVF8CZMP-O5Q3NH26ZPS": "1a140b095ddb89f9",
    "8BMU3L81AFY-C9A6OZ80Q8R-OQ8D35UABU2-CNGOS": "254a6fe34c0cd07c",
    "8BUU53NPMPZ-VHY629QYN47-XYTMNU2CJKO-CMZVX": "d7ee7a3bebd77d7f",
    "DYRVWVIPI2O-I1WATAMQ3IK-WLSHOQPPFLS-83X6BCBS": "77924b4ef3968aad",
    "E0E95DC3Y1G-PV4GCGQ5JQ6-MZZTTXKHMX6-2J6SMKVC": "e6356300cab77d4e",
    "DZRI4CTWG6Q-B1V520QNUEZ-GUMAC2P6SY9-NHHTWPX3": "894e67b987d5be1f",
    "A5MBXU5XA-ZCCYKEHRF-HX10TJJYP-DYBJ93Y5J-0VYUWZ21Q": "fc7df6249beed91f",
    "A68KEXJBN-3VUBGXNSV-746R14U80-2SQPOHHHH-YTLHHS8X9": "240fa8e67793f706",
    "A6FL091XO-N1E841I6P-YSULVA9YE-MIQ29KFLR-EZPOW66NW": "19ef4776d62d5213",
    "A407FO9QB-0H0P3EC98-EJNRZJEQL-5XFROHGIL-8L6Y8KU8U": "720f9fdade158569",
    "A50P5MEMX-B6M5L04BK-LFDDDQ28L-FSB14QFJY-EPDHD8KQO": "cac86f563e140242"
  },
  "random500": "996aec39cc4f72cd"
};
/* GOLDEN_END */

function goldenNow(E){
  const g={codes:{}};
  for(const c of CODES){ const r=E.decodeRecipe(c); if(!r) throw new Error('decode failed '+c); g.codes[c]=fingerprint(E.buildSong(base(E,r.preset,r))); }
  const R=mulberry(20261001), h=crypto.createHash('sha256');
  for(let i=0;i<500;i++){ const st=randomState(E,R); h.update(fingerprint(E.buildSong(st))+E.encodeRecipe(st)); }
  g.random500=h.digest('hex').slice(0,16);
  return g;
}
function checkSong(E,st){
  const s=E.buildSong(st), T=s.bars*s.epb;
  for(const e of s.events){
    if(!(e.p8>=0&&e.p8<T)) return 'outside loop '+e.kind+' '+e.p8;
    if(!(e.vel>0&&e.vel<=1.2)) return 'velocity '+e.kind+' '+e.vel;
    if(E.GROUP[e.kind]!=='drum'){
      if(!(e.d8>=1)) return 'length '+e.kind+' '+e.d8;
      for(const x of (e.notes||[e.note])) if(!(x>=20&&x<=108)) return 'note '+e.kind+' '+x;
      if(e.kind==='chord'&&!e.notes.length) return 'empty chord';
    }else if(!E.GROUP[e.kind]) return 'unknown kind '+e.kind;
  }
  return null;
}
function checkStarts(E,st){
  const song=E.buildSong(st), evs=E.playableEvents?E.playableEvents(song,st,192):song.events;
  const SYN={snare:['snare','snBody'],cowbell:['cbA','cbB']}, last={};
  const T=evs.map(e=>{ const [b,q,x]=E.posOf(e.p8,song.epb).split(':').map(Number);
    return {e,tick:Math.round((b*song.beats+q)*192+x*48)}; }).sort((a,b)=>a.tick-b.tick);
  for(const {e,tick} of T){ if(e.kind==='lead'||e.kind==='chord'||st.mute[E.GROUP[e.kind]]) continue;
    for(const s of (SYN[e.kind]||[e.kind])){ if(last[s]!==undefined&&tick<=last[s]) return e.kind+'@'+tick; last[s]=tick; } }
  return null;
}

(async()=>{
  const args=process.argv.slice(2), print=args.includes('--golden-print');
  const enginePath=args.find(a=>!a.startsWith('--'))||path.join(__dirname,'../../src/scripts/loop-bgm-studio/engine.js');
  const E=await loadEngine(enginePath);
  if(print){ console.log(JSON.stringify(goldenNow(E),null,2)); return; }
  let fail=0; const ok=(name,msg)=>console.log('OK   '+name+(msg?'  '+msg:'')), ng=(name,msg)=>{ fail++; console.log('FAIL '+name+'  '+msg); };

  // golden
  const g=goldenNow(E); let bad=[];
  for(const c of CODES) if(GOLDEN.codes&&GOLDEN.codes[c]!==g.codes[c]) bad.push(c);
  if(!GOLDEN.codes) ng('golden','GOLDEN is empty');
  else if(bad.length) ng('golden','演奏が変わったコード: '+bad.join(' '));
  else if(GOLDEN.random500!==g.random500) ng('golden','固定乱数500件の演奏が変わった');
  else ok('golden',CODES.length+'コード + 固定乱数500件が一致');

  // roundtrip
  { const R=mulberry(7), ks=['preset','lead','pad','bassStyle','drums','key','scale','swing','bpm','sections','density','tone','peak','seed',
      'bassArr','drama','arrange','drumBusy','drumFill','drumPlay','drumFeel'];
    let e=null;
    for(let i=0;i<3000&&!e;i++){ const st=randomState(E,R), b=E.decodeRecipe(E.prettyCode(E.encodeRecipe(st)));
      if(!b) e='decode null';
      else if(ks.some(k=>b[k]!==st[k])||['mel','mute','partVol'].some(gk=>Object.keys(st[gk]).some(k=>b[gk][k]!==st[gk][k]))) e='mismatch at '+i; }
    e?ng('roundtrip',e):ok('roundtrip','3000件'); }

  // range
  { let n=0,e=null;
    for(const k of E.MOOD_KEYS) for(const d of E.KIT_KEYS) for(const sc of E.SCALE_KEYS){ if(e) break;
      const st=base(E,k,{drums:d,scale:sc,bassStyle:E.BASS_KEYS[n%E.BASS_KEYS.length],pad:E.PAD_KEYS[n%E.PAD_KEYS.length],
        key:(n*5)%12,sections:[1,2,4][n%3],seed:1000+n,density:n%101,
        bassArr:[0,40,100][n%3],drama:[100,50,0][(n>>1)%3],arrange:[0,60,100][(n>>2)%3],
        drumBusy:[0,60,100][n%3],drumFill:[100,0,50][(n>>1)%3],drumPlay:[0,100,50][(n>>2)%3],drumFeel:[50,0,100][(n>>3)%3],
        mel:{dens:60,range:100,leap:100,oct:[-1,0,1][n%3],octUp:true,harm:true,counter:true}});
      const c=checkSong(E,st); if(c) e=k+'/'+d+'/'+sc+': '+c; n++; }
    e?ng('range',e):ok('range',n+'件'); }

  // starts
  { const R=mulberry(99); let e=null,n=0;
    for(const c of CODES){ const r=E.decodeRecipe(c), x=checkStarts(E,base(E,r.preset,r)); if(x){ e=c+' '+x; break; } }
    for(let i=0;i<800&&!e;i++){ const st=randomState(E,R); st.drums=E.KIT_KEYS[i%E.KIT_KEYS.length]; const x=checkStarts(E,st); if(x) e='random '+i+' '+x; n++; }
    e?ng('starts',e):ok('starts','コード全部 + ランダム'+n+'件'); }

  // omakase
  { const R=mulberry(3), lim={}; let over=0,meter=0;
    for(const k of E.MOOD_KEYS) lim[k]=E.scaleLimit(k);
    for(let i=0;i<1000;i++){ const st=E.omakase(R); if(E.clashScore(E.buildSong(st))>lim[st.preset]) over++;
      if(E.PRESETS[st.preset].beats!==4 && E.OMAKASE.only4.kit.includes(st.drums)) meter++; }
    (over||meter)?ng('omakase','上限超え'+over+' 拍子違い'+meter):ok('omakase','1000件'); }

  console.log(fail?`\n${fail}項目が失敗`:'\nすべて通過');
  process.exit(fail?1:0);
})().catch(e=>{ console.error(e); process.exit(1); });
