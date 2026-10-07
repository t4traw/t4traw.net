# ループBGMスタジオ（開発メモ）

`/apps/loop-bgm-studio` で公開しているループBGMスタジオの正本は、このリポジトリのモジュール。
Astro ページも単体HTMLも CLI も、ここから作る。仕様・方針・曲の記録は [GUIDE.md](./GUIDE.md)。

## 構成

```
src/scripts/loop-bgm-studio/
  engine.js     DOM に触らない部分すべて（理論・音色・曲調・buildSong・アレンジ・ドラム・
                おまかせ・レシピコード・MIDI・音源グラフ・スケジュール・書き出し）。Tone は useTone() で受け取る
  data.js       engine.js の表を再export ＋ KEY_NAMES（Astro ページのビルド時に使う）
  controls.js   画面の部品の一覧（スライダー・選択ボタン・トグル・パート行）と、開いたときの状態
  app.js        DOM の配線。controls.js を回して data 属性で部品を見つける。Astro と単体HTMLで共通
src/pages/apps/loop-bgm-studio.astro
                controls.js をビルド時に回して Tailwind で描画
tools/bgm/
  bgm-test.mjs          検証と演奏の指紋（golden）
  bgm-tool.mjs          CLI（encode / decode / describe / seeds / check / midi / omakase / list）
  build-standalone.mjs  単体HTMLを tools/bgm/out/loop-bgm-studio.html に焼く（成果物。手で編集しない）
  standalone.css        単体HTMLの見た目（Zen Maru Gothic、明暗テーマ）
```

## 用語

画面・コメント・ドキュメントでは次の言葉で統一する（2026-10-07 に決めた）。

| 言葉 | 意味 | コード上の名前 |
|---|---|---|
| **曲調** | コード進行・拍子・テンポ・編成・音階のひな型（のんびり、DnB…）。以前は「土台」と呼んでいたが、分かりにくいのでやめた | `preset` / `PRESETS` / `MOOD_KEYS` |
| ジャンル選択 | 曲調を選ぶ画面・ボタンの名前 | — |
| タネ | 同じ曲調・設定から別の演奏を作るための乱数の種 | `seed` |
| レシピコード | 設定をまるごと詰めた1行のコード（ハッシュ） | `encodeRecipe` / `decodeRecipe` |

エディタ版（`/apps/loop-bgm-studio/editor`）は DTM をやる人向けに近いので、DAW でふつうに使う言葉に寄せる（2026-10-07）。

| 画面の言葉 | 意味 | 以前の言葉・コード上の名前 |
|---|---|---|
| コード（トラック） | 和音のトラック | 伴奏 / `chord` |
| 音色 | 音源の設定。パネルから選ぶ | `mix[k].sound`（`editor/sounds.js`） |
| パターン | 弾き方。選ぶとそのトラックを作り直す | 弾き方・キット / `bassStyle` `drums` `st.leadStyle` `st.chordStyle` |
| 音作り | ブライトネス・アタック・ディケイ／リリース・FM量・フィルターEnv | 音色の傾向（明るさ・余韻・倍音・うなり） / `mix[k].tone` |
| エフェクト | トラックごとのインサートのラック。上から順にかかる | 歪み・コンプ / `mix[k].rack`（`editor/fx.js`） |
| ボリューム・パン | フェーダーと定位 | 音量・左右 |
| リバーブ（センド） | 全トラックで1台の共通リバーブに送る量 | 残響 / `mix[k].rev` |
| ディケイ（共通リバーブ） | 共通リバーブの長さ（秒） | 残響の長さ / `fx.revLen` |
| スウィング・マスタートーン・ループ長 | はね・全体のローパス・曲の長さ | はね・まるさ・長さ |
| ベロシティ・クオンタイズ・オートスクロール | 強さ・グリッドにそろえる・再生位置を追う | 強さ・そろえる・追尾 |
| アレンジブラシ | 選んでいるトラックを、なぞった所だけ書き換えるブラシ。線の高さが音程の目安 | メロディ変更・ドラマ / `brushLead` `brushChord` `brushBass` `brushDrum` |
| 曲の設定 | テンポ・キー・スウィング・マスタートーン・ループ長をまとめたモーダル | 以前は上の帯に並べていた |

