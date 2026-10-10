/*
  ループBGMメーカー／ループBGMスタジオ共通のエンジン（正本）。DOM には触らない。
  理論・音色表・曲調・進行・buildSong・アレンジ・ドラム・おまかせ・レシピコード・MIDI・
  音源グラフ・スケジュール・WAV/CAF/IMA4/ZIP の書き出しまで全部ここ。
  Astro ページ、単体HTML（tools/bgm/build-standalone.mjs）、CLI（tools/bgm/bgm-tool.mjs）、
  検証（tools/bgm/bgm-test.mjs）はみんなこのファイルを読む。

  Tone.js は import しない。音を出す前に useTone(Tone) で渡す（渡さなければ globalThis.Tone）。
  buildSong などの演奏データ側は Tone なしで動くので、Node からそのまま使える。
*/
let Tone=globalThis.Tone;
export function useTone(t){ Tone=t; }
export const getTone=()=>Tone;

/* ============================================================
   theory
   ============================================================ */
export const PC=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
export const QUAL={
  maj7:[0,4,7,11], maj9:[0,4,7,11,14], six:[0,4,7,9],
  m7:[0,3,7,10], m9:[0,3,7,10,14], m6:[0,3,7,9],
  dom7:[0,4,7,10], dom9:[0,4,7,10,14], dom13:[0,4,7,10,14],
  m7b5:[0,3,6,10], sus9:[0,5,7,10,14], dom7s9:[0,4,7,10,15],
  // 2026-10-08 追加（ダーク・シネマティック向け）：min は素の短3和音（ラインクリシェの出発点）、
  // mM7 はその7度が半音下がった形。どちらも暗いだけで濁らない
  min:[0,3,7,12], mM7:[0,3,7,11]
};
export const EXT={
  maj7:[2,9], maj9:[2,9], six:[2,11], m7:[2,5], m9:[2,5], m6:[2,5],
  dom7:[2,9], dom9:[2,9], dom13:[2,9], m7b5:[1,8], sus9:[2,9], dom7s9:[3,8],
  min:[2,5], mM7:[2,5]
};
export const SUF={maj7:'M7',maj9:'M9',six:'6',m7:'m7',m9:'m9',m6:'m6',dom7:'7',dom9:'9',
  dom13:'13',m7b5:'m7\u266d5',sus9:'9sus',dom7s9:'7#9',
  min:'m',mM7:'mM7'};
export const MINOR_Q={m7:1,m9:1,m6:1,m7b5:1,min:1,mM7:1};
export function midiName(m){ return PC[((m%12)+12)%12]+(Math.floor(m/12)-1); }
/* Spell chord roots the way a musician would: flats unless we're in a sharp key. */
export const PCF=["C","D\u266d","D","E\u266d","E","F","G\u266d","G","A\u266d","A","B\u266d","B"];
export const SHARP_KEYS=new Set([7,2,9,4,11,6]);
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

/* ============================================================
   sound palette  (gm = General MIDI program, used by the .mid export)
   ============================================================ */
export const LEADS={
  marimba:{name:'マリンバ',gm:12,vol:-9,cfg:{harmonicity:3.01,modulationIndex:6,oscillator:{type:'sine'},
    envelope:{attack:.004,decay:.55,sustain:0,release:.5},
    modulation:{type:'sine'},modulationEnvelope:{attack:.004,decay:.16,sustain:0,release:.16}}},
  box:{name:'オルゴール',gm:10,vol:-10,cfg:{harmonicity:4.6,modulationIndex:9,oscillator:{type:'sine'},
    envelope:{attack:.002,decay:1.5,sustain:0,release:1.2},
    modulation:{type:'sine'},modulationEnvelope:{attack:.002,decay:.25,sustain:0,release:.25}}},
  vibes:{name:'ビブラフォン',gm:11,vol:-10,cfg:{harmonicity:2.01,modulationIndex:3,oscillator:{type:'sine'},
    envelope:{attack:.006,decay:1.9,sustain:0,release:1.4},
    modulation:{type:'sine'},modulationEnvelope:{attack:.006,decay:.5,sustain:0,release:.4}}},
  kalimba:{name:'カリンバ',gm:108,vol:-8,cfg:{harmonicity:2.52,modulationIndex:8,oscillator:{type:'sine'},
    envelope:{attack:.002,decay:.42,sustain:0,release:.35},
    modulation:{type:'triangle'},modulationEnvelope:{attack:.002,decay:.1,sustain:0,release:.1}}},
  pluck:{name:'木のはじき',gm:45,vol:-9,cfg:{harmonicity:2.0,modulationIndex:11,oscillator:{type:'triangle'},
    envelope:{attack:.003,decay:.32,sustain:.02,release:.28},
    modulation:{type:'square'},modulationEnvelope:{attack:.002,decay:.09,sustain:0,release:.09}}},
  rhodes:{name:'エレピ',gm:4,vol:-9,cfg:{harmonicity:1.0,modulationIndex:3.2,oscillator:{type:'sine'},
    envelope:{attack:.006,decay:1.1,sustain:.12,release:.9},
    modulation:{type:'sine'},modulationEnvelope:{attack:.006,decay:.5,sustain:0,release:.4}}},
  whistle:{name:'くちぶえ',gm:78,vol:-13,cfg:{harmonicity:1.0,modulationIndex:1.1,oscillator:{type:'sine'},
    envelope:{attack:.09,decay:.2,sustain:.68,release:.35},
    modulation:{type:'sine'},modulationEnvelope:{attack:.12,decay:.2,sustain:.4,release:.3}}},
  toy:{name:'おもちゃ',gm:80,vol:-15,cfg:{harmonicity:1.0,modulationIndex:2.2,oscillator:{type:'square'},
    envelope:{attack:.004,decay:.22,sustain:.18,release:.2},
    modulation:{type:'square'},modulationEnvelope:{attack:.004,decay:.1,sustain:0,release:.1}}},
  synth:{name:'シンセ',gm:81,vol:-17,cfg:{harmonicity:1.0,modulationIndex:.6,oscillator:{type:'sawtooth'},
    envelope:{attack:.005,decay:.26,sustain:.14,release:.22},
    modulation:{type:'sine'},modulationEnvelope:{attack:.005,decay:.2,sustain:0,release:.2}}},
  bell:{name:'ベル',gm:14,vol:-14,cfg:{harmonicity:3.5,modulationIndex:12,oscillator:{type:'sine'},
    envelope:{attack:.002,decay:2.2,sustain:0,release:1.8},
    modulation:{type:'sine'},modulationEnvelope:{attack:.002,decay:.8,sustain:0,release:.6}}},
  glock:{name:'グロッケン',gm:9,vol:-13,cfg:{harmonicity:5.07,modulationIndex:5,oscillator:{type:'sine'},
    envelope:{attack:.001,decay:.9,sustain:0,release:.8},
    modulation:{type:'sine'},modulationEnvelope:{attack:.001,decay:.12,sustain:0,release:.12}}},
  flute:{name:'フルート',gm:73,vol:-13,cfg:{harmonicity:2.0,modulationIndex:.8,oscillator:{type:'triangle'},
    envelope:{attack:.06,decay:.25,sustain:.6,release:.3},
    modulation:{type:'sine'},modulationEnvelope:{attack:.04,decay:.3,sustain:.3,release:.3}}},
  steel:{name:'スチールパン',gm:114,vol:-11,cfg:{harmonicity:1.5,modulationIndex:5,oscillator:{type:'sine'},
    envelope:{attack:.003,decay:.8,sustain:0,release:.6},
    modulation:{type:'sine'},modulationEnvelope:{attack:.003,decay:.2,sustain:0,release:.2}}},
  harp:{name:'ハープ',gm:46,vol:-10,cfg:{harmonicity:1.0,modulationIndex:1.5,oscillator:{type:'triangle'},
    envelope:{attack:.003,decay:1.3,sustain:0,release:1.0},
    modulation:{type:'sine'},modulationEnvelope:{attack:.003,decay:.25,sustain:0,release:.2}}},
  brass:{name:'やわらかブラス',gm:61,vol:-15,cfg:{harmonicity:1.0,modulationIndex:3.5,oscillator:{type:'sine'},
    envelope:{attack:.03,decay:.3,sustain:.7,release:.3},
    modulation:{type:'sine'},modulationEnvelope:{attack:.05,decay:.3,sustain:.5,release:.3}}},
  // 2026-10-07 追加：ゲームのやさしい音以外にも寄せられるよう、太い・派手な音
  saw:{name:'ソウリード',gm:81,vol:-17,cfg:{harmonicity:1.0,modulationIndex:0,oscillator:{type:'sawtooth'},
    envelope:{attack:.006,decay:.3,sustain:.55,release:.25},
    modulation:{type:'sine'},modulationEnvelope:{attack:.01,decay:.1,sustain:0,release:.1}}},
  supersaw:{name:'スーパーソウ',gm:81,vol:-20,cfg:{harmonicity:1.0,modulationIndex:0,
    oscillator:{type:'fatsawtooth',count:3,spread:28},
    envelope:{attack:.01,decay:.4,sustain:.65,release:.4},
    modulation:{type:'sine'},modulationEnvelope:{attack:.01,decay:.1,sustain:0,release:.1}}},
  square:{name:'スクエアリード',gm:80,vol:-19,cfg:{harmonicity:1.0,modulationIndex:0,oscillator:{type:'square'},
    envelope:{attack:.004,decay:.25,sustain:.5,release:.18},
    modulation:{type:'sine'},modulationEnvelope:{attack:.01,decay:.1,sustain:0,release:.1}}},
  organ:{name:'オルガン',gm:17,vol:-15,cfg:{harmonicity:2.0,modulationIndex:1.6,oscillator:{type:'sine'},
    envelope:{attack:.01,decay:.1,sustain:.9,release:.12},
    modulation:{type:'sine'},modulationEnvelope:{attack:.01,decay:.1,sustain:1,release:.12}}},
  grit:{name:'ざらざら',gm:30,vol:-19,cfg:{harmonicity:1.0,modulationIndex:4.5,oscillator:{type:'sawtooth'},
    envelope:{attack:.004,decay:.35,sustain:.45,release:.25},
    modulation:{type:'square'},modulationEnvelope:{attack:.004,decay:.3,sustain:.4,release:.2}}},
  bow:{name:'バイオリン風',gm:40,vol:-17,cfg:{harmonicity:1.0,modulationIndex:.7,oscillator:{type:'sawtooth'},
    envelope:{attack:.14,decay:.3,sustain:.8,release:.35},
    modulation:{type:'sine'},modulationEnvelope:{attack:.2,decay:.3,sustain:.6,release:.3}}}
};
export const PADS={
  vibes:{name:'やわらか和音',gm:11,vol:-14,long:false,
    cfg:{oscillator:{type:'triangle'},envelope:{attack:.012,decay:.42,sustain:.06,release:.7}}},
  pad:{name:'ふんわりパッド',gm:89,vol:-17,long:true,
    cfg:{oscillator:{type:'triangle'},envelope:{attack:.9,decay:1.2,sustain:.55,release:2.2}}},
  organ:{name:'オルガン',gm:16,vol:-19,long:true,
    cfg:{oscillator:{type:'triangle'},envelope:{attack:.06,decay:.2,sustain:.7,release:.5}}},
  guitar:{name:'つまびき',gm:24,vol:-13,long:false,
    cfg:{oscillator:{type:'triangle'},envelope:{attack:.004,decay:.5,sustain:0,release:.45}}},
  stab:{name:'シンセスタブ',gm:50,vol:-21,long:false,
    cfg:{oscillator:{type:'sawtooth'},envelope:{attack:.003,decay:.18,sustain:0,release:.16}}},
  strings:{name:'ストリングス',gm:48,vol:-24,long:true,
    cfg:{oscillator:{type:'sawtooth'},envelope:{attack:.6,decay:.8,sustain:.6,release:1.6}}},
  piano:{name:'ピアノ風',gm:0,vol:-14,long:false,
    cfg:{oscillator:{type:'triangle'},envelope:{attack:.003,decay:1.1,sustain:.1,release:.9}}},
  choir:{name:'ハミング',gm:52,vol:-15,long:true,
    cfg:{oscillator:{type:'sine'},envelope:{attack:1.2,decay:1.0,sustain:.7,release:2.5}}},
  chip:{name:'ピコピコ和音',gm:80,vol:-25,long:false,
    cfg:{oscillator:{type:'square'},envelope:{attack:.002,decay:.12,sustain:.1,release:.08}}},
  clav:{name:'カッティング',gm:7,vol:-23,long:false,
    cfg:{oscillator:{type:'square'},envelope:{attack:.001,decay:.085,sustain:0,release:.05}}},
  // 2026-10-07 追加（伴奏はまだ1桁の欄なので、あと1つで上限の16）
  supersaw:{name:'スーパーソウ',gm:81,vol:-24,long:false,
    cfg:{oscillator:{type:'fatsawtooth',count:3,spread:30},envelope:{attack:.015,decay:.35,sustain:.45,release:.5}}},
  warm:{name:'あたたかパッド',gm:89,vol:-26,long:true,
    cfg:{oscillator:{type:'fatsawtooth',count:3,spread:18},envelope:{attack:.5,decay:1.0,sustain:.75,release:1.6}}},
  square:{name:'スクエア和音',gm:80,vol:-25,long:false,
    cfg:{oscillator:{type:'square'},envelope:{attack:.003,decay:.25,sustain:.25,release:.2}}},
  epiano:{name:'エレピ和音',gm:4,vol:-15,long:false,
    cfg:{oscillator:{type:'amsine',harmonicity:2},envelope:{attack:.004,decay:1.0,sustain:.12,release:.8}}},
  brass:{name:'ブラス和音',gm:61,vol:-24,long:true,
    cfg:{oscillator:{type:'sawtooth'},envelope:{attack:.06,decay:.3,sustain:.7,release:.3}}}
};
export const BASSES={
  two:{name:'ふたつ刻み',gm:32}, walk:{name:'ウォーキング',gm:32},
  bounce:{name:'はねる',gm:33}, whole:{name:'のばし',gm:38},
  offbeat:{name:'裏打ち',gm:38}, pulse:{name:'8分刻み',gm:38},
  octave:{name:'オクターブ',gm:38}, synco:{name:'シンコペ',gm:33},
  arp:{name:'分散和音',gm:33}, funk:{name:'ファンク',gm:36},
  // 2026-10-08 追加（ダーク・シネマティック向け）
  heartbeat:{name:'鼓動',gm:38},
  // 2026-10-08 追加：根音と5度の往復だけじゃない、遊ぶベース
  riff:{name:'リフ',gm:33,desc:'タネで作った2小節のリフを、和音に合わせて移して回す。8小節の終わりだけ音が変わる'},
  line:{name:'うたうベース',gm:32,desc:'4分で歩く。離れた和音へは音階をたどり、近ければ3度・5度・オクターブを回って、次の根音の隣から入る'}
};
export const KITS={
  brush:{name:'ブラシ'}, pop:{name:'ポップ'}, night:{name:'夜'},
  tick:{name:'クリック'}, none:{name:'なし'}, four:{name:'4つ打ち'},
  halftime:{name:'ハーフタイム'}, bossa:{name:'ボサノバ'}, breaks:{name:'ブレイクビーツ'},
  soft:{name:'そっと'}, funk:{name:'ファンク'},
  house:{name:'ハウス'}, disco:{name:'ディスコ'}, funk16:{name:'16ビート・ファンク'},
  boombap:{name:'ブームバップ'}, lofi:{name:'ローファイ'}, rock:{name:'ロック'},
  twostep:{name:'2ステップ'}, onedrop:{name:'ワンドロップ'}, samba:{name:'サンバ'},
  march:{name:'マーチ'}, jazz:{name:'ジャズ'}, trap:{name:'トラップ'},
  chipdrum:{name:'ピコピコドラム'}, afro:{name:'アフロ'},
  dnb:{name:'ドラムンベース'}, amen:{name:'ブレイク（アーメン風）'}, trance:{name:'トランス'},
  gabber:{name:'ガバ'}, minimal:{name:'ミニマル'}
};
export const SCALES={
  chord:{name:'コード音',desc:'和音の構成音とテンションから選ぶ。動機が和音につれて移調するので曲っぽくまとまる'},
  penta:{name:'ペンタトニック',desc:'5音だけ使う。外れた感じが出にくく、ゲーム音楽らしい素直な歌になる'},
  diatonic:{name:'全音階',desc:'7音の音階を通す。順次進行が増えて歌いやすい線になる'},
  blues:{name:'ブルース',desc:'マイナーペンタ＋♭5。少しざらついた、大人びた表情'},
  hexa:{name:'6音',desc:'全音階から1音抜いた6音。ペンタより歌えて、全音階よりやわらかい'},
  triad:{name:'3和音',desc:'いま鳴っている和音の根音・3度・5度だけ。ファンファーレのように明快'},
  modeUp:{name:'ひとさじ明るく',desc:'長調ならリディアン（#4）、短調ならドリアン（♮6）。1音だけ明るく浮かせる'},
  modeDown:{name:'ひとさじ渋く',desc:'長調ならミクソリディアン（♭7）、短調ならフリジアン（♭2）。1音だけ影を落とす'},
  harmonic:{name:'エキゾチック',desc:'和声的短音階（長調ならハーモニック・メジャー）。遺跡や砂漠のような異国の香り'},
  wholetone:{name:'全音音階',desc:'全部が全音間隔の6音。重力がなくなる、夢の中のような浮遊感'},
  majblues:{name:'メジャーブルース',desc:'明るいペンタに♭3を足す。陽気なこぶし。短調の曲調ではブルースと同じ音になる'}
};
export const SCALE_SET={
  penta:m=>m?[0,3,5,7,10]:[0,2,4,7,9],
  diatonic:m=>m?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11],
  blues:()=>[0,3,5,6,7,10],
  hexa:m=>m?[0,2,3,5,7,10]:[0,2,4,5,7,9],
  modeUp:m=>m?[0,2,3,5,7,9,10]:[0,2,4,6,7,9,11],
  modeDown:m=>m?[0,1,3,5,7,8,10]:[0,2,4,5,7,9,10],
  harmonic:m=>m?[0,2,3,5,7,8,11]:[0,2,4,5,7,8,11],
  wholetone:()=>[0,2,4,6,8,10],
  majblues:m=>m?[0,3,5,6,7,10]:[0,2,3,4,7,9]
};

/* ============================================================
   the foundations — chord progressions, 16 bars each, written in C
   ============================================================ */
