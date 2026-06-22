# Pomodoro Healthlink

睡眠（Google Health API / Fitbit）・気圧（Open-Meteo）・活動量に連動するポモドーロタイマー PWA です。

> **AI 補助について**  
> 本プロジェクトの設計・実装・ドキュメント整備の一部に、Cursor 上の AI（LLM）を補助ツールとして使用しています。  
> 最終的な要件判断・動作確認・公開判断は開発者が行っています。

## 概要

| 項目 | 内容 |
|------|------|
| フレームワーク | Vite + React + TypeScript |
| スタイル | Tailwind CSS v4 |
| 配布形式 | PWA（ホーム画面追加・通知対応） |
| 公開 URL | https://pomodoro-healthlink.vercel.app |

## 機能

- **Google Health API** — Fitbit の睡眠・歩数（連携時のみ。未取得時は詳細パネルに非表示）
- **Open-Meteo API** — 天気・湿度・海平面気圧（API キー不要）
- **Geolocation API** — 現在地から天気・気圧を取得
- **気象庁 bosai API** — 注意報・予報（詳細パネルの天気表示用）
- **ポモドーロタイマー** — 体調・当日気圧に応じて作業時間を自動調整
- **PWA 通知・効果音** — 作業／休憩の切り替え時

## 判定ロジック

### 1. 体調判定（タイマー ON/OFF）

| 条件 | 結果 |
|------|------|
| 直近3日の平均睡眠 **≥ 7h** **かつ** 昨日の歩数 **≥** 過去6日平均の **70%** | 体調良好 → ポモドーロ有効 |
| 直近3日の平均睡眠 **≤ 7h** | **睡眠日** — タイマー無効・画面グレーアウト |
| 昨日の歩数 **<** 過去6日平均の **70%** | **運動日** — タイマー無効・画面グレーアウト |
| 睡眠・歩数データ未取得 | **データ取得中** — タイマー無効 |

- **平均睡眠**: 直近3日の `minutesAsleep` の平均
- **昨日の歩数**: 今日より前の最新日の歩数
- **過去6日平均**: 昨日より前の6日間の日別歩数の平均

### 2. ポモドーロモード（体調良好時のみ）

当日の気圧変動幅（最高 − 最低）で判定します。

| 当日の気圧変動幅 | モード | 作業 / 休憩 | サイクル | 1日上限 | 終了後 |
|------------------|--------|-------------|----------|---------|--------|
| **4.0 hPa 未満** | optimal | 25分 / 5分 | 6 | **2回** | 2回完了でグレーアウト「本日の学習は終了しました」 |
| **4.0 hPa 以上** | reduced | 15分 / 5分 | 3 | **1回** | 1回完了でグレーアウト「本日の学習は終了しました」 |

- フェーズ切り替え時に効果音を再生
- 1日の使用回数は localStorage で管理（日付が変わるとリセット）

### 3. 連携 UI

| 状態 | 表示 |
|------|------|
| 未連携 | 「Fitbit連携」ボタン |
| 連携済み | 「詳細」ボタン（睡眠・歩数は **取得できた項目のみ** 表示） |

## セットアップ

```bash
npm install
cp .env.example .env
npm run dev
```

### 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `VITE_GOOGLE_CLIENT_ID` または `GOOGLE_CLIENT_ID` | 連携時 | OAuth クライアント ID |
| `VITE_GOOGLE_REDIRECT_URI` または `GOOGLE_REDIRECT_URI` | 連携時 | OAuth コールバック URL（例: `https://<your-domain>/auth/google/callback`） |
| `GOOGLE_CLIENT_SECRET` | 連携時 | サーバー側のみ（Vercel / `.env`） |

**Vercel でプロジェクトを作り直した場合**

1. 上記3つを **Production** 環境に設定する
2. Google Cloud Console の「承認済みリダイレクト URI」が Vercel の URL と一致しているか確認する
3. 環境変数を保存したあと **Redeploy（再デプロイ）** する

`VITE_*` はビルド時に埋め込まれます。`GOOGLE_*` は `/api/config` から実行時に読み込むため、再デプロイ後すぐに Fitbit 連携ボタンが有効になります。

未連携時も天気・気圧連動タイマーは動作しますが、睡眠・歩数に基づく体調判定は **データ取得中** となります。

## プロジェクト構成

```
api/google/token.js     # OAuth トークン交換
src/
├── lib/healthJudgment.ts   # 体調・気圧・ポモドーロ判定
├── services/googleHealth/  # Fitbit / Google Health API
├── services/weather/       # Open-Meteo
└── components/             # TimerCircle, WeatherBadge 等
```

## ビルド・公開

```bash
npm run build
npm run preview
```

## ライセンス

MIT
