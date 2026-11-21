import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { login, selectAuth } from "../store/slices/authSlice";
import "./Login.css";

export default function Login({ onSuccess } = {}) {
  const dispatch = useDispatch();
  const { loading, error } = useSelector(selectAuth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formErrors, setFormErrors] = useState({});

  const onSubmit = async (e) => {
    e.preventDefault();
    // Client-side validation
    const isValid = validate();
    if (!isValid) return;

    try {
      const resultAction = await dispatch(login({ username, password }));
      if (login.fulfilled.match(resultAction)) {
        // login succeeded
        if (typeof onSuccess === "function") {
          onSuccess(resultAction.payload?.user ?? null);
        }
      }
    } catch (err) {
      console.error("Login error", err);
    }
  };

  function validate() {
    const errs = {};
    if (!username || username.trim().length === 0) {
      errs.username = "Please enter a username.";
    }
    if (!password || password.length === 0) {
      errs.password = "Please enter a password.";
    } else if (password.length < 3) {
      errs.password = "Password must be at least 3 characters.";
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  return (
    <form className="login-card login-form" onSubmit={onSubmit}>
      <div className="form-row">
        <label htmlFor="portal-username">Username</label>
        <input
          id="portal-username"
          className="input"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          aria-invalid={!!formErrors.username}
          aria-describedby={formErrors.username ? "portal-username-error" : undefined}
        />
        {formErrors.username && (
          <div id="portal-username-error" className="field-error">{formErrors.username}</div>
        )}
      </div>
      <div className="form-row">
        <label htmlFor="portal-password">Password</label>
        <input
          id="portal-password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!formErrors.password}
          aria-describedby={formErrors.password ? "portal-password-error" : undefined}
        />
        {formErrors.password && (
          <div id="portal-password-error" className="field-error">{formErrors.password}</div>
        )}
      </div>
      <div className="login-actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </div>
      {error && <div className="login-error" role="alert">{error.message || JSON.stringify(error)}</div>}
    </form>
  );
}
