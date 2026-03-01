CREATE TABLE IF NOT EXISTS financial_report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,

  -- 營收與產值
  財報營收 REAL,
  產值統計 REAL,

  -- 變動成本
  原材料成本 REAL,
  委外加工 REAL,
  人工成本 REAL,
  變動製費 REAL,
  變動管銷研 REAL,

  -- 固定成本
  固定人工 REAL,
  廠房設備環境 REAL,

  -- 調整項目
  呆滯提列_報廢 REAL,
  模具利潤 REAL,
  在制半成品影響數 REAL,
  開關設備折舊 REAL,
  稅金附加 REAL,


  -- 營業利潤（財報）
  營業成本_財報 REAL,
  營業毛利 REAL,
  銷管研 REAL,
  財務收支 REAL,
  業外收支 REAL,
  庫存呆滯提列 REAL,
  庫存呆滯_財報 REAL,
  稅前淨利 REAL,

  -- 庫存周轉
  庫存周轉天數_原材料 REAL,
  庫存周轉天數_在制品 REAL,
  庫存周轉天數_成品 REAL,
  庫存周轉天數_模具 REAL,

  -- 主要產品平均單價（USD）
  NB機構件_塑膠 REAL,
  NB機構件_鋁皮 REAL,
  NB機構件_鎂鋁 REAL,
  NB機構件_鋁銑 REAL,
  NB機構件_塑膠2 REAL,
  一體機_五金 REAL,
  桌機_塑膠 REAL,
  桌機_五金 REAL,
  服務器_塑膠 REAL,
  服務器_五金 REAL,
  通訊通信設備_塑膠 REAL,
  通訊通信設備_五金 REAL,
  集線器_塑膠 REAL,
  電話機_塑膠 REAL,
  切板板 REAL,
  鈑金 REAL,
  汽車件 REAL,
  電動車 REAL,
  受託加工 REAL,

  -- 損益與資產指標
  淨利潤 REAL,
  流動資產 REAL,
  固定資產_平均 REAL,
  股東權益_平均 REAL,
  總資產_年平均 REAL,

  created_at TEXT DEFAULT (datetime('now'))
);
