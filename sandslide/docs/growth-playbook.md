# Sandslide 流沙方塊 — 成長作戰手冊

沒有買量預算。能靠的只有三件事：**一支 15 秒影片**（讓人看懂「翻轉」）、**分享迴圈**（每日流沙的成績卡）、**公平承諾**（讓媒體與社群有話題）。這份文件把三件事變成可以照表操課的動作，最後是軟啟動的指標與唯一允許動的旋鈕。

---

## 1. 15 秒影片腳本（9:16、1080×1920、原音、一鏡到底的實機錄影）

原則：第 1 秒就是「死局」，第 2 秒就翻轉。不配樂，遊戲的 whoosh／thud／和弦就是音效。字卡用 CapCut 或剪映燒進畫面，字體粗、置中、兩行以內；影片**不加 logo 到最後**。

| 時間 | 畫面 | 字卡（zh-TW） | 字卡（en） | 聲音 | 備註 |
|---|---|---|---|---|---|
| 0.0–1.5 s | 碎裂的棋盤，三個方塊都放不下、在托盤抖動；箭頭 ▼5 亮著 | Block Blast 但你可以翻轉棋盤 | Block Blast, but you can tilt the board | 方塊 denied 的悶響 | 這張字卡只用在社群影片，**不進商店、不進 App**；要投付費廣告時換成「卡住了？翻轉它。／Stuck? Tilt it.」 |
| 1.5–4.0 s | 手指往下一滑，全部方塊傾瀉落下、依欄壓扁 | （無字卡，讓動畫說話） | — | whoosh → thud、落地震動 | 手指要入鏡，觀眾才懂是「滑棋盤」不是「放方塊」 |
| 4.0–6.0 s | 五條線由牆側 pop 消除，橫幅「流沙 ×5！」 | 流沙 ×5！ | SANDSLIDE ×5! | 大三和弦 | 橫幅本身就是字卡，不要再疊字 |
| 6.0–9.0 s | 再放一塊、往左一滑，整個棋盤清空，「全清 +500」彩紙 | 再翻一次，全清。 | Tilt again. Board clear. | whoosh、allClear 和弦 | 兩次翻轉中間一定要放一塊（連翻第二次必消 0 線，這是規則） |
| 9.0–12.0 s | 切到每日流沙成績卡（分享卡 1080×1350 置中） | Daily #12 · 14,230 — 你能贏我嗎？ | Daily #12 · 14,230 — Beat my score? | 新紀錄號角 | 用真實的卡片截圖，分數不要 P |
| 12.0–15.0 s | 深藍底、程序化 icon、三行字、短網址 | 免費 · 沒有計時器 · 瀏覽器就能玩<br>chungtr9527.github.io/sandslide | Free · No timer · Plays in your browser<br>chungtr9527.github.io/sandslide | 安靜 | 最後一幀停 1 秒讓人截圖；平台支援連結就把短網址放在文案第一行 |

製作方法：

1. 用網頁版 dev 參數找一盤能一次消 5 線的局：`?seed=xxx` 換種子、`?nofx=1` 快轉到想要的狀態，記下種子與步數；然後在**手機**上用同一種子重玩（網頁版 `?seed=` 在 Android Chrome 也能用），用系統螢幕錄影錄 1080×1920、聲音開。
2. 錄兩個版本：中文字卡、英文字卡（同一段錄影，只換字卡）。另外輸出一支**無字卡**版給媒體。
3. 封面（cover）用第 4–6 秒「流沙 ×5！」那一幀。
4. 檔名：`sandslide-15s-zh.mp4`、`sandslide-15s-en.mp4`、`sandslide-15s-clean.mp4`；上傳前確認 ≤15 s、30 fps、H.264。

---

## 2. 14 天發文排程

平台規則先讀。短影音（TikTok／Shorts／Reels）**每天 1 支**；Threads 每天 1 則文字；論壇（Dcard、PTT、巴哈）**只在第 1、2、7、14 天**各發一篇，其餘時間只回留言——論壇每天貼就是洗版，會被檢舉。所有貼文第一行放短網址 `https://chungtr9527.github.io/sandslide/`（瀏覽器就能玩，降低門檻），Play 連結放第二行。

