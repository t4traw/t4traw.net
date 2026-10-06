/*
  画面の部品の一覧。DOM には触らない。
  Astro ページと単体HTMLはこれを回してマークアップを作り、app.js はこれを回して配線する。

  スライダーを1本足すときは:
    1. engine.js — その値で演奏を変える処理と、レシピコードへの出し入れ（新レイアウト）
    2. このファイル — KNOBS に1行
  だけでいい。Astro のマークアップも app.js も触らなくていい。

  KNOBS の項目:
    id       DOM の id（input#id / output[data-knob-out=id]）
    path     state 上のキー（'mel.dens' のようにドットで入れ子）
    section  どの欄に出すか（SECTIONS のキー）
    label    ラベル
    min/max  範囲（省略時 0〜100）
    def      新しく開いたときの値（曲調で決まるものは曲調の値で上書きされる）
    zero     0 のときに数字の代わりに出す言葉
    unit     数字のうしろにつける単位
    on       動かしたときに何をするか（app.js の EFFECTS）
             rebuild=演奏を作り直す / live=音色だけ変える / bpm / swing / vol
    help     欄の下の説明に並べる一文
*/
import { PRESETS } from "./engine.js";

export const SECTIONS={
  melody :{title:'メロディの表情',note:'一番上の線をどう歌わせるか'},
  arrange:{title:'アレンジ',note:'決まった形から、どこまで崩して盛り上げるか',
           foot:'どれも0で元の形のまま。'},
  mix    :{title:'調整',note:''},
};

export const KNOBS=[
  {id:'mDens',  path:'mel.dens', section:'melody', label:'音数',     def:60, on:'rebuild'},
  {id:'mRange', path:'mel.range',section:'melody', label:'音域の幅', def:55, on:'rebuild'},
  {id:'mLeap',  path:'mel.leap', section:'melody', label:'跳ねぐあい',def:45, on:'rebuild'},

  {id:'bassArr', path:'bassArr', section:'arrange', label:'ベースの崩し', def:0, zero:'そのまま', on:'rebuild',
   help:'経過音・オクターブ跳び・次の和音への寄り・4小節ごとのフィル。'},
  {id:'drama',   path:'drama',   section:'arrange', label:'伴奏のドラマ', def:0, zero:'そのまま', on:'rebuild',
   help:'共通音（3度など）を残してなめらかにつなぎ、フレーズ前半は3度と7度だけ、後半はオクターブ上を重ねて開いていく。'},
  {id:'arrange', path:'arrange', section:'arrange', label:'曲の展開',     def:0, zero:'そのまま', on:'rebuild',
   help:'8小節ごとに静かな部分と盛り上がる部分をつくり、区切りにフィルやブレイクを入れる。'},
  {id:'drumBusy',path:'drumBusy',section:'arrange', label:'ドラムの手数', def:55, zero:'そのまま', on:'rebuild',
   help:'キットの型はそのままに、バックビートのスネア・ゴーストノート・ハットの補い・オープンハット・コンガを足していく。'},
  {id:'drumFill',path:'drumFill',section:'arrange', label:'ドラムの展開', def:50, zero:'そのまま', on:'rebuild',
   help:'Bパターンへの切り替え、4小節・8小節ごとのフィル（タム、スネアロール、3連の食い、ブレイクなど）、フレーズ頭のシンバル。'},
  {id:'drumPlay',path:'drumPlay',section:'arrange', label:'ドラムの遊び', def:50, zero:'そのまま', on:'rebuild',
   help:'フラム、ドラッグ、キックの食い、オープンハット、32分のハットロール、メロディが休んでいる隙間にパーカッションが合いの手。ループの最後は必ずフィルで頭へ戻る。'},
  {id:'drumFeel',path:'drumFeel',section:'arrange', label:'ドラムのノリ', def:35, zero:'そのまま', on:'rebuild',
   help:'16分のハネ、スネアを少し後ろに置く、人の手の揺れ。'},

  {id:'bpm',     path:'bpm',     section:'mix', label:'テンポ', min:52, max:176, def:112, unit:' BPM', on:'bpm'},
  {id:'swing',   path:'swing',   section:'mix', label:'はねかた', def:80, zero:'まっすぐ', on:'swing'},
  {id:'density', path:'density', section:'mix', label:'伴奏のにぎやかさ', def:55, on:'rebuild'},
  {id:'tone',    path:'tone',    section:'mix', label:'音のまるさ', def:55, on:'live'},

  // 試聴用の音量。レシピにも書き出しにも入らない。置き場所はページごとに決める
  {id:'vol',     path:'vol',     section:'transport', label:'音量（試聴用）', def:72, on:'vol'},
];

