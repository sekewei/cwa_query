# 中央氣象署三十六小時天氣預報查詢 API 規格（Cloudflare Worker）

## 1. 背景

本 API 依據中央氣象署（CWA）開放資料 `F-C0032-001`（三十六小時天氣預報）設計，目標是讓前端或 Power Apps 傳入：

- 地點名稱，如 `臺北市`、`新北市`、`花蓮縣`

回傳該地點未來 36 小時（3 個 12 小時時段）的天氣現象、最高溫、最低溫、舒適度與降雨機率。

設計核心概念：

- 原始 JSON 為巢狀結構且包含 22 個縣市，體積大、不易在 Power Fx 中直接使用
- Worker 先抓取並攤平（flatten）為「地點 -> 3 時段陣列」的索引
- 每次請求只回傳單一地點的 3 筆資料
- CWA API Key 只存在 Worker Secret，不暴露給前端或 Power Apps 連接器

與七天天氣預報（`F-C0032-003`）的主要差異：

| 項目 | 七天（F-C0032-003） | 三十六小時（F-C0032-001） |
|------|---------------------|---------------------------|
| JSON 鍵名 | PascalCase（`Dataset`、`Location`） | 小寫（`dataset`、`location`） |
| 數值欄位 | `ElementValue` | `parameter`（物件） |
| 元素數量 | 3（Wx、MaxT、MinT） | 5（Wx、MaxT、MinT、CI、PoP） |
| 時段 | 7 × 24 小時 | 3 × 12 小時（共 36 小時） |
| 地點 | 25 個（混合區域/景點） | 22 個（全部為縣市） |
| 時區格式 | `+0800`（無冒號） | `+08:00`（有冒號） |

---

## 2. 資料來源

### 2.1 端點

```text
https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-C0032-001?Authorization={CWA_API_KEY}&format=JSON
```

`CWA_API_KEY` 以 Worker Secret 儲存，不寫入程式碼、規格或版本庫。

### 2.2 JSON 結構

```text
cwaopendata
 |- @xmlns, identifier, sender, sent, status, msgType, source, dataid, scope
    （訊息中繼資料，全部小寫鍵名）
 |- dataset
     |- datasetInfo
     |   |- datasetDescription   "三十六小時天氣預報"
     |   |- issueTime            預報發布時間（例：2026-11-01T17:00:00+08:00）
     |   |- update               最後更新時間
     |- location[]               陣列，22 個縣市
          |- locationName        地點名稱（例：臺北市、新北市）
          |- weatherElement[]    固定 5 個
               |- elementName    "Wx" | "MaxT" | "MinT" | "CI" | "PoP"
               |- time[]         3 筆，每 12 小時一筆
                    |- startTime, endTime
                    |- parameter  （物件，欄位依元素而異）
```

### 2.3 Parameter 內容

| elementName | parameter 結構 | 說明 |
|-------------|---------------|------|
| Wx | `{ "parameterName": "晴時多雲", "parameterValue": "2" }` | 天氣現象文字 + 代碼 |
| MaxT | `{ "parameterName": "26", "parameterUnit": "C" }` | 最高溫度（攝氏） |
| MinT | `{ "parameterName": "23", "parameterUnit": "C" }` | 最低溫度（攝氏） |
| CI | `{ "parameterName": "舒適" }` | 舒適度（無 parameterUnit） |
| PoP | `{ "parameterName": "20", "parameterUnit": "百分比" }` | 降雨機率（%） |

元素意義：

- **Wx** = 天氣現象（weather phenomenon）
- **MaxT** = 最高溫度（max temperature, °C）
- **MinT** = 最低溫度（min temperature, °C）
- **CI** = 舒適度（comfort index）
- **PoP** = 降雨機率（probability of precipitation, %）

### 2.4 地點清單

共 22 個縣市（已對照 CWA 即時 API 驗證，2026-11-01）：