### 2.1 平台寫法

| 平台 | 語言 | 格式 | 注意 |
|---|---|---|---|
| TikTok | zh-TW 帳號 + en 帳號各一（或同帳號雙語） | 影片 + 1 行文案 + 3–5 個 hashtag | 前 3 秒決定一切；回覆每一則留言；hashtag：#流沙方塊 #方塊遊戲 #益智遊戲 #Sandslide #blockpuzzle #puzzlegame #indiegame |
| YouTube Shorts | 同上 | 標題 ≤100 字元（含 #Shorts）+ 說明放連結 | 標題直接寫結果：「一次翻轉消 5 線」；說明第一行短網址 |
| Instagram Reels | 同上 | 影片 + 文案 + hashtag ≤10 | 封面要有大字；連結只能放 bio，文案寫「連結在個人檔案」 |
| Threads | zh-TW 為主 | 純文字 1–3 句 + 截圖或影片 | 對話口吻、問問題；可直接貼連結 |
| Dcard（遊戲板） | zh-TW | 標題 + 300–600 字 + 3 張圖/影片 | 標明「我是開發者」；講故事（為什麼做公平承諾），不要像廣告；先讀板規是否允許自製遊戲分享 |
| PTT | zh-TW | 依板規用標題分類（例如 Android 板 `[軟體]`、GameDesign 板 `[心得]`、MobileComm `[App]`） | 文長但資訊密；附網頁版連結讓不裝 App 的人也能試；版規不允許推廣就不要貼；用推文回應，不要自推 |
| 巴哈姆特（哈啦區：手機遊戲綜合討論、獨立遊戲開發者相關板） | zh-TW | 標題 + 圖文 | 巴哈喜歡開發心路；附「開發中」標籤；回每一樓 |

### 2.2 每日內容

