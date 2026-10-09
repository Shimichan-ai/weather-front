import { useState } from "react";

/**
 * ログイン / 新規登録のフォーム
 *
 * App.jsx から切り離した理由:
 *   App.jsx が長くなりすぎると、どこを直せばいいか分からなくなる。
 *   「画面の一区画」で切り出すのが分けやすい単位。
 *
 * props:
 *   apiBase   … APIのURL（App.jsx が持っているものを受け取る）
 *   onSuccess … 成功したとき、トークンとメールを親に渡す
 *   onCancel  … 閉じるとき
 */
export default function AuthPanel({ apiBase, onSuccess, onCancel }) {
  const [mode, setMode] = useState("login");   // "login" or "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const path = isRegister ? "/auth/register" : "/auth/login";
      const res = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // サーバーが返した理由をそのまま見せる。
        // 「登録済みです」「パスワードが違います」など、
        // 利用者が次に何をすべきか分かる文言になっている
        throw new Error(data.detail || `失敗しました (${res.status})`);
      }
      onSuccess(data.token, data.email);
    } catch (e) {
      setError(
        e.name === "TypeError"
          ? "サーバーに接続できませんでした。少し待って再度お試しください。"
          : e.message
      );
    } finally {
      setBusy(false);
    }
  }

  // Enterキーで送信できるようにする。
  // form要素を使う手もあるが、ページ遷移を止める処理が必要になるので
  // ここではキー判定で済ませる
  function onKeyDown(e) {
    if (e.key === "Enter" && email && password && !busy) submit();
  }

  return (
    <section className="auth">
      <div className="auth__tabs">
        <button
          className={`auth__tab ${!isRegister ? "auth__tab--on" : ""}`}
          onClick={() => { setMode("login"); setError(null); }}
        >
          ログイン
        </button>
        <button
          className={`auth__tab ${isRegister ? "auth__tab--on" : ""}`}
          onClick={() => { setMode("register"); setError(null); }}
        >
          新規登録
        </button>
      </div>

      <p className="auth__lead">
        {isRegister
          ? "登録すると、お気に入りの地域を保存できます。"
          : "登録済みのメールアドレスでログインしてください。"}
      </p>

      <label className="auth__label">
        メールアドレス
        <input
          className="auth__input"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>

      <label className="auth__label">
        パスワード
        <input
          className="auth__input"
          type="password"      /* type="password" にしないと画面に丸見えになる */
          value={password}
          autoComplete={isRegister ? "new-password" : "current-password"}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {isRegister && (
          <span className="auth__hint">8文字以上</span>
        )}
      </label>

      {error && <p className="auth__error">{error}</p>}

      <div className="auth__actions">
        <button
          className="auth__submit"
          onClick={submit}
          disabled={busy || !email || !password}
        >
          {busy ? "送信中…" : isRegister ? "登録する" : "ログイン"}
        </button>
        <button className="auth__cancel" onClick={onCancel}>
          閉じる
        </button>
      </div>
    </section>
  );
}