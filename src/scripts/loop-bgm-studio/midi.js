import { LEADS, PADS, BASSES } from "./data.js";
import { GROUP } from "./song.js";
import { encodeRecipe } from "./recipe.js";

/* ============================================================
   Standard MIDI File (format 1) — one track per part, for arranging
   ============================================================ */
export const TPQ=480;
export const DRUM_NOTE={kick:36,rim:37,clap:39,shaker:82,hat:42};
export function vlq(n){
  const b=[n&0x7F]; n=Math.floor(n/128);
  while(n>0){ b.unshift((n&0x7F)|0x80); n=Math.floor(n/128); }
  return b;
}
export function txtMeta(type,str){
  const b=[]; for(let i=0;i<str.length;i++) b.push(str.charCodeAt(i)&0x7F);
  return [0xFF,type,...vlq(b.length),...b];
}
export function buildMidi(song,st){
  const sw=st.swing/100*0.6, beats=song.beats, EPB=song.epb;
  const tickOf=p8=>{
    const bar=Math.floor(p8/EPB), w=p8%EPB;
    let t=(bar*beats+Math.floor(w/2))*TPQ;
    if(w%2===1) t+=TPQ/2+sw*(TPQ*2/3-TPQ/2);
    return Math.round(t);
  };
  const tracks=[];
  const us=Math.round(60000000/st.bpm);
  tracks.push([[0,txtMeta(3,'loop-bgm '+encodeRecipe(st))],
               [0,[0xFF,0x51,0x03,(us>>16)&255,(us>>8)&255,us&255]],
               [0,[0xFF,0x58,0x04,beats,2,24,8]]]);
  const addTrack=(name,ch,program,evs,drum,part)=>{
    if(!evs.length) return;
    const t=[[0,txtMeta(3,name)]];
    if(program!==null) t.push([0,[0xC0|ch,program]]);
    t.push([0,[0xB0|ch,7,Math.max(0,Math.min(127,Math.round(st.partVol[part]/100*127)))]]);
    for(const e of evs){
      const on=tickOf(e.p8);
      const len=drum?40:Math.max(48,Math.round((e.d8||1)*TPQ/2)-14);
      const v=Math.max(1,Math.min(127,Math.round((e.vel||.7)*112)));
      const notes=drum?[DRUM_NOTE[e.kind]]:(e.notes||[e.note]);
      for(const nn of notes){
        if(nn===undefined) continue;
        t.push([on,[0x90|ch,nn,v]]);
        t.push([on+len,[0x80|ch,nn,0]]);
      }
    }
    tracks.push(t);
  };
  const E=song.events, keep=g=>!st.mute[g];
  const layer=l=>keep('lead')?E.filter(e=>e.kind==='lead'&&e.layer===l):[];
  addTrack('Melody',0,LEADS[st.lead].gm,layer('main'),false,'lead');
  addTrack('Layers',1,LEADS[st.lead].gm,
    keep('lead')?E.filter(e=>e.kind==='lead'&&(e.layer==='oct'||e.layer==='harm')):[],false,'lead');
  addTrack('Counter',2,LEADS[st.lead].gm,layer('counter'),false,'lead');
  addTrack('Chords',3,PADS[st.pad].gm,keep('chord')?E.filter(e=>e.kind==='chord'):[],false,'chord');
  addTrack('Bass',4,BASSES[st.bassStyle].gm,keep('bass')?E.filter(e=>e.kind==='bass'):[],false,'bass');
  addTrack('Drums',9,null,
    keep('drum')?E.filter(e=>GROUP[e.kind]==='drum'&&DRUM_NOTE[e.kind]!==undefined):[],true,'drum');

  const out=[0x4D,0x54,0x68,0x64,0,0,0,6,0,1,
             (tracks.length>>8)&255,tracks.length&255,(TPQ>>8)&255,TPQ&255];
  for(const t of tracks){
    t.sort((a,b)=> a[0]-b[0] || ((a[1][0]&0xF0)===0x80?-1:1)-((b[1][0]&0xF0)===0x80?-1:1));
    const data=[]; let last=0;
    for(const [tick,bytes] of t){
      data.push(...vlq(Math.max(0,tick-last)),...bytes);
      last=tick;
    }
    data.push(0,0xFF,0x2F,0x00);
    out.push(0x4D,0x54,0x72,0x6B,(data.length>>>24)&255,(data.length>>>16)&255,
             (data.length>>>8)&255,data.length&255,...data);
  }
  return new Uint8Array(out);
}