export const PROGS={
lounge:[[0,'maj9'],[9,'m9'],[2,'m9'],[7,'dom13'],[0,'maj9'],[9,'m7'],[2,'m7'],[7,'dom9'],
  [5,'maj7'],[4,'m7'],[2,'m7'],[7,'dom7'],[0,'maj7'],[9,'dom7'],[2,'m7'],[7,'dom9']],
dream:[[0,'maj9'],[0,'maj9'],[5,'maj9'],[5,'maj9'],[9,'m9'],[9,'m9'],[5,'maj9'],[7,'sus9'],
  [0,'maj9'],[4,'m9'],[5,'maj9'],[7,'sus9'],[9,'m9'],[5,'maj9'],[7,'sus9'],[0,'maj9']],
pop:[[0,'six'],[9,'dom7'],[2,'m7'],[7,'dom7'],[0,'six'],[4,'dom7'],[9,'m7'],[9,'dom7'],
  [2,'m7'],[7,'dom7'],[4,'m7'],[9,'dom7'],[2,'m7'],[7,'dom7'],[0,'six'],[7,'dom9']],
night:[[9,'m9'],[9,'m9'],[2,'m9'],[2,'m9'],[5,'maj7'],[4,'dom7s9'],[9,'m9'],[9,'m9'],
  [2,'m9'],[7,'dom13'],[0,'maj9'],[5,'maj7'],[11,'m7b5'],[4,'dom7'],[9,'m9'],[4,'dom7']],
oudou:[[5,'maj7'],[7,'dom7'],[4,'m7'],[9,'m7'],[5,'maj7'],[7,'dom7'],[4,'m7'],[9,'m7'],
  [5,'maj7'],[7,'dom7'],[4,'m7'],[9,'dom7'],[2,'m7'],[7,'dom7'],[0,'maj9'],[7,'sus9']],
omise:[[0,'maj7'],[2,'m7'],[4,'m7'],[9,'dom7'],[2,'m9'],[7,'dom13'],[0,'maj9'],[9,'dom7'],
  [5,'maj7'],[4,'m7'],[9,'dom7'],[2,'m7'],[2,'m9'],[7,'dom13'],[0,'six'],[7,'dom9']],
canon:[[0,'maj7'],[7,'dom7'],[9,'m7'],[4,'m7'],[5,'maj7'],[0,'maj7'],[5,'maj7'],[7,'dom7'],
  [0,'maj9'],[7,'dom9'],[9,'m9'],[4,'m7'],[5,'maj9'],[2,'m7'],[7,'dom7'],[0,'maj7']],
dorian:[[2,'m9'],[2,'m9'],[7,'dom13'],[7,'dom13'],[2,'m9'],[2,'m9'],[7,'dom13'],[7,'dom13'],
  [2,'m9'],[5,'maj7'],[7,'dom13'],[2,'m9'],[0,'maj9'],[7,'dom13'],[2,'m9'],[2,'m9']],
lydian:[[0,'maj9'],[0,'maj9'],[2,'dom9'],[2,'dom9'],[0,'maj9'],[4,'m7'],[2,'dom9'],[2,'dom9'],
  [7,'maj7'],[7,'maj7'],[0,'maj9'],[0,'maj9'],[2,'dom9'],[7,'sus9'],[0,'maj9'],[0,'maj9']],
mixo:[[0,'dom7'],[10,'maj7'],[5,'maj7'],[0,'dom7'],[0,'dom7'],[10,'maj7'],[5,'maj7'],[0,'dom7'],
  [5,'maj7'],[10,'maj7'],[0,'dom7'],[0,'dom7'],[10,'maj7'],[5,'maj7'],[7,'sus9'],[0,'dom7']],
mokumoku:[[9,'m9'],[5,'maj9'],[0,'maj9'],[7,'sus9'],[9,'m9'],[5,'maj9'],[0,'maj9'],[4,'m7'],
  [2,'m9'],[9,'m9'],[5,'maj9'],[7,'sus9'],[2,'m9'],[4,'m7'],[5,'maj9'],[7,'sus9']],
waltz:[[0,'maj7'],[9,'m7'],[2,'m7'],[7,'dom7'],[0,'maj7'],[9,'m7'],[2,'m7'],[7,'dom9'],
  [5,'maj7'],[4,'m7'],[2,'m7'],[7,'dom7'],[0,'maj7'],[9,'dom7'],[2,'m7'],[7,'dom7']],
sway:[[9,'m9'],[5,'maj9'],[0,'maj9'],[7,'sus9'],[9,'m9'],[5,'maj9'],[0,'maj9'],[7,'sus9'],
  [2,'m9'],[7,'sus9'],[0,'maj9'],[5,'maj9'],[9,'m9'],[5,'maj9'],[7,'sus9'],[0,'maj9']],
blue:[[0,'dom9'],[0,'dom9'],[5,'dom9'],[0,'dom9'],[5,'dom9'],[5,'dom9'],[0,'dom9'],[0,'dom9'],
  [7,'dom9'],[5,'dom9'],[0,'dom9'],[7,'dom9'],[0,'dom9'],[5,'dom9'],[0,'dom9'],[7,'dom9']],
chip:[[0,'maj7'],[9,'m7'],[5,'maj7'],[7,'dom7'],[0,'maj7'],[9,'m7'],[5,'maj7'],[7,'dom7'],
  [5,'maj7'],[7,'dom7'],[0,'maj7'],[9,'m7'],[2,'m7'],[7,'dom7'],[0,'maj7'],[7,'dom7']],
minimal:[[0,'maj9'],[0,'maj9'],[4,'m7'],[4,'m7'],[5,'maj9'],[5,'maj9'],[4,'m7'],[4,'m7'],
  [2,'m9'],[2,'m9'],[4,'m7'],[4,'m7'],[5,'maj9'],[5,'maj9'],[7,'sus9'],[7,'sus9']],
longrun:[[9,'m7'],[9,'m7'],[5,'maj7'],[5,'maj7'],[0,'maj9'],[0,'maj9'],[7,'sus9'],[7,'sus9'],
  [9,'m7'],[9,'m7'],[5,'maj7'],[5,'maj7'],[2,'m7'],[2,'m7'],[7,'sus9'],[4,'m7']],
midnight:[[2,'m9'],[2,'m9'],[2,'m9'],[2,'m9'],[10,'maj7'],[10,'maj7'],[9,'m7'],[9,'m7'],
  [2,'m9'],[2,'m9'],[2,'m9'],[2,'m9'],[7,'dom13'],[7,'dom13'],[9,'m7'],[9,'m7']],
neon:[[0,'maj7'],[9,'m7'],[5,'maj7'],[7,'dom7'],[0,'maj7'],[9,'m7'],[5,'maj7'],[7,'sus9'],
  [5,'maj7'],[7,'dom7'],[4,'m7'],[9,'m7'],[2,'m7'],[7,'sus9'],[0,'maj9'],[7,'dom7']],
ambi:[[0,'maj9'],[0,'maj9'],[0,'maj9'],[0,'maj9'],[5,'maj9'],[5,'maj9'],[5,'maj9'],[5,'maj9'],
  [9,'m9'],[9,'m9'],[9,'m9'],[9,'m9'],[5,'maj9'],[5,'maj9'],[7,'sus9'],[7,'sus9']],
/* written in E: a dominant-9 vamp that moves to IV and turns around on V7#9 */
funk:[[4,'dom9'],[4,'dom9'],[4,'dom9'],[4,'dom9'],[9,'dom9'],[9,'dom9'],[4,'dom9'],[4,'dom9'],
  [4,'dom9'],[4,'dom9'],[9,'dom9'],[9,'dom9'],[11,'dom7s9'],[9,'dom9'],[4,'dom9'],[11,'dom7s9']],
/* neo-soul: IV-iii-ii-I stepping down, secondary dominant into ii */
mellow:[[5,'maj9'],[4,'m9'],[2,'m9'],[0,'maj9'],[5,'maj9'],[4,'m7'],[9,'m9'],[9,'dom7s9'],
  [2,'m9'],[7,'dom13'],[4,'m9'],[9,'m9'],[2,'m9'],[7,'sus9'],[0,'maj9'],[7,'dom13']],
/* C minor, weighted low; the relative major and sus chords keep it from going dark */
heavy:[[0,'m9'],[0,'m9'],[8,'maj7'],[8,'maj7'],[5,'m9'],[5,'m9'],[3,'maj9'],[7,'sus9'],
  [0,'m9'],[10,'sus9'],[8,'maj9'],[8,'maj7'],[5,'m7'],[7,'sus9'],[3,'maj9'],[7,'dom7']],
/* A minor: i-iv で揺れて、bVI から V7#9 で戻る。ループするサンプル風 */
hiphop:[[9,'m9'],[9,'m9'],[2,'m9'],[2,'m9'],[9,'m9'],[9,'m9'],[5,'maj7'],[4,'dom7s9'],
  [9,'m9'],[9,'m9'],[2,'m9'],[2,'m9'],[5,'maj7'],[5,'maj7'],[4,'dom7s9'],[4,'dom7s9']],
/* liquid: D minor から長調の和音へ開いていく。2小節ずつ */
dnb:[[2,'m9'],[2,'m9'],[10,'maj9'],[10,'maj9'],[5,'maj9'],[5,'maj9'],[0,'sus9'],[0,'sus9'],
  [2,'m9'],[2,'m9'],[10,'maj9'],[10,'maj9'],[7,'m9'],[7,'m9'],[9,'sus9'],[9,'dom7']],
/* vi-IV-I-V。2小節ずつで大きく開く */
trance:[[9,'m7'],[9,'m7'],[5,'maj7'],[5,'maj7'],[0,'maj9'],[0,'maj9'],[7,'sus9'],[7,'sus9'],
  [9,'m7'],[9,'m7'],[5,'maj7'],[5,'maj7'],[0,'maj9'],[0,'maj9'],[7,'sus9'],[4,'dom7']],
/* ---- 2026-10-08 ダーク・シネマティック：根音がほぼ動かない短調の進行。ベースは pedal で主音に固定する前提 ---- */
/* 暗い映画（エオリアン）：i に8小節とどまり、♭VI へ沈んで ♭VII から戻る。ペダルの上では Cm9 → A♭M7/C → B♭sus/C */
dark:[[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],
  [8,'maj7'],[8,'maj7'],[8,'maj7'],[8,'maj7'],[10,'sus9'],[10,'sus9'],[0,'m9'],[0,'m9']],
/* 霧（ドリアン）：i に8小節、IV9 へ開いて ♭VII sus から戻る。♮6 の「不思議だけど暗すぎない」色 */
mist:[[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],[0,'m9'],
  [5,'dom9'],[5,'dom9'],[5,'dom9'],[5,'dom9'],[10,'sus9'],[10,'sus9'],[0,'m9'],[0,'m9']],
/* ---- 2026-10-08 うらめん・ボス・こうげき ---- */
/* ひみつ（A ドリアン）：i と IV9（♮6 の明るさ）を行き来して、♭VI・♭VII から sus で戻る */
secret:[[9,'m9'],[9,'m9'],[2,'dom9'],[2,'dom9'],[5,'maj9'],[7,'six'],[9,'m9'],[4,'sus9'],
  [9,'m9'],[9,'m9'],[2,'dom9'],[2,'dom9'],[5,'maj9'],[0,'maj9'],[7,'six'],[4,'sus9']],
/* ボス（C 短調）：i → ♭VI → iv → V7。後半は ♭VII と ii°で緊張を引っぱって V7 で締める */
boss:[[0,'min'],[0,'min'],[8,'maj7'],[8,'maj7'],[5,'m7'],[5,'m7'],[7,'dom7'],[7,'dom7'],
  [0,'min'],[0,'min'],[8,'maj7'],[10,'six'],[5,'m7'],[2,'m7b5'],[7,'sus9'],[7,'dom7']],
/* こうげき（A 短調）：i → ♭VI → ♭VII の突き上げを2周、最後は V7 */
assault:[[9,'m7'],[5,'maj7'],[7,'six'],[9,'m7'],[9,'m7'],[5,'maj7'],[2,'m7'],[4,'dom7'],
  [5,'maj7'],[7,'six'],[9,'m7'],[0,'six'],[5,'maj7'],[2,'m7'],[4,'sus9'],[4,'dom7']],
/* ラインクリシェ：Cm → CmM7 → Cm7 → Cm6。根音はそのまま、内声だけ半音ずつ沈む */
cliche:[[0,'min'],[0,'min'],[0,'mM7'],[0,'mM7'],[0,'m7'],[0,'m7'],[0,'m6'],[0,'m6'],
  [0,'min'],[0,'min'],[0,'mM7'],[0,'mM7'],[0,'m7'],[0,'m7'],[0,'m6'],[0,'mM7']],
/* ---- 2026-10-08 宇宙：壮大で明るく、2〜4小節ずつゆっくり動く大きな和音 ---- */
/* リディアン・ペダル：I に II9 を乗せる（♯4 が浮く）。ベースは pedal で主音。無重力 */
lydPedal:[[0,'maj9'],[0,'maj9'],[0,'maj9'],[0,'maj9'],[2,'dom9'],[2,'dom9'],[0,'maj9'],[0,'maj9'],
  [0,'maj9'],[0,'maj9'],[2,'dom9'],[2,'dom9'],[2,'dom9'],[2,'dom9'],[0,'maj9'],[0,'maj9']],
/* ただよい：I に IV と vi がふわっと重なるだけ（ペダルの上では FM9/C・Am9/C） */
drift:[[0,'maj9'],[0,'maj9'],[0,'maj9'],[0,'maj9'],[5,'maj9'],[5,'maj9'],[0,'maj9'],[0,'maj9'],
  [0,'maj9'],[0,'maj9'],[0,'maj9'],[0,'maj9'],[9,'m9'],[9,'m9'],[5,'maj9'],[5,'maj9']],
/* ドリアン・ペダル（A）：i に IV9 が差し込む ♮6 の明るさ。最後は ♭VI M9 で持ち上げる */
dorPedal:[[9,'m9'],[9,'m9'],[9,'m9'],[9,'m9'],[2,'dom9'],[2,'dom9'],[9,'m9'],[9,'m9'],
  [9,'m9'],[9,'m9'],[9,'m9'],[9,'m9'],[2,'dom9'],[2,'dom9'],[5,'maj9'],[5,'maj9']],
/* ミクソリディアン・ペダル：I6・I9sus に ♭VII と IV を乗せる */
mixoPedal:[[0,'six'],[0,'six'],[0,'sus9'],[0,'sus9'],[10,'maj7'],[10,'maj7'],[0,'six'],[0,'six'],
  [0,'six'],[0,'six'],[0,'sus9'],[0,'sus9'],[5,'maj9'],[5,'maj9'],[10,'maj7'],[10,'maj7']]
};

