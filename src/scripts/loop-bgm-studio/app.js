import { PRESETS, SCALES } from "./data.js";
import { chordLabel } from "./theory.js";
import { buildSong, GROUP } from "./song.js";
import {
  LEAD_KEYS, PAD_KEYS, BASS_KEYS, KIT_KEYS, MOOD_KEYS, SCALE_KEYS,
  PEAKS, encodeRecipe, decodeRecipe, prettyCode,
} from "./recipe.js";
import { buildMidi } from "./midi.js";
import { encodeWav, encodeCafPcm, encodeCaf } from "./encoders.js";

/* Tone.js は重いので、最初に再生を押したときに読み込む */
let audio=null;

const $=id=>document.getElementById(id);
const $$=sel=>[...document.querySelectorAll(sel)];
const state={
  preset:'nonbiri', lead:'marimba', pad:'vibes', bassStyle:'two', drums:'brush',
  key:0, scale:'chord', swing:80,
  seed:(Math.random()*9000000|0)+1000, sections:2,
  density:55, tone:55, vol:72, bpm:112, fmt:'pcm', ch:2, peak:0,
  mel:{dens:60,range:55,leap:45,oct:0,octUp:false,harm:false,counter:false},
  mute:{lead:false,chord:false,bass:false,drum:false},
  partVol:{lead:80,chord:80,bass:80,drum:80},
  playing:false, ready:false, rig:null, song:null, busy:false
};
const FMT={
  pcm :{ext:'caf',mime:'audio/x-caf',per:2,tag:'-lossless',
        note:'無劣化。ALACに変換する元データとしても、そのまま鳴らす音源としてもこれが基準'},
  ima4:{ext:'caf',mime:'audio/x-caf',per:34/64,tag:'-ima4',
        note:'容量は1/4だが量子化ノイズが乗る（SNRおよそ39dB）。静かな曲だと気になることがある'},
  wav :{ext:'wav',mime:'audio/wav',per:2,tag:'',
        note:'無劣化。DAWや変換ツールに渡すならこれ'},
  mid :{ext:'mid',mime:'audio/midi',per:0,tag:'',
        note:'パートごとにトラック分けした標準MIDI。自分で編曲するならこれ'}};
const PNAME={lead:'メロディ',chord:'伴奏',bass:'ベース',drum:'ドラム'};
const masterDb=v=>v===0?-60:(-34+v*0.42);
const pressed=(el,on)=>el.setAttribute('aria-pressed',on?'true':'false');
const setStatus=(el,text,bad)=>{ el.textContent=text; el.dataset.bad=bad?'true':'false'; };

function syncUI(){
  const P=PRESETS[state.preset];
  $$('#moods [data-k]').forEach(b=>pressed(b,b.dataset.k===state.preset));
  $('selKey').value=String(state.key);
  $('selScale').value=state.scale;
  $('scaleNote').textContent=SCALES[state.scale].desc;
  $('selLead').value=state.lead; $('selPad').value=state.pad;
  $('selBass').value=state.bassStyle; $('selDrum').value=state.drums;
  $$('[data-part]').forEach(row=>{
    const k=row.dataset.part, on=!state.mute[k];
    row.dataset.off=on?'false':'true';
    const spk=row.querySelector('[data-spk]');
    pressed(spk,on);
    spk.setAttribute('aria-label',PNAME[k]+(on?'：鳴らしている（押すと止める）':'：止めている（押すと鳴らす）'));
    row.querySelector('[data-pvol]').value=state.partVol[k];
    row.querySelector('[data-pout]').textContent=state.partVol[k];
  });
  $$('#layers [data-layer]').forEach(b=>pressed(b,state.mel[b.dataset.layer]));
  $$('#octSeg [data-oct]').forEach(b=>pressed(b,+b.dataset.oct===state.mel.oct));
  [['mDens',state.mel.dens],['mRange',state.mel.range],['mLeap',state.mel.leap],
   ['bpm',state.bpm],['swing',state.swing],['density',state.density],
   ['tone',state.tone],['vol',state.vol]].forEach(([id,v])=>{
    $(id).value=v;
    $(id+'Out').textContent = id==='bpm' ? v+' BPM'
      : id==='swing' ? (v===0?'まっすぐ':v) : v;
  });
  $$('#lenSeg [data-len]').forEach(b=>pressed(b,+b.dataset.len===state.sections));
  $$('#fmtSeg [data-fmt]').forEach(b=>pressed(b,b.dataset.fmt===state.fmt));
  $$('#chSeg [data-ch]').forEach(b=>pressed(b,+b.dataset.ch===state.ch));
  $$('#peakSeg [data-peak]').forEach(b=>pressed(b,+b.dataset.peak===state.peak));

  const secs=(state.sections*16*P.beats)*(60/state.bpm);
  $('lenInfo').textContent='1周 '+secs.toFixed(1)+'秒';
  const F=FMT[state.fmt], isMidi=state.fmt==='mid';
  // MIDI には出力レベルもチャンネルもないので、触れないようにしておく
  ['chRow','peakRow'].forEach(id=>{
    $(id).classList.toggle('opacity-40',isMidi);
    $(id).classList.toggle('pointer-events-none',isMidi);
  });
  $('fmtNote').textContent=F.note;
  $('sizeNote').textContent=isMidi?'数十KB'
    :'書き出し後およそ '+((secs*44100*state.ch*F.per)/1048576).toFixed(1)+'MB';
  const tgt=PEAKS[state.peak];
  $('peakNote').textContent = tgt===null
    ? '合成そのままのレベル（ピークは −9 dBFS 前後になる）'
    : 'ピークが '+tgt+' dBFS に来るよう書き出し時に持ち上げる';
  $('codeIn').value=prettyCode(encodeRecipe(state));
}

