import { useState, useEffect, useRef } from "react";
import "./App.css";

// ============================================================
// 折れ線グラフの座標計算
//   SVGは「左上が原点、下に行くほどyが大きい」座標系。
//   気温は高いほど上に描きたいので、計算で上下を反転させる。
// ============================================================
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 横スクロール領域を直接操作するための参照
  const scrollRef = useRef(null);

  // 最初の1回だけ実行（GET /areas）
  useEffect(() => {
    async function loadAreas() {
      try {
        const res = await fetch(`${API_BASE}/areas`);
        if (!res.ok) throw new Error(`地域一覧の取得に失敗しました (${res.status})`);
        const data = await res.json();
        setAreas(data.areas);
      } catch (e) {
        setError(e.message);
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
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `取得に失敗しました (${res.status})`);
        }
        setWeather(await res.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    loadWeather();
  }, [selected]);

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
        {areas.length === 0 && !error && (
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
        {!selected && !error && (
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
              {weather.icon && (
                <img
                  className="condition__icon"
                  src={weather.icon}
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
                        {h.icon && (
                          <img
                            className="hour__icon"
                            src={h.icon}
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
      </main>

      <footer className="foot">
        自作API経由 / {API_BASE.replace("https://", "")}
      </footer>
    </div>
  );
}