/* beats = beats per bar. 3 gives you a waltz / 6-8 feel. */
export const PRESETS={
  nonbiri:{label:'のんびり',desc:'ゆるいラウンジ。手が止まっても気まずくない',
    bpm:112,swing:80,beats:4,prog:'lounge',tonic:0,minor:false,
    lead:'marimba',pad:'vibes',bass:'two',drums:'brush',center:82,comp:[1,3,6],rev:.30,filt:5200,scale:'chord'},
  fuwafuwa:{label:'ふわふわ',desc:'オルゴールと薄いパッド。ドラムなし',
    bpm:78,swing:0,beats:4,prog:'dream',tonic:0,minor:false,
    lead:'box',pad:'pad',bass:'whole',drums:'none',center:86,comp:[0],rev:.46,filt:6200,scale:'chord'},
  pokopoko:{label:'ぽこぽこ',desc:'跳ねる木のポップ。手数の多いパズル向き',
    bpm:130,swing:0,beats:4,prog:'pop',tonic:0,minor:false,
    lead:'pluck',pad:'vibes',bass:'bounce',drums:'pop',center:84,comp:[2,4,6],rev:.20,filt:7000,scale:'chord'},
  yofukashi:{label:'よふかし',desc:'エレピの夜。難問モードや結果画面に',
    bpm:92,swing:73,beats:4,prog:'night',tonic:9,minor:true,
    lead:'rhodes',pad:'vibes',bass:'walk',drums:'night',center:79,comp:[2,6],rev:.38,filt:4200,scale:'chord'},
  oudou:{label:'おうどう',desc:'王道進行。前へ進む感じの素直なJ-POP調',
    bpm:118,swing:0,beats:4,prog:'oudou',tonic:0,minor:false,
    lead:'pluck',pad:'guitar',bass:'bounce',drums:'pop',center:83,comp:[2,4,6],rev:.26,filt:6000,scale:'diatonic'},
  omise:{label:'おみせ',desc:'ボサノバ調のかろやかさ。ショップやメニュー画面の定番',
    bpm:116,swing:0,beats:4,prog:'omise',tonic:0,minor:false,
    lead:'vibes',pad:'guitar',bass:'two',drums:'bossa',center:83,comp:[0,3,5],rev:.30,filt:6000,scale:'chord'},
  canon:{label:'カノン',desc:'下がり続ける定番進行。やさしく、少し懐かしい',
    bpm:104,swing:0,beats:4,prog:'canon',tonic:0,minor:false,
    lead:'box',pad:'pad',bass:'whole',drums:'tick',center:85,comp:[0,4],rev:.40,filt:6000,scale:'diatonic'},
  dorian:{label:'ドリアン',desc:'2和音を行き来するモード。浮いた、都会的な涼しさ',
    bpm:96,swing:55,beats:4,prog:'dorian',tonic:2,minor:true,
    lead:'rhodes',pad:'vibes',bass:'walk',drums:'night',center:80,comp:[1,4,6],rev:.34,filt:4800,scale:'chord'},
  lydian:{label:'リディアン',desc:'明るいのに落ち着かない浮遊感。不思議な面のBGMに',
    bpm:84,swing:0,beats:4,prog:'lydian',tonic:0,minor:false,
    lead:'vibes',pad:'pad',bass:'whole',drums:'none',center:87,comp:[0],rev:.48,filt:6600,scale:'chord'},
  mixo:{label:'たびだち',desc:'ミクソリディアン。民族的で開けた、冒険の入り口',
    bpm:120,swing:30,beats:4,prog:'mixo',tonic:0,minor:false,
    lead:'kalimba',pad:'guitar',bass:'two',drums:'afro',center:83,comp:[2,6],rev:.28,filt:6400,scale:'penta'},
  mokumoku:{label:'もくもく',desc:'一定の刻みで集中を邪魔しない。長考するパズルに',
    bpm:100,swing:0,beats:4,prog:'mokumoku',tonic:9,minor:true,
    lead:'marimba',pad:'vibes',bass:'whole',drums:'tick',center:82,comp:[0,2,4,6],rev:.32,filt:5400,scale:'diatonic'},
  waltz:{label:'ワルツ',desc:'3拍子。くるくる回る軽さ。ずっと聴いても疲れない',
    bpm:128,swing:0,beats:3,prog:'waltz',tonic:0,minor:false,
    lead:'box',pad:'vibes',bass:'two',drums:'tick',center:84,comp:[2,4],rev:.36,filt:5800,scale:'chord'},
  sway:{label:'ゆらゆら',desc:'6/8のゆれ。とろけるように進む。夜更けや水中の面に',
    bpm:104,swing:0,beats:3,prog:'sway',tonic:9,minor:true,
    lead:'vibes',pad:'pad',bass:'whole',drums:'night',center:83,comp:[1,3],rev:.44,filt:5200,scale:'chord'},
  blue:{label:'ブルー',desc:'全部セブンス。ざらついた大人の余裕',
    bpm:86,swing:88,beats:4,prog:'blue',tonic:0,minor:true,
    lead:'rhodes',pad:'guitar',bass:'walk',drums:'jazz',center:78,comp:[1,3,6],rev:.30,filt:4000,scale:'blues'},
  chip:{label:'ちいさな冒険',desc:'速くて硬い矩形波。昔の携帯ゲーム機のあの音',
    bpm:152,swing:0,beats:4,prog:'chip',tonic:0,minor:false,
    lead:'toy',pad:'organ',bass:'bounce',drums:'chipdrum',center:86,comp:[0,2,4,6],rev:.14,filt:7800,scale:'penta'},
  ambi:{label:'ただよう',desc:'4小節に1和音。ほぼ止まっている。考え込む画面に',
    bpm:62,swing:0,beats:4,prog:'ambi',tonic:0,minor:false,
    lead:'vibes',pad:'pad',bass:'whole',drums:'none',center:88,comp:[0],rev:.55,filt:5000,scale:'chord'},
  kurikaeshi:{label:'くりかえし',desc:'短い動機が少しずつ形を変えて重なる。ミニマル・ミュージック',
    bpm:112,swing:0,beats:4,prog:'minimal',tonic:0,minor:false,plan:'minimal',
    lead:'marimba',pad:'vibes',bass:'whole',drums:'none',center:82,comp:[0,1,2,3,4,5,6,7],rev:.30,filt:6000,scale:'diatonic'},
  longrun:{label:'ロングラン',desc:'4つ打ちが一定のペースで走り続ける。前へ進む高揚感',
    bpm:128,swing:0,beats:4,prog:'longrun',tonic:9,minor:true,plan:'minimal',
    lead:'synth',pad:'stab',bass:'offbeat',drums:'house',center:81,comp:[3,7],rev:.22,filt:6800,scale:'penta'},
  midnight:{label:'ミッドナイト',desc:'削ぎ落としたミニマルテクノ。低く、深く、淡々と',
    bpm:122,swing:15,beats:4,prog:'midnight',tonic:2,minor:true,plan:'minimal',
    lead:'rhodes',pad:'stab',bass:'pulse',drums:'four',center:77,comp:[3],rev:.36,filt:3800,scale:'chord'},
  neon:{label:'ネオン',desc:'きらきらしたエレクトロポップ。明るい4つ打ち',
    bpm:132,swing:0,beats:4,prog:'neon',tonic:0,minor:false,
    lead:'synth',pad:'stab',bass:'pulse',drums:'disco',center:84,comp:[2,6],rev:.24,filt:7600,scale:'penta'},
  funk:{label:'ファンク',desc:'9thのワンコードで腰を落として刻み続ける。街やアクションの合間に',
    bpm:100,swing:12,beats:4,prog:'funk',tonic:4,minor:true,
    lead:'brass',pad:'clav',bass:'funk',drums:'funk16',center:79,comp:[1,3,4,6,7],rev:.16,filt:5600,scale:'penta'},
  mellow:{label:'メロウ',desc:'M9とm9が下りていくネオソウル。ゆったり揺れるR&B。会話や結果画面に',
    bpm:76,swing:58,beats:4,prog:'mellow',tonic:0,minor:false,
    lead:'rhodes',pad:'choir',bass:'synco',drums:'lofi',center:80,comp:[0],rev:.36,filt:4600,scale:'chord'},
  dosshiri:{label:'どっしり',desc:'重心を低く、ゆっくり踏みしめる。暗すぎない重さ。長考やボス前に',
    bpm:72,swing:0,beats:4,prog:'heavy',tonic:0,minor:true,
    lead:'vibes',pad:'strings',bass:'whole',drums:'boombap',center:74,comp:[0],rev:.40,filt:3600,scale:'diatonic'},
  minimal:{label:'ミニマル',desc:'クリックとリムだけの乾いた4つ打ち。同じ動機が淡々と続くミニマルテクノ',
    bpm:124,swing:10,beats:4,prog:'midnight',tonic:2,minor:true,plan:'minimal',
    lead:'pluck',pad:'stab',bass:'pulse',drums:'minimal',center:78,comp:[3,7],rev:.30,filt:4200,scale:'chord'},
  hiphop:{label:'ヒップホップ',desc:'ハネたブームバップにエレピ。ゆるく首を振るビート。拠点やメニューに',
    bpm:90,swing:52,beats:4,prog:'hiphop',tonic:9,minor:true,
    lead:'rhodes',pad:'piano',bass:'synco',drums:'boombap',center:79,comp:[0,3],rev:.24,filt:4400,scale:'penta'},
  dnb:{label:'DnB',desc:'速いブレイクに、ゆったり流れるパッドとベース。疾走する面に',
    bpm:172,swing:0,beats:4,prog:'dnb',tonic:2,minor:true,
    lead:'bell',pad:'pad',bass:'whole',drums:'dnb',center:82,comp:[0],rev:.34,filt:5800,scale:'chord'},
  breakbeat:{label:'ブレイクビーツ',desc:'細かく刻むブレイクで前のめりに。アクションの合間に',
    bpm:132,swing:6,beats:4,prog:'longrun',tonic:9,minor:true,
    lead:'synth',pad:'stab',bass:'octave',drums:'amen',center:80,comp:[2,6],rev:.20,filt:6400,scale:'penta'},
  trance:{label:'トランス',desc:'4つ打ちと裏のハイハット、大きく開く和音。高揚して駆け上がる',
    bpm:138,swing:0,beats:4,prog:'trance',tonic:9,minor:true,
    lead:'synth',pad:'pad',bass:'offbeat',drums:'trance',center:84,comp:[1,3,5,7],rev:.38,filt:7400,scale:'penta'},
  hardcore:{label:'ハードコア',desc:'速く硬い4つ打ちを踏み続ける。ボス戦や追い込みに',
    bpm:176,swing:0,beats:4,prog:'heavy',tonic:0,minor:true,
    lead:'synth',pad:'stab',bass:'offbeat',drums:'gabber',center:80,comp:[1,3,5,7],rev:.16,filt:7000,scale:'penta'},
  /* 2026-10-08 ダーク・シネマティック（裏面向け）。plan:'ostinato' は2小節の音型をそのまま回す、
     pedal はベースを主音に固定する。和音はほぼ止まり、音型の反復と脈打つ低音、長い弦やパッドでドラマを作る */
  /* 2026-10-08 作り直し：暗さより「ここは特別な場所だ」というワクワク。ドリアンの ♮6（IV が長3和音）で
     不思議に明るく、リフのベースと2ステップで前へ。表のジャンルに出す */
  uramen:{label:'うらめん',desc:'ここにしかない場所に来たワクワク。ドリアンの不思議な明るさの上でグロッケンの動機が跳ね、リフのベースと2ステップが前へ押す。裏ステージや隠しエリアに',
    bpm:124,swing:0,beats:4,prog:'secret',tonic:9,minor:true,plan:'motif',
    lead:'glock',pad:'warm',bass:'riff',drums:'twostep',center:84,comp:[0,3,6],rev:.40,filt:5600,scale:'modeUp'},
  shinen:{label:'しんえん',desc:'ゆっくり沈む弦の上で、エレピの音型が静かに回る。根音は動かず、内声だけ半音ずつ下がる。深い所へ降りる面に',
    bpm:80,swing:0,beats:4,prog:'cliche',tonic:0,minor:true,plan:'ostinato',pedal:true,
    lead:'rhodes',pad:'strings',bass:'heartbeat',drums:'soft',center:80,comp:[0],rev:.50,filt:3800,scale:'chord'},
  uneri:{label:'うねり',desc:'ピアノの脈と、低く長いベース、ハーフタイムの重い打ち込み。弦の音型が同じ形で回り、和音が ♭VI へ沈んで大きくうねる。映画の予告のような暗さ',
    bpm:88,swing:0,beats:4,prog:'dark',tonic:0,minor:true,plan:'ostinato',pedal:true,
    lead:'bow',pad:'piano',bass:'whole',drums:'halftime',center:79,comp:[0,1,2,3,4,5,6,7],rev:.50,filt:3600,scale:'diatonic'},
  /* 2026-10-08 宇宙：壮大で、歌うメロディ、ドラムは最低限。暗い音階は使わず、
     2〜4小節ずつゆっくり動く大きな和音と、広いリバーブ、ゆっくり立ち上がる音で「感動」を作る */
  hoshizora:{label:'ほしぞら',desc:'主音に居座るベースの脈の上で、I に IV と vi がふわっと重なるだけ。グロッケンの分散和音が星のようにまたたく。ふんわりパッド、ドラムなし',
    bpm:80,swing:0,beats:4,prog:'drift',tonic:0,minor:false,plan:'arp',pedal:true,
    lead:'glock',pad:'pad',bass:'pulse',drums:'none',center:86,comp:[0],rev:.60,filt:6000,scale:'chord'},
  ginga:{label:'ぎんが',desc:'ドリアンの i に IV9 が差し込む、主音固定のペダル。シンセの分散和音が回り続け、あたたかいパッドが広がる。ドラムはそっと。壮大な場面に',
    bpm:96,swing:0,beats:4,prog:'dorPedal',tonic:9,minor:true,plan:'arp',pedal:true,
    lead:'synth',pad:'warm',bass:'pulse',drums:'soft',center:82,comp:[0],rev:.50,filt:5200,scale:'chord'},
  oozora:{label:'おおぞら',desc:'主音に居座る鼓動の上で、I と ♭VII が入れ替わるミクソリディアン・ペダル。ベルの音型が同じ形で回り、ストリングスが広がる。ドラムなし',
    bpm:84,swing:0,beats:4,prog:'mixoPedal',tonic:0,minor:false,plan:'ostinato',pedal:true,
    lead:'bell',pad:'strings',bass:'heartbeat',drums:'none',center:84,comp:[0],rev:.55,filt:4800,scale:'chord'},
  mugen:{label:'むげん',desc:'主音に居座るベースの脈の上で、I と II9 が入れ替わるリディアン・ペダル。ハープの音型が同じ形で回り、ハミングが広がる。無重力の面に',
    bpm:92,swing:0,beats:4,prog:'lydPedal',tonic:0,minor:false,plan:'ostinato',pedal:true,
    lead:'harp',pad:'choir',bass:'pulse',drums:'none',center:84,comp:[0],rev:.58,filt:5600,scale:'modeUp'},
  /* 2026-10-08 ボス：怖いのは不協和音ではなく「強そう・仰々しい」。短調の太い和音と和声的短音階の V7、
     重いビートとオクターブのベースで押す。メロディは動機の「うた」で堂々と */
  boss:{label:'ボス',desc:'強く、怖く、仰々しく。ロックのビートとオクターブで刻むベース、弦の厚い和音の上でソウリードが堂々と歌う。V7 で締める王道の短調。ボス戦に',
    bpm:148,swing:0,beats:4,prog:'boss',tonic:0,minor:true,plan:'motif',
    lead:'saw',pad:'strings',bass:'octave',drums:'rock',center:79,comp:[0,3,6],rev:.30,filt:5200,scale:'chord'},
  kougeki:{label:'こうげき',desc:'攻め立てる戦闘曲。8分で刻むベースと3+3+2で突っ込むスタブ、矩形波のリードが前のめりに走る。ザコ戦や攻撃のターンに',
    bpm:168,swing:0,beats:4,prog:'assault',tonic:9,minor:true,plan:'motif',
    lead:'square',pad:'stab',bass:'pulse',drums:'breaks',center:82,comp:[0,3,6],rev:.20,filt:6800,scale:'chord'}
};

/* rhythm libraries — 8th-note positions across 2 bars, one set per meter */
export const RHY={
  4:[[0,2,3,6,8,10,11,14],[0,1,2,4,7,8,9,12],[2,3,4,6,10,11,12,14],
     [0,3,4,7,8,11,12,15],[0,2,4,8,10,12],[1,2,5,6,9,10,13,14]],
  3:[[0,2,3,6,8,9],[0,1,2,4,6,8,10],[2,3,4,6,7,10],
     [0,3,4,7,8,11],[0,2,6,8],[1,2,5,6,9,10]]
};
export const PLANS=[[0,0,1,0,2,2,1,4],[1,1,3,1,0,0,4,2],[5,5,0,5,3,3,2,4],[2,2,4,2,1,1,5,0]];
/* minimal: one motif repeated, with only occasional swaps — the rests still vary
   per repetition, so it shifts shape slowly instead of looping identically */
export const MIN_PLANS=[[0,0,0,0,0,0,0,0],[0,0,0,0,3,3,0,0],[3,3,3,3,0,0,0,0],[0,0,4,4,0,0,4,4]];

/* ---- コードのゆらぎ（エディタの「コードの変化」st.harmVary 0〜100。レシピコードには入らない） ----
   進行表の骨はそのままに、4小節ごとに「1小節に和音をいくつ置くか」の型（1・1・2・2 や 1・2・3・3 など）を選んで
   小節を拍で割る。割った後ろには次の和音へ向かう和音（ドミナント・ii-V・裏コード・sus・隣の和音）を入れ、
   ときどき小節まるごとを代理（I↔vi↔iii、IV↔ii）に替える。8小節の頭の和音は変えない。
   返すのは拍ごとの和音（長さ bars*beats、進行表と同じ C 基準の [根音, 種類]） */
export const HARM_RHYTHM={
  4:{lo:[[1,1,1,1],[1,1,1,2],[1,1,2,1],[1,2,1,1]],
     mid:[[1,1,2,2],[1,2,1,2],[2,1,2,1],[1,1,1,2],[2,2,1,1],[1,2,2,1]],
     hi:[[1,2,2,4],[1,2,3,3],[2,2,2,2],[1,3,1,2],[2,2,1,4],[1,1,3,4]]},
  3:{lo:[[1,1,1,1],[1,1,1,2],[1,2,1,1]],
     mid:[[1,1,2,2],[1,2,1,2],[2,1,2,1],[2,2,1,1]],
     hi:[[1,2,2,3],[2,2,2,2],[1,3,1,2],[2,1,3,3]]}
};
const qualOf=(a,b,c)=> a===4&&b===7&&c===11?'maj7': a===3&&b===7&&c===10?'m7': a===4&&b===7&&c===10?'dom7'
  : a===3&&b===6&&c===10?'m7b5': a===3&&b===7&&c===11?'mM7': a===4?'maj7':'m7';
export function diatonicChords(P){
  const sc=SCALE_SET.diatonic(P.minor).map(i=>(i+P.tonic)%12);
  return sc.map((r,d)=>{ const iv=k=>((sc[(d+k)%7]-r)+12)%12; return [r,qualOf(iv(2),iv(4),iv(6))]; });
}
export function harmonize(chords,P,v,rng){
  const B=P.beats, bars=chords.length, D=diatonicChords(P);
  const pcOf=x=>((x%12)+12)%12;
  // 9th や 13th の多い進行は、足した和音も同じ色にそろえる
  const rich=chords.filter(c=>/9|13/.test(c[1])).length>bars*.3;
  const color=q=>!rich?q: q==='maj7'?'maj9': q==='m7'?'m9': q==='dom7'?'dom9': q;
  const degOf=c=>D.findIndex(d=>d[0]===pcOf(c[0]));
  const pick=list=>{ let t=0; for(const [,w] of list) t+=w; let r=rng()*t;
    for(const [x,w] of list){ if((r-=w)<=0) return x; } return list[list.length-1][0]; };
  const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
  // 1. 小節まるごとの代理：3度となりの和音（同じ働き）へ
  const base=chords.map((c,b)=>{
    if(b%8===0 || b%16===15 || rng()>=v*.32) return c;
    const d=degOf(c); if(d<0) return c;
    const alt=D[(d+(rng()<.5?2:5))%7];
    return alt[1]==='m7b5'?c:[alt[0],color(alt[1])];
  });
  // 2. 次の和音へ向かう和音
  const approach=(T,first)=>{
    const opts=[];
    if(T[1]!=='m7b5') opts.push([[pcOf(T[0]+7),color('dom7')],3]);
    const d=degOf(T);
    if(d>=0){ const n=D[(d+(rng()<.5?1:6))%7]; if(n[1]!=='m7b5'||v>.6) opts.push([[n[0],color(n[1])],2]); }
    if(rich) opts.push([[pcOf(T[0]+1),'dom7'],v>.6?1.2:.4]);
    opts.push([[pcOf(T[0]),'sus9'],1]);
    if(first){ const fd=degOf(first); if(fd>=0){ const n=D[(fd+(rng()<.5?2:5))%7]; if(n[1]!=='m7b5') opts.push([[n[0],color(n[1])],1.5]); } }
    return pick(opts);
  };
  const cut=n=> B===4 ? (n===1?[4]: n===2?(rng()<.75?[2,2]:[3,1]): n===3?(rng()<.5?[2,1,1]:[1,1,2]):[1,1,1,1])
    : (n===1?[3]: n===2?(rng()<.7?[2,1]:[1,2]):[1,1,1]);
  const tier=()=>{ const r=rng(); return r<v*.55?'hi': r<.25+v*.6?'mid':'lo'; };
  const slots=[];
  for(let g=0;g<bars;g+=4){
    const T=HARM_RHYTHM[B][tier()], tmpl=T[Math.floor(rng()*T.length)];
    for(let i=0;i<4&&g+i<bars;i++){
      const b=g+i, X=base[b], next=base[(b+1)%bars];
      const segs=cut(tmpl[i]), chs=[X];
      // 後ろから、次の和音へ向かう鎖を作る（V の前は ii にしやすい：ii-V）
      let tgt=next; const tail=[];
      for(let k=segs.length-1;k>0;k--){
        let c;
        if(tgt[1].startsWith('dom') && degOf(tgt)>=0 && rng()<.6) c=[pcOf(tgt[0]+7),P.minor&&pcOf(tgt[0]+7-P.tonic)===2?'m7b5':color('m7')];
        else c=approach(tgt,k===1?X:null);
        if(same(c,tgt)) c=[pcOf(tgt[0]+7),color('dom7')];
        tail.unshift(c); tgt=c;
      }
      chs.push(...tail);
      segs.forEach((n,k)=>{ for(let q=0;q<n;q++) slots.push(chs[k]); });
    }
  }
  return slots;
}

export function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

/* ============================================================
   arrangement
   p8 = eighth-note position from the start; EPB eighths per bar
   ============================================================ */
