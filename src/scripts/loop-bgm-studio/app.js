/*
  画面の配線。Astro ページと単体HTMLの両方がこれを使う。
  部品は controls.js の一覧を回して data 属性で見つけるので、スライダーを足しても
  ここは触らなくていい。

  マークアップ側の約束:
    #moods [data-k]            土台ボタン
    #selKey #selScale          キー・音階
    [data-part] 行             data-off / [data-spk] / [data-pvol] / [data-pout]、select は PARTS の selId
    input[data-knob=id]        スライダー、output[data-knob-out=id] が表示
    [data-seg=name] [data-i]   1つ選ぶボタン（i は options の添字）
    [data-chip=path]           オン・オフ
    #iconPlay #iconPause       再生アイコン（.hidden で出し分け）
    #roll                      ピアノロール。色は CSS 変数 --roll-acc / -lav / -mint / -line / -muted
    #theme                     （あれば）明暗の切り替え
*/
import * as E from "./engine.js";
import {
  KNOBS, PARTS, SEGS, CHIPS, getPath, setPath, knobText, defaultState,
} from "./controls.js";

const FMT={
  pcm :{ext:'caf',mime:'audio/x-caf',label:'CAF',per:2,tag:'-lossless',
        note:'無劣化。ALACに変換する元データとしても、そのまま鳴らす音源としてもこれが基準'},
  ima4:{ext:'caf',mime:'audio/x-caf',label:'CAF',per:34/64,tag:'-ima4',
        note:'容量は1/4だが量子化ノイズが乗る（SNRおよそ39dB）。静かな曲だと気になることがある'},
  wav :{ext:'wav',mime:'audio/wav',label:'WAV',per:2,tag:'',
        note:'無劣化。DAWや変換ツールに渡すならこれ'},
  mid :{ext:'mid',mime:'audio/midi',label:'MIDI',per:0,tag:'',
        note:'パートごとにトラック分けした標準MIDI。自分で編曲するならこれ'}};