function selectPreset(k){
  const P=PRESETS[k];
  state.preset=k; state.bpm=P.bpm; state.swing=P.swing; state.scale=P.scale;
  state.lead=P.lead; state.pad=P.pad; state.bassStyle=P.bass; state.drums=P.drums;
  applyLive(); rebuild(true); syncUI();
}
function applyLive(){
  if(!state.ready||!state.rig) return;
  audio.setupTransport(audio.getTransport(),state);
  state.rig.apply(state);
  state.rig.master.volume.rampTo(masterDb(state.vol),.08);
}
function rebuild(resetPos){
  state.song=buildSong(state);
  if(state.ready){
    const t=audio.getTransport();
    t.cancel(0);
    t.timeSignature=state.song.beats;
    t.loop=true; t.loopStart=0; t.loopEnd=state.song.bars+'m';
    audio.scheduleAll(t,state.rig,state.song,state);
    if(resetPos && state.playing) t.position=0;
  }
  drawRoll();
}

$$('#moods [data-k]').forEach(b=>b.addEventListener('click',()=>selectPreset(b.dataset.k)));
$('selKey').addEventListener('change',e=>{ state.key=+e.target.value; rebuild(); syncUI(); });
$('selScale').addEventListener('change',e=>{ state.scale=e.target.value; rebuild(); syncUI(); });
$('selLead').addEventListener('change',e=>{ state.lead=e.target.value; applyLive(); syncUI(); });
$('selPad').addEventListener('change',e=>{ state.pad=e.target.value; applyLive(); rebuild(); syncUI(); });
$('selBass').addEventListener('change',e=>{ state.bassStyle=e.target.value; rebuild(); syncUI(); });
$('selDrum').addEventListener('change',e=>{ state.drums=e.target.value; rebuild(); syncUI(); });
$$('[data-spk]').forEach(b=>b.addEventListener('click',()=>{
  const k=b.dataset.spk; state.mute[k]=!state.mute[k]; rebuild(); syncUI();
}));
$$('[data-pvol]').forEach(r=>r.addEventListener('input',e=>{
  state.partVol[r.dataset.pvol]=+e.target.value;
  if(state.rig) state.rig.setLevels(state);
  syncUI();
}));
$$('#layers [data-layer]').forEach(b=>b.addEventListener('click',()=>{
  state.mel[b.dataset.layer]=!state.mel[b.dataset.layer]; rebuild(); syncUI();
}));
$$('#octSeg [data-oct]').forEach(b=>b.addEventListener('click',()=>{
  state.mel.oct=+b.dataset.oct; rebuild(); syncUI();
}));
['mDens','mRange','mLeap'].forEach(id=>$(id).addEventListener('input',e=>{
  state.mel[{mDens:'dens',mRange:'range',mLeap:'leap'}[id]]=+e.target.value;
  rebuild(); syncUI();
}));
$('bpm').addEventListener('input',e=>{
  state.bpm=+e.target.value;
  if(state.ready) audio.getTransport().bpm.value=state.bpm;
  syncUI();
});
$('swing').addEventListener('input',e=>{
  state.swing=+e.target.value;
  if(state.ready) audio.getTransport().swing=state.swing/100*0.6;
  syncUI();
});
$('density').addEventListener('input',e=>{ state.density=+e.target.value; rebuild(); syncUI(); });
$('tone').addEventListener('input',e=>{ state.tone=+e.target.value; applyLive(); syncUI(); });
$('vol').addEventListener('input',e=>{
  state.vol=+e.target.value;
  if(state.rig) state.rig.master.volume.rampTo(masterDb(state.vol),.1);
  syncUI();
});
$$('#lenSeg [data-len]').forEach(b=>b.addEventListener('click',()=>{
  state.sections=+b.dataset.len; rebuild(true); syncUI();
}));
$$('#fmtSeg [data-fmt]').forEach(b=>b.addEventListener('click',()=>{ state.fmt=b.dataset.fmt; syncUI(); }));
$$('#chSeg [data-ch]').forEach(b=>b.addEventListener('click',()=>{ state.ch=+b.dataset.ch; syncUI(); }));
$$('#peakSeg [data-peak]').forEach(b=>b.addEventListener('click',()=>{ state.peak=+b.dataset.peak; syncUI(); }));
$('reroll').addEventListener('click',()=>{
  state.seed=(Math.random()*9000000|0)+1000; rebuild(); syncUI();
});

