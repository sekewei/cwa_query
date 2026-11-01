# 中央氣象署七天天氣預報查詢 API 規格（Cloudflare Worker）

## 1. 背景

一般天氣預報-七天天氣預報 臺灣各縣市七天天氣預報資料 
   https://data.gov.tw/dataset/9218
本 API 依上述中央氣象署（CWA）開放資料 `F-C0032-003`（七天天氣預報）設計，目標是讓前端或 Power Apps 傳入：

- 地點名稱，如 `臺北市`、`玉山`、`北部地區`

回傳該地點未來七天每日的最低溫、最高溫、天氣現象與天氣現象代碼。

設計核心概念：

- 原始 JSON 為巢狀結構且包含約 30 個地點，體積大、不易在 Power Fx 中直接使用
- Worker 先抓取並攤平（flatten）為「地點 -> 七天陣列」的索引
- 每次請求只回傳單一地點的約 7 筆資料
- CWA API Key 只存在 Worker Secret，不暴露給前端或 Power Apps 連接器

---

## 2. 資料來源

### 2.1 端點

```text
https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-C0032-003?Authorization={CWA_API_KEY}&format=JSON
```

`CWA_API_KEY` 以 Worker Secret 儲存，不寫入程式碼、規格或版本庫。

### 2.2 JSON 結構

```text
cwaopendata
 |- Sent, Dataid, ...                    訊息中繼資料
 |- Dataset
     |- DatasetInfo
     |   |- IssueTime                    預報發布時間
     |   |- Update                       最後更新時間
     |- Locations
         |- Location[]                   約 30 個地點
              |- LocationName            地點名稱
              |- WeatherElement[]        固定 3 個
                   |- ElementName        天氣現象 | 最高溫度 | 最低溫度
                   |- Time[]             7 筆，每日一筆
                        |- StartTime, EndTime
                        |- ElementValue
```

### 2.3 ElementValue 內容

| ElementName | ElementValue |
|-------------|--------------|
| 天氣現象 | `{ "Weather": "多雲短暫雨", "WeatherCode": "08" }` |
| 最高溫度 | `{ "MaxTemperature": "26" }`（字串，攝氏） |
| 最低溫度 | `{ "MinTemperature": "23" }`（字串，攝氏） |

### 2.4 地點清單

共 25 個地點（已對照 CWA 即時 API 驗證，2026-11-01）：

| # | LocationName | 分類 |
|---|--------------|------|
| 1 | 北部地區 | 區域 |
| 2 | 中部地區 | 區域 |
| 3 | 南部地區 | 區域 |
| 4 | 東北部地區 | 區域 |
| 5 | 東部地區 | 區域 |
| 6 | 東南部地區 | 區域 |
| 7 | 臺北市 | 城市 |
| 8 | 澎湖地區 | 離島 |
| 9 | 金門地區 | 離島 |
| 10 | 馬祖地區 | 離島 |
| 11 | 綠島 | 離島 |
| 12 | 蘭嶼 | 離島 |
| 13 | 小琉球 | 離島 |
| 14 | 日月潭 | 景點與山區 |
| 15 | 溪頭 | 景點與山區 |
| 16 | 梨山 | 景點與山區 |
| 17 | 太魯閣 | 景點與山區 |
| 18 | 墾丁 | 景點與山區 |
| 19 | 玉山 | 景點與山區 |
| 20 | 拉拉山 | 景點與山區 |
| 21 | 阿里山 | 景點與山區 |
| 22 | 陽明山 | 景點與山區 |
| 23 | 龍洞(東北角風景區) | 景點與山區 |
| 24 | 三仙台(東部風景區) | 景點與山區 |
| 25 | 合歡山 | 景點與山區 |

注意：

- 本資料集（F-C0032-003）僅包含「臺北市」一個城市，不含新北市、桃園市、臺中市、臺南市、高雄市等其他直轄市
- 名稱需完全一致才能查詢成功，例如離島為「澎湖地區」而非「澎湖」
- 含括號的地點（龍洞、三仙台）需使用完整名稱
- 地點清單以實際資料為準，由 `/api/7day/locations` 動態提供，不在程式內寫死

