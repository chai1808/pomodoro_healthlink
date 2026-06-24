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
| 配布形式 | PWA（ホーム画面追加・オフラインキャッシュ） |
| 公開 URL | https://pomodoro-healthlink.vercel.app |

## 機能

- **Google Health API** — Fitbit の睡眠・歩数（連携時のみ。未取得時は詳細パネルに非表示）
- **Open-Meteo API** — 天気・湿度・海平面気圧（API キー不要）
- **Geolocation API** — 現在地から天気・気圧を取得
- **気象庁 bosai API** — 注意報・予報（詳細パネルの天気表示用）
- **ポモドーロタイマー** — 体調・当日気圧に応じて作業時間を自動調整
- **作業中のホワイトノイズ** — かすかな環境音（`<audio loop>`）。ミュートボタンあり

> **通知について**  
> プッシュ通知・バックグラウンド通知は提供していません。タイマーは **Web 画面完結** です。

### タイマー・音声の動作

| 状態 | タイマー | 音声 |
|------|----------|------|
| フォアグラウンド + 作業 | 進行 | かすかなホワイトノイズ（ミュート OFF 時） |
| フォアグラウンド + 休憩 | 進行 | 無音 |
| バックグラウンド | 壁時計ベースで進行 | OS により止まることがある |
| バックグラウンド中に次の休憩が終了 | **次のワーク先頭で自動一時停止** | 再生しない |
| 画面復帰 | catch-up で同期 | 作業フェーズなら再開を試行 |
| 一時停止後 | — | 「再開」で手動続行 |

- 実行中のタイマー状態は localStorage に保存（再読み込み・復帰時に catch-up）
- バックグラウンドに入ったあと、**次の休憩の終わり → 次のワーク開始** のタイミングで自動一時停止する（音が復帰しない問題への対策）

## 判定ロジック

### 1. 体調判定（タイマー ON/OFF）

| 条件 | 結果 |
|------|------|
| 今日の睡眠 **≥** 直近の睡眠記録（最大8件）の平均の **70%** **かつ** 昨日の歩数 **≥** 直近7日間（上位・下位1日を除く）平均の **70%** | 体調良好 → ポモドーロ有効 |
| 今日の睡眠 **<** 直近の睡眠記録（最大8件）の平均の **70%** | **睡眠日** — タイマー無効・画面グレーアウト |
| 昨日の歩数 **<** 直近7日間（上位・下位1日を除く）平均の **70%** | **運動日** — タイマー無効・画面グレーアウト |
| 睡眠・歩数データ未取得 | **データ取得中** — タイマー無効 |

- **今日の睡眠**: カレンダー上の当日の睡眠時間（起床日ベース）
- **睡眠基準**: 記録がある日だけを対象に、直近 **最大8件** の単純平均（欠損日は除外。表示と判定で同じ計算）
- **昨日の歩数**: カレンダー上の前日の歩数
- **歩数基準**: 昨日より前の7日間から、歩数が最も多い1日と最も少ない1日を除いた5日間の平均（記録のない日は0歩）

### 2. ポモドーロモード（体調良好時のみ）

当日の気圧変動幅（最高 − 最低）で判定します。

| 当日の気圧変動幅 | モード | 作業 / 休憩 | サイクル | 1日上限 | 終了後 |
|------------------|--------|-------------|----------|---------|--------|
| **4.0 hPa 未満** | optimal | 90分 / 30分 | 2 | **2回** | 2回完了でグレーアウト「本日の学習は終了しました」 |
| **4.0 hPa 以上** | reduced | 25分 / 5分 | 4 | **1回** | 1回完了でグレーアウト「本日の学習は終了しました」 |

- 1日の使用回数は localStorage で管理（日付が変わるとリセット）

### 3. 連携 UI

| 状態 | 表示 |
|------|------|
| 未連携 | 「Fitbit連携」ボタン |
| 連携済み | 「詳細」ボタン（睡眠・歩数は **直近8日分** を表示。取得できた項目のみ） |

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

Vanilla（`index.html` + `script.js`）に近い **5フォルダ構成** で整理しています。

```
api/                          # サーバー（OAuth トークン交換のみ）
src/
├── App.tsx                   # 画面の組み立て
├── components/               # 見た目（UI 部品）
├── hooks/                    # データ取得・タイマー状態
├── lib/                      # ビジネスルール・共通処理
│   ├── healthJudgment.ts     # 体調・気圧・ポモドーロ判定（コアロジック）
│   ├── constants.ts          # 閾値・設定（README の表と対応）
│   ├── sound.ts              # 作業中ホワイトノイズ
│   ├── timerPersistence.ts   # タイマー localStorage 永続化
│   ├── timerSchedule.ts      # 壁時計 catch-up
│   └── utils.ts              # 日付・時間フォーマット
├── services/                 # 外部 API
│   ├── googleHealth/         # auth.ts + api.ts
│   ├── weather/api.ts        # Open-Meteo
│   └── jma/                  # 気象庁 API
└── types/index.ts
```

### データの流れ

```
起動 (main.tsx → App.tsx)
  │
  ├─ useHealthData (hooks/)
  │    ├─ resolveUserLocation     → lib/location.ts
  │    ├─ fetchHealthData         → services/googleHealth/api.ts
  │    ├─ fetchWeather            → services/weather/api.ts
  │    └─ buildHealthSnapshot     → lib/healthJudgment.ts
  │
  └─ usePomodoroTimer (hooks/)
       ├─ getPomodoroConfig       → lib/healthJudgment.ts + constants.ts
       └─ components/             → TimerCircle, TimerControls 等
```

## ビルド・公開

```bash
npm run build
npm run lint
npm run preview
```

Vercel に push すると自動デプロイされます。

## ライセンス

MIT
