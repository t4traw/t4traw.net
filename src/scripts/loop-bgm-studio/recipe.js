import { LEADS, PADS, BASSES, KITS, PRESETS, SCALES } from "./data.js";

/* ============================================================
   recipe code — every knob packed into one filename-safe string
   v1 = 29 hex digits (no key/scale/swing); v2 = 33 and still reads v1.
   ============================================================ */
export const LEAD_KEYS=Object.keys(LEADS), PAD_KEYS=Object.keys(PADS),
      BASS_KEYS=Object.keys(BASSES), KIT_KEYS=Object.keys(KITS),
      MOOD_KEYS=Object.keys(PRESETS), SCALE_KEYS=Object.keys(SCALES);
export const W1=[1,1,1,1,1,1,2,1,2,2,2,2,2,1,2,7];
export const W2=W1.concat([1,1,2]);
export const W3=W2.concat([2,2,2,2]);
export const W4=W3.map((w,i)=>i===1?2:w);
export const LAYOUT={'1':W1,'2':W2,'3':W3,'4':W4};
export const CODE_LEN=33;
export const sumW=w=>w.reduce((a,b)=>a+b,0);
export const PEAKS=[-3,-6,-9,null];

export function encodeRecipe(st){
  const f=(st.mel.octUp?1:0)|(st.mel.harm?2:0)|(st.mel.counter?4:0)
        |(st.mute.lead?8:0)|(st.mute.chord?16:0)|(st.mute.bass?32:0)|(st.mute.drum?64:0);
  const v=[4,
    MOOD_KEYS.indexOf(st.preset), LEAD_KEYS.indexOf(st.lead),
    PAD_KEYS.indexOf(st.pad), BASS_KEYS.indexOf(st.bassStyle), KIT_KEYS.indexOf(st.drums),
    st.bpm, st.sections, st.density, st.tone,
    st.mel.dens, st.mel.range, st.mel.leap, (st.mel.oct+1)|(st.peak<<2), f, st.seed,
    st.key, SCALE_KEYS.indexOf(st.scale), st.swing,
    st.partVol.lead, st.partVol.chord, st.partVol.bass, st.partVol.drum];
  let hex='';
  v.forEach((x,i)=>{ hex+=Math.max(0,x).toString(16).padStart(W4[i],'0').slice(-W4[i]); });
  let n=0n;
  for(const c of hex) n=n*16n+BigInt(parseInt(c,16));
  let out='';
  while(n>0n){ out=(Number(n%36n)).toString(36)+out; n/=36n; }
  return out.padStart(CODE_LEN,'0').toUpperCase();
}
export function decodeRecipe(str){
  const s=(str||'').replace(/[^0-9a-zA-Z]/g,'').toLowerCase();
  if(!s) return null;
  let n=0n;
  for(const c of s){
    const d=parseInt(c,36);
    if(isNaN(d)) return null;
    n=n*36n+BigInt(d);
  }
  // every layout starts with a non-zero version nibble, so once leading zeros
  // are gone the version and the exact length identify the layout on their own
  const body=n.toString(16);
  const W=LAYOUT[body[0]];
  if(!W || body.length!==sumW(W)) return null;
  const v=[]; let o=0;
  W.forEach(w=>{ v.push(parseInt(body.slice(o,o+w),16)); o+=w; });
  const has2=W.length>=W2.length, has3=W.length>=W3.length;
  const pick=(arr,i)=>arr[i]!==undefined?arr[i]:arr[0];
  const preset=pick(MOOD_KEYS,v[1]), f=v[14];
  return {
    preset, lead:pick(LEAD_KEYS,v[2]), pad:pick(PAD_KEYS,v[3]),
    bassStyle:pick(BASS_KEYS,v[4]), drums:pick(KIT_KEYS,v[5]),
    bpm:Math.min(176,Math.max(52,v[6])), sections:[1,2,4].includes(v[7])?v[7]:2,
    density:Math.min(100,v[8]), tone:Math.min(100,v[9]),
    peak:(v[13]>>2)&3,
    mel:{dens:Math.min(100,v[10]),range:Math.min(100,v[11]),leap:Math.min(100,v[12]),
         oct:Math.max(-1,Math.min(1,(v[13]&3)-1)),
         octUp:!!(f&1),harm:!!(f&2),counter:!!(f&4)},
    mute:{lead:!!(f&8),chord:!!(f&16),bass:!!(f&32),drum:!!(f&64)},
    seed:v[15],
    key:has2?(v[16]%12):0,
    scale:has2?pick(SCALE_KEYS,v[17]):PRESETS[preset].scale,
    swing:has2?Math.min(100,v[18]):PRESETS[preset].swing,
    partVol:has3?{lead:Math.min(100,v[19]),chord:Math.min(100,v[20]),
                  bass:Math.min(100,v[21]),drum:Math.min(100,v[22])}
                :{lead:80,chord:80,bass:80,drum:80}
  };
}
export const prettyCode=c=>c.replace(/(.{11})/g,'$1-').replace(/-$/,'');