### 2.5 資料特性

- 溫度為字串，需轉為數字
- `StartTime`/`EndTime` 的時區格式為 `+0800`（無冒號），與 `IssueTime` 的 `+08:00` 不同
- 第一筆時段從發布時間起算，不是完整一天
- 同一個 `WeatherCode` 可對應多種文字描述（例如 `08`、`10`、`11`），顯示以 `Weather` 為主
- 三種元素的第 i 筆 `Time` 對應同一個時段

---

## 3. API 端點

本資料集使用 `/api/7day/` 路徑前綴，與 36 小時預報（`/api/36hour/`）共用同一 Worker 與同一部署網址。

### 3.1 查詢單一地點預報

```http
GET /api/7day/forecast?location=臺北市
```
https://cwa-forecast.sekewei.workers.dev/api/7day/forecast?


| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `location` | string | 是 | 地點名稱，需 URL 編碼 |

### 3.2 取得地點清單

```http
GET /api/7day/locations
```
https://cwa-forecast.sekewei.workers.dev/api/7day/locations
回傳所有可查詢的地點名稱，供 Power Apps 下拉選單使用。

---

## 4. Worker 初始化與快取

預報一天只發布數次，因此上游資料快取即可，不需每次請求都呼叫 CWA。

### 4.1 流程

1. 以 `CWA_API_KEY` 取得 `F-C0032-003` JSON
2. 解析 `Dataset.Locations.Location[]`
3. 對每個地點依 `ElementName` 找出三個元素，依索引合併為 `days[]`
4. 建立 `locationIndex: Map<LocationName, Day[]>`
5. 記錄 `issuedAt`（`IssueTime`）與 `updatedAt`（`Update`）
6. 結果存入 isolate 記憶體，並以 Cache API 或 `cf.cacheTtl` 快取上游回應

### 4.2 攤平範例

```ts
type Day = {
  date: string
  startTime: string
  endTime: string
  min: number | null
  max: number | null
  weather: string
  weatherCode: string
}

function flattenLocation(loc: any): Day[] {
  const pick = (name: string) =>
    loc.WeatherElement.find((e: any) => e.ElementName === name)?.Time ?? []

  const wx = pick('天氣現象')
  const maxT = pick('最高溫度')
  const minT = pick('最低溫度')

  return wx.map((t: any, i: number) => ({
    date: normalizeTime(t.StartTime).slice(0, 10),
    startTime: normalizeTime(t.StartTime),
    endTime: normalizeTime(t.EndTime),
    min: toNumber(minT[i]?.ElementValue?.MinTemperature),
    max: toNumber(maxT[i]?.ElementValue?.MaxTemperature),
    weather: t.ElementValue.Weather,
    weatherCode: t.ElementValue.WeatherCode
  }))
}
```

### 4.3 快取策略

| 資料 | 快取時間 | 說明 |
|------|----------|------|
| CWA 上游 JSON | 30 至 60 分鐘 | 預報每日僅發布數次 |
| 攤平後索引 | 同上，隨上游更新重建 | 保存在 isolate 記憶體 |
| 上游失敗時 | 沿用舊快取 | 回應加上 `stale: true` |

---

## 5. 請求流程

