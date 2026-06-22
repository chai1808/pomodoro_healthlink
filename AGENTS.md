# AI / 開発者向けガイド

## このプロジェクトの地図

```
hooks/     → いつ・何を取得するか
lib/       → どう判定するか（healthJudgment が核心）
services/  → 外部 API（触るのはここだけ）
components/→ どう見せるか
App.tsx    → 上記を組み立てる
```

## 変更するとき

1. 上の5つ以外にファイルを増やさない（例外: 300行超・新規外部 API）
2. ビジネスロジックは `lib/healthJudgment.ts` に集約
3. OAuth / API 通信は `services/` に閉じる
4. UI は `components/` に閉じる

## コマンド

```bash
npm run dev      # 開発サーバー
npm run build    # 型チェック + ビルド
npm run lint     # ESLint
```

## 参照

- 判定仕様: `README.md` の「判定ロジック」
- 構造ルール: `.cursor/rules/project-structure.mdc`