| 天 | 主題 | 素材 | 短影音文案（zh-TW） | 短影音文案（en） | Threads（zh-TW） | 論壇 |
|---|---|---|---|---|---|---|
| 1 | 主影片：卡住了？翻轉它 | 15 秒影片 | 卡住了？翻轉它。方塊像流沙一樣滑落，一次消 5 線。免費、沒有計時器、瀏覽器就能玩 👉 第一行連結 | Stuck? Tilt it. Blocks slide like sand, 5 lines in one move. Free, no timer, plays in your browser 👉 link | 做了一款方塊遊戲，唯一的新規則：棋盤可以翻。翻下去全部方塊會像沙子一樣滑落。你們覺得這個動作該叫「翻轉」還是「倒」？ | **Dcard／PTT／巴哈第 1 篇**：「我做了一款可以翻轉棋盤的方塊消除遊戲（免費、無計時器、公平亂數）」— 開發者自介、1 支影片、2 張截圖、網頁版與 Play 連結、徵回饋 |
| 2 | 公平承諾 | 說明頁截圖（公平承諾段落）+ 10 秒「同一種子兩次開局手牌一樣」的錄影 | 這款遊戲不會因為你快破紀錄就發死牌：固定種子，方塊只來自那個序列，分數跟廣告都改變不了。規則寫在遊戲裡，不信你比對兩局。 | This game never deals you a bad hand because you're about to beat your record: fixed seed, pieces come only from that sequence. It's written in the help screen. | 最近大家在討論某些消除遊戲會「看你快破紀錄就發爛牌」。我們的做法：固定隨機種子，同一題全世界一樣，規則公開寫在說明頁。你會在意這件事嗎？ | **第 2 篇（公平承諾專文）**：見 §3 的角度；附規則原文與每日流沙驗證方法 |
| 3 | 每日流沙開張 | 今日成績卡 | 每日流沙：全世界同一題、20 手牌、每天一次正式成績。今天 #N 我拿 X 分，你呢？ | Daily Slide: same 20 hands for everyone, one official score a day. Daily #N, I got X. You? | 今天的每日流沙 #N，我 X 分。截圖貼上來，看誰翻得漂亮。 | 回留言 |
| 4 | 翻轉三事實 ① | 10 秒：往上翻與往下翻消同樣多線 | 冷知識：往上翻跟往下翻永遠消一樣多線，差別只在方塊最後堆哪一邊。所以選方向是在幫下一手牌留位置。 | Fact: tilting up and down always clears the same number of lines; only the side the pile ends up on differs. Pick the side that fits your next pieces. | 翻轉冷知識 1/3：上下消的線數永遠相同。知道之後你會怎麼選？ | 回留言 |
| 5 | 翻轉三事實 ② | 10 秒：連翻兩次第二次 0 線 | 連續翻兩次（中間不放方塊），第二次一定消 0 線。翻完先放一塊再翻，才不浪費。 | Two tilts in a row with nothing placed in between: the second one always clears 0 lines. Place first, then tilt again. | 翻轉冷知識 2/3：連翻第二次必定 0 線。這是物理不是 bug。 | 回留言 |
| 6 | 翻轉三事實 ③ | 10 秒：0 線翻轉救卡死棋盤 | 消 0 線的翻轉也會把所有空隙壓掉。棋盤碎到放不下時，先翻再說。 | A 0-line tilt still removes every gap. When the board is shattered, tilt first, think later. | 翻轉冷知識 3/3：0 線翻轉常常是對的。你有被它救過嗎？ | 回留言 |
| 7 | 第一週每日流沙擂台 | 一週 7 張成績卡拼圖 | 第一週每日流沙結算：最高分 X、最大翻轉 Y 線。下週挑戰：單次翻轉 5 線。 | Week 1 of Daily Slide: top score X, biggest tilt Y lines. Next week's challenge: 5 lines in one tilt. | 第一週結束，貼出你最漂亮的一次翻轉。 | **第 3 篇（擂台文）**：Dcard／巴哈開「每日流沙成績樓」，一週回一次 |
| 8 | 最難的一天 | 當日死局錄影 | 今天的每日流沙 #N 特別壞，20 手到第 14 手就卡。你撐到第幾手？ | Today's Daily #N is nasty — I got stuck on hand 14 of 20. How far did you get? | 今天這題誰過了？說一下第幾手卡的。 | 回留言 |
| 9 | 沒有計時器 | 10 秒慢慢想的畫面 | 沒有計時器。想三分鐘再翻也可以。睡前玩一局不會心跳加速。 | No timer. Think for three minutes before you tilt. A bedtime game that doesn't spike your pulse. | 你們睡前會玩什麼不會讓人焦慮的遊戲？我做了一款沒有計時器的。 | 回留言 |
| 10 | 離線：捷運上 | 10 秒捷運／公車實拍（飛航模式） | 飛航模式照玩，每一步自動存檔。捷運進隧道也不會斷。 | Works in airplane mode, saves after every move. Tunnels don't matter. | 通勤族：這款離線可玩、每步存檔。你的通勤遊戲是什麼？ | 回留言 |
| 11 | 問大家下一步 | 投票圖：禪模式／岩石模式／手作關卡 | 下一個模式你想要哪個：Zen（無限翻轉不計分）、Rocks（不能移動的岩石，真正的連鎖）、手作關卡？ | Which mode next: Zen (unlimited tilts, no score), Rocks (immovable rocks, real chains) or handmade levels? | 投票：禪模式、岩石模式、手作關卡，選一個。 | 回留言、把票數記下來 |
| 12 | 單次翻轉 7 線挑戰 | 7 線翻轉錄影（最大值） | 單次翻轉的上限是 7 線，這是我目前做到的。誰能貼出 7 線？ | The max is 7 lines in one tilt. Here's mine. Can you post a 7? | 翻轉 7 線達成。你最高幾線？ | 回留言 |
| 13 | 配色解鎖 | 7 組配色輪播 | 最高分 1,000／2,500／5,000／10,000 與遊玩第 7／30 天會解鎖新配色。你解到第幾組？ | Palettes unlock at 1,000 / 2,500 / 5,000 / 10,000 points and on play day 7 / 30. Which one are you on? | 7 組配色，你最喜歡哪一組？（附圖） | 回留言 |
| 14 | 兩週回顧 + 感謝 | 數據圖（下載、Daily 參與、最高分） | 兩週了：X 次下載、每日流沙 Y 人完成、最高分 Z。謝謝每一個留言的人。下一步：看投票結果決定。 | Two weeks in: X installs, Y Daily finishers, top score Z. Thank you. Next: whatever the poll says. | 兩週回顧 + 下一步。還有什麼想要的功能？ | **第 4 篇（回顧文）**：數據、改了什麼、感謝、下一步 |

