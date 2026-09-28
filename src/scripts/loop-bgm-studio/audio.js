import * as Tone from "tone";
import { LEADS, PADS, PRESETS } from "./data.js";
import { GROUP } from "./song.js";
import { midiName, mulberry32 } from "./theory.js";

/* ============================================================
   audio graph — built once, never torn down
   ============================================================ */
export function makeIR(seconds,decay){
  const ctx=Tone.getContext(), raw=ctx.rawContext||ctx, sr=raw.sampleRate;
  const n=Math.max(2048,Math.floor(sr*seconds));
  const ir=raw.createBuffer(2,n,sr);
  const rnd=mulberry32(20260920);
  for(let c=0;c<2;c++){
    const d=ir.getChannelData(c); let lp=0;
    for(let i=0;i<n;i++){
      const t=i/n;
      lp+=((rnd()*2-1)-lp)*0.34;
      d[i]=lp*Math.pow(1-t,decay)*Math.min(1,i/(sr*0.005));
    }
  }
  return ir;
}
export function createRig(opts){
  const o=opts||{};
  const master=new Tone.Volume(-4);
  const colour=new Tone.Filter({type:'lowpass',frequency:5000,Q:.4});
  const limiter=new Tone.Limiter(-1.5);
  master.connect(colour); colour.connect(limiter); limiter.toDestination();

  let verb=null;
  if(!o.noVerb){
    try{ verb=new Tone.Convolver(); verb.buffer=makeIR(2.2,2.6); verb.connect(master); }
    catch(e){ verb=null; }
  }
  const mkSend=(to)=>{ const g=new Tone.Gain(0); const d=to||verb; if(d) g.connect(d); return g; };
  // one bus per part: its gain is the part's fader, and reverb sends are taken
  // after it so the wet signal follows the fader too
  const bus={lead:new Tone.Gain(1),chord:new Tone.Gain(1),bass:new Tone.Gain(1),drum:new Tone.Gain(1)};
  Object.values(bus).forEach(g=>g.connect(master));
  const drumWet=new Tone.Gain(1); if(verb) drumWet.connect(verb);

  const lead=new Tone.PolySynth(Tone.FMSynth,LEADS.marimba.cfg);
  lead.volume.value=-9; lead.connect(bus.lead);
  const leadSend=mkSend(); bus.lead.connect(leadSend);

  const chords=new Tone.PolySynth(Tone.Synth,PADS.vibes.cfg);
  chords.volume.value=-14;
  const chFilt=new Tone.Filter({type:'lowpass',frequency:2600,Q:.3});
  chords.connect(chFilt); chFilt.connect(bus.chord);
  const chordSend=mkSend(); bus.chord.connect(chordSend);

  const bass=new Tone.MonoSynth({
    oscillator:{type:'triangle'},
    envelope:{attack:.012,decay:.3,sustain:.45,release:.35},
    filterEnvelope:{attack:.01,decay:.2,sustain:.35,release:.3,baseFrequency:110,octaves:2.4},
    filter:{Q:1.2,type:'lowpass'}});
  bass.volume.value=-9; bass.connect(bus.bass);
  const bassSend=mkSend(); bus.bass.connect(bassSend);

  const kick=new Tone.MembraneSynth({pitchDecay:.035,octaves:5.5,
    envelope:{attack:.001,decay:.28,sustain:0,release:.2}});
  kick.volume.value=-11; kick.connect(bus.drum);

  const shHP=new Tone.Filter({type:'highpass',frequency:5200});
  const shaker=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.001,decay:.045,sustain:0}});
  shaker.volume.value=-20; shaker.connect(shHP); shHP.connect(bus.drum);
  const shSend=mkSend(drumWet); shHP.connect(shSend);

  const rimBP=new Tone.Filter({type:'bandpass',frequency:1700,Q:2.2});
  const rim=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.001,decay:.08,sustain:0}});
  rim.volume.value=-14; rim.connect(rimBP); rimBP.connect(bus.drum);
  const rimSend=mkSend(drumWet); rimBP.connect(rimSend);

  const clapBP=new Tone.Filter({type:'bandpass',frequency:1200,Q:1.4});
  const clap=new Tone.NoiseSynth({noise:{type:'pink'},envelope:{attack:.002,decay:.14,sustain:0}});
  clap.volume.value=-14; clap.connect(clapBP); clapBP.connect(bus.drum);
  const clapSend=mkSend(drumWet); clapBP.connect(clapSend);

  const hatHP=new Tone.Filter({type:'highpass',frequency:7200});
  const hat=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.001,decay:.035,sustain:0}});
  hat.volume.value=-24; hat.connect(hatHP); hatHP.connect(bus.drum);

  const rig={master,colour,lead,chords,bass,kick,shaker,rim,clap,hat,hasVerb:!!verb};
  rig.setLevels=function(st,ramp){
    const t=(ramp===undefined)?0.06:ramp;
    for(const k of Object.keys(bus)){
      const g=partGain(st.partVol[k]);
      if(t>0) bus[k].gain.rampTo(g,t); else bus[k].gain.value=g;
      if(k==='drum'){ if(t>0) drumWet.gain.rampTo(g,t); else drumWet.gain.value=g; }
    }
  };
  rig.apply=function(st,ramp){
    const P=PRESETS[st.preset], L=LEADS[st.lead], D=PADS[st.pad];
    const t=(ramp===undefined)?0.08:ramp;
    const set=(param,v)=>{ if(t>0) param.rampTo(v,t); else param.value=v; };
    set(colour.frequency,P.filt*(0.55+(st.tone/100)*0.9));
    lead.set(L.cfg); if(lead.releaseAll) lead.releaseAll();
    set(lead.volume,L.vol);
    chords.set(D.cfg); if(chords.releaseAll) chords.releaseAll();
    set(chords.volume,D.vol);
    set(chFilt.frequency,D.long?2200:2600);
    set(leadSend.gain,P.rev);
    set(chordSend.gain,P.rev*1.15);
    set(bassSend.gain,P.rev*0.25);
    set(shSend.gain,P.rev*0.5);
    set(rimSend.gain,P.rev*0.8);
    set(clapSend.gain,P.rev*0.9);
    rig.setLevels(st,t);
  };
  return rig;
}
/* fader 0–100: 80 = unity, 100 = +6 dB, 0 = silent */
export function partGain(v){ return v<=0?0:Math.pow(10,((v-80)*0.3)/20); }