| # | locationName | 分類 |
|---|--------------|------|
| 1 | 臺北市 | 直轄市 |
| 2 | 新北市 | 直轄市 |
| 3 | 桃園市 | 直轄市 |
| 4 | 臺中市 | 直轄市 |
| 5 | 臺南市 | 直轄市 |
| 6 | 高雄市 | 直轄市 |
| 7 | 基隆市 | 直轄市 |
| 8 | 新竹縣 | 縣 |
| 9 | 新竹市 | 市 |
| 10 | 苗栗縣 | 縣 |
| 11 | 彰化縣 | 縣 |
| 12 | 南投縣 | 縣 |
| 13 | 雲林縣 | 縣 |
| 14 | 嘉義縣 | 縣 |
| 15 | 嘉義市 | 市 |
| 16 | 屏東縣 | 縣 |
| 17 | 宜蘭縣 | 縣 |
| 18 | 花蓮縣 | 縣 |
| 19 | 臺東縣 | 縣 |
| 20 | 澎湖縣 | 縣 |
| 21 | 金門縣 | 縣 |
| 22 | 連江縣 | 縣 |

注意：

- 本資料集（F-C0032-001）涵蓋全部 22 個縣市，與 F-C0032-003（七天）的 25 個混合區域/景點不同
- 名稱需完全一致才能查詢成功
- 地點清單以實際資料為準，由 `/api/36hour/locations` 動態提供，不在程式內寫死

### 2.5 時段結構

每個元素有 3 個 `time` 條目，共覆蓋 36 小時：

| 時段 | 時間範圍 | 說明 |
|------|----------|------|
| 1 | 發布時間（例 18:00）→ 次日 06:00 | 12 小時 |
| 2 | 06:00 → 18:00 | 12 小時 |
| 3 | 18:00 → 次日 06:00 | 12 小時 |

- 第一筆時段從預報發布時間起算，不是從午夜開始
- 時區格式為 `+08:00`（有冒號），與 F-C0032-003 的 `+0800` 不同
- 所有 22 個縣市的時段結構完全相同

### 2.6 資料特性

- 溫度與降雨機率為字串，需轉為數字
- Wx 的 `parameterValue` 為天氣代碼（字串），`parameterName` 為顯示文字
- CI 只有 `parameterName`（例：「舒適」、「悶熱」、「寒冷」），無 `parameterUnit`
- 五種元素的第 i 筆 `time` 對應同一個 12 小時時段
- 資料集由 CWA 約每 3 小時更新一次

---

## 3. API 端點

本資料集使用 `/api/36hour/` 路徑前綴，與七天預報（`/api/7day/`）共用同一 Worker 與同一部署網址。

### 3.1 查詢單一地點預報

```http
GET /api/36hour/forecast?location=臺北市
```
https://cwa-forecast.sekewei.workers.dev/api/36hour/locations?location=%E8%87%BA%E5%8C%97%E5%B8%82

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `location` | string | 是 | 地點名稱，需 URL 編碼 |

### 3.2 取得地點清單

```http
GET /api/36hour/locations
```
https://cwa-forecast.sekewei.workers.dev/api/36hour/locations
回傳所有可查詢的地點名稱，供 Power Apps 下拉選單使用。

---

## 4. Worker 初始化與快取

預報約每 3 小時更新一次，因此上游資料快取即可，不需每次請求都呼叫 CWA。

### 4.1 流程

1. 以 `CWA_API_KEY` 取得 `F-C0032-001` JSON
2. 解析 `dataset.location[]`
3. 對每個地點依 `elementName` 找出五個元素，依索引合併為 `periods[]`
4. 建立 `locationIndex: Map<locationName, Period[]>`
5. 記錄 `issuedAt`（`issueTime`）與 `updatedAt`（`update`）
6. 結果存入 isolate 記憶體，並以 Cache API 或 `cf.cacheTtl` 快取上游回應

### 4.2 攤平範例

```ts
type Period = {
  startTime: string
  endTime: string
  weather: string
  weatherCode: string
  maxT: number | null
  minT: number | null
  comfort: string
  pop: number | null
}

function flattenLocation(loc: any): Period[] {
  const pick = (name: string) =>
    loc.weatherElement.find((e: any) => e.elementName === name)?.time ?? []

  const wx = pick('Wx')
  const maxT = pick('MaxT')
  const minT = pick('MinT')
  const ci = pick('CI')
  const pop = pick('PoP')

  return wx.map((t: any, i: number) => ({
    startTime: t.startTime,
    endTime: t.endTime,
    weather: t.parameter.parameterName,
    weatherCode: t.parameter.parameterValue ?? '',
    maxT: toNumber(maxT[i]?.parameter?.parameterName),
    minT: toNumber(minT[i]?.parameter?.parameterName),
    comfort: ci[i]?.parameter?.parameterName ?? '',
    pop: toNumber(pop[i]?.parameter?.parameterName)
  }))
}
```