/* 音色の行。table は engine.js の表の名前、path は state 上のキー */
export const PARTS=[
  {key:'lead', name:'メロディ', selId:'selLead', table:'LEADS',  path:'lead',      on:'live'},
  {key:'chord',name:'伴奏',     selId:'selPad',  table:'PADS',   path:'pad',       on:'live+rebuild'},
  {key:'bass', name:'ベース',   selId:'selBass', table:'BASSES', path:'bassStyle', on:'rebuild'},
  {key:'drum', name:'ドラム',   selId:'selDrum', table:'KITS',   path:'drums',     on:'rebuild'},
];

/* ボタンを並べて1つ選ぶ部品 */
export const SEGS=[
  {name:'oct', path:'mel.oct', section:'melody', label:'高さ', on:'rebuild',
   options:[[-1,'1オクターブ下'],[0,'そのまま'],[1,'1オクターブ上']]},
  {name:'len', path:'sections', section:'mix', label:'ループの長さ', on:'reset', info:'lenInfo',
   options:[[1,'16小節'],[2,'32小節'],[4,'64小節']]},
  {name:'fmt', path:'fmt', section:'export', label:'形式', on:'ui',
   options:[['pcm','CAF・無劣化'],['ima4','CAF・軽量'],['wav','WAV'],['mid','MIDI']]},
  {name:'peak', path:'peak', section:'export', label:'出力レベル', on:'ui', row:'peakRow', info:'peakNote', audioOnly:true,
   options:[[0,'−3 dBFS'],[1,'−6 dBFS'],[2,'−9 dBFS'],[3,'そのまま']]},
  {name:'ch', path:'ch', section:'export', label:'チャンネル', on:'ui', row:'chRow', info:'sizeNote', audioOnly:true,
   options:[[2,'ステレオ'],[1,'モノラル']]},
];

/* オン・オフを切り替える部品 */
export const CHIPS=[
  {group:'layers', section:'melody', label:'重ねる線', on:'rebuild',
   items:[['mel.octUp','オクターブ上'],['mel.harm','ハモリ'],['mel.counter','裏メロ']]},
];

export const knobsIn=section=>KNOBS.filter(k=>k.section===section);
export const segsIn=section=>SEGS.filter(s=>s.section===section);
export const chipsIn=section=>CHIPS.filter(c=>c.section===section);

export function getPath(obj,path){ return path.split('.').reduce((o,k)=>o[k],obj); }
export function setPath(obj,path,v){
  const ks=path.split('.'), last=ks.pop();
  ks.reduce((o,k)=>o[k],obj)[last]=v;
}
export function knobText(k,v){
  if(v===0&&k.zero) return k.zero;
  return v+(k.unit||'');
}

/* 新しく開いたときの状態。曲調の既定（テンポ・はね・音階・編成）を入れてから部品の既定値を入れる */
export function defaultState(presetKey){
  const k=presetKey||'nonbiri', P=PRESETS[k];
  const st={
    preset:k, lead:P.lead, pad:P.pad, bassStyle:P.bass, drums:P.drums,
    key:0, scale:P.scale, seed:(Math.random()*9000000|0)+1000,
    sections:2, fmt:'pcm', ch:2, peak:0,
    mel:{oct:0,octUp:false,harm:false,counter:false},
    mute:{lead:false,chord:false,bass:false,drum:false},
    partVol:{lead:80,chord:80,bass:80,drum:80},
  };
  for(const knob of KNOBS) setPath(st,knob.path,knob.def);
  st.bpm=P.bpm; st.swing=P.swing;
  return st;
}