$('dice').addEventListener('click',()=>{
  const r=a=>a[Math.floor(Math.random()*a.length)];
  const k=r(MOOD_KEYS), P=PRESETS[k];
  state.preset=k;
  state.lead=r(LEAD_KEYS); state.pad=r(PAD_KEYS);
  state.bassStyle=r(BASS_KEYS); state.drums=r(KIT_KEYS);
  state.key=Math.floor(Math.random()*12);
  state.scale=Math.random()<.45?P.scale:r(SCALE_KEYS);
  state.bpm=Math.max(52,Math.min(176,P.bpm+Math.round((Math.random()-.5)*26)));
  state.swing=Math.random()<.5?P.swing:Math.floor(Math.random()*101);
  state.density=20+Math.floor(Math.random()*70);
  state.mel={
    dens:30+Math.floor(Math.random()*65),
    range:20+Math.floor(Math.random()*75),
    leap:15+Math.floor(Math.random()*80),
    oct:r([-1,0,0,0,1]),
    octUp:Math.random()<.3, harm:Math.random()<.35, counter:Math.random()<.4
  };
  state.mute={lead:false,chord:false,bass:false,drum:false};
  state.seed=(Math.random()*9000000|0)+1000;
  applyLive(); rebuild(true); syncUI();
});

$('codeApply').addEventListener('click',()=>{
  const r=decodeRecipe($('codeIn').value), st=$('codeStatus');
  if(!r){ setStatus(st,'そのコードは読めなかった。文字の抜けがないか確認してみて。',true); return; }
  Object.assign(state,{preset:r.preset,lead:r.lead,pad:r.pad,bassStyle:r.bassStyle,
    drums:r.drums,bpm:r.bpm,sections:r.sections,density:r.density,tone:r.tone,
    seed:r.seed,mel:r.mel,mute:r.mute,peak:r.peak,key:r.key,scale:r.scale,swing:r.swing,partVol:r.partVol});
  applyLive(); rebuild(true); syncUI();
  setStatus(st,'読み込んだ。まったく同じ演奏が戻ってるはず。');
});
$('codeCopy').addEventListener('click',async()=>{
  const st=$('codeStatus');
  try{ await navigator.clipboard.writeText($('codeIn').value); setStatus(st,'コピーした。'); }
  catch(e){ $('codeIn').select(); setStatus(st,'選択したので手動でコピーして。'); }
});

$('play').addEventListener('click',async()=>{
  if(state.busy) return;
  if(!state.ready){
    state.busy=true; $('play').disabled=true;
    try{
      audio=await import('./audio.js');
      state.rig=await audio.startAudio(state);
    }catch(e){
      $('hint').textContent='音源を起動できなかった。ページを読み込み直してみて。';
      state.busy=false; $('play').disabled=false; return;
    }
    state.rig.master.volume.value=masterDb(state.vol);
    state.ready=true; state.busy=false; $('play').disabled=false;
    $('hint').classList.add('hidden');
    if(!state.rig.hasVerb) $('exportStatus').textContent='この環境では残響が作れなかったのでドライで鳴らしてる。書き出しは問題なくできる。';
    rebuild(true);
  }
  const t=audio.getTransport();
  if(state.playing){ t.pause(); state.playing=false; setIcon(false); }
  else{ t.start(); state.playing=true; setIcon(true); loop(); }
});
function setIcon(p){
  $('iconPlay').classList.toggle('hidden',p);
  $('iconPause').classList.toggle('hidden',!p);
  $('play').setAttribute('aria-label',p?'一時停止':'再生');
}

