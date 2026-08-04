# 点呼くん

お散歩先などで、名前ベースの点呼チェックリストで子どもの人数を確認する保育士向けアプリです。
ブラウザだけで完結する「PWA」なので、Xcode不要でiPhoneのSafariから使えます。全データは端末内(localStorage/IndexedDB)のみに保存され、外部サーバーには一切送信されません。

## 公開手順(GitHub Pagesを使う場合)

1. [GitHub](https://github.com/)で無料アカウントを作成する(すでに持っていれば不要)。
2. 新しいPublicリポジトリを作成する(例: `tenkokun`)。アプリコードのみで園児の個人情報は含まれないため公開して問題ありません。
3. この`tenkokun`フォルダの中身をすべてリポジトリにアップロードする。
4. リポジトリの Settings → Pages → Source を「Deploy from a branch」、ブランチを`main` / `/(root)`にして保存する。
5. 数分待つと `https://(ユーザー名).github.io/tenkokun/` でアプリが公開される。

## iPhoneへのインストール

1. iPhoneの**Safari**で上記URLを開く。
2. 共有ボタン(□に↑のアイコン)をタップ → 「ホーム画面に追加」を選ぶ。
3. 次回からはホーム画面のアイコンからワンタップで起動できる。

## 使い方

1. まず「名簿」から子どもを登録する(名前は必須、写真は任意)。
2. 「お散歩をはじめる」から参加する子を選び、点呼をスタート。
3. 出発前・到着時・出発時・帰園時などのタイミングで、写真+名前のタイルをタップして確認し「記録する」。
4. お迎え等で途中で抜ける子がいたら「途中退出」から記録。
5. お散歩が終わったら「お散歩終了」。「履歴」から過去の記録を確認・CSV書き出しできる。
6. 「設定」から名簿のバックアップ(JSON書き出し/読み込み)ができる。機種変更前には必ずバックアップを。

## ローカル開発

```powershell
./_serve.ps1
```

`http://localhost:8766/` で確認できる(ES ModulesはCORSの都合上`file://`では動かないため、HTTPサーバー経由が必須)。

## テスト

DOM/storageに依存しない純粋関数は Node 組み込みテストランナーでカバーしている。

```bash
node --test
```

DOM・IndexedDB・Service Worker・写真圧縮まわりは Node では検証できないため、`tests/MANUAL_CHECKLIST.md` に沿って実機(iPhone Safari)で確認する。

## デプロイ時のチェックリスト

1. 変更をコミット
2. 静的アセット(HTML/CSS/JS/アイコン)に変更がある場合は `sw.js` の `CACHE_VERSION` をインクリメントし、`ASSETS`配列に新規ファイルがあれば追加する
3. push → GitHub Pagesのビルド完了を待つ
4. インストール済み端末で「更新通知トースト」が出ることを確認する

## 開発メモ

- ビルドツール不要のプレーンHTML/CSS/JS構成(ES Modules)。
- 設計の詳細は `C:\Users\yoshi\.claude\plans\grill-me-ui-ux-fluttering-tarjan.md` を参照。
- 既存の試作(`../kodomo-tenko`、カメラ顔検出による頭数カウント方式)とは別アプリとして独立している。localStorageのキー名前空間・IndexedDBのDB名も別に切ってあるため、同一オリジンに同居させない限り干渉しない。