/* st.beats（3 か 4）があれば、曲調の拍子を上書きする（エディタの「拍子」。レシピコードには入らない） */
export function presetOf(st){
  const P=PRESETS[st.preset];
  return (st.beats===3||st.beats===4)&&st.beats!==P.beats ? Object.assign({},P,{beats:st.beats}) : P;
}
export function buildSong(st){
  const P=presetOf(st);
  const EPB=P.beats*2, MID=Math.floor(EPB/2), ACC=(P.beats===4)?[2,6]:[2,4];
  const rng=mulberry32(st.seed);
  const dens=st.density/100, mel=st.mel, key=st.key;
  const sections=st.sections, bars=16*sections, total=bars*EPB;
  const prog=PROGS[P.prog];
  // 反復の型とベースの土台。エディタは st で上書きできる（レシピコードには入らない）
  const planKind=st.plan||P.plan;
  const pedal=(st.pedal===undefined||st.pedal===null)?!!P.pedal:!!st.pedal;
  // 和音の動き（エディタの「アレンジ」。レシピコードには入らない）：half は2小節ごと、quarter は4小節ごと、
  // hold は最初の和音だけ。進行表のかたまりの頭の和音を伸ばすので、進行の骨は残る
  const motion=st.chordMotion||'auto';
  const progAt=i=> motion==='hold'?prog[0] : motion==='quarter'?prog[i-(i%4)] : motion==='half'?prog[i-(i%2)] : prog[i];
  const chords=[];
  for(let s=0;s<sections;s++) for(let i=0;i<16;i++) chords.push(progAt(i));
  // 拍ごとの和音（コードのゆらぎ）。st.slots はエディタが持っている和音をそのまま使わせるとき。
  // どちらも無ければ null で、和音は小節ごと（昔のまま）
  const BEATS=P.beats;
  let slots=null;
  if(Array.isArray(st.slots) && st.slots.length===bars*BEATS && st.slots.every(c=>Array.isArray(c)&&QUAL[c[1]]))
    slots=st.slots.map(c=>[c[0]|0,c[1]]);
  else if((st.harmVary|0)>0 && motion!=='hold')
    slots=harmonize(chords,P,Math.min(100,st.harmVary|0)/100*(P.pedal?.5:1),mulberry32(((st.harmSeed||st.seed)*23+0x7A3D)|0));
  if(slots) for(let b=0;b<bars;b++) chords[b]=slots[b*BEATS];
  const total0=bars*P.beats*2;
  const chordAt=p=> slots ? slots[Math.floor((((p%total0)+total0)%total0)/2)] : chords[Math.floor(p/(P.beats*2))%bars];

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

  const pcOf2=m=>((m%12)+12)%12;
  const nextStep=()=>{
    const r=rng();
    let s=r<.40?1:r<.72?-1:r<.84?2:r<.94?-2:(r<.97?3:-3);
    if(Math.abs(s)>1 && rng()>leap*1.6) s=Math.sign(s);
    else if(Math.abs(s)===1 && rng()<(leap-0.55)*1.1) s*=(rng()<.5?2:3);
    return s;
  };

  /* --- ostinato (plan:'ostinato'): 2小節の音型を一言一句そのまま回す ---
     休符も音型の一部として固定する。8小節の最後の2小節だけ変形し、
     奇数番目のセクションはまるごと音階上の2つ上に乗せ替えて B パートにする。
     和音が変わると音の池が変わるので、形はそのままで音が曲がる（ラインクリシェと相性がいい） */
  /* --- arp (plan:'arp'): 分散和音ふうの音型を鳴らし続ける ---
     休符なし。リズムは音数で 8分／4分／2分、形は 上り・上り下り・とび・低い音に戻る の4つからタネで選ぶ。
     2小節で1周。8小節の最後の2小節の変形（2つ上／形を逆から／オクターブ上）と
     奇数番目のセクションの乗せ替えは ostinato と同じ。和音が変わると音の池が変わり、形のまま音が変わる */
  if(planKind==='arp'){
    const span=2*EPB, step=mel.dens>=55?1:mel.dens>=30?2:MID;
    const cell=[]; for(let p=0;p<span;p+=step) cell.push(p);
    // 形（音の池の添字）。後ろの4つは1オクターブほど上って下りる長い形で、メロディックなエレクトロニカ向き
    const SHAPES=[[0,1,2,3],[0,1,2,3,2,1],[0,2,4,2],[0,3,0,4,0,5,0,4],
      [0,2,4,6,7,6,4,2],[0,1,2,4,5,4,2,1],[0,3,5,7,5,3],[0,4,7,4,2,5,7,5]];
    const shape=SHAPES[Math.floor(rng()*SHAPES.length)], L=shape.length;
    const vary=Math.floor(rng()*3);
    for(let c=0;c<bars/2;c++){
      const barBase=c*2, sec=Math.floor(barBase/16), w=c%4, last=(w===3);
      const shift=(sec%2===1)?2:0;
      for(let k=0;k<cell.length;k++){
        const p=cell[k], ch=chordAt(barBase*EPB+p);
        const pl=poolAt(ch,lo,hi);
        // 出だしは池の中でいちばん低い和音の音（根音・3度・5度）。テンションから始めると和音らしく聞こえない
        const tri=[0,QUAL[ch[1]][1],QUAL[ch[1]][2]].map(i=>(((ch[0]+key+i)%12)+12)%12);
        let low=pl.findIndex(m=>tri.includes(m%12)); if(low<0) low=Math.floor(pl.length*0.2);
        const rel=(last&&vary===1)?shape[L-1-k%L]:shape[k%L];
        let i=low+rel+shift+((last&&vary===0)?2:0);
        i=Math.max(0,Math.min(pl.length-1,i));
        let note=pl[i];
        if(last && vary===2 && note+12<=hi) note+=12;
        const at=barBase*EPB+p;
        if(at>=total) continue;
        const vel=(p%2===0?.66:.52)+(p%EPB===0?.06:0)+.05*(w/3);
        ev.push({kind:'lead',layer:'main',p8:at,d8:step,note,vel});
        if(mel.octUp && note+12<=103)
          ev.push({kind:'lead',layer:'oct',p8:at,d8:step,note:note+12,vel:vel*.42});
        if(mel.harm && i>=2)
          ev.push({kind:'lead',layer:'harm',p8:at,d8:step,note:pl[i-2],vel:vel*.52});
      }
    }
  } else if(planKind==='ostinato'){
    const span=2*EPB, lib=RHY[P.beats];
    const hits=new Set(lib[Math.floor(rng()*lib.length)]);
    // 音数：高いほど8分を足し、低いほど抜く（頭の音は必ず残す）
    for(let p=1;p<span;p++){
      if(hits.has(p)){ if(mel.dens<40 && rng()<(40-mel.dens)/50) hits.delete(p); }
      else if(mel.dens>60 && rng()<(mel.dens-60)/40) hits.add(p);
    }
    const cell=[...hits].sort((a,b)=>a-b), n=cell.length;
    const steps=[0]; for(let k=1;k<n;k++) steps.push(nextStep());
    const rest=cell.map((p,k)=>k>0 && rng()<restP*.35);
    const dur=cell.map((p,k)=>{
      let d=(k===n-1)?Math.min(4,span-p):(cell[k+1]-p);
      if(rng()<.18) d=Math.min(d+1,4);
      return d;
    });
    const vary=Math.floor(rng()*3);   // 0: 2つ上へ  1: しっぽを折り返す  2: オクターブ上
    for(let c=0;c<bars/2;c++){
      const barBase=c*2, sec=Math.floor(barBase/16), w=c%4, last=(w===3);
      const shift=(sec%2===1)?2:0;
      const pools=cell.map(p=>poolAt(chordAt(barBase*EPB+p),lo,hi));
      const idx=[]; let prev=null;
      for(let k=0;k<n;k++){
        const pl=pools[k];
        let i=(prev===null)?Math.floor(pl.length*0.45):prev+steps[k];
        if(k>0 && i>pl.length-2) i=prev-Math.abs(steps[k]);
        if(k>0 && i<1) i=prev+Math.abs(steps[k]);
        if(i<0) i=-i;
        if(i>=pl.length) i=pl.length-1-(i-pl.length+1);
        i=Math.max(0,Math.min(pl.length-1,i));
        idx.push(i); prev=i;
      }
      if(last && vary===1 && n>=3){
        // 最後の2音を、その前の音を軸に折り返す
        const ax=idx[n-3];
        idx[n-2]=ax-(idx[n-2]-ax); idx[n-1]=ax-(idx[n-1]-ax);
      }
      for(let k=0;k<n;k++){
        if(rest[k]) continue;
        const pl=pools[k];
        let i=idx[k]+shift+((last&&vary===0)?2:0);
        i=Math.max(0,Math.min(pl.length-1,i));
        let note=pl[i];
        if(last && vary===2 && note+12<=hi) note+=12;
        const at=barBase*EPB+cell[k];
        if(at>=total) continue;
        const vel=(cell[k]%2===0?.70:.56)+(k===0?.06:0)+.06*(w/3);
        ev.push({kind:'lead',layer:'main',p8:at,d8:dur[k],note,vel});
        if(mel.octUp && note+12<=103)
          ev.push({kind:'lead',layer:'oct',p8:at,d8:dur[k],note:note+12,vel:vel*.42});
        if(mel.harm && i>=2)
          ev.push({kind:'lead',layer:'harm',p8:at,d8:dur[k],note:pl[i-2],vel:vel*.52});
      }
    }
  } else if(planKind==='motif'){
  /* --- motif (plan:'motif'): 動機から組み立てる「うた」 ---
     1小節の動機（リズム＋音階上の形）をタネで1つ作り、8小節を
     「動機・動機を音階上でずらす（ゼクエンツ）・動機・問いの終わり／動機・ずらし・対比・答えの終わり」のように組む。
     強拍と長い音は和音の音に寄せ、弱拍は音階の経過音で動くので、でたらめに聞こえない。
     奇数番目のセクションは動機ごと音階上で2つ上に乗せ替える */
    const LIB=P.beats===4
      ? [[[0,2],[2,2],[4,4]],[[0,3],[3,1],[4,2],[6,2]],[[0,1],[1,1],[2,2],[4,3]],[[1,1],[2,2],[4,1],[5,3]],
         [[0,2],[3,3],[6,2]],[[0,1],[1,2],[3,1],[4,4]],[[0,2],[2,1],[3,1],[4,2],[6,2]],[[0,3],[3,3],[6,2]],
         [[2,2],[4,2],[6,2]],[[0,1],[1,1],[2,1],[3,1],[4,2],[6,2]],[[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,2]],
         [[0,2],[2,1],[3,2],[5,1],[6,1],[7,1]],[[0,4],[4,2],[6,2]],[[0,6],[6,1],[7,1]]]
      : [[[0,2],[2,2],[4,2]],[[0,3],[3,1],[4,2]],[[0,1],[1,1],[2,4]],[[0,2],[2,1],[3,3]],[[1,1],[2,2],[4,2]],
         [[0,1],[1,1],[2,1],[3,1],[4,2]],[[0,4],[4,2]],[[0,2],[2,1],[3,1],[4,1],[5,1]]];
    const END=P.beats===4
      ? [[[0,2],[2,2],[4,4]],[[0,3],[3,1],[4,4]],[[0,6]],[[0,2],[2,6]],[[0,1],[1,1],[2,6]]]
      : [[[0,2],[2,4]],[[0,6]],[[0,3],[3,3]],[[0,1],[1,1],[2,4]]];
    // 音数で動機の候補を絞る（少ないほど長い音、多いほど細かい）
    const want=1.8+mel.dens/100*(P.beats===4?5.4:3.6);
    const near=LIB.slice().sort((a,b)=>Math.abs(a.length-want)-Math.abs(b.length-want)).slice(0,5);
    const pickR=list=>list[Math.floor(rng()*list.length)];
    const rhyM=pickR(near), rhyN=pickR(near.filter(r=>r!==rhyM).concat([rhyM]));
    const shape=r=>{ const c=[0]; for(let k=1;k<r.length;k++) c.push(c[k-1]+nextStep()); return c; };
    const shM=shape(rhyM), shN=shape(rhyN);
    // 尻尾を折り返した形（同じリズムで、最後の2音だけ逆へ）
    const shM2=shM.map((x,k)=>k>=shM.length-2&&shM.length>=3?2*shM[shM.length-3]-x:x);
    const FORMS=[
      [['M',0],['M',1],['M',0],['Q'],['M',0],['M',1],['N',0],['E']],
      [['M',0],['N',0],['M',0],['Q'],['M',0],['N',0],['M',-1],['E']],
      [['M',0],['M2',0],['N',1],['Q'],['M',0],['M2',0],['N',-1],['E']],
      [['M',0],['M',-1],['M',-2],['Q'],['M',0],['M',-1],['N',0],['E']],
      [['M',0],['M',2],['N',0],['Q'],['M',0],['M',2],['M2',1],['E']]];
    const form=pickR(FORMS);
    const rhyQ=pickR(END), rhyE=pickR(END);
    const ARC=[0,0,1,1,1,2,1,0];
    const scPcs=fixedPcs||SCALE_SET.diatonic(P.minor).map(i=>i+P.tonic+key);
    const sc=notesInRange(scPcs,lo,hi);
    const a0=Math.floor(sc.length*0.42);
    const tonesAt=p=>{ const c=chordAt(p); return QUAL[c[1]].map(i=>pcOf2(c[0]+key+i)); };
    const snap=(i,p,root)=>{
      // いちばん近い和音の音（決まった音階なら、その音階に入っている和音の音）
      const ts=root?[tonesAt(p)[0]]:tonesAt(p);
      for(let d=0;d<=3;d++) for(const j of [i-d,i+d]) if(j>=0&&j<sc.length&&ts.includes(pcOf2(sc[j]))) return j;
      return i;
    };
    const clampI=i=>Math.max(0,Math.min(sc.length-1,i));
    const put=(at,d8,i,vel)=>{
      const note=sc[i];
      ev.push({kind:'lead',layer:'main',p8:at,d8,note,vel});
      if(mel.octUp && note+12<=103) ev.push({kind:'lead',layer:'oct',p8:at,d8,note:note+12,vel:vel*.42});
      if(mel.harm && i>=2) ev.push({kind:'lead',layer:'harm',p8:at,d8,note:sc[i-2],vel:vel*.52});
    };
    for(let b=0;b<bars;b++){
      const sec=Math.floor(b/16), ph=b%8, half=Math.floor((b%16)/8), base=b*EPB;
      const [kind,seq]=form[ph];
      const anchor=a0+ARC[ph]+(sec%2===1?2:0)+(seq||0);
      if(kind==='Q'||kind==='E'){
        // 終わりの小節：最後の音へ順に歩いて着く。前半の8小節は問い（3度か5度で止まる）、後半は答え（根音に着く）
        const rhy=kind==='E'?rhyE:rhyQ;
        const lastP=base+rhy[rhy.length-1][0];
        const answer=kind==='E'&&half===1;
        const tgt=snap(clampI(answer?a0-1:anchor+1),lastP,answer);
        const dir=rng()<.6?1:-1;
        rhy.forEach(([p,d],k)=>{
          const i=clampI(tgt+dir*(rhy.length-1-k));
          const at=base+p;
          const j=(k===0||k===rhy.length-1)?snap(i,at,k===rhy.length-1&&answer):i;
          put(at,Math.min(d,EPB-p),j,(p%2===0?.7:.56)+(k===rhy.length-1?.04:0));
        });
        continue;
      }
      const rhy=kind==='N'?rhyN:rhyM, shp=kind==='N'?shN:kind==='M2'?shM2:shM;
      rhy.forEach(([p,d],k)=>{
        // 1音目以外は、ときどき休む（形は崩さない程度）
        if(k>0 && rng()<restP*.25) return;
        const at=base+p;
        let i=clampI(anchor+shp[k]);
        const strong=(p%(P.beats===4?4:6)===0)||d>=3||k===0;
        // 和音の音の半音上（ぶつかる音）に2拍ぶん以上いるのも避ける
        const rub=d>=2&&tonesAt(at).includes(pcOf2(sc[i]-1));
        if(strong||rub) i=snap(i,at,false);
        put(at,Math.min(d,EPB-p),i,(p%2===0?.72:.56)+(p===0?.05:0)+rng()*.06);
      });
    }
  } else {
  /* --- main melody --- */
  const contourCache={};
  let prevIdx=null;
  for(let s=0;s<sections;s++){
    const plan=(planKind==='minimal'?MIN_PLANS:PLANS)[s%PLANS.length];
    for(let ph=0;ph<8;ph++){
      const role=plan[ph], rhy=RHY[P.beats][role], barBase=s*16+ph*2;
      if(!contourCache[role]){
        const c=[0];
        for(let k=1;k<rhy.length;k++) c.push(nextStep());
        contourCache[role]=c;
      }
      const contour=contourCache[role];
      for(let k=0;k<rhy.length;k++){
        const p8=rhy[k], ch=chordAt(barBase*EPB+p8);
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
        const ch=chordAt(b*EPB+p8);
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
  // arrangement knobs (v5). Each pass draws from its own random stream, so
  // moving them never reshuffles the melody, and 0 leaves the song untouched.
  const bArr=(st.bassArr|0)/100, drama=(st.drama|0)/100, arr=(st.arrange|0)/100;
  const dBusy=(st.drumBusy|0)/100, dFill=(st.drumFill|0)/100,
        dPlay=(st.drumPlay|0)/100, dFeel=(st.drumFeel|0)/100;
  const rngB=mulberry32((st.seed*7+0x9E37)|0), rngC=mulberry32((st.seed*11+0x51ED)|0),
        rngA=mulberry32((st.seed*13+0x2F6B)|0);
  const barInfo=[];
  let prevVc=null;
  let prevRoot=null;
  // 小節の途中で和音が変わるとき（コードのゆらぎ）：その拍から後ろのベースと伴奏を新しい和音へ移す。
  // ベースは和音の何度の音だったかを保って移し、またいで伸びている音はそこで切って弾き直す
  const pcOf=m=>((m%12)+12)%12;
  const bassClamp=n=>{ while(n>62) n-=12; while(n<28) n+=12; return n; };
  const mapTone=(n,c1,c2)=>{
    const q2=QUAL[c2[1]].map(i=>i%12), idx=QUAL[c1[1]].map(i=>i%12).indexOf(pcOf(n-c1[0]-key));
    if(idx<0) return n;
    const want=pcOf(c2[0]+key+q2[Math.min(idx,q2.length-1)]);
    for(let d=0;d<=6;d++){ if(pcOf(n-d)===want) return n-d; if(pcOf(n+d)===want) return n+d; }
    return n;
  };
  const rootNear=(n,c)=>{ const lo=n-pcOf(n-c[0]-key); return bassClamp(n-lo>6?lo+12:lo); };
  /* riff：タネで2小節のリフ（リズム＋和音の何度の音か）を1つ作り、和音に合わせて移して回す。
     8小節の終わりの2小節は、同じリズムで音だけ選び直した変化形 */
  let riff=null;
  if(st.bassStyle==='riff'){
    const rr=mulberry32((st.seed*29+0x4B1D)|0);
    const LIB=P.beats===4
      ? [[0,3,6,8,11,14],[0,2,3,6,8,10,11,14],[0,3,4,7,8,11,12,14,15],[0,1,4,6,8,9,12,14],
         [0,3,5,8,10,13,15],[0,2,5,6,8,11,13,14],[0,3,6,7,8,10,11,14,15]]
      : [[0,3,4,6,9,10],[0,2,3,6,8,9,11],[0,3,5,6,9,11],[0,1,4,6,7,10]];
    const hits=LIB[Math.floor(rr()*LIB.length)], span=2*EPB;
    const ROLES=['R','R','R','5','8','5','b7','3','6'];
    const roles=()=>hits.map((p,i)=>{
      if(p%EPB===0) return 'R';
      if(i===hits.length-1 && p>=span-2) return 'app';
      let r=ROLES[Math.floor(rr()*ROLES.length)];
      return r;
    });
    const durs=hits.map((p,i)=>{ const nx=i<hits.length-1?hits[i+1]:span; let d=Math.min(3,nx-p); if(d>1&&rr()<.4) d=1; return d; });
    riff={hits,durs,a:roles(),b:roles()};
  }
  const riffNote=(role,root,bq,nRoot,rr)=>{
    switch(role){
      case '5': return root+bq[2];
      case '8': return root+12<=55?root+12:root+bq[2];
      case '3': return root+bq[1];
      case 'b7': return root+(bq[3]%12===0?bq[2]:bq[3]%12);
      case '6': return root+(bq[1]===3?bq[2]:bq[2]+2);
      case 'app': return nRoot+(rr<.5?-1:1);
      default: return root;
    }
  };
  /* line：小節の頭は根音、そこから音階をたどって次の和音の根音へ歩く。和音が変わらないなら分散和音で回る */
  const scaleBass=notesInRange(SCALE_SET.diatonic(P.minor).map(i=>i+P.tonic+key),28,62);
  const splitBar=(b,from)=>{
    const base=b*EPB;
    for(let q=1;q<BEATS;q++){
      const c1=slots[b*BEATS+q-1], c2=slots[b*BEATS+q];
      if(c1[0]===c2[0]&&c1[1]===c2[1]) continue;
      const at=base+q*2, vc2=voicing(c2[0]+key,c2[1],55,74), add=[];
      for(let i=from;i<ev.length;i++){
        const e=ev[i];
        if(!(e.kind==='chord'||(e.kind==='bass'&&!pedal))) continue;
        const end=e.p8+e.d8;
        // 変わり目ちょうどの音は新しい和音の根音、その後ろは何度の音だったかを保って移す
        if(e.p8===at && e.kind==='bass') e.note=rootNear(e.note,c2);
        else if(e.p8>=at){ if(e.kind==='bass') e.note=bassClamp(mapTone(e.note,c1,c2)); else e.notes=vc2.slice(); }
        else if(end>at){
          e.d8=at-e.p8;
          let taken=false; for(let j=from;j<ev.length;j++) if(ev[j].kind===e.kind&&ev[j].p8===at) taken=true;
          if(!taken) add.push(e.kind==='bass'
            ? {kind:'bass',p8:at,d8:end-at,note:rootNear(e.note,c2),vel:e.vel*.85}
            : {kind:'chord',p8:at,d8:end-at,notes:vc2.slice(),vel:e.vel*.9});
        }
      }
      ev.push(...add);
    }
  };
  for(let b=0;b<bars;b++){
    const ch=chords[b], nx=chords[(b+1)%bars], base=b*EPB, evStart=ev.length;
    // ペダル：和音が変わってもベースは主音に居座る（上の和音だけが動く）。構成音は主音の3和音＋7度
    const bq=pedal?(P.minor?[0,3,7,10]:[0,4,7,11]):QUAL[ch[1]];
    const root=nearRoot((pedal?P.tonic:ch[0])+key,prevRoot); prevRoot=root;
    const third=root+bq[1], fifth=root+7;
    const nRoot=nearRoot((pedal?P.tonic:nx[0])+key,root);
    barInfo.push({root,nRoot,third,fifth:root+bq[2],sev:root+bq[3]});

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
    }else if(st.bassStyle==='funk'){
      // root on the one, an octave pop on the off-beat, the 7th and a ghost
      // approach to the next root; the in-between notes come and go with density
      const sev=QUAL[ch[1]].includes(10)?root+10:fifth;
      const pat=P.beats===4
        ? [[0,root,.9,2,1],[3,root+12,.66,1,1],[4,root,.5,1,.45+.4*dens],[5,sev,.6,1,.55+.35*dens],
           [6,root,.55,1,.35+.4*dens],[7,nRoot+(rng()<.5?-1:1),.42,1,.5+.3*dens]]
        : [[0,root,.9,2,1],[3,root+12,.66,1,1],[4,sev,.58,1,.55+.35*dens],[5,nRoot+(rng()<.5?-1:1),.42,1,.5+.3*dens]];
      for(const [p,n,v,d,pr] of pat)
        if(pr>=1||rng()<pr) ev.push({kind:'bass',p8:base+p,d8:d,note:n,vel:v});
    }else if(st.bassStyle==='heartbeat'){
      // ドッ・ドッ、と2連打だけ。4/4は1拍目と3拍目、3/4は1拍目だけ
      (P.beats===4?[0,MID]:[0]).forEach(p=>{
        ev.push({kind:'bass',p8:base+p,d8:1,note:root,vel:.82});
        ev.push({kind:'bass',p8:base+p+1,d8:1,note:root,vel:.5});
      });
    }else if(st.bassStyle==='riff'){
      const half=(b%2)*EPB, alt=(b%8>=6);
      riff.hits.forEach((p,i)=>{
        if(p<half||p>=half+EPB) return;
        const n=riffNote((alt?riff.b:riff.a)[i],root,bq,nRoot,rng());
        ev.push({kind:'bass',p8:base+p-half,d8:riff.durs[i],note:bassClamp(n),vel:(p-half)===0?.88:(p%2?.6:.7)});
      });
    }else if(st.bassStyle==='line'){
      // 頭は根音、最後の音は次の根音の隣（音階の隣か半音）から入る。間は離れていれば音階を歩き、
      // 近ければ和音の音（3度・5度・オクターブ）を回る
      const pts=P.beats===4?(rng()<.2+.3*dens?[0,2,4,6,7]:[0,2,4,6]):[0,2,4];
      const ix=n=>{ let k=0; for(let i=0;i<scaleBass.length;i++) if(Math.abs(scaleBass[i]-n)<Math.abs(scaleBass[k]-n)) k=i; return k; };
      const n=pts.length, i0=ix(root);
      let tgt=nRoot; if(Math.abs(tgt-root)>7) tgt+=tgt>root?-12:12;
      const i1=ix(tgt), far=Math.abs(i1-i0)>=n;
      let prev=null;
      const FIG=[[bq[1],bq[2]],[bq[2],12],[bq[2],bq[1]],[12,bq[2]],[bq[1],bq[2],12]];
      const fig=FIG[(b+Math.floor(rng()*FIG.length))%FIG.length];
      pts.forEach((p,k)=>{
        let note;
        if(k===0) note=root;
        else if(k===n-1){
          const from=i1>i0?-1:1;
          note=rng()<.3?tgt+from:scaleBass[Math.max(0,Math.min(scaleBass.length-1,i1+from))];
          if(note===tgt) note=tgt+from;
        }else if(far) note=scaleBass[Math.max(0,Math.min(scaleBass.length-1,Math.round(i0+(i1-i0)*k/(n-1))))];
        else note=root+fig[(k-1)%fig.length];
        if(note===prev) note=k===n-1?prev+(tgt>prev?2:-2):(note===root+bq[2]?root+12:root+bq[2]);
        prev=note;
        const d=(k<n-1?pts[k+1]:EPB)-p;
        ev.push({kind:'bass',p8:base+p,d8:d,note:bassClamp(note),vel:k===0?.84:(p===MID?.7:.6)});
      });
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

    let vc=voicing(ch[0]+key,ch[1],55,74), cVel=1;
    if(drama>0){
      const tones=QUAL[ch[1]].slice(1).map(i=>i+ch[0]+key);
      const lift=(b%8)/7;                       // where we are in the 8-bar phrase
      if(prevVc && rngC()<Math.min(1,drama*2.5)) vc=leadVoice(tones,prevVc,53,77);
      prevVc=vc;
      const pc=m=>((m%12)+12)%12;
      if(lift<.5 && rngC()<drama*.7){
        // first half: thin to the guide tones (3rd + 7th), which carry the colour
        const g=[pc(ch[0]+key+QUAL[ch[1]][1]),pc(ch[0]+key+QUAL[ch[1]][3])];
        const sh=vc.filter(m=>g.includes(pc(m)));
        if(sh.length>=2) vc=sh;
      }else if(lift>=.5 && rngC()<drama*.9){
        // second half: double the top voice an octave up so the phrase opens out
        const top=vc[vc.length-1];
        if(top+12<=88) vc=vc.concat([top+12]);
      }
      cVel=1+drama*(lift*.5-.2);
    }
    if(padLong){
      ev.push({kind:'chord',p8:base,d8:EPB,notes:vc,vel:.30*cVel});
    }else{
      P.comp.forEach((p,i)=>{
        if(p>=EPB) return;
        if(i>0 && rng()>0.45+0.5*dens) return;
        ev.push({kind:'chord',p8:base+p,d8:2,notes:vc,vel:(.30+(p===0?.06:0))*cVel});
      });
      // push the next chord in a beat early at phrase turns
      if(drama>.45 && b%4===3 && rngC()<(drama-.4)*1.4){
        const nt=QUAL[nx[1]].slice(1).map(i=>i+nx[0]+key);
        const nv=leadVoice(nt,prevVc||vc,53,77);
        for(let k=ev.length-1;k>=0;k--){ const e=ev[k];
          if(e.kind==='chord'&&e.p8>=base&&e.p8+e.d8>base+EPB-1) e.d8=Math.max(1,base+EPB-1-e.p8);
          if(e.kind==='chord'&&e.p8===base+EPB-1) ev.splice(k,1); }
        ev.push({kind:'chord',p8:base+EPB-1,d8:1,notes:nv,vel:.38*cVel});
      }
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
    }else if(kit==='funk'){
      // tight hats, a dry backbeat, syncopated kicks, quiet ghost hits on the rim
      for(let p=0;p<EPB;p++) ev.push({kind:'hat',p8:base+p,vel:p%2?.26:.4});
      ACC.forEach(p=>ev.push({kind:'clap',p8:base+p,vel:.56}));
      ev.push({kind:'kick',p8:base,vel:.82});
      ev.push({kind:'kick',p8:base+(rng()<.5?3:MID+1),vel:.58});
      if(rng()<.3+.5*dens) ev.push({kind:'kick',p8:base+EPB-1,vel:.44});
      for(let p=1;p<EPB;p+=2) if(rng()<.25+.45*dens) ev.push({kind:'rim',p8:base+p,vel:.14+rng()*.06});
    }else if(kit==='tick'){
      for(let p=0;p<EPB;p+=2) ev.push({kind:'shaker',p8:base+p,vel:p===0?.4:.24});
      ev.push({kind:'rim',p8:base+MID,vel:.34});
    }
    if(slots) splitBar(b,evStart);
  }
  if(bArr>0) arrangeBass(ev,barInfo,bArr,rngB,EPB,MID);
  let fillBars=null;
  if((dBusy>0||dFill>0) && DRUM_STYLE[st.drums])
    fillBars=drumExpress(ev,st.drums,dBusy,dFill,mulberry32((st.seed*17+0x3C6E)|0),bars,EPB,MID,ACC,P.beats,dPlay>0);
  // v7 drums: 16th-note grooves, the fill library, 遊び and ノリ. Old kits only
  // enter here when 遊び or ノリ is up, so older codes keep their exact sound.
  const GR=GROOVES[st.drums], DS=DRUM_STYLE[st.drums];
  if(GR || (DS && (dPlay>0||dFeel>0))){
    const rngG=mulberry32((st.seed*19+0x1B87)|0);
    if(GR) grooveDrums(ev,GR,dBusy,dFill,rngG,bars,EPB,P.beats,true);
    let done=new Set();
    if(GR || dPlay>0)
      done=placeFills(ev,GR?GR.fills:OLD_FILLS[DS.fill],dFill,dPlay,rngG,bars,EPB,P.beats,dPlay>0);
    fillBars=new Set([...(fillBars||[]),...done]);
    if(dPlay>0) drumPlay(ev,st.drums,dPlay,rngG,bars,EPB,P.beats,done);
    if(GR) for(const e of ev) if(GROUP[e.kind]==='drum'){
      const bar=Math.floor(e.p8/EPB);
      e.vel=Math.max(.03,Math.min(1,e.vel*(1+(rngG()-.5)*.16*dBusy+dFill*.12*((bar%8)/7-.5))));
    }
    drumFeel(ev,GR?Math.min(.9,(GR.sw||0)+dFeel*.35):0,(GR&&GR.lay||0)+dFeel*.03,dFeel*.012,rngG,total);
    for(const e of ev) if(GROUP[e.kind]==='drum') e.p8=((e.p8%total)+total)%total;
  }
  if(arr>0){
    const out=arrangeSong(ev,bars,arr,rngA,EPB,MID,st.drums,fillBars);
    ev.length=0; ev.push(...out);
  }
  ev.sort((a,b)=>a.p8-b.p8);
  return {events:ev,chords,slots,bars,beats:P.beats,epb:EPB,key};
}

/* nearest re-voicing of `tones` to the previous chord: common tones stay put,
   the rest move by the smallest step, so a held 3rd rings across the change */
export function leadVoice(tones,prev,lo,hi){
  const pcs=[...new Set(tones.map(t=>((t%12)+12)%12))].slice(0,4);
  const pc0=((pcs[0]%12)+12)%12;
  let best=null,bc=1e9;
  for(let r=0;r<pcs.length;r++){
    const order=pcs.slice(r).concat(pcs.slice(0,r));
    for(let start=lo;start<lo+12;start++){
      if(((start%12)+12)%12!==order[0]) continue;
      const v=[start];
      for(let i=1;i<order.length;i++){
        let m=v[i-1]+1; while(((m%12)+12)%12!==order[i]) m++;
        v.push(m);
      }
      if(v[v.length-1]>hi) continue;
      const c=v.reduce((a,m)=>a+Math.min(...prev.map(x=>Math.abs(x-m))),0)
        +Math.abs(v.reduce((a,m)=>a+m,0)/v.length-65)*.35;
      if(c<bc){ bc=c; best=v; }
    }
  }
  return best||voicing(pc0,'maj7',lo,hi);
}
/* bass: step off the fixed pattern — phrase-end fills, passing tones,
   octave jumps and approach notes into the next root. The downbeat root stays. */
export function arrangeBass(ev,info,a,rng,EPB,MID){
  const clamp=n=>{ while(n>62) n-=12; while(n<31) n+=12; return n; };
  const byBar=info.map(()=>[]);
  for(const e of ev) if(e.kind==='bass') byBar[Math.floor(e.p8/EPB)].push(e);
  const drop=new Set();
  info.forEach((I,b)=>{
    const base=b*EPB, list=byBar[b];
    const tonesUp=[I.root,I.third,I.fifth,I.sev,I.root+12];
    const nearTone=(n)=>tonesUp.filter(t=>t!==n).reduce((x,t)=>Math.abs(t-n)<Math.abs(x-n)?t:x,tonesUp[0]===n?tonesUp[1]:tonesUp[0]);
    let filled=false;
    if(a>.25 && b%4===3 && rng()<a*.8){
      // replace the back half of the bar with a run into the next root
      for(const e of list){ if(e.p8>=base+MID) drop.add(e); else if(e.p8+e.d8>base+MID) e.d8=base+MID-e.p8; }
      const up=rng()<.55, len=EPB-MID;
      const run=(up?[I.third,I.fifth,I.sev,I.root+12]:[I.root+12,I.sev,I.fifth,I.third]).slice(4-len+1);
      run.push(I.nRoot+(up?-1:1));
      run.slice(-len).forEach((n,i)=>ev.push({kind:'bass',p8:base+MID+i,d8:1,note:clamp(n),vel:.5+.1*i/len}));
      filled=true;
    }
    for(const e of list){
      if(drop.has(e)) continue;
      const off=e.p8-base;
      if(filled && off>=MID) continue;
      if(e.d8>=2 && rng()<a*.5){
        const h=Math.floor(e.d8/2), at=e.p8+h;
        if(!(filled && at>=base+MID) && at<base+EPB){
          e.d8=h;
          ev.push({kind:'bass',p8:at,d8:h,note:clamp(nearTone(e.note)),vel:e.vel*.82});
        }
      }
      if(off>0 && rng()<a*.3) e.note=clamp(e.note+(e.note<44?12:-12));
    }
    if(!filled && rng()<a*.6){
      const at=base+EPB-1, appr=clamp(I.nRoot+(rng()<.5?-1:1)*(rng()<.7?1:2));
      const hit=ev.find(e=>e.kind==='bass'&&e.p8===at&&!drop.has(e));
      if(hit) hit.note=appr;
      else{
        for(const e of ev) if(e.kind==='bass'&&!drop.has(e)&&e.p8<at&&e.p8+e.d8>at&&e.p8>=base) e.d8=at-e.p8;
        ev.push({kind:'bass',p8:at,d8:1,note:appr,vel:.5});
      }
    }
  });
  if(drop.size){ const keep=ev.filter(e=>!drop.has(e)); ev.length=0; ev.push(...keep); }
}
/* song form: 8-bar phrases get an energy level; quiet phrases thin out,
   phrase ends get a drum fill or a short break before the next one lands */
export const ENERGY={2:[.55,1],4:[.65,1,.3,1],8:[.6,1,.3,1,.65,1,.35,1]};
/* ---- drums: 手数 (how much is played) and 展開 (how it moves over the phrase) ----
   Each kit keeps its own pattern; these add what a drummer would around it:
   a backbeat under the clap, ghost notes, filled-in hats, open hats, hand
   percussion, 4-bar variations, 8-bar fills and a crash where phrases land. */
export const DRUM_STYLE={
  brush:   {back:'snare',bv:.2, ghost:'snare',hats:null,   kick:false,open:false,openAll:false,perc:true, fill:'tom',  crash:false},
  pop:     {back:'snare',bv:.3, ghost:'snare',hats:null,   kick:false,open:true, openAll:false,perc:false,fill:'tom',  crash:true},
  night:   {back:'rim',  bv:.26,ghost:'rim',  hats:'hat',  kick:true, open:true, openAll:false,perc:true, fill:'tom',  crash:false},
  tick:    {back:null,   bv:0,  ghost:'rim',  hats:'hat',  kick:true, open:false,openAll:false,perc:true, fill:'rim',  crash:false},
  four:    {back:'snare',bv:.26,ghost:null,   hats:null,   kick:false,open:false,openAll:true, perc:false,fill:'snare',crash:true},
  halftime:{back:'snare',bv:.34,ghost:'snare',hats:null,   kick:false,open:true, openAll:false,perc:false,fill:'tom',  crash:true,  backAt:[4]},
  bossa:   {back:null,   bv:0,  ghost:null,   hats:null,   kick:false,open:false,openAll:false,perc:true, fill:'perc', crash:false},
  breaks:  {back:'snare',bv:.38,ghost:'snare',hats:null,   kick:false,open:true, openAll:false,perc:false,fill:'tom',  crash:true},
  soft:    {back:'snare',bv:.14,ghost:null,   hats:'shaker',kick:false,open:false,openAll:false,perc:true, fill:'perc', crash:false},
  funk:    {back:'snare',bv:.36,ghost:'snare',hats:null,   kick:false,open:true, openAll:false,perc:false,fill:'tom',  crash:true}
};
/* GM numbers double as the pitch table for toms and congas */
export const TOM_GM=[50,48,47,45,43,41], CONGA={hi:63,mute:62,lo:64};
export function drumExpress(ev,kit,b,f,rng,bars,EPB,MID,ACC,beats,noFill){
  const S=DRUM_STYLE[kit], fills=new Set();
  const backAt=S.backAt||ACC;
  const at=new Map();
  for(const e of ev) if(GROUP[e.kind]==='drum'){ if(!at.has(e.p8)) at.set(e.p8,[]); at.get(e.p8).push(e); }
  const has=(p,kinds)=>(at.get(p)||[]).some(e=>kinds.includes(e.kind));
  const add=e=>{ ev.push(e); if(!at.has(e.p8)) at.set(e.p8,[]); at.get(e.p8).push(e); };
  const remove=(from,to,kinds)=>{
    for(let i=ev.length-1;i>=0;i--){ const e=ev[i];
      if(e.p8>=from&&e.p8<to&&kinds.includes(e.kind)){ ev.splice(i,1); const l=at.get(e.p8); l.splice(l.indexOf(e),1); } }
  };
  const PERC4=[[[3,'hi'],[5,'mute'],[6,'lo'],[7,'hi']],[[2,'hi'],[3,'hi'],[6,'lo'],[7,'mute']]],
        PERC3=[[[2,'hi'],[4,'lo'],[5,'hi']],[[1,'mute'],[2,'hi'],[4,'lo']]];
  for(let bar=0;bar<bars;bar++){
    // with 遊び on, fills come from the shared fill library instead
    const base=bar*EPB, q=bar%8, big=!noFill && f>=.25 && q===7 && rng()<Math.min(1,f*1.4);
    const small=!noFill && !big && f>=.3 && bar%4===3 && rng()<f*.6;
    const fillFrom=big?base+MID:small?base+EPB-2:base+EPB;
    // ---- 手数 ----
    if(b>0){
      if(S.back && b>=.15) for(const p of backAt)
        if(p<EPB && base+p<fillFrom) add({kind:S.back,p8:base+p,vel:S.bv*(.7+.6*b)});
      if(S.hats && b>=.3) for(let p=0;p<EPB;p++)
        if(base+p<fillFrom && !has(base+p,['hat','shaker','ohat']))
          add({kind:S.hats,p8:base+p,vel:(p%2?.1:.15)+.1*b});
      if(S.kick && b>=.35){
        if(!has(base,['kick'])) add({kind:'kick',p8:base,vel:.36+.12*b});
        if(b>=.6 && beats===4 && !has(base+4,['kick']) && rng()<.6) add({kind:'kick',p8:base+4,vel:.26});
      }
      if(S.ghost) for(let p=1;p<EPB;p+=2)
        if(base+p<fillFrom && !has(base+p,['snare','rim','clap']) && rng()<b*.4)
          add({kind:S.ghost,p8:base+p,vel:.08+.08*rng()});
      if(S.open && b>=.25 && rng()<b*.6 && base+EPB-1<fillFrom){
        remove(base+EPB-1,base+EPB,['hat']); add({kind:'ohat',p8:base+EPB-1,vel:.22+.12*b});
      }
      if(S.openAll && b>=.5) for(let p=1;p<EPB;p+=2){
        if(base+p>=fillFrom) continue;
        remove(base+p,base+p+1,['hat']); add({kind:'ohat',p8:base+p,vel:.18+.1*b});
      }
      if(S.perc && b>=.4){
        const pat=(beats===4?PERC4:PERC3)[bar%2];
        for(const [p,w] of pat) if(base+p<fillFrom && rng()<.45+.5*b)
          add({kind:'perc',p8:base+p,gm:CONGA[w],vel:(w==='mute'?.16:.24)+.1*b});
      }
    }
    // ---- 展開 ----
    if(f>0){
      if(bar%4===3 && rng()<f*.7){
        const p=beats===4?(rng()<.5?EPB-2:3):EPB-2;
        if(base+p<fillFrom && !has(base+p,['kick'])) add({kind:'kick',p8:base+p,vel:.4});
      }
      if(big||small){
        remove(fillFrom,base+EPB,['hat','shaker','ohat','perc','rim','snare','clap']);
        const n=base+EPB-fillFrom;
        for(let i=0;i<n;i++){
          const p8=fillFrom+i, v=.3+.3*(i+1)/n;
          if(S.fill==='tom') add({kind:'tom',p8,gm:TOM_GM[Math.min(TOM_GM.length-1,Math.round(i*(TOM_GM.length-1)/Math.max(1,n-1))*(big?1:2)%TOM_GM.length)],vel:v});
          else if(S.fill==='perc') add({kind:'perc',p8,gm:i<n/2?CONGA.hi:CONGA.lo,vel:v*.8});
          else add({kind:S.fill,p8,vel:v*(S.fill==='rim'?.8:1)});
        }
        if(big){ add({kind:'kick',p8:base+EPB-1,vel:.5}); fills.add(bar); }
      }
      if(S.crash && f>=.45 && q===0){
        remove(base,base+1,['hat','ohat']);
        add({kind:'crash',p8:base,vel:.26+.18*f});
      }
    }
  }
  // dynamics: a little human unevenness, a lean into the phrase, a firmer one
  for(const e of ev){
    if(GROUP[e.kind]!=='drum') continue;
    const bar=Math.floor(e.p8/EPB), off=e.p8%EPB;
    let v=e.vel;
    if(b>0) v*=1+(rng()-.5)*.16*b+(off===0?.05*b:0);
    if(f>0) v*=1+f*.12*((bar%8)/7-.5);
    e.vel=Math.max(.03,Math.min(1,v));
  }
  return fills;
}

/* ============================================================
   groove library — 16th-note drums
   One bar per string: 16 steps in 4/4 (the first 12 are used in 3/4).
   X accent · x normal · o soft · g ghost · ? maybe (more likely with 手数) · O open hat · . rest
   voices: k kick · B 808 · s snare · c clap · r rim · h hat · O open hat · S shaker
           t tambourine · R ride · cb cowbell · bl wood block · p conga hi · pl conga lo
   a = the main bar, b = the answering bar, opt = layers that join as 手数 rises
   ============================================================ */
export const GV={X:.9,x:.66,o:.42,g:.16,'?':.22};
export const GVOICE={k:'kick',B:'boom',s:'snare',c:'clap',r:'rim',h:'hat',O:'ohat',S:'shaker',
  t:'tamb',R:'ride',cb:'cowbell',bl:'block',p:'perc',pl:'perc'};
export const GROOVES={
  house:{sw:.08,crash:true,fills:['snareRoll','hatBark','kickSnare','triplet'],
    a:{k:'X...X...X...X...',c:'....x.......x...',O:'..x...x...x...x.',h:'.g.g.g.g.g.g.g.g'},
    b:{k:'X...X...X...X..g',c:'....x.......x..?',O:'..x...x...x...x.',h:'.g.g.g.g.g.g.gxg'},
    opt:[{min:.35,v:{S:'gogogogogogogogo'}},{min:.6,v:{t:'....x.......x...'}}]},
  disco:{sw:.05,crash:true,fills:['tomDown','snareRoll','cowbellCall'],
    a:{k:'X...X...X...X...',s:'....X.......X...',O:'..x...x...x...x.',h:'x...x...x...x...'},
    b:{k:'X...X...X...X...',s:'....X.......X.gx',O:'..x...x...x.....',h:'x...x...x...x.x.'},
    opt:[{min:.3,v:{t:'gogogogogogogogo'}},{min:.65,v:{cb:'..........x.....'}}]},
  funk16:{sw:.14,crash:true,fills:['tomDown','kickSnare','snareBuild','flamTom'],
    a:{k:'X.....x...x..x..',s:'....X..g.g..X..g',h:'xoxoxoxoxoxoxoxo'},
    b:{k:'X..x..x...X..x..',s:'.g..X..g.g..X.g.',h:'xoxoxoxoxoxo.oxo',O:'............x...'},
    opt:[{min:.55,v:{cb:'..x.......x.....'}},{min:.3,v:{s:'..?......?....?.'}}]},
  boombap:{sw:.45,lay:.05,crash:false,fills:['stop','kickSnare','hatBark'],
    a:{k:'X......x..X.....',s:'....X.......X...',h:'x.x.x.x.x.x.x.x.'},
    b:{k:'X.x.......X..x..',s:'....X.......X.g.',h:'x.x.x.x.x.x.x.O.'},
    opt:[{min:.4,v:{S:'..g...g...g...g.'}},{min:.25,v:{h:'.?.?.?.?.?.?.?.?'}}]},
  lofi:{sw:.55,lay:.07,gain:.82,crash:false,fills:['rimClick','stop','percRun'],
    a:{k:'x......o..x.....',r:'....x.......x...',S:'o.g.o.g.o.g.o.g.'},
    b:{k:'x.o.......x..o..',r:'....x.......x..g',S:'o.g.o.g.o.g.o.go'},
    opt:[{min:.4,v:{h:'g...g...g...g...'}},{min:.6,v:{p:'......g.......g.'}}]},
  rock:{sw:0,crash:true,fills:['tomDown','snareBuild','flamTom','tomUp'],
    a:{k:'X.......x.x.....',s:'....X.......X...',h:'x.x.x.x.x.x.x.x.'},
    b:{k:'X.....x.x.x.....',s:'....X.......X..g',h:'x.x.x.x.x.x.x.x.'},
    opt:[{min:.5,v:{h:'.g.g.g.g.g.g.g.g'}},{min:.3,v:{s:'.......?.......?'}}]},
  twostep:{sw:.35,crash:true,fills:['hatBark','snareRoll','triplet'],
    a:{k:'X.........x.....',s:'....x.......x...',h:'..x...x...x...x.',S:'g.gog.gog.gog.go'},
    b:{k:'X......x..x.....',s:'....x.......x..?',h:'..x...x...x...O.',S:'g.gog.gog.gog.go'},
    opt:[{min:.5,v:{r:'.......g.......g'}}]},
  onedrop:{sw:.3,crash:false,fills:['rimClick','flamTom','stop'],
    a:{k:'........X.......',r:'........X.......',h:'..x...x...x...x.'},
    b:{k:'........X.......',r:'........X.....g.',h:'..x...x...x...O.'},
    opt:[{min:.3,v:{h:'g...g...g...g...'}},{min:.55,v:{bl:'...........x....'}}]},
  samba:{sw:.12,crash:false,fills:['percRun','snareRoll','triplet'],
    a:{k:'o...X...o...X...',S:'XgxgXgxgXgxgXgxg',bl:'x.x..x.x.x.x..x.'},
    b:{k:'o...X...o...X...',S:'XgxgXgxgXgxgXgxg',bl:'x.x..x.x..x.x.x.'},
    opt:[{min:.35,v:{p:'...x..x....x..x.',pl:'......x.......x.'}},{min:.6,v:{t:'x.x.x.x.x.x.x.x.'}}]},
  march:{sw:0,crash:true,fills:['snareRoll','snareBuild','flamTom'],
    a:{k:'X.......X.......',s:'X.gxX.gxX.xxX.gx'},
    b:{k:'X.......X.......',s:'X.gxX.gxXxxxX...'},
    opt:[{min:.45,v:{bl:'....x.......x...'}},{min:.7,v:{cb:'x.......x.......'}}]},
  jazz:{sw:0,crash:false,fills:['flamTom','kickSnare','rimClick'],
    a:{R:'x...X.x.x...X.x.',h:'....x.......x...',k:'g...g...g...g...',s:'......?.......?.'},
    b:{R:'x...X.x.x...X.x.',h:'....x.......x...',k:'g...g...g...g...',s:'..?.......?...?.'},
    opt:[{min:.5,v:{s:'.........?......'}}]},
  trap:{sw:0,crash:false,hatRoll:true,fills:['hatRoll','stop','kickSnare'],
    a:{B:'X......X..X.....',c:'........X.......',h:'xoxoxoxoxoxoxoxo'},
    b:{B:'X..X......X..X..',c:'........X......g',h:'xoxoxoxoxoxox.x.'},
    opt:[{min:.45,v:{O:'......x.........'}},{min:.3,v:{s:'...........g....'}}]},
  chipdrum:{sw:0,crash:true,fills:['snareRoll','tomDown','triplet'],
    a:{k:'X...x.X.X...x...',s:'....X.......X..x',h:'xgxgxgxgxgxgxgxg'},
    b:{k:'X.x...X.X.x.....',s:'....X...g...X.xx',h:'xgxgxgxgxgxgxgxg'},
    opt:[{min:.5,v:{bl:'.......x.......x'}}]},
  afro:{sw:.18,crash:false,fills:['percRun','tomDown','triplet'],
    a:{k:'X..x..X...x..x..',s:'....x..g....x...',cb:'x.x.xx.x.x.xx.x.',S:'gogogogogogogogo'},
    b:{k:'X..x..X...x.....',s:'....x..g....x.g.',cb:'x.x.xx.x.x.xx.x.',S:'gogogogogogogogo'},
    opt:[{min:.35,v:{p:'...x..x....x.x..',pl:'......x.......x.'}}]},
  // 2ステップの DnB：1拍目と3拍目の裏にキック、2・4拍目にスネア
  dnb:{sw:0,crash:true,fills:['snareRoll','hatRoll','kickSnare','triplet'],
    a:{k:'X.........x.....',s:'....X..g....X...',h:'x.x.x.x.x.x.x.x.'},
    b:{k:'X.x.......x.....',s:'....X..g.g..X..g',h:'x.x.x.x.x.x.x.O.'},
    opt:[{min:.35,v:{S:'gogogogogogogogo'}},{min:.6,v:{R:'x...x...x...x...'}}]},
  // アーメン・ブレイク風：ライドで刻み、スネアが細かく跳ねる
  amen:{sw:.06,crash:true,fills:['snareRoll','kickSnare','stop','triplet'],
    a:{k:'X.x.......xx....',s:'....X..g.g..X..g',R:'x.x.x.x.x.x.x.x.'},
    b:{k:'X.x.......x.....',s:'....X..g.g....X.',R:'x.x.x.x.x.x.x.x.',c:'..............x.'},
    opt:[{min:.4,v:{h:'.g.g.g.g.g.g.g.g'}},{min:.65,v:{s:'.?.....?...?....'}}]},
  trance:{sw:0,crash:true,fills:['snareRoll','snareBuild','hatRoll'],
    a:{k:'X...X...X...X...',c:'....x.......x...',O:'..X...X...X...X.',h:'xgx.xgx.xgx.xgx.'},
    b:{k:'X...X...X...X...',c:'....x.......x..?',O:'..X...X...X...X.',h:'xgx.xgx.xgx.xgxg'},
    opt:[{min:.4,v:{S:'gogogogogogogogo'}},{min:.65,v:{t:'....x.......x...'}}]},
  // ガバ：キックに808を重ねて硬く太く
  gabber:{sw:0,crash:true,gain:1,fills:['snareRoll','kickSnare','hatRoll'],
    a:{k:'X...X...X...X...',B:'x...x...x...x...',O:'..x...x...x...x.',c:'....x.......x...'},
    b:{k:'X...X...X...X.xx',B:'x...x...x...x...',O:'..x...x...x.....',c:'....x.......x...'},
    opt:[{min:.4,v:{h:'xgxgxgxgxgxgxgxg'}}]},
  minimal:{sw:.12,crash:false,fills:['rimClick','hatBark','stop'],
    a:{k:'X...X...X...X...',r:'...x.....x....x.',h:'..g...g...g...g.'},
    b:{k:'X...X...X...X..g',r:'...x..x..x....x.',h:'..g...g...g...O.'},
    opt:[{min:.35,v:{S:'gogogogogogogogo'}},{min:.6,v:{bl:'.......x........'}}]}
};
/* the old kits reach the fill library through their DRUM_STYLE fill family */
export const OLD_FILLS={tom:['tomDown','flamTom','kickSnare','tomUp'],snare:['snareRoll','snareBuild','triplet'],
  rim:['rimClick','triplet'],perc:['percRun','rimClick']};
export const HAT_KITS=['pop','four','breaks','funk','halftime','house','disco','funk16','boombap','rock',
  'twostep','trap','chipdrum','onedrop','dnb','trance','gabber','minimal'];

/* ---- fills: n 16th steps starting at p8 `from` ---- */
export function renderFill(type,from,n,rng,out){
  const P=(i,frac)=>from+i/2+(frac||0);
  const v=i=>.32+.5*(i+1)/n;
  const tom=i=>TOM_GM[Math.min(TOM_GM.length-1,Math.floor(i*TOM_GM.length/n))];
  const push=(kind,p8,vel,gm)=>out.push(gm?{kind,p8,vel:Math.min(1,vel),gm}:{kind,p8,vel:Math.min(1,vel)});
  switch(type){
    case 'tomDown': for(let i=0;i<n;i++) push('tom',P(i),v(i),tom(i)); break;
    case 'tomUp': for(let i=0;i<n;i++) push('tom',P(i),v(i),TOM_GM[TOM_GM.length-1-Math.min(TOM_GM.length-1,Math.floor(i*TOM_GM.length/n))]); break;
    case 'snareRoll':
      for(let i=0;i<n;i++){
        if(n>=8 && i>=n-4){ push('snare',P(i),v(i)); push('snare',P(i,.25),v(i)*.8); }
        else push('snare',P(i),v(i)*.85);
      } break;
    case 'snareBuild':
      for(let i=0;i<n;i++) if(i>=n/2||i%2===0) push('snare',P(i),v(i));
      push('kick',P(0),.6); break;
    case 'kickSnare':
      for(let i=0;i<n;i++){ const m=i%3; if(m===0) push('kick',P(i),.55+.2*i/n); else if(m===1) push('snare',P(i),v(i)); }
      push('tom',P(n-1),.8,TOM_GM[TOM_GM.length-1]); break;
    case 'flamTom':
      for(let i=0;i<n;i+=2){ const g=tom(i); push('tom',P(i,-.1),v(i)*.35,g); push('tom',P(i),v(i),g); } break;
    case 'stop':
      if(n>=3){ push('snare',P(n-2),.2); push('snare',P(n-1),.7); push('kick',P(n-1),.5); } break;
    case 'hatBark':
      for(let i=0;i<n;i++){ if(i%4===2) push('ohat',P(i),.5); else push('hat',P(i),i%2?.3:.5); }
      push('kick',P(0),.6); push('clap',P(n-1),.7); break;
    case 'hatRoll':
      for(let i=0;i<n;i++){ const k=i>=n-4?4:i>=n/2?2:1;
        for(let j=0;j<k;j++) push('hat',P(i,j/(2*k)),.25+.45*(i+j/k)/n); }
      push('clap',P(n-1),.7); break;
    case 'triplet':   // three-against-four: a hit every third 16th
      for(let i=0;i<n;i+=3){ push('snare',P(i),v(i)); push(i%6===0?'kick':'tom',P(i),.55,TOM_GM[2]); }
      push('snare',P(n-1),.8); break;
    case 'percRun':
      for(let i=0;i<n;i++) push('perc',P(i),v(i)*.8,i%4<2?CONGA.hi:(i%4===2?CONGA.mute:CONGA.lo));
      push('block',P(n-1),.6); break;
    case 'rimClick':
      for(let i=0;i<n;i++) if(i%2===0||rng()<.5) push(i%4===3?'block':'rim',P(i),v(i)*.7); break;
    case 'cowbellCall':
      for(let i=0;i<n;i+=2) push('cowbell',P(i),.4+.2*i/n);
      push('clap',P(n-1),.7); push('kick',P(0),.6); break;
  }
}
/* decide where fills go and write them. The last bar of the loop always leads
   back into the top when 遊び is on, so the loop has an entrance every time. */
export function placeFills(ev,fills,f,play,rng,bars,EPB,beats,forceEnd){
  const steps=beats*4, done=new Set();
  for(let bar=0;bar<bars;bar++){
    const base=bar*EPB, last=bar===bars-1;
    let n=0;
    if((f>=.25 && bar%8===7 && rng()<Math.min(1,.3+f)) || (forceEnd && last))
      n=(f>.7 && rng()<.35)?steps:steps/2;
    else if(f>=.3 && bar%4===3 && rng()<f*.65) n=4;
    if(!n) continue;
    const from=base+EPB-n/2;
    for(let i=ev.length-1;i>=0;i--){ const e=ev[i];
      if(GROUP[e.kind]==='drum' && e.p8>=from && e.p8<base+EPB && !(e.kind==='kick'&&e.p8===from)) ev.splice(i,1); }
    renderFill(fills[Math.floor(rng()*fills.length)],from,n,rng,ev);
    if(n>=steps/2) done.add(bar);
  }
  return done;
}
export function grooveDrums(ev,g,busy,f,rng,bars,EPB,beats,crashOk){
  const steps=beats*4;
  for(let bar=0;bar<bars;bar++){
    const base=bar*EPB;
    const useB=f>0 && (bar%4===3 || (bar%2===1 && rng()<f*.8));
    const pat=Object.assign({},useB?g.b:g.a);
    const layers=[pat];
    for(const o of (g.opt||[])) if(busy>=o.min) layers.push(o.v);
    const taken=new Set();
    for(const L of layers) for(const [vk,str] of Object.entries(L)){
      for(let i=0;i<steps;i++){
        const c=str[i]; if(!c||c==='.') continue;
        const key=vk+':'+i; if(taken.has(key)) continue;
        if(c==='?' && rng()>.2+.6*busy) continue;
        taken.add(key);
        // an 'O' inside the hat line opens that one hat
        let vel=(c==='O'?.55:GV[c])*(g.gain||1);
        if(c==='g') vel=(.11+.1*busy)*(g.gain||1);
        const e={kind:c==='O'?'ohat':GVOICE[vk],p8:base+i/2,vel};
        if(vk==='p') e.gm=CONGA.hi; if(vk==='pl') e.gm=CONGA.lo;
        ev.push(e);
      }
    }
    if(g.crash && crashOk && f>=.3 && bar%8===0){
      for(let i=ev.length-1;i>=0;i--) if(ev[i].p8===base && (ev[i].kind==='hat'||ev[i].kind==='ohat')) ev.splice(i,1);
      ev.push({kind:'crash',p8:base,vel:.3+.2*f});
    }
  }
}
/* 遊び: flams, drags, kick pickups, open-hat splashes, 32nd hat rolls, and
   hand percussion answering in the gaps the melody leaves */
export function drumPlay(ev,kit,p,rng,bars,EPB,beats,skipBars){
  const out=[], hats=HAT_KITS.includes(kit), total=bars*EPB;
  const leadStarts=new Set(ev.filter(e=>e.kind==='lead'&&e.layer==='main').map(e=>Math.floor(e.p8/(EPB/2))));
  const answerVoices=['perc','block','cowbell','tamb'];
  for(const e of ev){
    if(!(e.kind==='snare'||e.kind==='clap') || e.vel<.35 || skipBars.has(Math.floor(e.p8/EPB))) continue;
    const r=rng();
    if(r<p*.35) out.push({kind:e.kind,p8:e.p8-.1,vel:e.vel*.35});                       // flam
    else if(r<p*.5){ out.push({kind:'snare',p8:e.p8-.25,vel:.14}); out.push({kind:'snare',p8:e.p8-.125,vel:.18}); } // drag
  }
  for(let bar=0;bar<bars;bar++){
    if(skipBars.has(bar)) continue;
    const base=bar*EPB;
    if(rng()<p*.35) out.push({kind:'kick',p8:base+EPB-.5,vel:.42});
    if(hats && rng()<p*.3) out.push({kind:'ohat',p8:base+Math.floor(rng()*EPB)+.5,vel:.3});
    if(hats && rng()<p*.25){ const at=base+EPB-2; for(let j=0;j<4;j++) out.push({kind:'hat',p8:at+j*.25,vel:.2+.08*j}); }
    if(rng()<p*.3){ const at=base+MIDOF(EPB)+.5; [0,.5,1].forEach((d,j)=>out.push({kind:'snare',p8:at+d,vel:.09+.03*j})); }
    // answer the melody where it rests for half a bar
    for(let h=0;h<2;h++){
      const half=bar*2+h; if(leadStarts.has(half) || rng()>p*.8) continue;
      const voice=answerVoices[Math.floor(rng()*answerVoices.length)], from=base+h*EPB/2;
      const hitsAt=[.5,1,1.5,2.5].filter(x=>x<EPB/2 && rng()<.75);
      hitsAt.forEach((x,j)=>out.push(voice==='perc'
        ?{kind:'perc',p8:from+x,vel:.24+.06*j,gm:j%2?CONGA.lo:CONGA.hi}
        :{kind:voice,p8:from+x,vel:.2+.06*j}));
    }
    if(rng()<p*.18) out.push({kind:rng()<.5?'cowbell':'block',p8:base+Math.floor(rng()*EPB)+.5,vel:.26});
  }
  for(const e of out){ e.p8=((e.p8%total)+total)%total; ev.push(e); }
}
export const MIDOF=EPB=>Math.floor(EPB/2);
/* ノリ: 16th swing, a lazy backbeat, a little human timing */
export function drumFeel(ev,sw,lay,jit,rng,total){
  for(const e of ev){
    if(GROUP[e.kind]!=='drum') continue;
    let d=0; const f16=e.p8*2, i16=Math.round(f16);
    if(sw>0 && Math.abs(f16-i16)<1e-6 && i16%2===1) d+=sw*.5/3;
    if(lay>0 && (e.kind==='snare'||e.kind==='clap'||e.kind==='rim')) d+=lay;
    if(jit>0) d+=(rng()-.5)*2*jit;
    if(d) e.p8=((e.p8+d)%total+total)%total;
  }
}

export function arrangeSong(ev,bars,a,rng,EPB,MID,kit,fillBars){
  const nph=bars/8, en=ENERGY[nph]||Array(nph).fill(1);
  const out=[], endMode=[];
  for(let ph=0;ph<nph;ph++){
    const nxt=en[(ph+1)%nph], r=rng();
    endMode.push(kit==='none'?'':(a>.55 && nxt>en[ph] && r<.45)?'break':(r<a*1.1?'fill':''));
  }
  for(const e of ev){
    const bar=Math.floor(e.p8/EPB), off=e.p8%EPB, ph=Math.floor(bar/8), low=1-en[ph];
    const drum=GROUP[e.kind]==='drum', last=bar%8===7, mode=endMode[ph];
    if(last && mode==='break' && off>=EPB-2 && (drum||e.kind==='bass'||e.kind==='chord')) continue;
    if(last && mode==='fill' && off>=MID && (e.kind==='hat'||e.kind==='shaker')) continue;
    if(low>0){
      const r=rng();
      if(drum && e.kind!=='kick' && r<a*low*1.1) continue;
      if(e.kind==='kick' && off>0 && r<a*low) continue;
      if((e.kind==='bass'||e.kind==='chord') && off>0 && r<a*low*.8) continue;
      if(e.kind==='lead' && e.layer!=='main' && r<a*low*1.2) continue;
    }
    const c=Object.assign({},e);
    c.vel=e.vel*(1-a*low*(e.kind==='lead'&&e.layer==='main'?.15:.35));
    out.push(c);
  }
  endMode.forEach((m,ph)=>{
    if(m!=='fill') return;
    if(fillBars && fillBars.has(ph*8+7)) return;   // the drum pass already wrote a fill here
    const base=(ph*8+7)*EPB;
    out.push({kind:'kick',p8:base+MID,vel:.6});
    for(let p=MID;p<EPB;p++)
      out.push({kind:(p===EPB-1?'clap':'rim'),p8:base+p,vel:.3+.3*(p-MID)/Math.max(1,EPB-1-MID)});
  });
  return out;
}

/* how much the tune rubs against the harmony, 0 = none. A note that is neither
   a chord tone nor one of the chord's usual tensions and sits a semitone from
   a chord tone is an "avoid" note (semitone above hurts most). Weighted by
   beat strength and length; the main line counts fully, added lines at 60%. */
export function clashScore(song){
  let bad=0,tot=0;
  for(const e of song.events){
    if(e.kind!=='lead') continue;
    const ch=song.chords[Math.floor(e.p8/song.epb)];
    const root=ch[0]+song.key, rel=(((e.note-root)%12)+12)%12;
    const tones=QUAL[ch[1]].map(i=>i%12), ext=(EXT[ch[1]]||[]).map(i=>i%12);
    const w=(e.p8%2===0?1:.5)*Math.min(e.d8||1,4)*(e.layer==='main'?1:.6);
    tot+=w;
    if(tones.includes(rel)||ext.includes(rel)) continue;
    const above=tones.some(t=>(rel-t+12)%12===1), below=tones.some(t=>(t-rel+12)%12===1);
    bad+=w*(above?1:below?.6:.25);
  }
  return tot?bad/tot:0;
}

/* ---- おまかせ: random, but only from combinations that belong together ----
   energy 0 = calm, 1 = middle, 2 = driving. A part may be used by a
   foundation when their energies overlap; 3/4 skips grooves built for 4/4. */
export const OMAKASE={
  preset:{nonbiri:1,fuwafuwa:0,pokopoko:2,yofukashi:1,oudou:2,omise:1,canon:1,dorian:1,lydian:0,
    mixo:1,mokumoku:1,waltz:1,sway:0,blue:1,chip:2,ambi:0,kurikaeshi:1,longrun:2,midnight:2,
    neon:2,funk:2,mellow:1,dosshiri:0,minimal:1,hiphop:1,dnb:2,breakbeat:2,trance:2,hardcore:2,
    uramen:1,shinen:0,uneri:1,hoshizora:0,ginga:1,oozora:0,mugen:0,boss:2,kougeki:2},
  lead:{marimba:[0,1,2],box:[0,1],vibes:[0,1],kalimba:[0,1,2],pluck:[1,2],rhodes:[0,1,2],
    whistle:[0,1],toy:[2],synth:[2],bell:[0,1],glock:[0,1,2],flute:[0,1],steel:[1,2],harp:[0,1],brass:[1,2],
    saw:[2],supersaw:[2],square:[1,2],organ:[1,2],grit:[2],bow:[0,1]},
  pad:{vibes:[0,1,2],pad:[0,1],organ:[1,2],guitar:[1],stab:[2],strings:[0,1],piano:[0,1,2],
    choir:[0,1],chip:[2],clav:[2],supersaw:[2],warm:[0,1],square:[2],epiano:[0,1,2],brass:[1,2]},
  bass:{two:[1],walk:[1],bounce:[1,2],whole:[0,1],offbeat:[2],pulse:[2],octave:[2],synco:[1,2],
    arp:[0,1],funk:[2],heartbeat:[0,1],riff:[1,2],line:[0,1]},
  kit:{brush:[1],pop:[2],night:[0,1],tick:[0,1],none:[0,1],four:[2],halftime:[0,1,2],bossa:[1],
    breaks:[2],soft:[0,1],funk:[2],house:[2],disco:[2],funk16:[1,2],boombap:[1,2],lofi:[0,1],
    rock:[2],twostep:[1,2],onedrop:[0,1],samba:[1,2],march:[1,2],jazz:[0,1],trap:[1,2],chipdrum:[2],afro:[1,2],
    dnb:[2],amen:[2],trance:[2],gabber:[2],minimal:[1,2]},
  only4:{kit:['four','bossa','breaks','funk','halftime','house','disco','funk16','boombap','lofi',
    'rock','twostep','onedrop','samba','march','jazz','trap','chipdrum','afro',
    'dnb','amen','trance','gabber','minimal'],bass:['funk']},
  // scales that ignore the chords entirely stay out of the dice
  noDice:['wholetone']
};
/* 拍子を上書きしたときに、4拍子専用のドラムとベースを3拍子でも鳴る型へ差し替える。
   ドラムはおまかせの勢い（0〜2）の平均が近いものにする */
export function fitMeter(st){
  if(presetOf(st).beats===4) return st;
  if(OMAKASE.only4.kit.includes(st.drums)){
    const en=OMAKASE.kit[st.drums]||[1], avg=Math.round(en.reduce((a,b)=>a+b,0)/en.length);
    st.drums=['tick','brush','pop'][avg];
  }
  if(OMAKASE.only4.bass.includes(st.bassStyle)) st.bassStyle='two';
  return st;
}
export function scaleLimit(preset){
  // how much rub the foundation's own scale already has (blues / funk rub on purpose)
  const P=PRESETS[preset]; let t=0;
  for(let i=0;i<6;i++) t+=clashScore(buildSong({preset,lead:P.lead,pad:P.pad,bassStyle:P.bass,
    drums:P.drums,key:0,scale:P.scale,swing:P.swing,seed:3000+i*101,sections:2,density:55,tone:55,
    bpm:P.bpm,peak:0,mel:{dens:60,range:55,leap:45,oct:0,octUp:false,harm:false,counter:false},
    mute:{},partVol:{}}));
  return Math.max(.18,t/6+.05);
}
export function omakase(rand){
  const R=rand||Math.random, r=a=>a[Math.floor(R()*a.length)], O=OMAKASE;
  const k=r(MOOD_KEYS), P=PRESETS[k], en=O.preset[k]!==undefined?O.preset[k]:1;
  const fits=(table,keys,skip,def)=>{
    const ok=keys.filter(x=>(table[x]||[0,1,2]).includes(en) && !(P.beats!==4&&(skip||[]).includes(x)));
    return R()<.4||!ok.length?def:r(ok);
  };
  const lead=fits(O.lead,LEAD_KEYS,null,P.lead), pad=fits(O.pad,PAD_KEYS,null,P.pad);
  const bassStyle=fits(O.bass,BASS_KEYS,O.only4.bass,P.bass), drums=fits(O.kit,KIT_KEYS,O.only4.kit,P.drums);
  const straightKit=['four','breaks','funk','pop','house','disco','rock','chipdrum','march','trap','dnb','trance','gabber'].includes(drums);
  const swing=P.swing===0 ? (R()<.8||straightKit?0:Math.floor(R()*20))
    : Math.max(0,Math.min(100,P.swing+Math.round((R()-.5)*24)));
  const bpm=Math.max(52,Math.min(176,Math.round(P.bpm*(0.9+R()*.2))));
  const lim=scaleLimit(k), padLong=PADS[pad].long;
  const base={preset:k,lead,pad,bassStyle,drums,key:Math.floor(R()*12),swing,bpm,sections:2,
    density:25+Math.floor(R()*60),tone:55,peak:0,
    mute:{lead:false,chord:false,bass:false,drum:false},partVol:{lead:80,chord:80,bass:80,drum:80},
    bassArr:R()<.4?0:Math.floor(R()*60), drama:R()<.35?0:Math.floor(R()*70),
    arrange:R()<.4?0:Math.floor(R()*(en===0?40:60)),
    drumBusy:(en===0?25:40)+Math.floor(R()*45), drumFill:(en===0?20:35)+Math.floor(R()*45),
    drumPlay:(en===0?20:35)+Math.floor(R()*50), drumFeel:15+Math.floor(R()*50)};
  const scales=SCALE_KEYS.filter(x=>!O.noDice.includes(x));
  let best=null,bs=1e9;
  for(let t=0;t<40;t++){
    const layers=['octUp','harm','counter'].filter(()=>R()<.3).slice(0,2);
    const cand=Object.assign({},base,{
      scale:(t>=24||R()<.45)?P.scale:r(scales),
      seed:(R()*9000000|0)+1000,
      mel:{dens:30+Math.floor(R()*55),range:25+Math.floor(R()*55),leap:20+Math.floor(R()*50),
        // below the chords the tune tangles with the pad, so going down is rare
        oct:R()<.12?1:(R()<.08&&!padLong?-1:0),
        octUp:layers.includes('octUp'),harm:layers.includes('harm'),counter:layers.includes('counter')}});
    const c=clashScore(buildSong(cand));
    if(c<=lim) return cand;
    if(c<bs){ bs=c; best=cand; }
  }
  return best;
}

export const GROUP={lead:'lead',chord:'chord',bass:'bass',
  kick:'drum',shaker:'drum',rim:'drum',clap:'drum',hat:'drum',
  snare:'drum',ohat:'drum',crash:'drum',tom:'drum',perc:'drum',
  boom:'drum',ride:'drum',tamb:'drum',cowbell:'drum',block:'drum'};

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
// v5: melody-timbre field widened to 2 digits, plus bass arrange / chord drama / song form
export const W5=W4.map((w,i)=>i===2?2:w).concat([2,2,2]);
// v6: drum 手数 / 展開
export const W6=W5.concat([2,2]);
// v7: drum-kit field widened to 2 digits, plus drum 遊び / ノリ
export const W7=W6.map((w,i)=>i===5?2:w).concat([2,2]);
export const LAYOUT={'1':W1,'2':W2,'3':W3,'4':W4,'5':W5,'6':W6,'7':W7};
export const CODE_LEN=45;
export const sumW=w=>w.reduce((a,b)=>a+b,0);
export const PEAKS=[-3,-6,-9,null];

export function encodeRecipe(st){
  const f=(st.mel.octUp?1:0)|(st.mel.harm?2:0)|(st.mel.counter?4:0)
        |(st.mute.lead?8:0)|(st.mute.chord?16:0)|(st.mute.bass?32:0)|(st.mute.drum?64:0);
  const v=[7,
    MOOD_KEYS.indexOf(st.preset), LEAD_KEYS.indexOf(st.lead),
    PAD_KEYS.indexOf(st.pad), BASS_KEYS.indexOf(st.bassStyle), KIT_KEYS.indexOf(st.drums),
    st.bpm, st.sections, st.density, st.tone,
    st.mel.dens, st.mel.range, st.mel.leap, (st.mel.oct+1)|(st.peak<<2), f, st.seed,
    st.key, SCALE_KEYS.indexOf(st.scale), st.swing,
    st.partVol.lead, st.partVol.chord, st.partVol.bass, st.partVol.drum,
    st.bassArr|0, st.drama|0, st.arrange|0, st.drumBusy|0, st.drumFill|0, st.drumPlay|0, st.drumFeel|0];
  let hex='';
  v.forEach((x,i)=>{ hex+=Math.max(0,x).toString(16).padStart(W7[i],'0').slice(-W7[i]); });
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
  const has2=W.length>=W2.length, has3=W.length>=W3.length, has5=W.length>=W5.length, has6=W.length>=W6.length, has7=W.length>=W7.length;
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
                :{lead:80,chord:80,bass:80,drum:80},
    bassArr:has5?Math.min(100,v[23]):0,
    drama:has5?Math.min(100,v[24]):0,
    arrange:has5?Math.min(100,v[25]):0,
    drumBusy:has6?Math.min(100,v[26]):0,
    drumFill:has6?Math.min(100,v[27]):0,
    drumPlay:has7?Math.min(100,v[28]):0,
    drumFeel:has7?Math.min(100,v[29]):0
  };
}
export const prettyCode=c=>c.replace(/(.{9})/g,'$1-').replace(/-$/,'');

/* ============================================================
   Standard MIDI File (format 1) — one track per part, for arranging
   ============================================================ */
export const TPQ=480;
export const DRUM_NOTE={kick:36,rim:37,clap:39,shaker:82,hat:42,snare:38,ohat:46,crash:49,
  boom:35,ride:51,tamb:54,cowbell:56,block:76};
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
    const bar=Math.floor(p8/EPB), wf=p8-bar*EPB, w=Math.floor(wf), frac=wf-w;
    let t=(bar*beats+Math.floor(w/2))*TPQ;
    if(w%2===1) t+=TPQ/2+sw*(TPQ*2/3-TPQ/2);
    if(frac) t+=frac*TPQ/2;
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
      const notes=drum?[e.gm||DRUM_NOTE[e.kind]]:(e.notes||[e.note]);
      for(const nn of notes){
        if(nn===undefined) continue;
        t.push([on,[0x90|ch,nn,v]]);
        t.push([on+len,[0x80|ch,nn,0]]);
      }
    }
    tracks.push(t);
  };
  const E=song.events, keep=g=>!st.mute[g];
  // st.gm (editor): program numbers for sounds that are not in the recipe tables
  const gm=(part,def)=>(st.gm&&st.gm[part]!==undefined)?st.gm[part]:def;
  const layer=l=>keep('lead')?E.filter(e=>e.kind==='lead'&&e.layer===l):[];
  addTrack('Melody',0,gm('lead',LEADS[st.lead].gm),layer('main'),false,'lead');
  addTrack('Layers',1,gm('lead',LEADS[st.lead].gm),
    keep('lead')?E.filter(e=>e.kind==='lead'&&(e.layer==='oct'||e.layer==='harm')):[],false,'lead');
  addTrack('Counter',2,gm('lead',LEADS[st.lead].gm),layer('counter'),false,'lead');
  addTrack('Chords',3,gm('chord',PADS[st.pad].gm),keep('chord')?E.filter(e=>e.kind==='chord'):[],false,'chord');
  addTrack('Bass',4,gm('bass',BASSES[st.bassStyle].gm),keep('bass')?E.filter(e=>e.kind==='bass'):[],false,'bass');
  addTrack('Drums',9,null,
    keep('drum')?E.filter(e=>GROUP[e.kind]==='drum'&&(e.gm||DRUM_NOTE[e.kind])!==undefined):[],true,'drum');

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
  // opts.pan (editor): a stereo panner per part. channelCount 2 upmixes first, so
  // at 0 it passes the signal untouched; without it the graph is exactly as before
  const pans={};
  for(const [k,g] of Object.entries(bus)){
    if(o.pan){ pans[k]=new Tone.Panner({pan:0,channelCount:2}); g.connect(pans[k]); pans[k].connect(master); }
    else g.connect(master);
  }
  // opts.pan (editor) also gets an insert chain per part, in front of the fader:
  // in → lowpass → high shelf → (effect rack, rebuilt by the editor) → out → bus.
  // Every stage starts transparent; without opts.pan the parts go straight into the bus.
  const inp={}, fx={};
  for(const k of Object.keys(bus)){
    if(!o.pan){ inp[k]=bus[k]; continue; }
    const f={in:new Tone.Gain(1),lp:new Tone.Filter({type:'lowpass',frequency:20000,Q:.5}),
      shelf:new Tone.Filter({type:'highshelf',frequency:3200,gain:0}),out:new Tone.Gain(1)};
    f.in.chain(f.lp,f.shelf,f.out,bus[k]);
    f.rackFrom=f.shelf; f.rackTo=f.out; f.sig=''; f.units=[];
    inp[k]=f.in; fx[k]=f;
  }
  const drumWet=new Tone.Gain(1); if(verb) drumWet.connect(verb);

  const lead=new Tone.PolySynth(Tone.FMSynth,LEADS.marimba.cfg);
  lead.volume.value=-9; lead.connect(inp.lead);
  const leadSend=mkSend(); bus.lead.connect(leadSend);

  const chords=new Tone.PolySynth(Tone.Synth,PADS.vibes.cfg);
  chords.volume.value=-14;
  const chFilt=new Tone.Filter({type:'lowpass',frequency:2600,Q:.3});
  chords.connect(chFilt); chFilt.connect(inp.chord);
  const chordSend=mkSend(); bus.chord.connect(chordSend);

  const bass=new Tone.MonoSynth({
    oscillator:{type:'triangle'},
    envelope:{attack:.012,decay:.3,sustain:.45,release:.35},
    filterEnvelope:{attack:.01,decay:.2,sustain:.35,release:.3,baseFrequency:110,octaves:2.4},
    filter:{Q:1.2,type:'lowpass'}});
  bass.volume.value=-9; bass.connect(inp.bass);
  const bassSend=mkSend(); bus.bass.connect(bassSend);

  const kick=new Tone.MembraneSynth({pitchDecay:.035,octaves:5.5,
    envelope:{attack:.001,decay:.28,sustain:0,release:.2}});
  kick.volume.value=-11; kick.connect(inp.drum);

  const shHP=new Tone.Filter({type:'highpass',frequency:5200});
  const shaker=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.001,decay:.045,sustain:0}});
  shaker.volume.value=-20; shaker.connect(shHP); shHP.connect(inp.drum);
  const shSend=mkSend(drumWet); shHP.connect(shSend);

  const rimBP=new Tone.Filter({type:'bandpass',frequency:1700,Q:2.2});
  const rim=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.001,decay:.08,sustain:0}});
  rim.volume.value=-14; rim.connect(rimBP); rimBP.connect(inp.drum);
  const rimSend=mkSend(drumWet); rimBP.connect(rimSend);

  const clapBP=new Tone.Filter({type:'bandpass',frequency:1200,Q:1.4});
  const clap=new Tone.NoiseSynth({noise:{type:'pink'},envelope:{attack:.002,decay:.14,sustain:0}});
  clap.volume.value=-14; clap.connect(clapBP); clapBP.connect(inp.drum);
  const clapSend=mkSend(drumWet); clapBP.connect(clapSend);

  const hatHP=new Tone.Filter({type:'highpass',frequency:7200});
  const hat=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.001,decay:.035,sustain:0}});
  hat.volume.value=-24; hat.connect(hatHP); hatHP.connect(inp.drum);

  // snare = a short tuned body under band-limited noise
  const snHP=new Tone.Filter({type:'highpass',frequency:1500});
  const snare=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.001,decay:.13,sustain:0}});
  snare.volume.value=-17; snare.connect(snHP); snHP.connect(inp.drum);
  const snBody=new Tone.MembraneSynth({pitchDecay:.02,octaves:1.6,
    envelope:{attack:.001,decay:.09,sustain:0,release:.05}});
  snBody.volume.value=-21; snBody.connect(inp.drum);
  const snSend=mkSend(drumWet); snHP.connect(snSend);

  const ohHP=new Tone.Filter({type:'highpass',frequency:6400});
  const ohat=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.002,decay:.26,sustain:0}});
  ohat.volume.value=-27; ohat.connect(ohHP); ohHP.connect(inp.drum);

  const crHP=new Tone.Filter({type:'highpass',frequency:4200});
  const crash=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.003,decay:1.5,sustain:0}});
  crash.volume.value=-31; crash.connect(crHP); crHP.connect(inp.drum);
  const crSend=mkSend(drumWet); crHP.connect(crSend);

  const tom=new Tone.MembraneSynth({pitchDecay:.05,octaves:2,
    envelope:{attack:.001,decay:.34,sustain:0,release:.2}});
  tom.volume.value=-15; tom.connect(inp.drum);
  const tomSend=mkSend(drumWet); tom.connect(tomSend);

  const perc=new Tone.MembraneSynth({pitchDecay:.012,octaves:1.2,
    envelope:{attack:.001,decay:.17,sustain:0,release:.1}});
  perc.volume.value=-19; perc.connect(inp.drum);
  const percSend=mkSend(drumWet); perc.connect(percSend);

  const boom=new Tone.MembraneSynth({pitchDecay:.09,octaves:3,
    envelope:{attack:.001,decay:1.0,sustain:0,release:.4}});
  boom.volume.value=-10; boom.connect(inp.drum);

  const rideBP=new Tone.Filter({type:'bandpass',frequency:5600,Q:1.3});
  const ride=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.002,decay:.55,sustain:0}});
  ride.volume.value=-25; ride.connect(rideBP); rideBP.connect(inp.drum);
  const rideSend=mkSend(drumWet); rideBP.connect(rideSend);

  const tambHP=new Tone.Filter({type:'highpass',frequency:7800});
  const tamb=new Tone.NoiseSynth({noise:{type:'white'},envelope:{attack:.004,decay:.09,sustain:0}});
  tamb.volume.value=-23; tamb.connect(tambHP); tambHP.connect(inp.drum);

  const cbBP=new Tone.Filter({type:'bandpass',frequency:820,Q:2.5});
  const cbA=new Tone.Synth({oscillator:{type:'square'},envelope:{attack:.001,decay:.11,sustain:0,release:.05}});
  const cbB=new Tone.Synth({oscillator:{type:'square'},envelope:{attack:.001,decay:.08,sustain:0,release:.04}});
  cbA.volume.value=-27; cbB.volume.value=-29;
  cbA.connect(cbBP); cbB.connect(cbBP); cbBP.connect(inp.drum);

  const block=new Tone.MembraneSynth({pitchDecay:.004,octaves:.7,
    envelope:{attack:.001,decay:.05,sustain:0,release:.03}});
  block.volume.value=-17; block.connect(inp.drum);
  const blockSend=mkSend(drumWet); block.connect(blockSend);

  const rig={master,colour,lead,chords,bass,kick,shaker,rim,clap,hat,
    snare,snBody,ohat,crash,tom,perc,boom,ride,tamb,cbA,cbB,block,hasVerb:!!verb,
    bus,pans,fx,verb,sends:{lead:leadSend,chord:chordSend,bass:bassSend},drumWet,chFilt,
    filt:{shHP,rimBP,clapBP,hatHP,snHP,ohHP,crHP,rideBP,tambHP,cbBP}};
  // reverb length in seconds (editor). Rebuilding the impulse is cheap enough to do on release of a slider
  rig.setReverb=function(sec){ if(verb){ try{ verb.buffer=makeIR(sec,2.6); }catch(e){} } };
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
    set(snSend.gain,P.rev*0.8);
    set(crSend.gain,P.rev*0.7);
    set(tomSend.gain,P.rev*0.6);
    set(percSend.gain,P.rev*0.5);
    set(rideSend.gain,P.rev*0.6);
    set(blockSend.gain,P.rev*0.6);
    rig.setLevels(st,t);
  };
  return rig;
}
/* fader 0–100: 80 = unity, 100 = +6 dB, 0 = silent */
export function partGain(v){ return v<=0?0:Math.pow(10,((v-80)*0.3)/20); }

