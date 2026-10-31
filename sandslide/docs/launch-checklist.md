# Sandslide 流沙方塊 — 上架作戰手冊（使用者端）

這份文件是**你（帳號擁有者）要親手做的事**。程式、CI、素材由我（Claude）在 repo 裡完成；凡是需要 Google 帳號、證件、信用卡、手機、金鑰的步驟，只有你能做。§0 的每一項都可以**今天**開始，和開發並行；最晚期限寫在每一項的標題裡。

固定識別資料（所有文件、後台欄位都用這一套，不要改拼法）：

| 項目 | 值 |
|---|---|
| 英文名 / 中文名 | Sandslide / 流沙方塊 |
| Android 套件名稱（appId） | `io.github.chungtr9527.sandslide` |
| Play 商店標題 | `Sandslide: Block Puzzle` / `流沙方塊：傾斜方塊消除益智` |
| 遊戲網址（GitHub Pages，合併進 `main` 後才有） | `https://chungtr9527.github.io/-/sandslide/www/` |
| 隱私權政策網址 | `https://chungtr9527.github.io/-/sandslide/www/privacy.html` |
| 行銷短網址（user-site repo 轉址） | `https://chungtr9527.github.io/sandslide/` |
| 開發者網站（Play 商店頁「網站」欄位；app-ads.txt 放這裡） | `https://chungtr9527.github.io` |
| Play 商店連結 | `https://play.google.com/store/apps/details?id=io.github.chungtr9527.sandslide` |
| 封閉測試加入連結 | `https://play.google.com/apps/testing/io.github.chungtr9527.sandslide` |
| AdMob 廣告單元名稱 | `sandslide_and_banner_bottom`、`sandslide_and_inter_gameover`、`sandslide_and_rw_rescue`、`sandslide_and_rw_tilt` |
| GitHub Secrets | `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` |
| 目標 / 編譯 SDK | API 36（Play 2026 年新 App 硬性要求） |
| 每日流沙第 1 期日期（`DAILY_EPOCH`，`www/js/config.js`） | `2026-10-31`＝第 1 期；**上線後絕對不能改**（改了每一期的編號與題目種子都會位移，玩家的連續天數也會錯亂） |

> GitHub Pages 備註：repo `chungtr9527/-` 的 Pages **已經開啟**（classic build，來源 `main`，根目錄有 `.nojekyll`）。遊戲與隱私權政策**只有在合併進 `main` 之後**才會出現在上面的網址。隱私權政策網址在 Play Console 填表時就要能打開，所以 `www/privacy.html`（把 `{{DEVELOPER_NAME}}`、`{{CONTACT_EMAIL}}` 換成真實值之後）要**比遊戲本體更早**合併到 `main`。

---

## §0 今天就做（與開發並行）

### 0.1 Google Play Console 開發者帳號（第一天就申請；驗證約 3 天）

1. 到 `play.google.com/console` 用你打算長期使用的 Google 帳號註冊「個人」開發者帳號；一次性註冊費 **US$25**（信用卡）。
2. 依指示完成：電子郵件與電話驗證、身分證件驗證（上傳證件，Google 審核**約 3 天**）、付款資料姓名要和證件一致。若 Play Console 要求「用實體裝置驗證」，在 Android 手機安裝 **Google Play Console** App、用同一帳號登入完成驗證。
3. **DSA 交易商身分申報**（建立帳號或建立 App 時會問）：依歐盟《數位服務法》，以廣告獲利的個人通常算「交易商」；選交易商就必須提供並**公開顯示**地址、電話、電子郵件。這是你的決定；選「非交易商」則 EU 使用者可能無法下載。
4. 註冊後立刻看一眼「帳戶詳細資料 → 開發人員名稱」：這個名稱會公開在商店頁，也會寫進 `config.js` 與 `privacy.html`（見 0.7）。
5. **2023-11-13 之後建立的個人帳號**，第一個 App 必須先通過封閉測試才能申請正式上架（規則見 0.2）。沒有例外，所以帳號越早開越好。

### 0.2 封閉測試規則與做法（上架的前置條件；時程佔 14 天以上）