/* loadTone: () => Promise<Tone>。Astro は npm の tone、単体HTMLは CDN から読む */
export function startStudio({loadTone}){
  const $=id=>document.getElementById(id);
  const $$=sel=>[...document.querySelectorAll(sel)];
  const pressed=(el,on)=>el.setAttribute('aria-pressed',on?'true':'false');
  const setStatus=(el,text,bad)=>{ el.textContent=text; el.dataset.bad=bad?'true':'false'; };

  const state=Object.assign(defaultState(),{playing:false,ready:false,rig:null,song:null,busy:false});

  function syncUI(){
    const P=E.PRESETS[state.preset];
    $$('#moods [data-k]').forEach(b=>pressed(b,b.dataset.k===state.preset));
    $('selKey').value=String(state.key);
    $('selScale').value=state.scale;
    $('scaleNote').textContent=E.SCALES[state.scale].desc;
    for(const p of PARTS){
      $(p.selId).value=state[p.path];
      const row=document.querySelector(`[data-part="${p.key}"]`), on=!state.mute[p.key];
      row.dataset.off=on?'false':'true';
      const spk=row.querySelector('[data-spk]');
      pressed(spk,on);
      spk.setAttribute('aria-label',p.name+(on?'：鳴らしている（押すと止める）':'：止めている（押すと鳴らす）'));
      row.querySelector('[data-pvol]').value=state.partVol[p.key];
      row.querySelector('[data-pout]').textContent=state.partVol[p.key];
    }
    for(const k of KNOBS){
      const v=getPath(state,k.path);
      $$(`[data-knob="${k.id}"]`).forEach(el=>{ el.value=v; });
      $$(`[data-knob-out="${k.id}"]`).forEach(el=>{ el.textContent=knobText(k,v); });
    }
    for(const s of SEGS){
      const v=getPath(state,s.path);
      $$(`[data-seg="${s.name}"] [data-i]`).forEach(b=>pressed(b,s.options[+b.dataset.i][0]===v));
    }
    for(const c of CHIPS) for(const [path] of c.items)
      $$(`[data-chip="${path}"]`).forEach(b=>pressed(b,getPath(state,path)));

    const secs=(state.sections*16*P.beats)*(60/state.bpm);
    $('lenInfo').textContent='1周 '+secs.toFixed(1)+'秒';
    const F=FMT[state.fmt], isMidi=state.fmt==='mid';
    // MIDI には出力レベルもチャンネルもないので、触れないようにしておく
    for(const s of SEGS) if(s.audioOnly&&$(s.row)) $(s.row).dataset.disabled=isMidi?'true':'false';
    $('fmtNote').textContent=F.note;
    $('sizeNote').textContent=isMidi?'数十KB'
      :'書き出し後およそ '+((secs*44100*state.ch*F.per)/1048576).toFixed(1)+'MB';
    const tgt=E.PEAKS[state.peak];
    $('peakNote').textContent = tgt===null
      ? '合成そのままのレベル（ピークは −9 dBFS 前後になる）'
      : 'ピークが '+tgt+' dBFS に来るよう書き出し時に持ち上げる';
    $('codeIn').value=E.prettyCode(E.encodeRecipe(state));
  }

  function applyLive(){
    if(!state.ready||!state.rig) return;
    E.setupTransport(E.TR(),state);
    state.rig.apply(state);
    state.rig.master.volume.rampTo(E.masterDb(state.vol),.08);
  }
  function rebuild(resetPos){
    if(pending){ cancelAnimationFrame(pending); pending=0; }
    state.song=E.buildSong(state);
    if(state.ready){
      const t=E.TR();
      t.cancel(0);
      t.timeSignature=state.song.beats;
      t.loop=true; t.loopStart=0; t.loopEnd=state.song.bars+'m';
      E.scheduleAll(t,state.rig,state.song,state);
      if(resetPos && state.playing) t.position=0;
    }
    drawRoll();
  }
  // スライダーを引きずると input が1フレームに何度も来るので、作り直しは1フレームに1回
  let pending=0;
  function rebuildSoon(){ if(!pending) pending=requestAnimationFrame(()=>rebuild()); }

  const EFFECTS={
    rebuild:()=>rebuildSoon(),
    reset:()=>rebuild(true),
    live:()=>applyLive(),
    'live+rebuild':()=>{ applyLive(); rebuild(); },
    bpm:()=>{ if(state.ready) E.TR().bpm.value=state.bpm; },
    swing:()=>{ if(state.ready) E.TR().swing=state.swing/100*0.6; },
    vol:()=>{ if(state.rig) state.rig.master.volume.rampTo(E.masterDb(state.vol),.1); },
    ui:()=>{},
  };
  const change=(path,v,on)=>{ setPath(state,path,v); EFFECTS[on](); syncUI(); };

  function selectPreset(k){
    const P=E.PRESETS[k];
    state.preset=k; state.bpm=P.bpm; state.swing=P.swing; state.scale=P.scale;
    state.lead=P.lead; state.pad=P.pad; state.bassStyle=P.bass; state.drums=P.drums;
    applyLive(); rebuild(true); syncUI();
  }

  $$('#moods [data-k]').forEach(b=>b.addEventListener('click',()=>selectPreset(b.dataset.k)));
  $('selKey').addEventListener('change',e=>change('key',+e.target.value,'rebuild'));
  $('selScale').addEventListener('change',e=>change('scale',e.target.value,'rebuild'));
  for(const p of PARTS){
    $(p.selId).addEventListener('change',e=>change(p.path,e.target.value,p.on));
    const row=document.querySelector(`[data-part="${p.key}"]`);
    row.querySelector('[data-spk]').addEventListener('click',()=>change('mute.'+p.key,!state.mute[p.key],'rebuild'));
    row.querySelector('[data-pvol]').addEventListener('input',e=>{
      state.partVol[p.key]=+e.target.value;
      if(state.rig) state.rig.setLevels(state);
      syncUI();
    });
  }
  for(const k of KNOBS) $$(`[data-knob="${k.id}"]`).forEach(el=>
    el.addEventListener('input',e=>change(k.path,+e.target.value,k.on)));
  for(const s of SEGS) $$(`[data-seg="${s.name}"] [data-i]`).forEach(b=>
    b.addEventListener('click',()=>change(s.path,s.options[+b.dataset.i][0],s.on)));
  for(const c of CHIPS) for(const [path] of c.items) $$(`[data-chip="${path}"]`).forEach(b=>
    b.addEventListener('click',()=>change(path,!getPath(state,path),c.on)));

  $('reroll').addEventListener('click',()=>{
    state.seed=(Math.random()*9000000|0)+1000; rebuild(); syncUI();
  });
  $('dice').addEventListener('click',()=>{
    const o=E.omakase(Math.random);
    Object.assign(state,o,{sections:state.sections,tone:state.tone,peak:state.peak});
    applyLive(); rebuild(true); syncUI();
  });

  $('codeApply').addEventListener('click',()=>{
    const r=E.decodeRecipe($('codeIn').value), st=$('codeStatus');
    if(!r){ setStatus(st,'そのコードは読めなかった。文字の抜けがないか確認してみて。',true); return; }
    // decodeRecipe はレシピに入る項目だけを返す（試聴音量や書き出し形式は今のまま）
    Object.assign(state,r);
    applyLive(); rebuild(true); syncUI();
    setStatus(st,'読み込んだ。まったく同じ演奏が戻ってるはず。');
  });
  $('codeCopy').addEventListener('click',async()=>{
    const st=$('codeStatus');
    try{ await navigator.clipboard.writeText($('codeIn').value); setStatus(st,'コピーした。'); }
    catch(e){ $('codeIn').select(); setStatus(st,'選択したので手動でコピーして。'); }
  });

  if($('theme')) $('theme').addEventListener('click',()=>{
    const cur=document.documentElement.getAttribute('data-theme');
    const dark=cur? cur==='dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme',dark?'light':'dark');
    drawRoll();
  });

  $('play').addEventListener('click',async()=>{
    if(state.busy) return;
    if(!state.ready){
      state.busy=true; $('play').disabled=true;
      try{
        const T=await loadTone();
        if(!T) throw new Error('Tone.js');
        E.useTone(T);
        await T.start();
        E.setupTransport(E.TR(),state);
        state.rig=E.createRig();
        state.rig.apply(state,0);
      }catch(e){
        $('hint').textContent='音源を読み込めなかった。通信環境を変えて開き直してみて。';
        state.busy=false; $('play').disabled=false; return;
      }
      state.rig.master.volume.value=E.masterDb(state.vol);
      state.ready=true; state.busy=false; $('play').disabled=false;
      $('hint').style.display='none';
      if(!state.rig.hasVerb) $('exportStatus').textContent='この環境では残響が作れなかったのでドライで鳴らしてる。書き出しは問題なくできる。';
      rebuild(true);
    }
    const t=E.TR();
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
  const FALLBACK={acc:'#FE5F55', lav:'#a694ea', mint:'#3fcbaf', line:'#3f3f46', muted:'#a1a1aa'};
  const colors=()=>{
    const s=getComputedStyle(cv), out={};
    for(const k of Object.keys(FALLBACK)) out[k]=s.getPropertyValue('--roll-'+k).trim()||FALLBACK[k];
    return out;
  };
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
    const C=colors();
    const spb=60/state.bpm, barSec=state.song.beats*spb;
    const loopSec=state.song.bars*barSec;
    const p=state.ready?(E.TR().seconds%loopSec):0;
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
        if(state.mute[E.GROUP[e.kind]]) continue;
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
    $('chordname').textContent=ch?E.chordLabel(ch,state.key,E.PRESETS[state.preset].tonic):'';
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
  // claude.ai の Artifact の中ではふつうのダウンロードが止められているので、あればそちらを使う
  async function claudeUse(name){
    try{ if(!window.claude||!window.claude.use) return null; return await window.claude.use(name); }
    catch(e){ return null; }
  }
  async function deliver(name,ext,mime,bytes,label,extra){
    const st=$('exportStatus');
    const mb=bytes.length>=1048576?(bytes.length/1048576).toFixed(2)+'MB'
                                  :Math.round(bytes.length/1024)+'KB';
    const dl=await claudeUse('downloads');
    if(dl){
      try{
        await dl.save({filename:name+'.zip',data:E.zipStore(name+'.'+ext,bytes)});
        setStatus(st,'保存した（'+mb+(extra||'')+'）。ZIPの中の '+name+'.'+ext+' を使ってね。');
      }catch(e){
        const c=(e&&e.code)||'不明';
        if(c==='declined') setStatus(st,'保存をやめたよ。');
        else setStatus(st,'この画面ではファイル保存が止められてる（'+c+'）。'
          +'このHTMLを保存してローカルのブラウザで開けば、'+label+'がそのまま落ちてくる。',true);
      }
    }else{
      saveLocal(name+'.'+ext,bytes,mime);
      setStatus(st,'保存した： '+name+'.'+ext+'（'+mb+(extra||'')+'）');
    }
  }
  $('export').addEventListener('click',async()=>{
    const st=$('exportStatus'), btn=$('export');
    setStatus(st,st.textContent);
    btn.disabled=true;
    const code=E.encodeRecipe(state);
    const song=E.buildSong(state);
    const base='loop-'+state.preset+'-'+state.bpm+'bpm-'+song.bars+'bars-'+code;
    const F=FMT[state.fmt];

    if(state.fmt==='mid'){
      try{
        await deliver(base,'mid','audio/midi',E.buildMidi(song,state),'MIDI',' / 6トラックまで');
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
      const {buf,dry,liveRate}=await E.renderOffline(song,state,loopSec,tail,async()=>{
        setStatus(st,'残響ありで合成できなかった。残響なしでやり直してる…');
        await new Promise(r=>setTimeout(r,30));
      });

      stage='後処理';
      const {outs,sr,n,peak,rms}=E.finishLoop(buf,liveRate,loopSec,state.ch,state.peak);
      const dB=v=>v>1e-9?(20*Math.log10(v)).toFixed(1):'-inf';

      stage='符号化';
      const bytes = state.fmt==='ima4' ? E.encodeCaf(outs,sr)
                  : state.fmt==='pcm'  ? E.encodeCafPcm(outs,sr)
                  :                      E.encodeWav(outs,sr);
      stage='保存';
      await deliver(base+F.tag+(outs.length===1?'-mono':''),F.ext,F.mime,bytes,F.label,
        ' / '+(n/sr).toFixed(3)+'秒 / '+(outs.length===1?'モノラル':'ステレオ')
        +' / ピーク '+dB(peak)+' dBFS・RMS '+dB(rms)+' dBFS'
        +(dry?' / 残響ありで合成できなかったので残響なし':''));
    }catch(err){
      setStatus(st,stage+'でつまずいた：'+((err&&(err.code||err.message))||'不明')
        +'。もう一度押してみて。続くときはレシピコードを添えて教えてもらえると直せる。',true);
    }finally{ btn.disabled=false; }
  });

  /* ---- boot ---- */
  state.song=E.buildSong(state);
  syncUI();
  setIcon(false);
  fit();
  return state;
}
