# Sandslide 流沙方塊 — Google Play 商店資訊

預設語言 **en-US**，再新增翻譯 **zh-TW**（Play Console → 主要商店資訊 → 管理翻譯 → 新增語言 → 繁體中文）。每個欄位的限制：標題 ≤30 字元、簡短說明 ≤80、完整說明 ≤4000、新功能 ≤500。下面每個欄位都放在 ```` ```text 欄位:語言 ```` 區塊裡，`test/unit/docs.test.js` 會自動檢查長度與禁用字。

## 1. 標題（≤30）

```text title:en-US
Sandslide: Block Puzzle
```

```text title:zh-TW
流沙方塊：傾斜方塊消除益智
```

## 2. 簡短說明（≤80）

```text short:en-US
Tilt the board, blocks slide like sand, lines clear. Fair, offline, no timer.
```

```text short:zh-TW
滑動翻轉棋盤，方塊像流沙般滑落，整行整列一次消除。公平、離線、沒有計時器。
```

## 3. 完整說明（≤4000；純文字，用 • 條列，不用 HTML）

結構順序固定：鉤子 → 翻轉機制 → 公平承諾 → 沒有計時器 → 離線 → 每日流沙 → 免費與其他 → 收尾口號。

```text full:en-US
Stuck? Tilt it.

Sandslide is a block puzzle with one new move: when the board gets messy, swipe it and every block slides to that side like sand. Lines that fill up on the way clear in one go.

HOW IT PLAYS
• Drag the three pieces onto the 8×8 board. Fill a whole row or column to clear it.
• Every block you place fills the Tilt meter. When it's full, swipe the board — up, down, left or right.
• The arrows tell you exactly what a tilt will do: ▼2 means tilting down clears 2 lines, ✓ means one of your pieces will fit afterwards. No guessing.
• Clear 2 or more lines in one tilt and you'll see it: SANDSLIDE ×2, ×3, ×5…
• Tilts are a resource. Each one costs a little more energy than the last, so the real game is deciding when to spend them and which way to tilt.

FAIR PLAY PROMISE
Every game starts from a fixed random seed, and the pieces you get come only from that sequence. Your score, your streak, your high score and ads never change which pieces appear. No hidden difficulty, no rigged hands. One exception, written in the in-game help: if none of the three pieces fits and you have no Tilt stored, the hand is silently redrawn up to 3 times.

NO TIMER
Take as long as you like. Sandslide is about thinking one tilt ahead, not tapping fast.

PLAYS OFFLINE
No account, no sign-in, no internet needed. Your game saves itself after every move, so you can pick it up on the bus or the train.

DAILY SLIDE
One puzzle a day, the same 20 hands for everyone in the world. Share your score card and see who tilts better. Keep your streak going — missing a day costs you nothing.

ALSO
• Classic endless mode with best score and personal records: biggest tilt, longest combo, board clears
• 7 board colour palettes to unlock
• Sound and vibration you can switch off, reduce-motion and large-text options, left-handed layout
• Free to play, supported by ads. Rewarded ads are always your choice.
• English and 繁體中文

Tilt the board. Blocks slide like sand.
```

```text full:zh-TW
卡住了？翻轉它。

《流沙方塊》是一款方塊消除益智遊戲，多了一個新動作：棋盤變得亂七八糟時，滑動棋盤，所有方塊就會像流沙一樣倒向那一邊，途中排滿的整行整列一次全部消除。

玩法
• 把三個方塊拖到 8×8 棋盤上，排滿一整行或一整列就消除。
• 每放一個方塊都會存「翻轉」能量，存滿後往上、下、左、右滑動棋盤。
• 箭頭會直接告訴你翻轉的結果：▼2 代表往下倒會消 2 條線，✓ 代表翻完後手上有方塊放得下。不用猜。
• 一次翻轉消 2 線以上，就會看到「流沙 ×2、×3、×5…」。
• 翻轉是資源：每一次的成本都比上一次高一點，所以真正的策略是「什麼時候翻、往哪邊翻」。

公平承諾
每一局都從固定的隨機種子開始，你拿到的方塊只來自這個序列。你的分數、連勝、最高分或廣告都不會改變出現的方塊。沒有暗中調整的難度，沒有故意發的死牌。唯一例外（就寫在遊戲的說明頁裡）：三個方塊都放不下、而且沒有存翻轉時，會靜默重抽最多 3 次。

沒有計時器
想多久都可以。《流沙方塊》比的是多想一步，不是手速。

離線可玩
不需要帳號、不用登入、沒有網路也能玩。每一步都會自動存檔，捷運上、等公車時隨時接著玩。

每日流沙
每天一題，全世界的人拿到同樣的 20 手牌。分享你的成績卡，看看誰翻得比較漂亮。連續天數不責備人，漏一天也不會扣你什麼。

還有
• 經典無盡模式，記錄最高分與個人紀錄：單次翻轉最多線、最長連擊、全清次數
• 7 組棋盤配色等你解鎖
• 音效、震動可以關；有減少動態效果、大字體、左手模式
• 免費遊玩，靠廣告支持；獎勵影片永遠由你自己決定要不要看
• 繁體中文、English