規則：**至少 12 位測試者，連續 14 天保持加入測試狀態**（「已選擇加入 + App 裝著」就算，不要求每天開啟；但我們的測試者指南會請他們每天玩）。中途退出或解除安裝的人不算，所以請找 15–20 位（見 0.5）。

做法（AAB 準備好之後，我會告訴你哪一個 GitHub Release）：

1. Play Console →「建立應用程式」：名稱 `Sandslide`、預設語言 **English (United States)**、「遊戲」、「免費」（**免費不可逆**）、勾選聲明。
2. 左側「測試 → 封閉測試」→ 建立測試群組（track 名稱例如 `closed-alpha`）。
3. 「測試人員」分頁 → 建立電子郵件名單（貼上所有測試者的 Gmail）**或**填入 Google 群組的信箱（0.5 的做法）→ 儲存。
4. 「版本」分頁 → 建立新版本 → 上傳 `.aab`（從 GitHub Release 下載，檔名 `sandslide-0.1.0.aab`）→ 版本名稱、版本資訊（可貼 `docs/store-listing.md` 的「新功能」）→ 國家/地區先選 **台灣**（軟啟動）→ 審查並開始推出。
5. 第一次推出前 Dashboard 會列出必須先完成的「設定應用程式」項目：隱私權政策網址、應用程式存取權、廣告、內容分級、目標對象、新聞／COVID-19／政府／金融／健康聲明、資料安全、商店資訊（至少英文：圖示、主題圖片、2 張以上截圖）。答案全部在 §2、素材在 §3。
6. 推出後「測試人員」分頁會出現加入連結 `https://play.google.com/apps/testing/io.github.chungtr9527.sandslide`；把它和 `docs/tester-guide.md` 一起寄給測試者。封閉測試版的審核通常比正式版快，但也可能要幾天。
7. Dashboard 會顯示「申請正式版存取權」與 14 天進度條。期間可以照常上傳新版 `.aab` 到同一個測試群組，不會重算天數。
8. 14 天到了 → 「申請正式版存取權」→ 問卷（每題約 300 字：怎麼找測試者、收到什麼回饋、改了什麼、為什麼準備好了；照實寫）→ Google 審核 **最多 7 天**。通過後才看得到「正式版」軌道。

### 0.3 AdMob 帳號、付款、App 與 4 個廣告單元（App ID 與單元 ID 在 M8 前交給我）

1. 到 `admob.google.com` 用**同一個 Google 帳號**註冊；國家台灣、時區 Asia/Taipei。
2. **付款資料**：姓名必須與證件、銀行帳戶一致；地址填台灣可收信的地址——累積到 **US$10** 時 Google 會寄一封 **PIN 郵件**到這個地址（可能要幾週），收到後在「付款 → 驗證地址」輸入 PIN，沒輸入就不會付款。
3. **稅務資訊**：付款 → 設定 → 管理稅務資訊 → **W-8BEN**（個人、非美國人、台灣稅務居民；台灣與美國沒有租稅協定，協定欄位留空）。
4. **付款方式**：電匯到**可以收美金的台灣銀行帳戶**（先問銀行入帳手續費與外幣帳戶）。月底餘額達 **US$100** 才會付款，下個月付款期（AdMob 顯示為準，通常 21 日前後）入帳。封閉測試期間幾乎不會有收入，這些先設好就好。
5. **建立 App**：應用程式 → 新增應用程式 → 平台 Android →「應用程式是否已在支援的商店上架？」選**否** → 名稱 `Sandslide` → 新增。記下 **App ID**：`ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`（`~` 前的 16 位數字就是你的 publisher ID `pub-XXXXXXXXXXXXXXXX`，app-ads.txt 要用）。
6. **4 個廣告單元**（名稱一字不差）：

   | 單元名稱 | 格式 | 建立時的選項 |
   |---|---|---|
   | `sandslide_and_banner_bottom` | 橫幅（Banner） | 預設即可；自動調整大小（adaptive）是程式端設定 |
   | `sandslide_and_inter_gameover` | 插頁（Interstitial） | 預設即可 |
   | `sandslide_and_rw_rescue` | 獎勵（Rewarded） | 獎勵金額 `1`、獎勵項目 `rescue`（程式只認事件，不看數字） |
   | `sandslide_and_rw_tilt` | 獎勵（Rewarded） | 獎勵金額 `1`、獎勵項目 `tilt` |

   每個單元的 ID 長這樣：`ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ`。**把 App ID 與 4 個單元 ID 貼給我**（或自己照 §1 貼進檔案）。
