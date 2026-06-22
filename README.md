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

- **Google Health API** — Fitbit デバイスの睡眠3日分・歩数（未連携時はデモデータ）
- **Open-Meteo API** — 天気・湿度・海平面気圧（API キー不要）
- **Geolocation API** — 利用者の現在地から天気・気圧を取得
- **Open-Meteo Geocoding** — 逆ジオコーディングで市区町村名を表示
- **気象庁 bosai API** — 注意報・予報上の強風リスク（座標から地方気象台・市区町村を自動判定）
- **ポモドーロタイマー** — 体調・気圧に応じて作業時間を自動調整
- **PWA 通知** — フェーズ切替・セッション完了

### 連携 UI

| 状態 | 表示 |
|------|------|
| OAuth 未設定（`VITE_GOOGLE_CLIENT_ID` なし） | 「Fitbit連携」ボタン（無効） |
| 未連携 | 「Fitbit連携」ボタン |
| 連携済み | 「詳細」ボタン + 「Fitbit 連携を解除」 |

## 判定ロジック

### 1. 体調判定（タイマー ON/OFF）

| 条件 | 結果 |
|------|------|
| 平均睡眠 ≥ 7h **かつ** 活動スコア ≥ 70% | 体調良好 → ポモドーロ有効 |
| 平均睡眠 < 7h | **睡眠日** — タイマー無効・画面グレーアウト |
| 活動スコア < 70% | **運動日** — タイマー無効・画面グレーアウト |

- **平均睡眠**: 直近3日の睡眠時間の平均
- **活動スコア**: 直近7日平均歩数 ÷ 直近28日平均歩数（70% 以上で合格）

### 2. ポモドーロモード（体調良好時のみ）

| 気象条件 | モード | 設定 | 1日上限 |
|----------|--------|------|---------|
| 当日の気圧変動幅 ≤ 4 hPa **かつ** 先2日に注意報・6時間急降下なし | **optimal** | 25分作業 / 5分休憩 × 6 | 2回 |
| それ以外 | **reduced** | 15分作業 / 5分休憩 × 3 | 1回 |

## セットアップ

```bash
npm install
cp .env.example .env
# .env に VITE_GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を記入
npm run dev
```

`npm run dev` / `npm run build` は `.env` が無い場合 `.env.example` を自動コピーします。

### 環境変数

| 変数 | 公開 | 必須 | 説明 |
|------|------|------|------|
| `VITE_GOOGLE_CLIENT_ID` | クライアント | 連携時 | Google Cloud Console の OAuth クライアント ID |
| `VITE_GOOGLE_REDIRECT_URI` | クライアント | 連携時 | OAuth コールバック URL |
| `GOOGLE_CLIENT_SECRET` | **サーバーのみ** | 連携時 | OAuth クライアント シークレット（`VITE_` 不可・Git に含めない） |

**Google Cloud Console 設定**

1. プロジェクト作成 → **Google Health API** を有効化
2. OAuth 同意画面（外部）を設定（Testing モードではテストユーザーを追加）
3. OAuth クライアント ID（**ウェブアプリケーション**）を作成
4. **クライアント シークレット**を控える → Vercel / ローカル `.env` に `GOOGLE_CLIENT_SECRET` として設定
5. 承認済みリダイレクト URI に以下を追加  
   - 本番: `https://pomodoro-healthlink.vercel.app/auth/google/callback`  
   - 開発: `http://localhost:5173/auth/google/callback`

**Vercel 公開時（必須チェックリスト）**

- [ ] `GOOGLE_CLIENT_SECRET` を Environment Variables に設定（Production / Preview）
- [ ] `VITE_GOOGLE_CLIENT_ID` を設定（または `.env.example` からビルド時コピー）
- [ ] `VITE_GOOGLE_REDIRECT_URI` が Google Console の URI と一致
- [ ] 設定変更後に **Redeploy**

未設定・未連携時はデモデータで動作します。

### OAuth フロー

```
[Fitbit連携] → Google 同意画面
     ↓
/auth/google/callback?code=...
     ↓
POST /api/google/token  （client_secret をサーバー側で付与）
     ↓
localStorage に access / refresh token 保存
     ↓
Google Health API で睡眠・歩数取得
```

- トークン交換は **Vercel Serverless Function**（`api/google/token.js`）または `vite.config.ts` の開発用ミドルウェアで実行
- `client_secret` はブラウザに露出させない

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| 「Fitbit連携」が無反応 | `VITE_GOOGLE_CLIENT_ID` 未設定 | `.env` を確認して dev サーバー再起動 |
| `client_secret is missing` | トークン API に secret 未設定 | `GOOGLE_CLIENT_SECRET` を Vercel / `.env` に追加 |
| `GOOGLE_CLIENT_SECRET is not configured` | Vercel に secret なし | Dashboard で設定 → Redeploy |
| 同意後に連携失敗 | リダイレクト URI 不一致 | Console と `VITE_GOOGLE_REDIRECT_URI` を照合 |
| 「未検証アプリ」警告 | OAuth が Testing モード | テストユーザー追加 or アプリ審査 |

## プロジェクト構成

```
api/
├── google/token.js          # Vercel: OAuth トークン交換
└── lib/exchangeGoogleToken.js
scripts/
└── sync-env.mjs             # .env 自動コピー
src/
├── components/              # UI（TimerCircle, WeatherBadge, HealthConnectButton 等）
├── hooks/                   # useHealthData, usePomodoroTimer
├── services/
│   ├── googleHealth/        # OAuth, API, モック, 日付フォーマット
│   ├── jma/                 # 気象庁 API
│   └── weather/             # Open-Meteo
└── types/
```

## 外部 API

| サービス | 用途 | 認証 |
|----------|------|------|
| Open-Meteo Forecast | 天気・気圧 | 不要 |
| Open-Meteo Geocoding | 逆ジオコーディング | 不要 |
| 気象庁 bosai | 注意報・予報 | 不要 |
| Google Health API | 睡眠・歩数（Fitbit 等） | Google OAuth（PKCE + サーバー側 secret） |

## ビルド・公開

```bash
npm run build
npm run preview
```

Vercel では `vercel.json` により `/api/*` 以外を SPA にルーティングします。

## ライセンス

MIT（未設定の場合はリポジトリ管理者に確認してください）
