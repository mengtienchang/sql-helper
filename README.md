# 智能財報助手

桌面端財務報表分析工具，支援 Excel 匯入匯出、SQL 查詢、AI 自然語言問答、自訂儀表板。

基於 Electron + Vue 3 + TypeScript + sql.js 構建，資料完全離線儲存，無需安裝資料庫。

---

## 功能一覽

### 儀表板
- 5 組預設儀表板：綜合總覽、獲利分析、成本分析、營運效率、報酬率追蹤
- KPI 卡片搭配門檻指標（良好 / 注意 / 異常）
- ECharts 圖表：折線圖、柱狀圖、堆疊圖
- 支援自訂儀表板，自由組合圖表與指標

### 資料表瀏覽
- 列出資料庫中所有表格
- 點擊即可預覽表格內容
- 結果支援一鍵匯出 Excel

### SQL 查詢
- 內建 SQL 編輯器，直接撰寫查詢語句
- 即時顯示查詢結果，支援匯出 Excel
- 僅允許 SELECT 查詢，確保資料安全

### Excel 匯入
- 上傳 `.xlsx` / `.xls` 檔案，自動解析欄位
- 預覽資料後匯入至指定資料表

### Excel 匯出（模板系統）
- **簡單匯出**：任何查詢結果都可一鍵匯出 Excel
- **模板匯出**：上傳帶佔位符的 Excel 模板，系統自動填入資料

佔位符語法：

| 佔位符 | 說明 | 範例 |
|--------|------|------|
| `{{SQL:...}}` | 執行 SQL，將結果值填入儲存格 | `{{SQL:SELECT SUM(財報營收) FROM financial_report WHERE period='2024Q1'}}` |
| `{{VAR:名稱}}` | 匯出時讓使用者手動填入 | `{{VAR:期別}}` |
| `{{TABLE:...}}` | 執行 SQL，結果展開為多行 | `{{TABLE:SELECT period, SUM(財報營收) FROM financial_report GROUP BY period}}` |

### AI 助手
- 右下角聊天按鈕開啟
- 用自然語言提問，AI 自動生成 SQL 查詢並回傳結果
- 支援多輪對話，自動記錄歷史
- 使用 DeepSeek API（需在設定頁填入 API Key）

### 管理
- 自訂儀表板佈局：新增 / 編輯 / 刪除儀表板
- 管理圖表：設定 SQL、圖表類型、X/Y 軸欄位
- 管理指標：設定 SQL、單位、門檻判斷

### 設定
- 深色 / 淺色主題切換
- DeepSeek API Key 設定
- 產生範例數據（一鍵 Seed）

### 使用教程
- 首次開啟自動顯示導覽
- 灰屏高亮逐步引導，介紹各功能區域
- 隨時從側欄底部「使用教程」重新啟動

---

## 快速開始

### 環境需求
- Node.js >= 18
- npm >= 9

### 安裝與開發

```bash
# 安裝依賴
npm install

# 開發模式（熱更新）
npm run dev

# 首次使用，點擊設定頁的「產生範例數據」初始化資料
```

### 打包

```bash
# TypeScript 檢查 + Vite 建置
npm run build

# 打包 Windows 安裝檔（需 Wine，WSL/macOS）
npm run pack

# 打包 Windows 免安裝版（不需 Wine）
npm run pack:dir
```

打包完成後：
- 安裝檔：`release/智能財報助手 Setup 0.1.0.exe`
- 免安裝版：`release/win-unpacked/智能財報助手.exe`

---

## 技術架構

```
sql-helper/
├── database/
│   ├── migrations/       # SQL migration 檔案（001 ~ 008）
│   ├── service.ts        # DatabaseService（sql.js 封裝）
│   └── sql.js.d.ts       # sql.js 型別宣告
├── electron/
│   ├── main/index.ts     # Electron 主程序（IPC handlers）
│   └── preload/index.ts  # Preload（contextBridge API）
├── src/
│   ├── App.vue           # 主佈局（側欄 + 路由）
│   ├── components/
│   │   ├── DashboardView.vue   # 儀表板（KPI + 圖表）
│   │   ├── TablesView.vue      # 資料表瀏覽
│   │   ├── QueryView.vue       # SQL 查詢編輯器
│   │   ├── ImportView.vue      # Excel 匯入
│   │   ├── ExportView.vue      # 匯出模板管理
│   │   ├── ExportDialog.vue    # 匯出變數填寫對話框
│   │   ├── ManageView.vue      # 管理（儀表板/圖表/指標）
│   │   ├── SettingsView.vue    # 設定
│   │   ├── ChatPanel.vue       # AI 聊天面板
│   │   ├── GuidedTour.vue      # 使用教程導覽
│   │   ├── ResultsTable.vue    # 查詢結果表格（含匯出）
│   │   └── ...                 # 表單元件
│   └── composables/
│       ├── useTheme.ts         # 深色/淺色主題
│       └── useChartRenderer.ts # ECharts 渲染
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### 核心技術
- **Electron** — 桌面應用框架
- **Vue 3** + Composition API — 前端 UI
- **TypeScript** — 型別安全
- **sql.js** — 純 JS 的 SQLite（無需安裝原生依賴）
- **ECharts** (vue-echarts) — 圖表視覺化
- **SheetJS (xlsx)** — Excel 讀寫
- **DeepSeek API** — AI 自然語言查詢

### 資料流

```
Excel 檔案 → ImportView → sql.js (SQLite) → DashboardView / QueryView → Excel 匯出
                                  ↑                                         ↓
                            ChatPanel (AI)                          ExportView (模板)
                            自然語言 → SQL                          佔位符 → SQL → Excel
```

---

## 資料庫 Migration

| 檔案 | 說明 |
|------|------|
| 001 | financial_report — 財務報表主表 |
| 002 | factory — 廠區 |
| 003 | metric — 統計指標 |
| 004 | chart — 圖表定義 |
| 005 | dashboard + dashboard_item — 儀表板佈局 |
| 006 | chat_session + chat_message — AI 聊天記錄 |
| 007 | metric 加入 unit, thresholds 欄位 |
| 008 | export_template — 匯出模板 |

Migration 會在應用啟動時自動執行，已執行的不會重複。

---

## 授權

MIT