7. **隱私權與訊息（UMP）**：AdMob → 隱私權與訊息 → **GDPR** → 建立訊息 → 選 `Sandslide` → 語言 English + Chinese (Traditional) → 選含「同意 / 不同意 / 管理選項」的樣式 → **發布**；再對 **美國各州法規（US state regulations）** 建立並發布訊息。沒有發布訊息，歐洲與美國部分州的使用者會完全看不到廣告。IDFA 訊息是 iOS 用的，先略過。
8. **封鎖控制項 / 分級**：AdMob → 封鎖控制項 → 所有應用程式（或只對 Sandslide）→ 敏感類別封鎖：賭博與博弈、交友、快速致富、性健康、裸露／情色（依後台實際清單勾）；App 設定 → 廣告內容分級上限 **PG（輔導級）**（程式端也設了 `ParentalGuidance`）。
9. **測試裝置**（避免你自己的手機在正式 ID 下產生無效點擊）：手機「設定 → Google → 廣告」→ 抄下「你的廣告 ID」→ AdMob → 設定 → 測試裝置 → 新增（Android、貼上 ID）。開發 APK 用的是 Google 範例單元不需要這步；封閉測試版就是正式 ID 了，一定要加。
10. **絕對不要自己點廣告**，也不要叫測試者點（測試者指南已寫）。AdMob 無效流量會直接封帳號且幾乎不能申訴。

### 0.4 建立 `chungtr9527.github.io` repo（app-ads.txt 與短網址；正式上架前就要能打開）

1. GitHub → New repository → 名稱**一字不差** `chungtr9527.github.io`、Public、勾 README 建立。這種 user-site repo 會自動發布到 `https://chungtr9527.github.io/`（Settings → Pages 確認來源是 `main` 根目錄）。
2. 在根目錄新增 **`app-ads.txt`**，內容只有這一行（把 `pub-XXXXXXXXXXXXXXXX` 換成 0.3 的 publisher ID，逗號後各一個空格，檔尾換行）：

   ```
   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
   ```

3. 新增 **`sandslide/index.html`**（行銷短網址 `https://chungtr9527.github.io/sandslide/`，保留 `?d=YYYY-MM-DD` 等參數）：

   ```html
   <!doctype html>
   <html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
   <title>Sandslide 流沙方塊</title>
   <meta http-equiv="refresh" content="0; url=https://chungtr9527.github.io/-/sandslide/www/">
   <script>location.replace('https://chungtr9527.github.io/-/sandslide/www/' + location.search + location.hash);</script>
   </head><body><a href="https://chungtr9527.github.io/-/sandslide/www/">Open Sandslide</a></body></html>
   ```

4. 幾分鐘後驗證：瀏覽器打開 `https://chungtr9527.github.io/app-ads.txt` 要看到那一行純文字；`https://chungtr9527.github.io/sandslide/` 要轉到遊戲網址（遊戲合併進 `main` 前會是 404，正常）。
5. Play 商店頁的「網站」欄位必須填 `https://chungtr9527.github.io`（網域根），AdMob 才會去這個網域抓 `app-ads.txt`（§5）。

### 0.5 找 15–20 位測試者（最晚在第一個 AAB 之前）

- 條件：有 Android 手機（Android 7 以上）、有 Google 帳號、願意裝著 App **連續 14 天**不解除安裝、每天玩幾分鐘。
- 最省事：建立一個 **Google 群組**（groups.google.com，例如 `sandslide-testers`，設定為「任何人可申請加入、需核准」），把群組信箱填進 Play Console 測試人員名單；之後加人只要核准入群。或者直接收集 Gmail 貼進名單（上限 2,000 人）。
- 來源：親友、同事、Dcard／PTT／巴哈的「徵測試者」文（講清楚 14 天與不要點廣告）、台灣獨立遊戲開發社群。
- 同時建立 **Google 表單**（回饋表）：欄位 = 暱稱、手機型號、Android 版本、第 1 天診斷資料（長文字）、第 14 天診斷資料（長文字）、遇到的問題（長文字）、最喜歡／最討厭的一點。把表單網址填進 `docs/tester-guide.md` 的 `{{FEEDBACK_FORM_URL}}`。
- 封閉測試版使用**正式廣告 ID**（和正式版同一份 bits），所以測試者指南裡「不要故意點廣告」這條一定要寄到。

