# GH Enhancer

GitHub Pull Requestで頻繁に使う操作を、画面右下のボタンから実行するChrome拡張です。

## 機能

- `@codex`: コメント欄へ`@codex review`だけを入力して投稿
- `Close PR`: 確認後、GitHub標準のClose操作を実行
- `Approve`: 確認後、Files changedのGitHub標準Review UIからApprove

入力中のコメントやレビューがある場合は上書き・同時送信せず、中止します。追加のGitHubトークンやChrome権限は不要です。

## インストール

1. このリポジトリをダウンロードする
2. Chromeで`chrome://extensions`を開く
3. 「デベロッパー モード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」から、このフォルダを選ぶ

## 開発

Node.js 24を使用します。

```sh
npm ci
npm run check
npm run lint
npm run test:e2e
```

GitHubの画面構造を安全に特定できない場合、拡張は操作を実行せずエラーを表示します。
