# Pomodoro Healthlink

睡眠（Fitbit）・気圧（OpenWeatherMap）・活動量に連動するポモドーロタイマー PWA です。

## 機能

- **Fitbit Web API** — 直近3日の睡眠時間・途中起床・効率を取得
- **OpenWeatherMap API** — 天気・気圧変動幅・最大降下を取得・表示
- **PWA + 通知** — ホーム画面追加、バックグラウンド復帰時のタイマー同期、フェーズ切替通知
- **健康判定** — 睡眠・活動量に基づきタイマーモードを自動選択

## 判定ロジック

| 条件 | 結果 |
|------|------|
| 平均睡眠 ≥ 7h かつ 活動スコア ≥ 70% | 体調良好 → ポモドーロ有効 |
| 平均睡眠 < 7h | 「睡眠日」— 画面グレーアウト |
| 活動スコア < 70% | 「運動日」— 画面グレーアウト |

体調良好時のポモドーロ:

| 気象条件 | モード | 設定 | 1日上限 |
|----------|--------|------|---------|
| 当日の気圧変動幅 ≤ 4 hPa かつ 先2日間に注意報・6時間急降下なし | optimal | 25分作業 / 5分休憩 × 6 | 2回 |
| それ以外（気象庁注意報発表中、気圧変動大、6時間で4hPa以上降下） | reduced | 15分作業 / 5分休憩 × 3 | 1回 |

気圧判定は OpenWeatherMap の予報、注意報は [気象庁 bosai API](https://www.jma.go.jp/bosai/) の発表内容を参照します。

## セットアップ

```bash
npm install
cp .env.example .env
npm run dev
```

### 環境変数

`.env.example` を **`.env` にコピー**して API キーを設定してください（Vite は `.env.example` を読み込みません）。

```bash
cp .env.example .env
```

API キー未設定時はモックデータで動作します。

**キーを設定しても「晴れ 22°C」のままの場合** — OpenWeatherMap が `401 Invalid API key` を返している可能性があります。新規キーは有効化まで最大2時間かかることがあります。[API keys ページ](https://home.openweathermap.org/api_keys) でキーを確認し、無効なら再発行してください。

## プロジェクト構成

```
src/
├── components/     # UI（TimerCircle, StatusOverlay 等）
├── hooks/          # useHealthData, usePomodoroTimer
├── lib/            # 判定ロジック・ストレージ・通知・音声
├── services/
│   ├── fitbit/     # Fitbit API + モック
│   └── weather/    # OpenWeatherMap API + モック
└── types/          # 型定義
```

## ビルド

```bash
npm run build
npm run preview
```

## スマホでの利用

1. `npm run dev` で起動
2. ブラウザで「ホーム画面に追加」
3. 通知許可をオンにする

## スタイリング方針

- デザイントークン（色）→ `src/index.css` の `@theme`
- レイアウト・状態 → 各コンポーネントの Tailwind クラス
- タイマー円の縁 → SVG のみ（CSS `border` は使わない）