備註：文案裡的 X／Y／Z／#N 用真實數字，不誇大。留言裡有人問「跟 ○○ 有什麼不一樣」就回「可以翻轉、固定種子、沒有計時器」三點，不評論別人的遊戲。

---

## 3. 公平承諾的 PR 角度

**為什麼有話題**：2026 年 10 月社群與開發者反編譯指出，某些爆紅消除遊戲會在玩家快破紀錄時由伺服器下發「特徵」調整發牌、依廣告價值調難度，玩家評論第一大抱怨就是「被操控」與廣告太多。我們不點名，只講自己：

1. **固定種子**：每一局從一個隨機種子開始，方塊只來自那個序列。分數、連勝、最高分、廣告都改變不了它。
2. **可驗證**：每日流沙全世界同一題（種子 = `sandslide-daily-日期`），兩支手機對照第 N 手牌就能驗證；網頁版 `?seed=` 參數也公開。
3. **唯一例外寫在說明頁**：三個方塊都放不下且沒有存翻轉時，靜默重抽最多 3 次。連例外都公開。
4. **廣告有節制**：插頁只在結算之後、每局最多一次獎勵影片、教學與第一局沒有 banner。

**媒體與社群名單（依序寄，附無字卡影片、3 張截圖、網頁版連結、Play 連結、公平承諾原文）**：

| 對象 | 語言 | 切入點 |
|---|---|---|
| 巴哈 GNN、4Gamers、遊戲基地、電獺少女、INSIDE | zh-TW | 「台灣獨立開發者做了一款不發死牌的方塊遊戲」；提供開發者專訪 |
| Dcard 遊戲板、PTT GameDesign 板 | zh-TW | 開發心路 + 公平承諾的技術做法（子亂數 `rng(seed, handIndex)`） |
| Hacker News「Show HN」 | en | 標題：`Show HN: Sandslide – a block puzzle where you tilt the board (seeded RNG, plays in the browser)`；HN 看重「瀏覽器就能玩、無 bundler、公開規則」 |
| r/AndroidGaming、r/puzzlevideogames、r/incremental_games（視板規） | en | 「No rigged hands: fixed seed, rules in the help screen」；附影片 |
| PocketGamer、TouchArcade、Android Police（投稿信箱） | en | 「A block puzzle that answers the rigged-RNG controversy with a fair-play promise」 |

**寄給媒體的 100 字版本（zh-TW）**：
> 《流沙方塊 Sandslide》是台灣獨立開發的方塊消除遊戲，唯一的新規則是「翻轉」：滑動棋盤，所有方塊像流沙一樣倒向那一邊，排滿的線一次消除。它做了一個公平承諾：固定隨機種子、方塊只來自那個序列，分數或廣告都改變不了發牌，唯一例外公開寫在說明頁。免費、沒有計時器、離線可玩，瀏覽器也能直接玩。

**English one-liner**:
> Sandslide is a block puzzle with one new move: tilt the board and every block slides like sand. It ships with a fair-play promise: a fixed random seed, pieces that come only from that sequence, and the single exception written in the help screen. Free, no timer, offline, and it runs in the browser.

---

## 4. 軟啟動（台灣 2 週）指標與決策規則

### 4.1 看哪裡