export const TOM_PITCH={50:'G3',48:'E3',47:'D3',45:'C3',43:'A2',41:'G2'};
export const PERC_PITCH={63:'D#4',62:'F4',64:'A#3'};
export const DURNAME=d=> d<=1?'8n': d<=2?'4n': d<=3?'4n.': d<=4?'2n': d<=6?'2n.':'1n';
export const posOf=(p8,epb)=>{ const bar=Math.floor(p8/epb), r=p8-bar*epb, q=Math.floor(r/2);
  const six=(r-q*2)*2;
  return bar+':'+q+':'+(Number.isInteger(six)?six:+six.toFixed(4)); };

/* Monophonic voices (bass and every drum) refuse two starts at the same instant,
   and an offline render aborts on the first refusal. So hits that land on the
   same transport tick for the same voice are merged (the loudest one stays),
   and every trigger is guarded so one bad hit can never stop a render. */
export function playableEvents(song,st,ppq){
  // two transport ticks is far below anything audible (~2.6 ms at 120 BPM)
  const gap=2/((ppq||192)/2), last=new Map(), out=[];
  const evs=song.events.slice().sort((x,y)=>x.p8-y.p8);
  for(const e of evs){
    if(st.mute[GROUP[e.kind]]) continue;
    if(e.kind==='bass'||GROUP[e.kind]==='drum'){
      const prev=last.get(e.kind);
      if(prev && e.p8-prev.p8<gap){ if(e.vel>out[prev.i].vel) out[prev.i]=e; continue; }
      last.set(e.kind,{p8:e.p8,i:out.length});
    }
    out.push(e);
  }
  return out;
}
export function scheduleAll(transport,rig,song,st){
  const epb=song.epb;
  const sch=(fn,t)=>transport.schedule(time=>{ try{ fn(time); }catch(err){} },t);
  for(const e of playableEvents(song,st,transport.PPQ)){
    const t=posOf(e.p8,epb);
    switch(e.kind){
      case 'lead': sch(time=>
        rig.lead.triggerAttackRelease(midiName(e.note),DURNAME(e.d8),time,e.vel),t); break;
      case 'chord': sch(time=>
        rig.chords.triggerAttackRelease(e.notes.map(midiName),DURNAME(e.d8),time,e.vel),t); break;
      case 'bass': sch(time=>
        rig.bass.triggerAttackRelease(midiName(e.note),DURNAME(e.d8),time,e.vel),t); break;
      case 'kick': sch(time=>
        rig.kick.triggerAttackRelease('C1','8n',time,e.vel),t); break;
      case 'shaker': sch(time=>
        rig.shaker.triggerAttackRelease('32n',time,e.vel),t); break;
      case 'rim': sch(time=>
        rig.rim.triggerAttackRelease('32n',time,e.vel),t); break;
      case 'clap': sch(time=>
        rig.clap.triggerAttackRelease('16n',time,e.vel),t); break;
      case 'hat': sch(time=>
        rig.hat.triggerAttackRelease('64n',time,e.vel),t); break;
      case 'snare': sch(time=>{
        rig.snare.triggerAttackRelease('16n',time,e.vel);
        rig.snBody.triggerAttackRelease('G3','32n',time,e.vel); },t); break;
      case 'ohat': sch(time=>
        rig.ohat.triggerAttackRelease('8n',time,e.vel),t); break;
      case 'crash': sch(time=>
        rig.crash.triggerAttackRelease('2n',time,e.vel),t); break;
      case 'tom': sch(time=>
        rig.tom.triggerAttackRelease(TOM_PITCH[e.gm]||'C3','8n',time,e.vel),t); break;
      case 'perc': sch(time=>
        rig.perc.triggerAttackRelease(PERC_PITCH[e.gm]||'D4','16n',time,e.vel),t); break;
      case 'boom': sch(time=>
        rig.boom.triggerAttackRelease('G1','2n',time,e.vel),t); break;
      case 'ride': sch(time=>
        rig.ride.triggerAttackRelease('4n',time,e.vel),t); break;
      case 'tamb': sch(time=>
        rig.tamb.triggerAttackRelease('16n',time,e.vel),t); break;
      case 'cowbell': sch(time=>{
        rig.cbA.triggerAttackRelease('C#5','16n',time,e.vel);
        rig.cbB.triggerAttackRelease('G#5','16n',time,e.vel); },t); break;
      case 'block': sch(time=>
        rig.block.triggerAttackRelease('A5','32n',time,e.vel),t); break;
    }
  }
}
export function setupTransport(transport,st){
  transport.bpm.value=st.bpm;
  transport.timeSignature=PRESETS[st.preset].beats;
  transport.swing=st.swing/100*0.6;
  transport.swingSubdivision='8n';
}
/* preview volume 0–100 → master dB. Not part of the recipe, never reaches an export */
export const masterDb=v=>v===0?-60:(-34+v*0.42);
export const TR=()=>(Tone.getTransport?Tone.getTransport():Tone.Transport);