### 4.3 快取策略

| 資料 | 快取時間 | 說明 |
|------|----------|------|
| CWA 上游 JSON | 15 至 30 分鐘 | 預報約每 3 小時更新 |
| 攤平後索引 | 同上，隨上游更新重建 | 保存在 isolate 記憶體 |
| 上游失敗時 | 沿用舊快取 | 回應加上 `stale: true` |

---

## 5. 請求流程

1. 驗證 API Key header 與 `location` 參數
2. 確認上游快取有效，否則重新抓取並重建索引
3. 以 `locationIndex.get(location)` 取得 3 時段資料
4. 輸出回應

```text
Client / Power Apps
   ↓
Check x-api-key
   ↓
Validate location
   ↓
Load cached CWA data (refresh if expired)
   ↓
Lookup locationIndex[location]
   ↓
Return 36-hour forecast (3 periods)
```

---

## 6. 回應格式

### 6.1 成功回應（200 OK）

```json
{
  "location": "臺北市",
  "issuedAt": "2026-11-01T17:00:00+08:00",
  "updatedAt": "2026-11-01T16:33:01+08:00",
  "stale": false,
  "periods": [
    {
      "startTime": "2026-11-01T18:00:00+08:00",
      "endTime": "2026-11-02T06:00:00+08:00",
      "weather": "晴時多雲",
      "weatherCode": "2",
      "maxT": 26,
      "minT": 23,
      "comfort": "舒適",
      "pop": 20
    },
    {
      "startTime": "2026-11-02T06:00:00+08:00",
      "endTime": "2026-11-02T18:00:00+08:00",
      "weather": "多雲短暫雨",
      "weatherCode": "8",
      "maxT": 26,
      "minT": 23,
      "comfort": "舒適",
      "pop": 40
    },
    {
      "startTime": "2026-11-02T18:00:00+08:00",
      "endTime": "2026-11-03T06:00:00+08:00",
      "weather": "陰短暫雨",
      "weatherCode": "11",
      "maxT": 24,
      "minT": 23,
      "comfort": "舒適",
      "pop": 30
    }
  ]
}
```

### 6.2 欄位說明

| 欄位 | 型別 | 說明 |
|------|------|------|
| `location` | string | 地點名稱 |
| `issuedAt` | string | 預報發布時間 |
| `updatedAt` | string | 資料最後更新時間 |
| `stale` | boolean | 是否為上游失敗時使用的舊快取 |
| `periods[].startTime` | string | 時段起點，ISO 8601（`+08:00`） |
| `periods[].endTime` | string | 時段終點，ISO 8601（`+08:00`） |
| `periods[].weather` | string | 天氣現象文字 |
| `periods[].weatherCode` | string | 天氣現象代碼 |
| `periods[].maxT` | integer \| null | 最高溫（攝氏） |
| `periods[].minT` | integer \| null | 最低溫（攝氏） |
| `periods[].comfort` | string | 舒適度（例：舒適、悶熱、寒冷） |
| `periods[].pop` | integer \| null | 降雨機率（%） |

### 6.3 地點清單回應

```json
{
  "locations": ["臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "基隆市", "新竹縣", "新竹市", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", "嘉義市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"]
}
```

---

## 7. 轉換規則

| 項目 | 規則 |
|------|------|
| 溫度 / 降雨機率 | 字串轉整數；空值或無法解析為 `null` |
| 時間 | 已為 `+08:00` 格式，無需轉換 |
| 天氣顯示 | 使用 `parameter.parameterName` 文字，`parameterValue` 僅供圖示對應 |
| 舒適度 | 直接使用 `parameter.parameterName`（無單位） |
| 第一筆時段 | 保留原樣，起點為發布時間（非完整 12 小時） |

```ts
function toNumber(v: unknown): number | null {
  const n = Number(v)
  return v === undefined || v === '' || Number.isNaN(n) ? null : n
}
```

---

## 8. 主要邏輯

```ts
const periods = locationIndex.get(location)
if (!periods) return notFound()

return Response.json({
  location,
  issuedAt,
  updatedAt,
  stale,
  periods
})
```

