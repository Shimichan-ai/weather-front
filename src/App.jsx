import { useState, useEffect, useRef } from "react";
import "./App.css";

// ============================================================
// 折れ線グラフの座標計算
//   SVGは「左上が原点、下に行くほどyが大きい」座標系。
//   気温は高いほど上に描きたいので、計算で上下を反転させる。
// ============================================================
// 自作アイコンは public/icons/ に置く。Viteは public の中身を
// サイトのルート直下として配信するので、パスは /icons/... になる。
const iconSrc = (name) => `/icons/${name || "cloudy"}.png`;


// ============================================================
// 週間予報（Open-Meteo を直接叩く）
//
//   なぜ自作APIを経由しないか:
//     Open-Meteoはキー不要＝IPで利用者を識別する。
//     Renderの共有IPだと他人の使用量で429になるため、
//     ブラウザから直接叩いて各利用者のIPを使う。
//
//   Open-MeteoはWMOコードという別の番号体系を返すので、
//   バックエンドと同じアイコン名に翻訳して揃える。
// ============================================================
const WMO = {
  0:  ["clear", "晴れ"],
  1:  ["partly-cloudy", "おおむね晴れ"],
  2:  ["partly-cloudy", "一部曇り"],
  3:  ["cloudy", "曇り"],
  45: ["fog", "霧"],
  48: ["fog", "霧"],
  51: ["drizzle", "霧雨"],
  53: ["drizzle", "霧雨"],
  55: ["drizzle", "強い霧雨"],
  56: ["drizzle", "着氷性の霧雨"],
  57: ["drizzle", "着氷性の霧雨"],
  61: ["rain", "弱い雨"],
  63: ["rain", "雨"],
  65: ["heavy-rain", "強い雨"],
  66: ["heavy-rain", "着氷性の雨"],
  67: ["heavy-rain", "着氷性の雨"],
  71: ["snow", "弱い雪"],
  73: ["snow", "雪"],
  75: ["heavy-snow", "強い雪"],
  77: ["snow", "霧雪"],
  80: ["showers", "にわか雨"],
  81: ["showers", "にわか雨"],
  82: ["heavy-rain", "激しいにわか雨"],
  85: ["heavy-snow", "にわか雪"],
  86: ["heavy-snow", "強いにわか雪"],
  95: ["thunder", "雷雨"],
  96: ["thunder", "雷を伴うひょう"],
  99: ["thunder", "激しい雷雨"],
};

const wmoInfo = (code) => WMO[code] || ["cloudy", "—"];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function dayLabel(dateStr, index) {
  if (index === 0) return "今日";
  if (index === 1) return "明日";
  // "2026-10-05" をそのまま new Date() に渡すとUTC解釈になり
  // 日本時間では1日ずれることがあるので、数値から組み立てる
  const [y, m, d] = dateStr.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}


// ============================================================
// 再試行つきの fetch
//
//   Renderの無料プランは15分アクセスが無いと停止し、
//   復帰に50秒以上かかる。最初の1回は必ず失敗するので、
//   諦めずに数回やり直す。
//
//   重要なのは「やり直す価値のある失敗」だけを選ぶこと:
//     - 通信そのものが成立しない → サーバーが起動中かもしれない → 再試行
//     - 404や429が返ってきた     → サーバーは生きていて断っている → 再試行しない
//   区別せず全部やり直すと、無駄に待たせるだけになる。
// ============================================================
const ATTEMPT_TIMEOUT = 12000;   // 1回あたりの待ち上限(ms)
const RETRY_WAIT = 3000;         // 失敗後に次を試すまでの間隔(ms)
const MAX_ATTEMPTS = 6;          // 合計で最長約90秒

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, onRetry) {
  let lastError;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    // 応答が無いまま固まるのを防ぐ。時間切れで中断して次を試す
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res;   // HTTPエラーでもここで返す（呼び出し側が判断する）
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      if (i < MAX_ATTEMPTS - 1) {
        onRetry?.(i + 1);
        await sleep(RETRY_WAIT);
      }
    }
  }
  throw lastError;
}

const COL_WIDTH = 52;   // 1時間ぶんの列幅(px)。CSSのgrid列幅と必ず揃える
const CHART_H = 76;     // グラフ領域の高さ
const Y_TOP = 30;       // 線が到達する一番上（上に気温の数字を置くので余白を取る）
const Y_BOTTOM = 64;    // 線が到達する一番下

