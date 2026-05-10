# 🎮 StandQuest Demo - 開發紀錄與專案說明

這是一個基於 Socket.io 的多人即時互動問答遊戲原型，設計概念類似「糖豆人」，玩家可以在地圖上自由移動並在指定時間內跑向正確答案區域。

## 🚀 如何啟動遊戲

1. **安裝依賴**：
   ```bash
   npm install
   ```
2. **啟動伺服器**：
   ```bash
   npm start
   ```
3. **開啟遊戲**：
   在瀏覽器中開啟 `http://localhost:3000`。

## 🎮 遊戲機制

- **目標**：根據螢幕上方顯示的問題，移動到你的角色跑向代表正確答案的區域（Zone A、B 或 C）。
- **操作方式**：
    - **PC**：使用 `WASD` 或 `方向鍵` 控制移動。
    - **手機/平板**：使用螢幕左下角的**虛擬搖桿**移動。
- **遊戲流程**：
    1. **LOBBY**：進入遊戲後在等候區閒逛，等待主持人（GM）開始。
    2. **QUESTION**：GM 按下「下一題」後，螢幕顯示題目與倒數計時。你需要在時間內跑到正確區域。
    3. **FREEZING**：時間結束，系統判定分數。答對者加分，答錯者無分。
    4. **結果揭曉**：短暫顯示結果後，自動進入下一題或回到 LOBBY。

## 📝 如何新增或修改題目

題目存放在 `data/questions.json` 檔案中。你可以使用任何文字編輯器（如 VS Code）開啟並修改。

**題目格式範例**：
```json
{
  "id": "unique_id",
  "questionText": "這裡輸入問題內容",
  "options": ["選項 A", "選項 B", "選項 C"],
  "correctIndex": 0, 
  "timeLimit": 15
}
```

**欄位說明**：
- `questionText`: 顯示在螢幕上的問題。
- `options`: 選項陣列（對應下方的 Zone A, B, C）。
- `correctIndex`: 正確答案的索引值（0 代表 Zone A, 1 代表 Zone B, 2 代表 Zone C）。
- `timeLimit`: 倒數秒數。

## 🚀 目前開發進度 (As of May 2026)

### ✅ 已完成功能
- [x] **多端連線機制**：支援 Web 端與行動裝置連線，透過 Socket.io 實現即時同步。
- [x] **雙模式移動系統**：
    - **PC 端**：支援 WASD 與 方向鍵控制。
    - **手機端**：內建**虛擬搖桿 (Joystick)**，自動偵測觸控裝置並顯示。
- [x] **遊戲流程邏輯**：
    - `LOBBY` 階段：玩家自由閒逛、等待 GM 開始。
    - `QUESTION_ACTIVE` 階段：GM 觸發題目，玩家必須在 15 秒內跑向正確的 A/B/C 區域。
    - `FREEZING` 階段：時間到後強制凍結移動，進行分數統計並顯示結果。
- [x] **視覺化答題區域**：地圖下方自動生成三個彩色半透明區域 (Zone A, B, C)，包含邊框與標籤。
- [x] **GM 控制介面**：提供 API 端點 (`/api/game/next`) 供管理員手動觸發下一題。

### 🚧 開發中功能 (Upcoming)
- [ ] **GM 管理網頁**：建立一個簡單的 UI 介面，讓 GM 可以透過按鈕控制遊戲（下一個任務）。
- [ ] **排行榜系統**：在畫面上顯示目前玩家的即時得分排名。
- [ ] **地圖擴充**：增加更多障礙物或動態地形。

## 🛠️ 技術堆疊 (Tech Stack)
- **Frontend**: HTML5 Canvas, JavaScript (ES6+), Socket.io Client.
- **Backend**: Node.js, Express, Socket.io Server.
- **Deployment**: Render (Auto-deploy via GitHub).

## 🕹️ 遊戲玩法說明
1. **加入遊戲**：玩家輸入暱稱並點擊「開始遊戲」。
2. **等待指令**：在 LOBBY 階段，玩家可在地圖上自由走動。
3. **搶答挑戰**：當 GM 啟動題目時，螢幕上方會出現問題與倒數計時。玩家必須迅速跑向代表正確答案的彩色區域（例如：若答案是 B，則需站在 Zone B）。
4. **勝負判定**：時間結束後，留在正確區域的玩家將獲得加分，並在下一題開始前看到統計結果。

## 📂 專案結構說明
- `server.js`: 後端核心邏輯（遊戲狀態、Socket 事件處理、API 端點）。
- `public/game.js`: 前端遊戲循環（Update/Draw）、輸入控制與 Socket 接收。
- `public/index.html`: 遊戲主入口與 UI 介面。
- `data/questions.json`: 題目資料庫，可隨時擴充題庫。

---
*Last updated: 2026-05-03*