export const DURNAME=d=> d<=1?'8n': d<=2?'4n': d<=3?'4n.': d<=4?'2n': d<=6?'2n.':'1n';
export const posOf=(p8,epb)=>{ const bar=Math.floor(p8/epb), r=p8%epb;
  return bar+':'+Math.floor(r/2)+':'+((r%2)*2); };

export function scheduleAll(transport,rig,song,st){
  const epb=song.epb;
  for(const e of song.events){
    if(st.mute[GROUP[e.kind]]) continue;
    const t=posOf(e.p8,epb);
    switch(e.kind){
      case 'lead': transport.schedule(time=>
        rig.lead.triggerAttackRelease(midiName(e.note),DURNAME(e.d8),time,e.vel),t); break;
      case 'chord': transport.schedule(time=>
        rig.chords.triggerAttackRelease(e.notes.map(midiName),DURNAME(e.d8),time,e.vel),t); break;
      case 'bass': transport.schedule(time=>
        rig.bass.triggerAttackRelease(midiName(e.note),DURNAME(e.d8),time,e.vel),t); break;
      case 'kick': transport.schedule(time=>
        rig.kick.triggerAttackRelease('C1','8n',time,e.vel),t); break;
      case 'shaker': transport.schedule(time=>
        rig.shaker.triggerAttackRelease('32n',time,e.vel),t); break;
      case 'rim': transport.schedule(time=>
        rig.rim.triggerAttackRelease('32n',time,e.vel),t); break;
      case 'clap': transport.schedule(time=>
        rig.clap.triggerAttackRelease('16n',time,e.vel),t); break;
      case 'hat': transport.schedule(time=>
        rig.hat.triggerAttackRelease('64n',time,e.vel),t); break;
    }
  }
}
export function setupTransport(transport,st){
  transport.bpm.value=st.bpm;
  transport.timeSignature=PRESETS[st.preset].beats;
  transport.swing=st.swing/100*0.6;
  transport.swingSubdivision='8n';
}

export const getTransport=()=>Tone.getTransport();

/* 最初の再生ボタンで呼ぶ。ユーザー操作の中で AudioContext を起こす必要がある */
export async function startAudio(st){
  await Tone.start();
  setupTransport(getTransport(),st);
  const rig=createRig();
  rig.apply(st,0);
  return rig;
}

/* いま鳴っているのと同じ演奏を、残響の尻尾ぶん長めにオフラインで合成する */
export async function renderOffline(song,st,loopSec,tail){
  const liveRate=Tone.getContext().sampleRate||44100;
  const render=noVerb=>Tone.Offline(({transport})=>{
    setupTransport(transport,st);
    const rig=createRig({noVerb});
    rig.apply(st,0);
    rig.master.volume.value=-4;
    scheduleAll(transport,rig,song,st);
    transport.start(0);
  }, loopSec+tail, 2, liveRate);
  try{ return {buf:await render(false),dry:false,liveRate}; }
  catch(e){ return {buf:await render(true),dry:true,liveRate}; }
}
