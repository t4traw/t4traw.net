import { PC, PCF, SHARP_KEYS, QUAL, EXT, SUF } from "./data.js";

export function midiName(m){ return PC[((m%12)+12)%12]+(Math.floor(m/12)-1); }
/* Spell chord roots the way a musician would: flats unless we're in a sharp key. */
export function chordLabel(ch,key,tonic){
  const sharp=SHARP_KEYS.has((((tonic||0)+key)%12+12)%12);
  return (sharp?PC:PCF)[((ch[0]+key)%12+12)%12]+SUF[ch[1]];
}
export function notesInRange(pcs,lo,hi){
  const set=new Set(pcs.map(p=>((p%12)+12)%12)), out=[];
  for(let m=lo;m<=hi;m++) if(set.has(m%12)) out.push(m);
  return out.length?out:[lo];
}
export function chordPool(rootPc,q,lo,hi){
  const pcs=QUAL[q].map(i=>rootPc+i).concat((EXT[q]||[]).map(i=>rootPc+i));
  return notesInRange(pcs,lo,hi);
}
export function voicing(rootPc,q,lo,hi){
  const ints=QUAL[q].slice(1), notes=[];
  for(const iv of ints){
    let m=lo+((((rootPc+iv)-lo)%12)+12)%12;
    while(m>hi) m-=12;
    if(m>=lo) notes.push(m);
  }
  return [...new Set(notes)].sort((a,b)=>a-b).slice(0,4);
}

export function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