function buildChart(hours) {
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const span = hi - lo || 1;   // 全時刻が同じ気温なら 0 除算になるので保険

  // 気温 → y座標。高い気温ほど小さいy（＝上）になる
  const yOf = (t) => Y_BOTTOM - ((t - lo) / span) * (Y_BOTTOM - Y_TOP);

  const pts = hours.map((h, i) => ({
    x: i * COL_WIDTH + COL_WIDTH / 2,   // 列の中央
    y: yOf(h.temp),
    temp: h.temp,
  }));

  return {
    width: hours.length * COL_WIDTH,
    pts,
    // polyline用の "x1,y1 x2,y2 ..." 形式
    line: pts.map((p) => `${p.x},${p.y}`).join(" "),
    // 線の下を塗るための閉じた多角形
    area: `${pts[0].x},${CHART_H} ${pts.map((p) => `${p.x},${p.y}`).join(" ")} ${pts[pts.length - 1].x},${CHART_H}`,
  };
}

// ============================================================
// 自分のRenderのURL。末尾のスラッシュは付けないこと。
// ============================================================
const API_BASE = "https://weather-app-ytf7.onrender.com";

// 気温バーの目盛り範囲。都市が変わっても物差しが変わらないよう固定する
const SCALE_MIN = -10;
const SCALE_MAX = 40;