/* Offline render of one loop plus its reverb tail. onRetry is called before
   falling back to a dry render when the convolver can't be built offline. */
export async function renderOffline(song,st,loopSec,tail,onRetry){
  const liveRate=Tone.getContext().sampleRate||44100;
  const render=noVerb=>Tone.Offline(({transport})=>{
    setupTransport(transport,st);
    const rig=createRig({noVerb});
    rig.apply(st,0);
    rig.master.volume.value=-4;
    scheduleAll(transport,rig,song,st);
    transport.start(0);
  }, loopSec+tail, 2, liveRate);
  let buf, dry=false;
  try{ buf=await render(false); }
  catch(e1){ if(onRetry) await onRetry(); buf=await render(true); dry=true; }
  return {buf,dry,liveRate};
}

/* Turn a rendered buffer into a seamless loop: n is a multiple of 64 frames,
   the tail past the loop end is folded back onto the start, then mono-mixed
   and normalised to the chosen peak. */
export function finishLoop(buf,liveRate,loopSec,ch,peak){
  const ab=(buf&&buf.get)?buf.get():buf;
  const sr=ab.sampleRate||liveRate;
  let n=Math.round(loopSec*sr/64)*64;
  if(n>ab.length) n=Math.floor(ab.length/64)*64;
  const srcL=ab.getChannelData(0);
  const srcR=ab.numberOfChannels>1?ab.getChannelData(1):srcL;
  let outs=[new Float32Array(n),new Float32Array(n)];
  [srcL,srcR].forEach((src,c)=>{
    outs[c].set(src.subarray(0,n));
    const tn=Math.min(src.length-n,n);
    for(let i=0;i<tn;i++) outs[c][i]+=src[n+i];
  });
  if(ch===1){
    const m=new Float32Array(n);
    for(let i=0;i<n;i++) m[i]=(outs[0][i]+outs[1][i])*0.5;
    outs=[m];
  }
  const measure=()=>{
    let pk=0,sq=0,cnt=0;
    for(const chn of outs) for(let i=0;i<n;i++){
      const a=Math.abs(chn[i]); if(a>pk) pk=a; sq+=chn[i]*chn[i]; cnt++;
    }
    return {pk,rms:Math.sqrt(sq/Math.max(1,cnt))};
  };
  const tgt=PEAKS[peak];
  let m=measure();
  if(m.pk>1e-6){
    const ceil=(tgt===null)?0.999:Math.pow(10,tgt/20);
    const g=(tgt===null)?Math.min(1,ceil/m.pk):ceil/m.pk;
    if(Math.abs(g-1)>1e-4) for(const chn of outs) for(let i=0;i<n;i++) chn[i]*=g;
    m=measure();
  }
  return {outs,sr,n,peak:m.pk,rms:m.rms};
}

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
  // ima4 is constant-bitrate, so the packet table has no entries and its packet
  // count must be 0 (as afconvert writes it). A non-zero count makes Apple's
  // AudioFile (afinfo, AVAudioPlayer) look for entries that aren't there and fail.
  tag('pakt'); i64(24); i64(0); i64(frames);
  dv.setInt32(o,0,false); o+=4;
  dv.setInt32(o,packets*64-frames,false); o+=4;
  tag('data'); i64(dataSize); u32(0);
  const out=new Uint8Array(o+audio.length);
  out.set(new Uint8Array(buf,0,o),0); out.set(audio,o);
  return out;
}
export const CRCT=(()=>{const t=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}
  return t;})();
export function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRCT[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
export function zipStore(name,data){
  const enc=new TextEncoder().encode(name), crc=crc32(data);
  const local=new Uint8Array(30+enc.length), dv=new DataView(local.buffer);
  dv.setUint32(0,0x04034b50,true); dv.setUint16(4,20,true);
  dv.setUint32(14,crc,true); dv.setUint32(18,data.length,true); dv.setUint32(22,data.length,true);
  dv.setUint16(26,enc.length,true); local.set(enc,30);
  const cen=new Uint8Array(46+enc.length), cv=new DataView(cen.buffer);
  cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
  cv.setUint32(16,crc,true); cv.setUint32(20,data.length,true); cv.setUint32(24,data.length,true);
  cv.setUint16(28,enc.length,true); cen.set(enc,46);
  const end=new Uint8Array(22), ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(8,1,true); ev.setUint16(10,1,true);
  ev.setUint32(12,cen.length,true); ev.setUint32(16,local.length+data.length,true);
  return new Blob([local,data,cen,end],{type:'application/zip'});
}