地點比對以完整名稱為準，並先做 `trim()`。可選擇性支援常見別名（例如 `台北市` 對應 `臺北市`）。

---

## 9. 錯誤回應

### 9.1 參數錯誤（400）

```json
{ "error": { "code": "INVALID_PARAMETER", "message": "location is required" } }
```

### 9.2 地點不存在（404）

```json
{ "error": { "code": "LOCATION_NOT_FOUND", "message": "No forecast for the given location" } }
```

### 9.3 驗證失敗（401）

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Missing or invalid API key" } }
```

### 9.4 上游錯誤（502）

CWA 失敗且無可用快取時回傳：

```json
{ "error": { "code": "UPSTREAM_ERROR", "message": "CWA API unavailable" } }
```

---

## 10. Cloudflare Worker 設計

### 10.1 設定

| 項目 | 設定 |
|------|------|
| `CWA_API_KEY` | Worker Secret（`wrangler secret put CWA_API_KEY`） |
| `CLIENT_API_KEY` | Worker Secret，供 Power Apps 連接器的 API Key 驗證使用 |
| 部署網址 | `https://cwa-forecast.<account>.workers.dev`（與七天預報共用同一 Worker） |

### 10.2 建議流程

```ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.headers.get('x-api-key') !== env.CLIENT_API_KEY) return unauthorized()

    const url = new URL(request.url)
    const data = await getForecastData(env, ctx)

    if (url.pathname === '/api/36hour/locations') {
      return Response.json({ locations: [...data.index.keys()] })
    }

    if (url.pathname === '/api/36hour/forecast') {
      const location = url.searchParams.get('location')?.trim()
      if (!location) return badRequest('location is required')
      const periods = data.index.get(location)
      if (!periods) return notFound()
      return Response.json({ location, issuedAt: data.issuedAt, updatedAt: data.updatedAt, stale: data.stale, periods })
    }

    return new Response('Not found', { status: 404 })
  }
}
```

### 10.3 CORS

若瀏覽器前端直接呼叫，回應需加入 `Access-Control-Allow-Origin` 與 `Access-Control-Allow-Headers: x-api-key`，並處理 `OPTIONS` 預檢。Power Apps 連接器由伺服器端呼叫，不受 CORS 限制。

### 10.4 Power Apps 整合

- 以 OpenAPI 定義匯入自訂連接器，驗證方式選 API Key（header `x-api-key`）
- 動作：`GetLocations`、`GetForecast(location)`
- 使用方式：下拉選單綁定 `GetLocations().locations`，選取後呼叫 `GetForecast` 並將 `periods` 存入 collection，供 Gallery 顯示

---

## 11. 設計總結

- Worker 抓取 CWA 資料並攤平為各地點 3 時段陣列
- 上游資料快取 15 至 30 分鐘，上游失敗時回傳舊快取
- 每次請求只回傳單一地點 3 筆資料，適合 Power Apps 使用
- API Key 僅存在 Worker Secret，前端以獨立的 client key 存取
- 統一溫度型別、時間格式與欄位命名，隱藏上游資料的不一致
- 與七天預報（F-C0032-003）共用相同的 Worker 架構，僅資料集與攤平邏輯不同

---

## 12. 範例：臺北市 36 小時輸出

```json
{
  "location": "臺北市",
  "issuedAt": "2026-11-01T17:00:00+08:00",
  "updatedAt": "2026-11-01T16:33:01+08:00",
  "stale": false,
  "periods": [
    { "startTime": "2026-11-01T18:00:00+08:00", "endTime": "2026-11-02T06:00:00+08:00", "weather": "晴時多雲", "weatherCode": "2", "maxT": 26, "minT": 23, "comfort": "舒適", "pop": 20 },
    { "startTime": "2026-11-02T06:00:00+08:00", "endTime": "2026-11-02T18:00:00+08:00", "weather": "多雲短暫雨", "weatherCode": "8", "maxT": 26, "minT": 23, "comfort": "舒適", "pop": 40 },
    { "startTime": "2026-11-02T18:00:00+08:00", "endTime": "2026-11-03T06:00:00+08:00", "weather": "陰短暫雨", "weatherCode": "11", "maxT": 24, "minT": 23, "comfort": "舒適", "pop": 30 }
  ]
}
```
