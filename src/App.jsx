import { useState, useEffect } from "react";
import "./App.css";

// ============================================================
// ★ここだけ書き換える★
// Renderで発行された自分のURLに置き換えてください。
// 末尾のスラッシュは付けないこと。
//   例: https://weather-app-ytf7.onrender.com
// ============================================================
const API_BASE = "https://weather-app-ytf7.onrender.com";

// 気温バーの目盛り範囲。都市が変わっても物差しが変わらないよう固定する
const SCALE_MIN = -10;
const SCALE_MAX = 40;

export default function App() {
  // --- 状態（state）の定義 ---
  const [areas, setAreas] = useState([]);        // 地域一覧
  const [selected, setSelected] = useState(null); // 選択中の地域
  const [weather, setWeather] = useState(null);   // 天気データ
  const [loading, setLoading] = useState(false);  // 通信中かどうか
  const [error, setError] = useState(null);       // エラー文言

  // ============================================================
  // 1回目の表示時に一度だけ実行される（GET /areas）
  //   第2引数の [] が「最初の1回だけ」という意味
  // ============================================================
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

  // ============================================================
  // selected が変わるたびに実行される（GET /weather?area=...）
  //   第2引数の [selected] が「selectedが変わったら実行」という意味
  // ============================================================
  useEffect(() => {
    if (!selected) return; // まだ何も選ばれていないなら何もしない

    async function loadWeather() {
      setLoading(true);
      setError(null);
      setWeather(null);
      try {
        // 地域名が日本語なので encodeURIComponent でURL用に変換する。
        // これを忘れると「東京」が壊れてサーバーに届く。
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
        setLoading(false); // 成功でも失敗でも必ず通る
      }
    }
    loadWeather();
  }, [selected]);

  // 気温バーの位置を計算する（0〜100%）
  const toPercent = (t) =>
    ((t - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

  return (
    <div className="app">
      <header className="masthead">
        <p className="eyebrow">Open-Meteo 観測データ</p>
        <h1 className="title">きょうの天気</h1>
      </header>

      {/* 地域選択 */}
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

      {/* 表示エリア */}
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

            <p className="condition">{weather.weather}</p>

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
          </article>
        )}
      </main>

      <footer className="foot">
        自作API経由 / {API_BASE.replace("https://", "")}
      </footer>
    </div>
  );
}