エディタ版（プロ版）は **PC 専用**として作る（2026-10-07）。スマホでは使う想定がないので、改修のときもスマホ・タッチ操作の確認はしなくていい（崩れていても直さなくていい）。スマホ対応が要るのはふつう版（`/apps/loop-bgm-studio`）だけ。

エディタのアイコンは [Remix Icon](https://remixicon.com/)（Apache-2.0）の SVG を埋め込む。新しく足すときもここから選ぶ（音作り＝sound-module-fill、エフェクト＝server-line、戻す・進む＝arrow-go-back/forward-line、4小節戻る＝rewind-fill など）。

## コマンド

```bash
npm run bgm:test                       # engine.js を検証。改修したら必ず「すべて通過」させる
npm run bgm:standalone                 # 単体HTMLを作って、それにも bgm-test を通す
npm run bgm -- describe <code>         # CLI（npm run bgm -- list でも、node tools/bgm/bgm-tool.mjs ... でも）
npm run bgm -- check <code>
```

`bgm-test` の golden は「過去のコードが同じ演奏で鳴ること」の指紋。演奏を**意図して**変えたときだけ
`node tools/bgm/bgm-test.mjs --golden-print` の結果でファイル内の GOLDEN を更新する。

## スライダーを1本足す

触るのは `engine.js` と `controls.js` だけ。Astro のマークアップと app.js は触らない。

1. **engine.js**
   - その値で演奏を変える処理を足す。0（または既定値）のとき今までと**完全に同じ演奏**になること。乱数は既存の列を消費しない専用の列を使う
   - レシピコードに新レイアウトを作る（例：`const W8=W7.concat([2]);`、`LAYOUT` に `'8':W8`）。古いレイアウトは消さない
   - `encodeRecipe` の先頭を新バージョンにして値を末尾に足し、`W8` で詰める。`CODE_LEN` を新しい長さに
   - `decodeRecipe` で `has8` のときだけ読み、古いコードでは 0 を返す
2. **controls.js** の `KNOBS` に1行足す
   ```js
   {id:'drumSwing', path:'drumSwing', section:'arrange', label:'ドラムの○○', def:40, zero:'そのまま', on:'rebuild',
    help:'説明文。欄の下に並ぶ'},
   ```
   - `def` は新しく開いたときの値（CLI の encode / seeds の既定にもなる）
   - `on` は動かしたときの処理：`rebuild`（演奏を作り直す）/ `live`（音色だけ）/ `bpm` / `swing` / `vol`
3. `tools/bgm/bgm-test.mjs` の `base()` と `randomState()` に新しい項目を足す（`base` は 0、`randomState` は乱数）。
   新しい乱数を足すと固定乱数500件の指紋は変わるので、**先に** 0 のままで golden が一致するのを確かめてから
   `--golden-print` で `random500` を更新する
4. `npm run bgm:test` → `npm run bgm:standalone` → `npm run build` → ブラウザで確認

選択ボタン（`SEGS`）やトグル（`CHIPS`）、パート行（`PARTS`）も同じ要領で controls.js に足せば両方の画面に出る。

## 注意

- **Tone.js は 14.7.77 に固定**（package.json も単体HTMLの CDN も）。位置指定 `小節:拍:16分(小数)` と NoiseSynth / MembraneSynth の引数がこの系統前提
- 曲調・音色・ベース・ドラム・音階は配列の添字でコード化しているので、追加は必ず**末尾**に。並べ替え・差し替え禁止
- 伴奏・ベース・音階の欄はまだ1桁（各16種まで）。超えるなら新レイアウトで2桁に
- 試聴音量 `vol` はレシピにも書き出しにも入らない
- 単体HTMLの中では engine.js がトップレベルにそのまま入る（bgm-test が `const PC=[` から `function setupTransport` までを切り出して検証するため）。controls.js と app.js は関数の中に入って、エンジンを `E` で見る
