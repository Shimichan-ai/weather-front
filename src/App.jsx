import { useState, useEffect } from "react";
import "./App.css";

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

  const toPercent = (t) =>
    ((t - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

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

            {/* ---- 1時間ごと（横スクロール） ---- */}
            {weather.hours?.length > 0 && (
              <section className="hourly">
                <h3 className="hourly__head">時間ごと</h3>
                <div className="hourly__scroll">
                  {weather.hours.map((h) => {
                    // 棒の高さは「その日の中での相対位置」で決める。
                    // 都市間で比べる上の気温バーとは目的が違うので、
                    // ここでは1日の最低〜最高を物差しにして変化を読みやすくする。
                    const span = weather.temp_max - weather.temp_min || 1;
                    const ratio = (h.temp - weather.temp_min) / span;
                    const barHeight = 5 + ratio * 30;

                    // 観測地点の「今」の時刻を強調する
                    const isNow = parseInt(h.time, 10) === weather.local_hour;

                    return (
                      <div
                        key={h.time}
                        className={`hour ${isNow ? "hour--now" : ""}`}
                      >
                        <span className="hour__time">
                          {isNow ? "今" : h.time.slice(0, 2)}
                        </span>
                        {h.icon && (
                          <img
                            className="hour__icon"
                            src={h.icon}
                            alt={h.weather}
                            width="32"
                            height="32"
                            loading="lazy"
                          />
                        )}
                        <span className="hour__temp">{Math.round(h.temp)}°</span>
                        <span
                          className="hour__bar"
                          style={{ height: `${barHeight}px` }}
                        />
                        <span className="hour__rain">
                          {h.rain_prob > 0 ? `${h.rain_prob}%` : ""}
                        </span>
                      </div>
                    );
                  })}
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