翻轉棋盤，方塊像流沙一樣滑落。
```

## 4. 新功能（版本資訊，≤500）

```text whatsnew:en-US
First release: Classic endless mode, Daily Slide (same 20 hands for everyone), a 20-second tutorial, fair seeded random pieces, offline play, English and Traditional Chinese.
```

```text whatsnew:zh-TW
首次發布：經典無盡模式、每日流沙（全世界同一題 20 手牌）、20 秒教學、公平的固定種子亂數、離線可玩，支援繁體中文與英文。
```

## 5. 關鍵字策略

Play 沒有獨立的關鍵字欄位；排名看**標題 > 簡短說明 > 完整說明**裡自然出現的詞，以及安裝、留存與評分。做法：

| 語言 | 主要詞（標題／簡短說明已含） | 次要詞（完整說明自然出現 1–3 次） | 不要做 |
|---|---|---|---|
| en-US | block puzzle、tilt、offline、no timer | relaxing、daily puzzle、fair、endless、sand、lines clear、brain | 堆疊關鍵字清單、重複同一詞超過 5 次、把競品名稱當關鍵字 |
| zh-TW | 方塊、消除、益智、離線、沒有計時器 | 拼圖、免費、翻轉、每日、連擊、休閒、腦力 | 「俄羅斯方塊」「Tetris」「Block Blast」等他人商標；「最好玩」「第一名」等無法證明的宣稱 |

- 標題不能有 emoji、全大寫、「free／best／#1／new」之類促銷字（Google Play 中繼資料政策），所以「免費」只放在完整說明。
- 完整說明前 3 行在商店頁未展開時就看得到：鉤子「卡住了？翻轉它。」必須在第一行。
- 每種語言的截圖標語要和說明用同一套詞（翻轉／Tilt、流沙／SANDSLIDE、每日流沙／Daily Slide）。

## 6. 六張截圖標語（1080×1920；`docs/store/<lang>/01–06.png`）

| # | 畫面 | zh-TW | en-US |
|---|---|---|---|
| 01 | 碎裂棋盤，箭頭亮著 ▼3 | 卡住了？翻轉它。 | Stuck? Tilt it. |
| 02 | 翻轉中，方塊滑落的中間幀 | 方塊像流沙一樣滑落 | Blocks slide like sand. |
| 03 | 「流沙 ×3！」橫幅 | 一次翻轉消 3 線：流沙 ×3！ | 3 lines in one Tilt: SANDSLIDE ×3! |
| 04 | 說明頁的公平承諾段落 | 公平亂數，絕不發死牌 | Fair random. Never rigged. |
| 05 | 一般遊玩畫面，HUD 無計時器 | 沒有計時器 · 離線可玩 | No timer. Plays offline. |
| 06 | 每日流沙分享卡 | 每日流沙，和朋友比分 | Daily Slide. Beat your friends. |

## 7. 分類、標籤、其他欄位

| 欄位 | 值 |
|---|---|
| 應用程式或遊戲 | 遊戲 |
| 類別 | 益智（Puzzle） |
| 標籤（最多 5 個，從 Play Console 固定清單挑；名稱以後台為準，優先順序如下） | 益智 Puzzle、方塊 Block、休閒 Casual、單人 Single player、離線 Offline |
| 內容分級 | Everyone / PEGI 3（IARC 問卷：含廣告，其餘皆無） |
| 定價 | 免費 |
| 聯絡電子郵件 | 公開信箱（`CONTACT_EMAIL`） |
| 網站 | `https://chungtr9527.github.io` |
| 隱私權政策 | `https://chungtr9527.github.io/-/sandslide/www/privacy.html` |
| 開發人員名稱 | `DEVELOPER_NAME`（與 Play Console 帳戶一致） |

## 8. 不能寫的東西

- **他人商標**：俄羅斯方塊、Tetris、Block Blast、Hungry Studio、Candy Crush、任何競品名稱；也不能寫「類似 ○○」「○○ 玩法」。Play 會下架，商標權人也會投訴。
- 標題／圖示／主題圖片裡的促銷字與符號：free、best、#1、new、top、download now、emoji、全大寫、驚嘆號堆疊、星星／排名圖。
- 「無廣告」「沒有廣告」——有廣告就不能這樣寫；只能說「獎勵影片自願」。
- 任何關於獎金、現金、抽獎的字眼（獎勵影片的獎品是遊戲內救援／翻轉）。
- 假評價、引用評分、「百萬下載」等未發生的數字；「Google Play」「Android」商標不能當作背書語氣（可以中性描述「Android 版」）。
- 截圖裡不能有別家 App 的畫面、真人臉孔、未授權字型／圖片；不要截到測試廣告（用沒有廣告的網頁版截圖）。
- 「iOS／App Store」字樣（Play 商店頁不能宣傳其他商店）。
- 「醫療／教育／兒童」相關承諾（我們的目標對象是 13 歲以上）。
- 說明最後不要放關鍵字列表或大量 hashtag。
