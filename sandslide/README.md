# Sandslide 流沙方塊

翻轉棋盤，方塊像流沙一樣滑落、整行整列一次消除的方塊益智遊戲。純 HTML5 Canvas + vanilla JS（不用 bundler），用 Capacitor 8 包成 Android App；同一份程式碼也能在 GitHub Pages 與 `file://` 直接開啟。

- 規則：把三個方塊拖到 8×8 棋盤上，排滿一整行或一整列就消除。放方塊會存「翻轉」能量，存滿後滑動棋盤，所有方塊會倒向那一邊、排滿的線全部消除；方塊都放不下又沒有翻轉可用時，遊戲結束。
- 模式：Classic（無盡）與 Daily Slide 每日流沙（固定 20 手牌、全球同一題）。
- 公平承諾：固定隨機種子、沒有任何依玩家表現調整的隱藏難度。

## 開發

```bash
npm install            # 第一次
npm run serve          # http://127.0.0.1:4173/
npm test               # 單元測試（node:test）
npm run e2e            # Playwright（Chromium）端對端測試，截圖在 test-results/e2e/
npm run sim            # 平衡模擬（貪婪 bot），結果對照 docs/tuning.md
```

網頁版除錯參數（只在 dev build 有效）：`?tutorial=0|1`、`?mode=classic|daily`、`?seed=xxx`、`?d=YYYY-MM-DD`（練習某一天）、`?lang=zh-TW|en`、`?nofx=1`（動畫立即完成）、`?fakeads=1`（假廣告，測試救援/+1 翻轉流程）。瀏覽器 console 可用 `window.__TB`。

## 目錄

```
www/            遊戲本體（Capacitor webDir；GitHub Pages 內容）
  js/           傳統 <script> 模組，全部掛在 globalThis.TB（載入順序見 index.html）
  privacy.html  隱私權政策
android/        Capacitor 產生的 Android 專案（已 commit；手動修改見 docs/android-notes.md）
scripts/        static-server、apply-build-flags（test/prod 開關）、sim、export-icons、make-store-assets
test/unit       純邏輯單元測試；test/e2e Playwright
docs/           CONTRACTS（模組 API）、launch-checklist（上架步驟）、store-listing、growth-playbook、tester-guide、tuning
```

## 建置 Android

- Debug APK：push 到 GitHub 後由 `sandslide-android-debug` workflow 產生 artifact（不需本機 Android SDK）。
- 下載 debug APK：GitHub → **Actions** → workflow `sandslide-android-debug` → 最新綠色 run → Artifacts `sandslide-debug-<sha>`（zip，保留 14 天）→ 解壓得到 `app-debug.apk`；手機要先允許「安裝未知應用程式」；debug 版只用 Google 測試廣告 ID（步驟見 docs/android-notes.md §6）。
- Release AAB/APK：打 tag `vX.Y.Z` → `sandslide-android-release`（需要 4 個 Secrets，見 docs/launch-checklist.md）。
- 正式廣告 ID 貼在 `www/js/ads-ids.prod.js` 與 `android/app/src/main/res/values/strings.xml`；release 前 `npm run flags:release` 會移除測試 ID，workflow 也會檢查。

## 版本

數值全部在 `www/js/config.js`；上線後唯一該調的旋鈕是 `RULES.classic.chargeGrowth`（10 / 15 / 20）。
