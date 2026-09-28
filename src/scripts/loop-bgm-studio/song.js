import { QUAL, PADS, PRESETS, PROGS, SCALE_SET, RHY, PLANS, MIN_PLANS } from "./data.js";
import { notesInRange, chordPool, voicing, mulberry32 } from "./theory.js";

/* ============================================================
   arrangement
   p8 = eighth-note position from the start; EPB eighths per bar
   ============================================================ */
export function buildSong(st){
  const P=PRESETS[st.preset];
  const EPB=P.beats*2, MID=Math.floor(EPB/2), ACC=(P.beats===4)?[2,6]:[2,4];
  const rng=mulberry32(st.seed);
  const dens=st.density/100, mel=st.mel, key=st.key;
  const sections=st.sections, bars=16*sections, total=bars*EPB;
  const prog=PROGS[P.prog];
  const chords=[];
  for(let s=0;s<sections;s++) for(let i=0;i<16;i++) chords.push(prog[i]);

  const ev=[];
  const center=P.center+mel.oct*12;
  const half=Math.round(4+(mel.range/100)*14);
  const lo=Math.max(55,center-half), hi=Math.min(101,center+half);
  const leap=mel.leap/100;
  const restP=0.72-0.69*(mel.dens/100);

  // A fixed scale set makes the line ignore the chord changes, which is a
  // different character on purpose; 'chord' follows the harmony instead.
  // 'triad' also follows the harmony, but keeps only root / 3rd / 5th.
  const fixedPcs = SCALE_SET[st.scale]
    ? SCALE_SET[st.scale](P.minor).map(i=>i+P.tonic+key) : null;
  const poolAt=(ch,l,h)=> fixedPcs?notesInRange(fixedPcs,l,h)
    : st.scale==='triad' ? notesInRange(QUAL[ch[1]].slice(0,3).map(i=>i+ch[0]+key),l,h)
    : chordPool(ch[0]+key,ch[1],l,h);

  const nextStep=()=>{
    const r=rng();
    let s=r<.40?1:r<.72?-1:r<.84?2:r<.94?-2:(r<.97?3:-3);
    if(Math.abs(s)>1 && rng()>leap*1.6) s=Math.sign(s);
    else if(Math.abs(s)===1 && rng()<(leap-0.55)*1.1) s*=(rng()<.5?2:3);
    return s;
  };

  /* --- main melody --- */
  const contourCache={};
  let prevIdx=null;
  for(let s=0;s<sections;s++){
    const plan=(P.plan==='minimal'?MIN_PLANS:PLANS)[s%PLANS.length];
    for(let ph=0;ph<8;ph++){
      const role=plan[ph], rhy=RHY[P.beats][role], barBase=s*16+ph*2;
      if(!contourCache[role]){
        const c=[0];
        for(let k=1;k<rhy.length;k++) c.push(nextStep());
        contourCache[role]=c;
      }
      const contour=contourCache[role];
      for(let k=0;k<rhy.length;k++){
        const p8=rhy[k], ch=chords[barBase+Math.floor(p8/EPB)];
        const pl=poolAt(ch,lo,hi);
        if(prevIdx===null) prevIdx=Math.floor(pl.length*0.45);
        let idx=prevIdx+contour[k];
        if(k>0 && idx>pl.length-2) idx=prevIdx-Math.abs(contour[k]);
        if(k>0 && idx<1) idx=prevIdx+Math.abs(contour[k]);
        if(idx<0) idx=-idx;
        if(idx>=pl.length) idx=pl.length-1-(idx-pl.length+1);
        idx=Math.max(0,Math.min(pl.length-1,idx));
        prevIdx=idx;
        if(rng()<(k===0?restP*0.45:restP)) continue;
        const next=rhy[k+1];
        let d8=(k===rhy.length-1)?Math.min(4,2*EPB-p8):(next-p8);
        if(rng()<.22) d8=Math.min(d8+2,6);
        const at=barBase*EPB+p8;
        if(at>=total) continue;
        const vel=(p8%2===0?.72:.56)+rng()*.12;
        ev.push({kind:'lead',layer:'main',p8:at,d8,note:pl[idx],vel});
        if(mel.octUp && pl[idx]+12<=103)
          ev.push({kind:'lead',layer:'oct',p8:at,d8,note:pl[idx]+12,vel:vel*.42});
        if(mel.harm && idx>=2)
          ev.push({kind:'lead',layer:'harm',p8:at,d8,note:pl[idx-2],vel:vel*.52});
      }
    }
  }

  /* --- counter line: sparse, an octave below, answering in the gaps --- */
  if(mel.counter){
    const CR=[0,MID,EPB,EPB+MID];
    let cIdx=null;
    for(let b=1;b<bars;b+=2){
      const cl=Math.max(48,lo-14), chh=Math.max(cl+7,lo-2);
      for(const p8 of CR){
        const at=b*EPB+p8;
        if(at>=total) continue;
        const ch=chords[b+Math.floor(p8/EPB)];
        const pl=poolAt(ch,cl,chh);
        if(cIdx===null) cIdx=Math.floor(pl.length*0.5);
        if(rng()<0.45) continue;
        cIdx=Math.max(0,Math.min(pl.length-1,cIdx+(rng()<.5?1:-1)));
        ev.push({kind:'lead',layer:'counter',p8:at,d8:2,note:pl[cIdx],vel:.34+rng()*.08});
      }
    }
  }

  /* --- bass / comping / kit --- */
  const nearRoot=(pc,prev)=>{
    const base=36+(((pc%12)+12)%12);
    const cands=[base,base+12].filter(c=>c>=36&&c<=51);
    if(prev===null) return cands[cands.length-1];
    return cands.reduce((a,c)=>Math.abs(c-prev)<Math.abs(a-prev)?c:a,cands[0]);
  };
  const padLong=PADS[st.pad].long;
  let prevRoot=null;
  for(let b=0;b<bars;b++){
    const ch=chords[b], nx=chords[(b+1)%bars], base=b*EPB;
    const root=nearRoot(ch[0]+key,prevRoot); prevRoot=root;
    const third=root+QUAL[ch[1]][1], fifth=root+7;
    const nRoot=nearRoot(nx[0]+key,root);

    if(st.bassStyle==='whole'){
      ev.push({kind:'bass',p8:base,d8:EPB,note:root,vel:.7});
    }else if(st.bassStyle==='bounce'){
      for(let p=0;p<EPB;p+=2){
        const n=(p===MID)?fifth:root;
        ev.push({kind:'bass',p8:base+p,d8:2,note:n,vel:p===0?.85:.6});
      }
    }else if(st.bassStyle==='offbeat'){
      for(let p=1;p<EPB;p+=2)
        ev.push({kind:'bass',p8:base+p,d8:1,note:root,vel:.74});
    }else if(st.bassStyle==='pulse'){
      for(let p=0;p<EPB;p++)
        ev.push({kind:'bass',p8:base+p,d8:1,note:(p%4===2)?root+12:root,vel:p%2?.5:.74});
    }else if(st.bassStyle==='octave'){
      for(let p=0;p<EPB;p++)
        ev.push({kind:'bass',p8:base+p,d8:1,note:p%2?root+12:root,vel:p%2?.55:.78});
    }else if(st.bassStyle==='synco'){
      // 3+3+2 in 4/4, 3+2+1 in 3/4
      const pts=P.beats===4?[0,3,6]:[0,3,5], ns=[root,root,fifth];
      pts.forEach((p,i)=>{
        const d=(i<pts.length-1?pts[i+1]:EPB)-p;
        ev.push({kind:'bass',p8:base+p,d8:d,note:ns[i],vel:i===0?.85:.64});
      });
    }else if(st.bassStyle==='arp'){
      const seq=[root,third,fifth,root+12];
      for(let p=0,i=0;p<EPB;p+=2,i++)
        ev.push({kind:'bass',p8:base+p,d8:2,note:seq[i%4],vel:p===0?.82:.6});
    }else if(st.bassStyle==='walk'){
      [[0,root],[2,third],[MID,fifth],[EPB-1,nRoot+(rng()<.5?-1:1)]].forEach(([p,n])=>{
        if(p<EPB) ev.push({kind:'bass',p8:base+p,d8:2,note:n,vel:p===0?.85:.62});
      });
    }else{
      ev.push({kind:'bass',p8:base,d8:MID-1,note:root,vel:.85});
      ev.push({kind:'bass',p8:base+MID,d8:MID-1,note:fifth,vel:.62});
      if(rng()<.35+.3*dens)
        ev.push({kind:'bass',p8:base+EPB-1,d8:1,note:nRoot+(rng()<.5?-1:1),vel:.55});
    }

    const vc=voicing(ch[0]+key,ch[1],55,74);
    if(padLong){
      ev.push({kind:'chord',p8:base,d8:EPB,notes:vc,vel:.30});
    }else{
      P.comp.forEach((p,i)=>{
        if(p>=EPB) return;
        if(i>0 && rng()>0.45+0.5*dens) return;
        ev.push({kind:'chord',p8:base+p,d8:2,notes:vc,vel:.30+(p===0?.06:0)});
      });
    }

    const kit=st.drums;
    if(kit==='brush'){
      for(let p=0;p<EPB;p++) ev.push({kind:'shaker',p8:base+p,vel:p%2?.42:.26});
      ACC.forEach(p=>ev.push({kind:'rim',p8:base+p,vel:.5}));
      ev.push({kind:'kick',p8:base,vel:.62});
      if(rng()<.25+.45*dens) ev.push({kind:'kick',p8:base+MID+1,vel:.42});
    }else if(kit==='pop'){
      for(let p=0;p<EPB;p++) ev.push({kind:'hat',p8:base+p,vel:p%2?.30:.44});
      ACC.forEach(p=>ev.push({kind:'clap',p8:base+p,vel:.52}));
      ev.push({kind:'kick',p8:base,vel:.8});
      ev.push({kind:'kick',p8:base+MID-1,vel:.55});
      if(rng()<.3+.4*dens) ev.push({kind:'kick',p8:base+EPB-2,vel:.4});
    }else if(kit==='night'){
      for(let p=1;p<EPB;p+=2) ev.push({kind:'shaker',p8:base+p,vel:.34});
      ev.push({kind:'rim',p8:base+EPB-2,vel:.46});
      ev.push({kind:'kick',p8:base,vel:.6});
    }else if(kit==='four'){
      for(let p=0;p<EPB;p+=2) ev.push({kind:'kick',p8:base+p,vel:.84});
      for(let p=1;p<EPB;p+=2) ev.push({kind:'hat',p8:base+p,vel:.46});
      ACC.forEach(p=>ev.push({kind:'clap',p8:base+p,vel:.44}));
      if(rng()<.2+.6*dens) for(let p=0;p<EPB;p++) ev.push({kind:'shaker',p8:base+p,vel:p%2?.2:.12});
    }else if(kit==='halftime'){
      // snare on beat 3 (p8 4 in both meters): half the pulse, same tempo
      for(let p=0;p<EPB;p++) ev.push({kind:'hat',p8:base+p,vel:p%2?.22:.34});
      ev.push({kind:'kick',p8:base,vel:.74});
      ev.push({kind:'clap',p8:base+4,vel:.5});
      if(rng()<.3+.4*dens) ev.push({kind:'kick',p8:base+EPB-1,vel:.4});
    }else if(kit==='bossa'){
      // 2-bar clave on the rim, soft kick, even shaker
      for(let p=0;p<EPB;p++) ev.push({kind:'shaker',p8:base+p,vel:p%2?.3:.2});
      ((b%2===0)?[0,3,6]:[2,5]).forEach(p=>{ if(p<EPB) ev.push({kind:'rim',p8:base+p,vel:.42}); });
      ev.push({kind:'kick',p8:base,vel:.5});
      ev.push({kind:'kick',p8:base+MID,vel:.4});
    }else if(kit==='breaks'){
      for(let p=0;p<EPB;p++) ev.push({kind:'hat',p8:base+p,vel:p%2?.24:.36});
      ACC.forEach(p=>ev.push({kind:'clap',p8:base+p,vel:.5}));
      ev.push({kind:'kick',p8:base,vel:.8});
      ev.push({kind:'kick',p8:base+MID+1,vel:.6});
      if(rng()<.35+.4*dens) ev.push({kind:'kick',p8:base+3,vel:.42});
      if(rng()<.3+.4*dens) ev.push({kind:'rim',p8:base+EPB-1,vel:.26});
    }else if(kit==='soft'){
      // kick on the strong beats and a whisper of shaker, no backbeat at all
      ev.push({kind:'kick',p8:base,vel:.5});
      if(P.beats===4) ev.push({kind:'kick',p8:base+4,vel:.34});
      for(let p=1;p<EPB;p+=2) ev.push({kind:'shaker',p8:base+p,vel:.18});
    }else if(kit==='tick'){
      for(let p=0;p<EPB;p+=2) ev.push({kind:'shaker',p8:base+p,vel:p===0?.4:.24});
      ev.push({kind:'rim',p8:base+MID,vel:.34});
    }
  }
  ev.sort((a,b)=>a.p8-b.p8);
  return {events:ev,chords,bars,beats:P.beats,epb:EPB,key};
}

export const GROUP={lead:'lead',chord:'chord',bass:'bass',
  kick:'drum',shaker:'drum',rim:'drum',clap:'drum',hat:'drum'};