export default function App() {
  const [areas, setAreas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [weather, setWeather] = useState(null);
  const [coords, setCoords] = useState({});     // 地域名 → [緯度, 経度]
  const [week, setWeek] = useState(null);       // 週間予報
  const [weekError, setWeekError] = useState(null);
  const [waking, setWaking] = useState(0);   // 再試行の回数。0なら通常
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 横スクロール領域を直接操作するための参照
  const scrollRef = useRef(null);

  // 最初の1回だけ実行（GET /areas）
  useEffect(() => {
    async function loadAreas() {
      try {
        const res = await fetchWithRetry(`${API_BASE}/areas`, setWaking);
        if (!res.ok) throw new Error(`地域一覧の取得に失敗しました (${res.status})`);
        const data = await res.json();
        setAreas(data.areas);
        setCoords(data.coords || {});
      } catch {
        setError("サーバーに接続できませんでした。時間をおいて再度お試しください。");
      } finally {
        setWaking(0);
      }
    }
    loadAreas();
  }, []);

  // selected が変わるたびに実行（GET /weather?area=...）
  useEffect(() => {
    if (!selected) return;

    async function loadWeather() {
      setLoading(true);
      setError(null);
      setWeather(null);
      try {
        const url = `${API_BASE}/weather?area=${encodeURIComponent(selected)}`;
        const res = await fetchWithRetry(url, setWaking);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `取得に失敗しました (${res.status})`);
        }
        setWeather(await res.json());
      } catch (e) {
        setError(
          e.name === "AbortError" || e.name === "TypeError"
            ? "サーバーに接続できませんでした。時間をおいて再度お試しください。"
            : e.message
        );
      } finally {
        setLoading(false);
        setWaking(0);
      }
    }
    loadWeather();
  }, [selected]);

  // 週間予報：Open-Meteoを直接叩く。
  // 自作APIとは独立させ、片方が落ちてももう片方は表示されるようにする。
  useEffect(() => {
    if (!selected || !coords[selected]) return;
    const [lat, lon] = coords[selected];

    async function loadWeek() {
      setWeek(null);
      setWeekError(null);
      try {
        const url =
          "https://api.open-meteo.com/v1/forecast" +
          `?latitude=${lat}&longitude=${lon}` +
          "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
          "&timezone=Asia%2FTokyo&forecast_days=7";
        const res = await fetch(url);
        if (!res.ok) throw new Error(`週間予報の取得に失敗しました (${res.status})`);
        const d = (await res.json()).daily;

        // 配列が項目ごとに分かれて返るので、日付ごとにまとめ直す
        setWeek(
          d.time.map((date, i) => {
            const [icon, text] = wmoInfo(d.weather_code[i]);
            return {
              date,
              icon,
              text,
              max: d.temperature_2m_max[i],
              min: d.temperature_2m_min[i],
              rain: d.precipitation_probability_max[i] ?? 0,
            };
          })
        );
      } catch (e) {
        setWeekError(e.message);
      }
    }
    loadWeek();
  }, [selected, coords]);

  // 現在時刻が画面に入るよう、取得のたびに横スクロールを合わせる。
  // 24時間ぶんあるので、何もしないと常に0時が見えてしまう。
  useEffect(() => {
    const idx = weather?.hours?.findIndex(
      (h) => parseInt(h.time, 10) === weather.local_hour
    );
    if (scrollRef.current && idx > 0) {
      scrollRef.current.scrollLeft = Math.max(0, idx * COL_WIDTH - COL_WIDTH);
    }
  }, [weather]);

  const toPercent = (t) =>
    ((t - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

  // 折れ線の座標を計算しておく（データが無ければ null）
  const chart = weather?.hours?.length ? buildChart(weather.hours) : null;

  return (
    <div className="app">
      <header className="masthead">
        <p className="eyebrow">WeatherAPI.com 提供</p>
        <h1 className="title">きょうの天気</h1>
      </header>

      <nav className="areas" aria-label="地域を選ぶ">
        {areas.length === 0 && !error && waking === 0 && (
          <p className="hint">地域一覧を読み込んでいます…</p>
        )}
        {areas.map((name) => (
          <button
            key={name}
            className={`chip ${selected === name ? "chip--on" : ""}`}
            onClick={() => setSelected(name)}
          >
            {name}
          </button>
        ))}
      </nav>

      <main className="panel">
        {/* サーバーがスリープから復帰する間の案内。
            黙って待たせると「壊れている」と思われる */}
        {waking > 0 && (
          <div className="waking">
            <span className="waking__dot" />
            <div>
              <p className="waking__head">サーバーを起動しています</p>
              <p className="waking__body">
                しばらく使われていなかったため、最初の表示に1分ほどかかります（{waking}/{MAX_ATTEMPTS - 1}回目）
              </p>
            </div>
          </div>
        )}

        {!selected && !error && waking === 0 && (
          <p className="empty">地域を選ぶと今日の天気が出ます。</p>
        )}

        {loading && <p className="empty">取得中…</p>}

        {error && (
          <div className="error">
            <p className="error__head">読み込めませんでした</p>
            <p className="error__body">{error}</p>
          </div>
        )}

        {weather && !loading && (
          <article className="card">
            <div className="card__head">
              <h2 className="place">{weather.area}</h2>
              <time className="date">{weather.date}</time>
            </div>

            {/* アイコンと天気名を横並びに */}
            <div className="condition">
              {weather.icon_name && (
                <img
                  className="condition__icon"
                  src={iconSrc(weather.icon_name)}
                  alt=""          /* 隣に天気名があるので、読み上げは重複させない */
                  width="64"
                  height="64"
                  loading="lazy"
                />
              )}
              <span className="condition__text">{weather.weather}</span>
            </div>

            {/* 主役：最高気温 */}
            <p className="temp">
              {weather.temp_max}
              <span className="temp__unit">{weather.temp_unit}</span>
            </p>

            {/* 気温レンジバー：都市が変わっても目盛りは固定 */}
            <div className="range">
              <div className="range__track">
                <div
                  className="range__fill"
                  style={{
                    left: `${toPercent(weather.temp_min)}%`,
                    width: `${toPercent(weather.temp_max) - toPercent(weather.temp_min)}%`,
                  }}
                />
              </div>
              <div className="range__labels">
                <span>最低 {weather.temp_min}{weather.temp_unit}</span>
                <span>最高 {weather.temp_max}{weather.temp_unit}</span>
              </div>
            </div>

            <dl className="facts">
              <div className="fact">
                <dt>降水確率</dt>
                <dd>{weather.rain_prob}%</dd>
              </div>
            </dl>

            {/* ---- 1時間ごと：折れ線グラフ ---- */}
            {chart && (
              <section className="hourly">
                <h3 className="hourly__head">時間ごとの気温</h3>

                <div className="hourly__scroll" ref={scrollRef}>
                  {/* grid の列幅と COL_WIDTH を揃えることで、
                      SVGの折れ線と下の時刻・アイコンが正確に縦に並ぶ */}
                  <div
                    className="hourly__grid"
                    style={{
                      gridTemplateColumns: `repeat(${weather.hours.length}, ${COL_WIDTH}px)`,
                    }}
                  >
                    {/* 1行目：時刻 */}
                    {weather.hours.map((h) => {
                      const isNow = parseInt(h.time, 10) === weather.local_hour;
                      return (
                        <span
                          key={`t-${h.time}`}
                          className={`hour__time ${isNow ? "hour__time--now" : ""}`}
                        >
                          {isNow ? "今" : h.time.slice(0, 2)}
                        </span>
                      );
                    })}

                    {/* 2行目：折れ線（全列にまたがる1枚のSVG） */}
                    <svg
                      className="hourly__chart"
                      width={chart.width}
                      height={CHART_H}
                      viewBox={`0 0 ${chart.width} ${CHART_H}`}
                      aria-hidden="true"
                    >
                      <defs>
                        {/* 上が暖色、下が寒色。y座標＝気温なので色が意味を持つ */}
                        <linearGradient id="tempLine" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--warm)" />
                          <stop offset="100%" stopColor="var(--cool)" />
                        </linearGradient>
                        <linearGradient id="tempArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--warm)" stopOpacity="0.16" />
                          <stop offset="100%" stopColor="var(--warm)" stopOpacity="0" />
                        </linearGradient>
                      </defs>

                      <polygon points={chart.area} fill="url(#tempArea)" />
                      <polyline
                        points={chart.line}
                        fill="none"
                        stroke="url(#tempLine)"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />

                      {chart.pts.map((p, i) => {
                        const isNow =
                          parseInt(weather.hours[i].time, 10) === weather.local_hour;
                        return (
                          <g key={`p-${i}`}>
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isNow ? 4 : 2.5}
                              fill={isNow ? "var(--warm)" : "var(--paper)"}
                              stroke="var(--warm)"
                              strokeWidth="1.5"
                            />
                            <text
                              x={p.x}
                              y={p.y - 11}
                              textAnchor="middle"
                              className={`hourly__label ${isNow ? "hourly__label--now" : ""}`}
                            >
                              {Math.round(p.temp)}°
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    {/* 3行目：アイコン */}
                    {weather.hours.map((h) => (
                      <span key={`i-${h.time}`} className="hour__iconwrap">
                        {h.icon_name && (
                          <img
                            className="hour__icon"
                            src={iconSrc(h.icon_name)}
                            alt={h.weather}
                            width="30"
                            height="30"
                            loading="lazy"
                          />
                        )}
                      </span>
                    ))}

                    {/* 4行目：降水確率（0%のときは出さない） */}
                    {weather.hours.map((h) => (
                      <span key={`r-${h.time}`} className="hour__rain">
                        {h.rain_prob > 0 ? `${h.rain_prob}%` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </article>
        )}

        {/* ---- 週間予報 ---- */}
        {weather && week && (
          <section className="week">
            <h3 className="week__head">これからの7日間</h3>
            {(() => {
              // 週全体の最低〜最高を物差しにして、各日の帯の位置を決める。
              // 「どの日が暑いか」が帯の位置だけで読めるようにする。
              const lo = Math.min(...week.map((d) => d.min));
              const hi = Math.max(...week.map((d) => d.max));
              const span = hi - lo || 1;
              const pct = (t) => ((t - lo) / span) * 100;

              return week.map((d, i) => (
                <div className={`day ${i === 0 ? "day--today" : ""}`} key={d.date}>
                  <span className="day__label">{dayLabel(d.date, i)}</span>
                  <img
                    className="day__icon"
                    src={iconSrc(d.icon)}
                    alt={d.text}
                    width="32"
                    height="32"
                    loading="lazy"
                  />
                  <span className="day__rain">
                    {d.rain > 0 ? `${d.rain}%` : ""}
                  </span>
                  <span className="day__min">{Math.round(d.min)}°</span>
                  <span className="day__track">
                    <span
                      className="day__fill"
                      style={{
                        left: `${pct(d.min)}%`,
                        width: `${pct(d.max) - pct(d.min)}%`,
                      }}
                    />
                  </span>
                  <span className="day__max">{Math.round(d.max)}°</span>
                </div>
              ));
            })()}
            <p className="week__note">週間予報は Open-Meteo</p>
          </section>
        )}

        {weather && weekError && (
          <p className="week__error">週間予報を取得できませんでした</p>
        )}
      </main>

      <footer className="foot">
        自作API経由 / {API_BASE.replace("https://", "")}
      </footer>
    </div>
  );
}