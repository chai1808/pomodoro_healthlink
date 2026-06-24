type PrivacyPolicySheetProps = {
  open: boolean
  onClose: () => void
}

export const PrivacyPolicySheet = ({ open, onClose }: PrivacyPolicySheetProps) => {
  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/50 duration-300"
        aria-label="プライバシーポリシーを閉じる"
        onClick={onClose}
      />
      <aside
        className="details-sheet fixed inset-x-0 bottom-0 z-50 flex h-dvh max-h-dvh flex-col rounded-t-2xl border-t border-mono-border bg-mono-bg sm:h-auto sm:max-h-[85dvh]"
        aria-label="プライバシーポリシー"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="space-y-4 text-sm leading-relaxed text-mono-text">
            <h2 className="text-base font-normal">プライバシーポリシー</h2>
            <p className="text-xs text-mono-muted">最終更新日: 2026年6月24日</p>

            <section className="space-y-2">
              <h3 className="text-sm text-mono-text">1. はじめに</h3>
              <p className="text-mono-muted">
                Pomodoro Healthlink（以下「本アプリ」）は、睡眠・活動量・気象情報に基づいて
                ポモドーロタイマーを調整する Web アプリです。本ポリシーは、本アプリが取得・利用する
                情報とその取り扱いについて説明します。
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm text-mono-text">2. 取得する情報</h3>
              <ul className="list-disc space-y-2 pl-5 text-mono-muted">
                <li>
                  <span className="text-mono-text">Fitbit データ（Google Health API 経由）</span>
                  ：睡眠時間・就寝・起床時刻、歩数。Fitbit 連携を行った場合にのみ取得します。
                </li>
                <li>
                  <span className="text-mono-text">位置情報</span>
                  ：ブラウザの Geolocation API により、天気・気圧データ取得のために
                  おおよその位置（緯度・経度）を取得します。
                </li>
                <li>
                  <span className="text-mono-text">端末内の保存データ</span>
                  ：OAuth トークン、タイマーの進行状態、1 日の利用回数、位置情報のキャッシュなどを
                  ブラウザの localStorage に保存します。
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm text-mono-text">3. 利用目的</h3>
              <ul className="list-disc space-y-2 pl-5 text-mono-muted">
                <li>睡眠・歩数に基づく体調判定とタイマーの有効・無効の制御</li>
                <li>気圧変動に応じたポモドーロモード（作業時間・休憩時間）の調整</li>
                <li>天気・注意報などの表示</li>
                <li>タイマー状態の復元（再読み込み・画面復帰時）</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm text-mono-text">4. 外部サービス</h3>
              <p className="text-mono-muted">
                本アプリは以下の外部サービスと連携します。各サービスのプライバシーポリシーもあわせて
                ご確認ください。
              </p>
              <ul className="list-disc space-y-2 pl-5 text-mono-muted">
                <li>Google（OAuth 認証・Google Health API）</li>
                <li>Open-Meteo（天気・気圧データ）</li>
                <li>気象庁 bosai API（注意報・予報）</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm text-mono-text">5. データの保存と共有</h3>
              <p className="text-mono-muted">
                健康データは Google Health API から取得し、判定・表示のために端末内で処理します。
                本アプリの開発者が、取得した健康データを独自のサーバーに蓄積したり、
                第三者へ販売・提供したりすることはありません。OAuth トークンの更新処理のみ、
                ホスティング環境（Vercel）上の API を経由します。
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm text-mono-text">6. 連携の解除</h3>
              <p className="text-mono-muted">
                詳細パネルの「Fitbit 連携を解除」から、本アプリ内の連携情報（トークン等）を削除できます。
                Fitbit 側のアプリ連携解除は、Fitbit アカウント設定から行ってください。
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm text-mono-text">7. お問い合わせ</h3>
              <p className="text-mono-muted">
                本ポリシーに関するお問い合わせは、本アプリの公開リポジトリ（GitHub）の Issue
                よりご連絡ください。
              </p>
            </section>

            <button
              type="button"
              onClick={onClose}
              className="w-full duration-200 cursor-pointer rounded-full border border-mono-border bg-mono-surface py-2.5 text-xs text-mono-text transition-colors hover:border-mono-text focus:outline-none focus-visible:ring-2 focus-visible:ring-mono-text sm:hidden"
              aria-label="プライバシーポリシーを閉じる"
            >
              閉じる
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
