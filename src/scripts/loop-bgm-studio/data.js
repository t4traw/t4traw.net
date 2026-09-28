/* 音楽理論・音色・土台のデータ。Tone.js に依存しないので Astro 側からも読める */
export const PC=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
export const QUAL={
  maj7:[0,4,7,11], maj9:[0,4,7,11,14], six:[0,4,7,9],
  m7:[0,3,7,10], m9:[0,3,7,10,14], m6:[0,3,7,9],
  dom7:[0,4,7,10], dom9:[0,4,7,10,14], dom13:[0,4,7,10,14],
  m7b5:[0,3,6,10], sus9:[0,5,7,10,14], dom7s9:[0,4,7,10,15]
};
export const EXT={
  maj7:[2,9], maj9:[2,9], six:[2,11], m7:[2,5], m9:[2,5], m6:[2,5],
  dom7:[2,9], dom9:[2,9], dom13:[2,9], m7b5:[1,8], sus9:[2,9], dom7s9:[3,8]
};
export const SUF={maj7:'M7',maj9:'M9',six:'6',m7:'m7',m9:'m9',m6:'m6',dom7:'7',dom9:'9',
  dom13:'13',m7b5:'m7\u266d5',sus9:'9sus',dom7s9:'7#9'};
export const MINOR_Q={m7:1,m9:1,m6:1,m7b5:1};
export const PCF=["C","D\u266d","D","E\u266d","E","F","G\u266d","G","A\u266d","A","B\u266d","B"];
export const SHARP_KEYS=new Set([7,2,9,4,11,6]);
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
    modulation:{type:'sine'},modulationEnvelope:{attack:.05,decay:.3,sustain:.5,release:.3}}}
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
    cfg:{oscillator:{type:'square'},envelope:{attack:.002,decay:.12,sustain:.1,release:.08}}}
};
export const BASSES={
  two:{name:'ふたつ刻み',gm:32}, walk:{name:'ウォーキング',gm:32},
  bounce:{name:'はねる',gm:33}, whole:{name:'のばし',gm:38},
  offbeat:{name:'裏打ち',gm:38}, pulse:{name:'8分刻み',gm:38},
  octave:{name:'オクターブ',gm:38}, synco:{name:'シンコペ',gm:33},
  arp:{name:'分散和音',gm:33}
};
export const KITS={
  brush:{name:'ブラシ'}, pop:{name:'ポップ'}, night:{name:'夜'},
  tick:{name:'カチカチ'}, none:{name:'なし'}, four:{name:'4つ打ち'},
  halftime:{name:'ハーフタイム'}, bossa:{name:'ボサノバ'}, breaks:{name:'ブレイクビーツ'},
  soft:{name:'そっと'}
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
  majblues:{name:'メジャーブルース',desc:'明るいペンタに♭3を足す。陽気なこぶし。短調の土台ではブルースと同じ音になる'}
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
  [9,'m9'],[9,'m9'],[9,'m9'],[9,'m9'],[5,'maj9'],[5,'maj9'],[7,'sus9'],[7,'sus9']]
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
    lead:'vibes',pad:'guitar',bass:'two',drums:'tick',center:83,comp:[0,3,5],rev:.30,filt:6000,scale:'chord'},
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
    lead:'kalimba',pad:'guitar',bass:'two',drums:'brush',center:83,comp:[2,6],rev:.28,filt:6400,scale:'penta'},
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
    lead:'rhodes',pad:'guitar',bass:'walk',drums:'brush',center:78,comp:[1,3,6],rev:.30,filt:4000,scale:'blues'},
  chip:{label:'ちいさな冒険',desc:'速くて硬い矩形波。昔の携帯ゲーム機のあの音',
    bpm:152,swing:0,beats:4,prog:'chip',tonic:0,minor:false,
    lead:'toy',pad:'organ',bass:'bounce',drums:'pop',center:86,comp:[0,2,4,6],rev:.14,filt:7800,scale:'penta'},
  ambi:{label:'ただよう',desc:'4小節に1和音。ほぼ止まっている。考え込む画面に',
    bpm:62,swing:0,beats:4,prog:'ambi',tonic:0,minor:false,
    lead:'vibes',pad:'pad',bass:'whole',drums:'none',center:88,comp:[0],rev:.55,filt:5000,scale:'chord'},
  kurikaeshi:{label:'くりかえし',desc:'短い動機が少しずつ形を変えて重なる。ミニマル・ミュージック',
    bpm:112,swing:0,beats:4,prog:'minimal',tonic:0,minor:false,plan:'minimal',
    lead:'marimba',pad:'vibes',bass:'whole',drums:'none',center:82,comp:[0,1,2,3,4,5,6,7],rev:.30,filt:6000,scale:'diatonic'},
  longrun:{label:'ロングラン',desc:'4つ打ちが一定のペースで走り続ける。前へ進む高揚感',
    bpm:128,swing:0,beats:4,prog:'longrun',tonic:9,minor:true,plan:'minimal',
    lead:'synth',pad:'stab',bass:'offbeat',drums:'four',center:81,comp:[3,7],rev:.22,filt:6800,scale:'penta'},
  midnight:{label:'ミッドナイト',desc:'削ぎ落としたミニマルテクノ。低く、深く、淡々と',
    bpm:122,swing:15,beats:4,prog:'midnight',tonic:2,minor:true,plan:'minimal',
    lead:'rhodes',pad:'stab',bass:'pulse',drums:'four',center:77,comp:[3],rev:.36,filt:3800,scale:'chord'},
  neon:{label:'ネオン',desc:'きらきらしたエレクトロポップ。明るい4つ打ち',
    bpm:132,swing:0,beats:4,prog:'neon',tonic:0,minor:false,
    lead:'synth',pad:'stab',bass:'pulse',drums:'four',center:84,comp:[2,6],rev:.24,filt:7600,scale:'penta'}
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

export const KEY_NAMES=['C','C#/D♭','D','D#/E♭','E','F','F#/G♭','G','G#/A♭','A','A#/B♭','B'];