### 0.6 產生上傳金鑰 + 4 個 GitHub Secrets（M10 前）

金鑰只做一次、永久保存。Play 採用 **Play App Signing**：Google 保管正式簽章金鑰，你保管的是「上傳金鑰」。

1. 需要 JDK 的 `keytool`：
   - **Windows**：裝 Temurin 21（adoptium.net）後在 PowerShell 執行；或用 Android Studio 內建的 `"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"`。
   - **macOS**：`brew install --cask temurin@21`；或 `/Applications/Android\ Studio.app/Contents/jbr/Contents/Home/bin/keytool`。
   - **Linux**：`sudo apt install openjdk-21-jdk-headless`（或 Temurin）。
2. 在一個**不在 git 裡**的資料夾執行（三個 OS 相同）：

   ```
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   會問密碼與姓名／組織（隨意填但要記得）。JDK 21 預設是 PKCS12 格式，**金鑰密碼＝金鑰庫密碼**（它會提醒不支援不同密碼），所以兩個密碼 Secret 填同一個值。
3. 轉成 base64 一行文字：
   - Linux：`base64 -w0 upload.jks > upload.jks.b64`
   - macOS：`base64 -i upload.jks | pbcopy`（已複製到剪貼簿）
   - Windows PowerShell：`[Convert]::ToBase64String([IO.File]::ReadAllBytes('upload.jks')) | Set-Clipboard`
4. GitHub → repo `chungtr9527/-` → Settings → Secrets and variables → Actions → New repository secret，建立四個：

   | Secret | 值 |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | 上一步的 base64 文字（一行，不能有換行） |
   | `ANDROID_KEYSTORE_PASSWORD` | 金鑰庫密碼 |
   | `ANDROID_KEY_ALIAS` | `upload` |
   | `ANDROID_KEY_PASSWORD` | 與金鑰庫密碼相同 |

5. `upload.jks` 與密碼存進密碼管理器（兩個地方）。**絕不 commit**（`.gitignore` 已擋 `*.jks`）。遺失時要到 Play Console → 應用程式完整性 → 申請重設上傳金鑰，會卡幾天。
6. 驗證：之後打 tag（§4）跑 `sandslide-android-release` workflow，產物檔名**沒有** `-unsigned` 就代表簽章成功。

### 0.7 其他今天能做的

- **公開開發者名稱與聯絡信箱**：給我之後會寫進 `www/js/config.js`（`DEVELOPER_NAME`、`CONTACT_EMAIL`）與 `www/privacy.html`（`{{DEVELOPER_NAME}}`、`{{CONTACT_EMAIL}}`）。這個信箱會公開在商店頁，建議開一個專用 Gmail。
- **商標檢查**：在 Google Play、Apple App Store（美國與台灣）搜尋「Sandslide」「流沙方塊」；USPTO（tmsearch.uspto.gov）查 `Sandslide` 第 9／41 類；台灣 TIPO 商標檢索系統（twtmsearch.tipo.gov.tw）查「流沙方塊」。看到同名的遊戲或註冊中的商標就告訴我，改名要在商店資訊建立前。中文標題永遠帶「方塊＋消除／益智」，任何地方都不寫「俄羅斯方塊」「Tetris」「Block Blast」。
- **手機**：至少一支 Android 實機（最好手勢導航與三鍵導航各一），開「安裝未知應用程式」以便側載 debug APK。

### 0.8 從 GitHub Actions 下載 debug APK（實機測試用；每次 push 都會自動產生）

1. GitHub → repo `chungtr9527/-` → 上方 **Actions** 分頁 → 左側 workflow 清單點 **`sandslide-android-debug`** → 點最新一筆**綠色勾勾**的 run（要先登入 GitHub 才下載得了）。
2. run 頁面最下方的 **Artifacts** 區塊 → 下載 **`sandslide-debug-<commit sha>`**（zip，保留 14 天）→ 解壓縮，裡面就是 `app-debug.apk`。
3. 把 `app-debug.apk` 傳到手機（USB、Google Drive、Nearby Share 或寄給自己）→ 在手機上點開；第一次要允許**安裝未知應用程式**（設定 → 應用程式 → 特殊應用程式存取權 → 安裝不明應用程式，對你點開檔案的那個 App 開啟）；Play Protect 要掃描就讓它掃。之後的版本會直接覆蓋安裝、保留存檔。細節與疑難排解見 `docs/android-notes.md` §6。
4. debug 版用的是 **Google 測試廣告 ID**（範例 App ID + 測試單元），廣告可以隨便點、不會產生無效流量；它**不是**封閉測試用的版本（那個是 §4 打 tag 後 release workflow 產出的 `.aab`，用正式 ID）。
5. 狀態：這個 workflow **前兩次執行都已成功**（原生依賴組合 AdMob plugin 8.3.0 / Kotlin 2.2 / play-services-ads 25.4 確認可編譯），之後每次 push 到 `sandslide/**` 都會再跑一次；失敗時 GitHub 會寄信通知。

---

## §1 AdMob ID 的貼入位置（兩處，缺一不可）

| 檔案 | 貼什麼 | 備註 |
|---|---|---|
| `android/app/src/main/res/values/strings.xml` | `<string name="admob_app_id">ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>` | 只改 `main`；`android/app/src/debug/res/values/strings.xml` 維持 Google 測試 App ID `ca-app-pub-3940256099942544~3347511713`，不要動 |
| `www/js/ads-ids.prod.js` | `android.banner` ← `sandslide_and_banner_bottom`、`android.interstitial` ← `sandslide_and_inter_gameover`、`android.rwRescue` ← `sandslide_and_rw_rescue`、`android.rwTilt` ← `sandslide_and_rw_tilt` | 格式 `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ`，保留單引號 |

注意事項：

- Release workflow 的閘門會 `grep -rEl '3940256099942544|REPLACE' www/js android/app/src/main/res/values/strings.xml`，**任何一個 REPLACE 都會讓建置失敗**。`ads-ids.prod.js` 的 `ios` 區塊目前也是 `REPLACE`：在做 iOS 之前，把 `ios` 四個值先填成與 Android 相同的 ID（Android 版永遠不會讀 `ios` 區塊），之後做 iOS 再換成真的。
- `www/js/ads-ids.test.js`（Google 範例單元）與 `build-flags.js` 不用手動改：`npm run flags:release` 會切到 `env:'prod'` 並移除測試 ID，workflow 自動執行；本機開發永遠維持 `npm run flags:dev` 的狀態再 commit。
- 貼完後在 repo 裡 `grep -rn REPLACE www/js android/app/src/main/res/values/strings.xml` 應該沒有任何輸出。
- 程式在 `TB.flags.env === 'prod'` 時才讀 `TB.ADS_IDS_PROD`；封閉測試與正式版都是 prod bits。

---

## §2 Play Console 申報清單（照這張表填）

| 區塊 | 答案 |
|---|---|
| 應用程式存取權（App access） | 所有功能不需登入、無限制 |
| 廣告（Ads） | **是**，含廣告 |
| 廣告 ID（Advertising ID） | **是**，使用廣告 ID（用途：廣告或行銷、分析）；AdMob SDK 會自動加上 `com.google.android.gms.permission.AD_ID` |
| 內容分級（IARC 問卷） | 類別「遊戲」；無暴力、無性相關、無賭博（無真錢、無模擬賭博）、無毒品；**含廣告**；無使用者互動、無分享位置、無數位購買 → 預期 **Everyone / PEGI 3** |
| 目標對象與內容 | 年齡層只勾 **13–15、16–17、18+**（**不勾 13 歲以下、不加入 Designed for Families**）；「是否可能無意間吸引兒童」答**否**，說明：抽象方塊、無角色或吉祥物、無卡通主題。若 Google 仍判定吸引兒童，告訴我，備案是 `tagForChildDirectedTreatment:true` + `maxAdContentRating:'General'` |
| 新聞應用程式 | 否 |
| COVID-19 接觸者追蹤／狀態 | 否 |
| 政府應用程式 | 否 |
| 金融功能 | 無 |
| 健康 | 無 |
| 資料安全（Data safety）總覽 | 是，會蒐集或分享必要資料類型；**所有資料傳輸加密：是**；**提供刪除資料的方式：否**（無帳號；說明：資料只存在裝置上，解除安裝即刪除，廣告 ID 可在 Android 設定重設） |
| 資料安全 — 裝置或其他 ID | 蒐集 ✔、分享 ✔（與 Google／AdMob）、非選填、用途：廣告或行銷 |
| 資料安全 — 應用程式活動 › 應用程式互動 | 蒐集 ✔、分享 ✔、用途：廣告或行銷、分析 |
| 資料安全 — 應用程式資訊與效能 › 當機記錄、診斷 | 蒐集 ✔、分享 ✔、用途：分析 |
| 資料安全 — 其他 | 填表前打開 Google「AdMob 的資料安全性指南」（support.google.com/admob/answer/10787282）核對 SDK 當下的清單（它可能還列「大概位置（由 IP 推算）」）；清單變了就照 Google 的填，並告訴我更新 privacy.html |
| 隱私權政策網址 | `https://chungtr9527.github.io/-/sandslide/www/privacy.html`（App 內「設定／說明」也連到同一頁） |
| 類別 | 遊戲 › 益智（Puzzle）；標籤從後台清單挑最多 5 個：益智、方塊、休閒、單人、離線 |
| 定價 | 免費（**不可逆**） |
| 國家／地區 | 封閉測試與正式初期：台灣（軟啟動 2 週，見 growth-playbook）→ 之後全部國家 |
| 商店資訊聯絡方式 | 電子郵件 = 公開信箱；網站 = `https://chungtr9527.github.io`（app-ads.txt 驗證用） |
| DSA 交易商身分 | 建立 App 時申報（見 0.1 第 3 點） |

AdMob 政策對照（程式已照做，審核被問時這樣答）：插頁只在結算畫面之後、玩家按下按鈕時才出現，絕不在啟動／關卡開始／每個動作；只有一個橫幅、不重疊內容、不在死路畫面、離可點元素 ≥24dp；獎勵影片每次都由玩家主動選擇，獎品是遊戲內救援或翻轉，不是金錢；開發者與測試者絕不自己點廣告。

---

## §3 商店素材規格

| 素材 | 規格 | 來源 |
|---|---|---|
| 應用程式圖示 | 512×512、32-bit PNG（可含 alpha）、≤1 MB | `docs/store/icon-512.png`（由 `scripts/make-store-assets.js` 產生） |
| 主題圖片（feature graphic） | 1024×500、JPEG 或 24-bit PNG、**不可含 alpha** | `docs/store/feature-1024x500.png` |
| 手機截圖 | 每種語言 2–8 張、1080×1920（9:16）、JPEG 或 24-bit PNG、每邊 320–3840 px | `docs/store/zh-TW/01–06.png`、`docs/store/en-US/01–06.png` |
| 7 吋／10 吋平板截圖 | 選填（最多各 8 張）；沒有的話 Play Console 只會警告 | 之後再補 |
| 宣傳影片 | 選填，YouTube 公開或不公開連結、不能有廣告 | `docs/growth-playbook.md` 的 15 秒影片可直接用 |

產生指令：`node scripts/make-store-assets.js --lang zh-TW` 與 `--lang en-US`（輸出到 `docs/store/<lang>/`）。六張截圖的標語（兩種語言）在 `docs/store-listing.md`。

上傳位置：Play Console → 商店發布 → 主要商店資訊；預設語言 **en-US**，再「新增翻譯」**zh-TW** 貼中文標題／說明／中文截圖。

---

## §4 時程（整體 4–6 週；以「第 0 週＝今天」計）

| 週 | 你做 | 我／CI 做 | 完成訊號 |
|---|---|---|---|
| 第 0 週 | §0 全部：Play Console 註冊、AdMob 帳號與 4 單元、user-site repo、金鑰與 Secrets、找測試者、商標、名稱與信箱 | 引擎、網頁版、Android 專案、廣告層 | Play 驗證通過；AdMob ID 已交給我；`app-ads.txt` 可打開 |
| 第 1 週 | 把填好名稱／信箱的 `privacy.html` 合併進 `main`；側載 debug APK 實機測試（手勢／三鍵導航各一支）；打 tag `v0.1.0` | release workflow → GitHub Release（`.aab` + `.apk`）；修實機問題 | `privacy.html` 網址回 200；Release 檔名無 `-unsigned` |
| 第 1 週末 | Play Console 建 App、填 §2、上傳 §3 素材、內部測試軌道先傳一次 `.aab`、再建封閉測試並推出；寄出 tester-guide + 加入連結 | 視需要出 `v0.1.x` 修正 | ≥12 人加入；Dashboard 進度條開始跑 |
| 第 2–3 週 | 封閉測試 14 天：每天看回饋表與當機；第 1、14 天收診斷資料 | 修 bug、出新 `.aab`（同一測試群組，不重算天數） | 第 14 天進度條滿 |
| 第 3 週末 | 申請正式版存取權（問卷） | 整理測試數據給你寫問卷 | Google 審核 ≤7 天 |
| 第 4 週 | 建立正式版（可用同一個 `.aab`）、國家先台灣、推出 | — | 商店頁可打開 |
| 第 4–5 週 | §5：AdMob 連結商店、app-ads.txt 驗證、AdMob App 審核（2–3 天）；開始 growth-playbook 第 1 天 | 看 Android vitals 與 stats | AdMob 顯示「已驗證」；廣告正常出現 |
| 第 5–6 週 | 台灣軟啟動 2 週看 D1/D7 代理指標 → 開全部國家 | 只調 `chargeGrowth` 或插頁 N（見 growth-playbook） | 全球上架 |

版本號規則：tag `vX.Y.Z` → `versionName X.Y.Z`、`versionCode = X×10000 + Y×100 + Z`。Play **每次上傳都要更大的 versionCode**，所以每次上傳都打新 tag（`git tag v0.1.1 && git push origin v0.1.1`），不要重用。

每次發版前的三個問題：`npm test` 綠？Release workflow 閘門全過（無 REPLACE、無測試 ID、AAB 內無 `.so`）？實機看過 banner 不蓋到按鈕、返回鍵、看廣告後不黑屏？

---

## §5 上架之後

1. **AdMob 連結商店**：AdMob → 應用程式 → Sandslide → 應用程式設定 → 應用程式商店 → 搜尋套件名稱 `io.github.chungtr9527.sandslide` → 連結。連結後 Google 會做 **AdMob App 審核（約 2–3 天）**，審核前廣告投放可能受限。
2. **app-ads.txt 驗證**：Play 商店頁「網站」= `https://chungtr9527.github.io` 之後，AdMob 會在 24 小時內抓 `https://chungtr9527.github.io/app-ads.txt`；在 AdMob → 應用程式 → 查看所有應用程式 → app-ads.txt 分頁看狀態；「未找到」就檢查網址與 publisher ID、按「重新檢查」。沒驗證通過會少掉一部分廣告需求。
3. **付款**：US$10 時收 PIN 信 → 輸入；設定付款方式；月底 ≥US$100 才付款。付款資料姓名若改動會重新驗證，少動。
4. **Play Console 日常**：回覆評論（尤其抱怨廣告的）、看 Android vitals（使用者感知當機率與 ANR 要低於 Play 的門檻，超過會被降低曝光）、政策狀態頁有通知就當天處理。每年 Google 會提高 target API 要求（目前 API 36），到時由我升版重出。
5. **資料安全要同步**：v1.1 若加 Firebase 等任何遙測，先改 Data safety 與 `privacy.html` 再發版。
6. **網頁版**：合併進 `main` 後確認 `https://chungtr9527.github.io/-/sandslide/www/` 與 `privacy.html` 回 200、瀏覽器 console 無錯誤、短網址 `https://chungtr9527.github.io/sandslide/?d=2026-11-01` 會帶著參數轉到遊戲。
7. **行銷**：接著走 `docs/growth-playbook.md`（15 秒影片、14 天排程、公平承諾 PR、軟啟動指標與唯一的調整旋鈕）。