/* ---- visualiser ---- */
const cv=$('roll'), cx=cv.getContext('2d');
const H=210;
// サイトの配色に合わせた固定色（アクセントは #FE5F55）
const C={acc:'#FE5F55', lav:'#a694ea', mint:'#3fcbaf', line:'#3f3f46', muted:'#a1a1aa'};
function fit(){
  const r=cv.getBoundingClientRect(), dpr=Math.min(2,devicePixelRatio||1);
  cv.width=Math.max(320,r.width*dpr); cv.height=H*dpr;
  cx.setTransform(dpr,0,0,dpr,0,0);
  drawRoll();
}
addEventListener('resize',fit);
function rr(x,y,w,h,r){
  cx.beginPath();
  const rad=Math.min(r,h/2,w/2);
  cx.moveTo(x+rad,y); cx.arcTo(x+w,y,x+w,y+h,rad); cx.arcTo(x+w,y+h,x,y+h,rad);
  cx.arcTo(x,y+h,x,y,rad); cx.arcTo(x,y,x+w,y,rad); cx.closePath(); cx.fill();
}
function drawRoll(){
  const W=cv.clientWidth||cv.width;
  cx.clearRect(0,0,W,H);
  if(!state.song) return;
  const spb=60/state.bpm, barSec=state.song.beats*spb;
  const loopSec=state.song.bars*barSec;
  const p=state.ready?(audio.getTransport().seconds%loopSec):0;
  const winL=p-1.1, winR=p+4.6, span=winR-winL;
  const X=t=>((t-winL)/span)*W;
  const LOMID=32, HIMID=100;
  const Y=m=>H-14-((m-LOMID)/(HIMID-LOMID))*(H-36);
  cx.strokeStyle=C.line; cx.lineWidth=1;
  for(let b=Math.floor(winL/barSec)-1;b<=Math.ceil(winR/barSec)+1;b++){
    const x=X(b*barSec);
    if(x<-10||x>W+10) continue;
    cx.globalAlpha=(b%4===0)?.9:.4;
    cx.beginPath(); cx.moveTo(x,6); cx.lineTo(x,H-6); cx.stroke();
  }
  cx.globalAlpha=1;
  for(const off of [-loopSec,0,loopSec]){
    for(const e of state.song.events){
      if(state.mute[GROUP[e.kind]]) continue;
      const t=(e.p8/2)*spb+off;
      if(t>winR||t<winL-3) continue;
      const w8=(e.d8||1)/2*spb, x=X(t), w=Math.max(5,X(t+w8)-x-2);
      if(e.kind==='lead'){
        cx.fillStyle=C.acc;
        cx.globalAlpha=e.layer==='main'?1:(e.layer==='counter'?.45:.35);
        rr(x,Y(e.note)-5,w,e.layer==='main'?10:7,5);
        cx.globalAlpha=1;
      }else if(e.kind==='bass'){
        cx.fillStyle=C.mint; rr(x,Y(e.note)-4,w,8,4);
      }else if(e.kind==='chord'){
        cx.fillStyle=C.lav; cx.globalAlpha=.55;
        e.notes.forEach(n=>rr(x,Y(n)-3,w,6,3));
        cx.globalAlpha=1;
      }else{
        cx.fillStyle=C.muted; cx.globalAlpha=.4; rr(x,H-9,3,3,1.5); cx.globalAlpha=1;
      }
    }
  }
  const px=X(p);
  cx.fillStyle=C.acc; cx.globalAlpha=.16; cx.fillRect(px-1.5,0,3,H); cx.globalAlpha=1;
  cx.fillStyle=C.acc; rr(px-4,0,8,7,3);
  const bar=Math.floor(p/barSec);
  const ch=state.song.chords[bar%state.song.chords.length];
  $('chordname').textContent=ch?chordLabel(ch,state.key,PRESETS[state.preset].tonic):'';
  $('barcount').textContent=(bar+1)+' / '+state.song.bars+' 小節';
}
function loop(){ if(!state.playing) return; drawRoll(); requestAnimationFrame(loop); }

