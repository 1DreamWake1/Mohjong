import type { FormEvent } from "react";
import { useState } from "react";

import { getErrorMessage } from "../api/errors.js";
import styles from "../app/App.module.css";
import { useAuthStore } from "../stores/authStore.js";

export function LoginPage(): JSX.Element {
  const signIn = useAuthStore((state) => state.signIn);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn({ username, password });
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.loginLayout}>
        <div className={styles.loginCopy}>
          <p className={styles.kicker}>在线麻将</p>
          <h1>账号登录</h1>
          <p>管理员可维护玩家账号，玩家可进入大厅准备开始对局。</p>
        </div>
        <form className={styles.formPanel} onSubmit={handleSubmit}>
          <label>
            用户名
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.primaryButton} disabled={isSubmitting}>
            {isSubmitting ? "登录中" : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
}