1. 驗證 API Key header 與 `location` 參數
2. 確認上游快取有效，否則重新抓取並重建索引
3. 以 `locationIndex.get(location)` 取得七天資料
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
Return 7-day forecast
```

---

## 6. 回應格式

### 6.1 成功回應（200 OK）

```json
{
  "location": "臺北市",
  "issuedAt": "2026-11-01T17:00:00+08:00",
  "updatedAt": "2026-11-01T16:49:48+08:00",
  "stale": false,
  "days": [
    {
      "date": "2026-11-01",
      "startTime": "2026-11-01T18:00:00+08:00",
      "endTime": "2026-11-02T00:00:00+08:00",
      "min": 25,
      "max": 26,
      "weather": "晴時多雲",
      "location=%E8%87%BA%E5%8C%97%E5%B8%82weatherCode": "02"
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
| `days[].date` | string | 日期 `YYYY-MM-DD`，取自 `startTime` |
| `days[].startTime` | string | 時段起點，ISO 8601 |
| `days[].endTime` | string | 時段終點，ISO 8601 |
| `days[].min` | integer \| null | 最低溫（攝氏） |
| `days[].max` | integer \| null | 最高溫（攝氏） |
| `days[].weather` | string | 天氣現象文字 |
| `days[].weatherCode` | string | 天氣現象代碼 |

### 6.3 地點清單回應

```json
{
  "locations": ["北部地區", "中部地區", "南部地區", "臺北市", "玉山"]
}
```

---

## 7. 轉換規則

| 項目 | 規則 |
|------|------|
| 溫度 | 字串轉整數；空值或無法解析為 `null` |
| 時間 | `+0800` 轉為 `+08:00` |
| 日期 | 取 `startTime` 前 10 碼 |
| 第一筆時段 | 保留原樣，起點為發布時間（非完整一天） |
| 天氣顯示 | 使用 `weather` 文字，`weatherCode` 僅供圖示對應 |

```ts
function normalizeTime(s: string): string {
  return s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
}

function toNumber(v: unknown): number | null {
  const n = Number(v)
  return v === undefined || v === '' || Number.isNaN(n) ? null : n
}
```

---

## 8. 主要邏輯

```ts
const days = locationIndex.get(location)
if (!days) return notFound()

return Response.json({
  location,
  issuedAt,
  updatedAt,
  stale,
  days
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
| 部署網址 | `https://cwa-forecast.<account>.workers.dev`（與 36 小時預報共用同一 Worker） |

### 10.2 建議流程

```ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.headers.get('x-api-key') !== env.CLIENT_API_KEY) return unauthorized()

    const url = new URL(request.url)
    const data = await getForecastData(env, ctx)

    if (url.pathname === '/api/7day/locations') {
      return Response.json({ locations: [...data.index.keys()] })
    }

    if (url.pathname === '/api/7day/forecast') {
      const location = url.searchParams.get('location')?.trim()
      if (!location) return badRequest('location is required')
      const days = data.index.get(location)
      if (!days) return notFound()
      return Response.json({ location, issuedAt: data.issuedAt, updatedAt: data.updatedAt, stale: data.stale, days })
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
- 使用方式：下拉選單綁定 `GetLocations().locations`，選取後呼叫 `GetForecast` 並將 `days` 存入 collection，供 Gallery 顯示

---

## 11. 設計總結

- Worker 抓取 CWA 資料並攤平為各地點七天陣列
- 上游資料快取 30 至 60 分鐘，上游失敗時回傳舊快取
- 每次請求只回傳單一地點約 7 筆資料，適合 Power Apps 使用
- API Key 僅存在 Worker Secret，前端以獨立的 client key 存取
- 統一溫度型別、時間格式與欄位命名，隱藏上游資料的不一致

---

## 12. 範例：臺北市前三日輸出

```json
{
  "location": "臺北市",
  "issuedAt": "2026-11-01T17:00:00+08:00",
  "updatedAt": "2026-11-01T16:49:48+08:00",
  "stale": false,
  "days": [
    { "date": "2026-11-01", "startTime": "2026-11-01T18:00:00+08:00", "endTime": "2026-11-02T00:00:00+08:00", "min": 25, "max": 26, "weather": "晴時多雲", "weatherCode": "02" },
    { "date": "2026-11-02", "startTime": "2026-11-02T00:00:00+08:00", "endTime": "2026-11-03T00:00:00+08:00", "min": 23, "max": 26, "weather": "多雲短暫雨", "weatherCode": "08" },
    { "date": "2026-11-03", "startTime": "2026-11-03T00:00:00+08:00", "endTime": "2026-11-04T00:00:00+08:00", "min": 23, "max": 24, "weather": "陰天", "weatherCode": "07" }
  ]
}
```