/* ---- export ---- */
function saveLocal(filename,u8,mime){
  const url=URL.createObjectURL(new Blob([u8],{type:mime||'application/octet-stream'}));
  const a=document.createElement('a');
  a.href=url; a.download=filename; a.style.display='none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),8000);
}
function deliver(name,ext,mime,bytes,extra){
  const mb=bytes.length>=1048576?(bytes.length/1048576).toFixed(2)+'MB'
                                :Math.round(bytes.length/1024)+'KB';
  saveLocal(name+'.'+ext,bytes,mime);
  setStatus($('exportStatus'),'保存した： '+name+'.'+ext+'（'+mb+(extra||'')+'）');
}
$('export').addEventListener('click',async()=>{
  const st=$('exportStatus'), btn=$('export');
  setStatus(st,st.textContent);
  btn.disabled=true;
  const code=encodeRecipe(state);
  const song=buildSong(state);
  const base='loop-'+state.preset+'-'+state.bpm+'bpm-'+song.bars+'bars-'+code;
  const F=FMT[state.fmt];

  if(state.fmt==='mid'){
    try{
      deliver(base,'mid','audio/midi',buildMidi(song,state),' / 6トラックまで');
    }catch(err){
      setStatus(st,'MIDIの組み立てでつまずいた：'+((err&&err.message)||'不明'),true);
    }finally{ btn.disabled=false; }
    return;
  }
  if(!state.ready){
    setStatus(st,'音の書き出しは、先に一度再生して音源を読み込んでから。',true);
    btn.disabled=false; return;
  }

  let stage='合成';
  try{
    const spb=60/state.bpm, loopSec=song.bars*song.beats*spb, tail=3.4;
    setStatus(st,'合成中… ('+loopSec.toFixed(0)+'秒ぶん)');
    await new Promise(r=>setTimeout(r,30));
    const {buf,dry,liveRate}=await audio.renderOffline(song,state,loopSec,tail);

    stage='後処理';
    const ab=(buf&&buf.get)?buf.get():buf;
    const sr=ab.sampleRate||liveRate;
    let n=Math.round(loopSec*sr/64)*64;
    if(n>ab.length) n=Math.floor(ab.length/64)*64;
    const srcL=ab.getChannelData(0);
    const srcR=ab.numberOfChannels>1?ab.getChannelData(1):srcL;
    let outs=[new Float32Array(n),new Float32Array(n)];
    // ループ末尾からはみ出た残響を先頭に足し戻して、継ぎ目をなくす
    [srcL,srcR].forEach((src,c)=>{
      outs[c].set(src.subarray(0,n));
      const tn=Math.min(src.length-n,n);
      for(let i=0;i<tn;i++) outs[c][i]+=src[n+i];
    });
    if(state.ch===1){
      const m=new Float32Array(n);
      for(let i=0;i<n;i++) m[i]=(outs[0][i]+outs[1][i])*0.5;
      outs=[m];
    }

    stage='レベル調整';
    const measure=()=>{
      let pk=0,sq=0,cnt=0;
      for(const chn of outs) for(let i=0;i<n;i++){
        const a=Math.abs(chn[i]); if(a>pk) pk=a; sq+=chn[i]*chn[i]; cnt++;
      }
      return {pk,rms:Math.sqrt(sq/Math.max(1,cnt))};
    };
    const tgt=PEAKS[state.peak];
    let m=measure();
    if(m.pk>1e-6){
      const ceil=(tgt===null)?0.999:Math.pow(10,tgt/20);
      const g=(tgt===null)?Math.min(1,ceil/m.pk):ceil/m.pk;
      if(Math.abs(g-1)>1e-4) for(const chn of outs) for(let i=0;i<n;i++) chn[i]*=g;
      m=measure();
    }
    const dB=v=>v>1e-9?(20*Math.log10(v)).toFixed(1):'-inf';

    stage='符号化';
    const bytes = state.fmt==='ima4' ? encodeCaf(outs,sr)
                : state.fmt==='pcm'  ? encodeCafPcm(outs,sr)
                :                      encodeWav(outs,sr);
    stage='保存';
    deliver(base+F.tag+(outs.length===1?'-mono':''),F.ext,F.mime,bytes,
      ' / '+(n/sr).toFixed(3)+'秒 / '+(outs.length===1?'モノラル':'ステレオ')
      +' / ピーク '+dB(m.pk)+' dBFS・RMS '+dB(m.rms)+' dBFS'
      +(dry?' / 残響ありで合成できなかったので残響なし':''));
  }catch(err){
    setStatus(st,stage+'でつまずいた：'+((err&&(err.code||err.message))||'不明')
      +'。ループの長さを16小節にすると通ることがある。',true);
  }finally{ btn.disabled=false; }
});

/* ---- boot ---- */
state.song=buildSong(state);
syncUI();
setIcon(false);
fit();
