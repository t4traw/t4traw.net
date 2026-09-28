/* ============================================================
   WAV / CAF(PCM, IMA4) / ZIP
   ============================================================ */
export function encodeWav(chans,rate){
  const nch=chans.length, n=chans[0].length, bytes=n*nch*2;
  const buf=new ArrayBuffer(44+bytes), dv=new DataView(buf);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF'); dv.setUint32(4,36+bytes,true); w(8,'WAVE'); w(12,'fmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,nch,true);
  dv.setUint32(24,rate,true); dv.setUint32(28,rate*nch*2,true);
  dv.setUint16(32,nch*2,true); dv.setUint16(34,16,true);
  w(36,'data'); dv.setUint32(40,bytes,true);
  let o=44;
  for(let i=0;i<n;i++) for(let c=0;c<nch;c++){
    const v=Math.max(-1,Math.min(1,chans[c][i]));
    dv.setInt16(o,v<0?v*0x8000:v*0x7FFF,true); o+=2;
  }
  return new Uint8Array(buf);
}
/* Lossless 16-bit PCM in a CAF wrapper — the right master for afconvert,
   and playable on iOS with no decode cost and no codec padding. */
export function encodeCafPcm(chans,rate){
  const nch=chans.length, n=chans[0].length;
  const bytes=n*nch*2, dataSize=4+bytes;
  const head=new ArrayBuffer(8+12+32+12+4);
  const dv=new DataView(head); let o=0;
  const tag=t=>{ for(let i=0;i<4;i++) dv.setUint8(o+i,t.charCodeAt(i)); o+=4; };
  const u32=v=>{ dv.setUint32(o,v,false); o+=4; };
  const i64=v=>{ dv.setUint32(o,Math.floor(v/4294967296),false); dv.setUint32(o+4,v>>>0,false); o+=8; };
  tag('caff'); dv.setUint16(o,1,false); o+=2; dv.setUint16(o,0,false); o+=2;
  tag('desc'); i64(32);
  dv.setFloat64(o,rate,false); o+=8;
  tag('lpcm'); u32(0); u32(2*nch); u32(1); u32(nch); u32(16);
  tag('data'); i64(dataSize); u32(0);
  const out=new Uint8Array(o+bytes);
  out.set(new Uint8Array(head,0,o),0);
  const body=new DataView(out.buffer,o);
  let q=0;
  for(let i=0;i<n;i++) for(let c=0;c<nch;c++){
    const v=Math.max(-1,Math.min(1,chans[c][i]));
    body.setInt16(q,v<0?v*0x8000:v*0x7FFF,false); q+=2;
  }
  return out;
}
export const IMA_STEP=[7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,
73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,
598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,
3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,
15289,16818,18500,20350,22385,24623,27086,29794,32767];
export const IMA_IDX=[-1,-1,-1,-1,2,4,6,8,-1,-1,-1,-1,2,4,6,8];
export function ima4Packet(pcm,start,out,outOff,stt){
  const hp=stt.pred&0xFF80;
  out[outOff]=(hp>>8)&0xFF;
  out[outOff+1]=(hp&0x80)|(stt.idx&0x7F);
  let pred=(hp<<16)>>16, idx=stt.idx, o=outOff+2, lo=0, half=false;
  for(let i=0;i<64;i++){
    const smp=pcm[start+i]|0;
    let diff=smp-pred, code=0;
    if(diff<0){ code=8; diff=-diff; }
    let step=IMA_STEP[idx]; const tmp=step;
    if(diff>=step){ code|=4; diff-=step; }
    step>>=1; if(diff>=step){ code|=2; diff-=step; }
    step>>=1; if(diff>=step){ code|=1; }
    let dq=tmp>>3;
    if(code&4) dq+=tmp;
    if(code&2) dq+=tmp>>1;
    if(code&1) dq+=tmp>>2;
    pred+=(code&8)?-dq:dq;
    if(pred>32767) pred=32767; else if(pred<-32768) pred=-32768;
    idx+=IMA_IDX[code];
    if(idx<0) idx=0; else if(idx>88) idx=88;
    if(!half){ lo=code&0xF; half=true; }
    else { out[o++]=((code&0xF)<<4)|lo; half=false; }
  }
  stt.pred=pred; stt.idx=idx;
}
export function encodeCaf(chans,rate){
  const nch=chans.length, frames=chans[0].length, packets=Math.ceil(frames/64);
  const pcm=chans.map(c=>{
    const a=new Int16Array(packets*64);
    for(let i=0;i<frames;i++){
      const v=Math.max(-1,Math.min(1,c[i]));
      a[i]=v<0?v*0x8000:v*0x7FFF;
    }
    return a;
  });
  const bpp=34*nch, audio=new Uint8Array(packets*bpp), stt=[];
  for(let c=0;c<nch;c++) stt.push({pred:0,idx:0});
  let off=0;
  for(let pk=0;pk<packets;pk++)
    for(let c=0;c<nch;c++){ ima4Packet(pcm[c],pk*64,audio,off,stt[c]); off+=34; }
  const dataSize=4+audio.length;
  const buf=new ArrayBuffer(8+12+32+12+24+12+4), dv=new DataView(buf);
  let o=0;
  const tag=t=>{ for(let i=0;i<4;i++) dv.setUint8(o+i,t.charCodeAt(i)); o+=4; };
  const u32=v=>{ dv.setUint32(o,v,false); o+=4; };
  const i64=v=>{ dv.setUint32(o,Math.floor(v/4294967296),false);
                 dv.setUint32(o+4,v>>>0,false); o+=8; };
  tag('caff'); dv.setUint16(o,1,false); o+=2; dv.setUint16(o,0,false); o+=2;
  tag('desc'); i64(32);
  dv.setFloat64(o,rate,false); o+=8;
  tag('ima4'); u32(0); u32(bpp); u32(64); u32(nch); u32(0);
  tag('pakt'); i64(24); i64(packets); i64(frames);
  dv.setInt32(o,0,false); o+=4;
  dv.setInt32(o,packets*64-frames,false); o+=4;
  tag('data'); i64(dataSize); u32(0);
  const out=new Uint8Array(o+audio.length);
  out.set(new Uint8Array(buf,0,o),0); out.set(audio,o);
  return out;
}