| 指標 | 來源 | 目標 |
|---|---|---|
| D1 留存（代理） | Play Console → 統計 → 使用者 → 回訪使用者／留存率（依安裝日群組） | **≥30%** |
| D7 留存（代理） | 同上 | **≥10%** |
| 廣告曝光趨勢 | AdMob → 報表 → 曝光（每天） | 與 DAU 同向成長；每 DAU 約 15–20 次 banner、~1 次插頁、1–1.5 次獎勵 |
| 一局長度 | 測試者與你自己的「複製診斷資料」裡的 `gameMs`（最近 50 局） | Classic 中位數 8–30 分鐘；沒有大量 >60 分鐘的局 |
| 翻轉使用 | 診斷資料 `tilts`、`tiltLinesHist` | 每局 2–5 次翻轉、≥70% 的翻轉消 ≥2 線 |
| 分享率 | 診斷資料 `sharesTapped / games`；社群上出現的成績卡數 | 每 10 局 ≥1 次分享 |
| 每日流沙完成率 | 診斷資料 `gamesByMode.daily`；社群貼出的卡片 | 每天 ≥30% 的 DAU 完成 Daily |
| 當機 | Play Console → Android vitals；診斷資料 `lastErrors` | 使用者感知當機率與 ANR 率低於 Play 的門檻 |
| 評論 | Play Console → 評分與評論 | 抱怨廣告的評論 <10%；任何「被操控／死牌」評論 = 0（有就回覆並附公平承諾） |

### 4.2 決策規則（兩週結束時只做一件事）

| 情況 | 動作 |
|---|---|
| D1 ≥30% 且 D7 ≥10% | 開全部國家；啟動英文帳號與 Show HN／Reddit；不改任何數值 |
| D1 20–30% | 問題在前 5 分鐘：看教學完成率（診斷 `events`）與第一局長度；修教學／第一局手感，一週後再量。**不動經濟數值** |
| D1 <20% | 核心循環問題：先看一局長度與翻轉次數再決定。局數多但每局 <5 分鐘且翻轉 <2 次 → `chargeGrowth` 15→**10**；局「永遠不結束」（大量 >60 分鐘或 >600 步）→ `chargeGrowth` 15→**20** |
| D7 <10% 但 D1 正常 | 續玩鉤子不夠：優先推每日流沙（通知在 v1.1 才有，所以先靠社群擂台樓）與配色解鎖的能見度 |
| 評論抱怨廣告 ≥10% 或 D2 之後解除安裝突增 | 插頁頻率 `everyNGameOvers` 3→**4**（唯一允許動的第二個數字），其他閘門不動 |
| 任何「發死牌」的評論 | 回覆引用公平承諾，並請對方提供種子與手牌序號；如果真的重現就是 bug，立刻修 |

一次只改一個數字，改完至少再量 2 週。改了什麼、為什麼、前後數字，記在 `docs/tuning.md`。

---

## 5. 唯一的調整旋鈕：`chargeGrowth`

位置：`www/js/config.js` → `RULES.classic.chargeGrowth`（第 k 次翻轉成本 = `60 + chargeGrowth × (k − 1)`）。只影響 Classic；Daily 固定 `chargeGrowth: 0`、成本 60、存量 3，**永遠不改**（全世界同一題，改了就不公平）。

| 值 | 第 1–5 次翻轉成本 | 模擬（一般玩家 eps 0.1，`docs/tuning.md`） | 什麼時候用 |
|---|---|---|---|
| **10** | 60 / 70 / 80 / 90 / 100 | 中位數 146 步 ≈ 12.2 分、7.8 次翻轉 | 真人比 bot 死得早、一局太短、翻轉太少 |
| **15（預設）** | 60 / 75 / 90 / 105 / 120 | 中位數 125 步 ≈ 10.4 分、6.2 次翻轉、88% 翻轉消 ≥2 線 | 上線值 |
| **20** | 60 / 80 / 100 / 120 / 140 | 中位數 113 步 ≈ 9.4 分、5.3 次翻轉 | 高手局永遠不結束、單局過長 |

政策：

1. 只在 10／15／20 之間選，不要試 12 或 18 之類的中間值（差異量不出來）。
2. 一次只動這一個數字（或 §4.2 的插頁 N，不同時動）。
3. 改值 = 發新版本（`versionCode` 變大），不做伺服器端遠端設定——沒有伺服器，也不該有「看玩家表現調難度」的任何機制，這是公平承諾的一部分。
4. 不另外公告，但 `docs/tuning.md` 要記：日期、版本、舊值→新值、依據的數字。
5. 其他常數（`baseCharge`、`storedCap`、`energyPerCell`、`energyPerLine`、`startEnergy`、計分表、牌庫權重）一律不動；模擬已證明它們不是有效槓桿，動了只會讓前後數據無法比較。
