"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { getJSON } from "@/lib/workspace-client";
export default function AuthPage() {
  const router = useRouter();
  const [login, setLogin] = useState(true), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [name, setName] = useState("");
  const [visible, setVisible] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (loading) return; setLoading(true); setError("");
    try {
      const result = await getJSON<{ token: string }>(login ? "/api/auth/login" : "/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, ...(login ? {} : { name }) }) });
      if (!result.token) throw new Error("The server could not start your session. Please try again.");
      localStorage.setItem("token", result.token); window.dispatchEvent(new Event("safepath-auth-change")); router.push("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); setLoading(false); }
  }
  return <DashboardLayout><div className="auth-layout"><div className="auth-intro"><span className="workspace-kicker">Your SafePath account</span><h1>Keep your planning<br />in one place.</h1><p>Work with building models, revisit your saved algorithm runs and review each candidate route before using it for planning.</p><p>You can explore the workspace and practice simulator without an account.</p><Link className="site-link" href="/simulator">Explore the simulator first</Link></div>
    <div><form className="workspace-panel account-form" onSubmit={submit}><h2>{login ? "Welcome back" : "Create your account"}</h2><p>{login ? "Sign in with your email and password." : "Start with your name and email. Your password needs at least 8 characters."}</p>
      {error && <div className="workspace-alert" role="alert">{error}</div>}
      {!login && <><label htmlFor="account-name">Full name</label><input id="account-name" autoComplete="name" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="Your name" required /></>}
      <label htmlFor="account-email">Email</label><input id="account-email" type="email" autoComplete="email" value={email} maxLength={255} onChange={e => setEmail(e.target.value)} placeholder="you@university.edu" required />
      <label htmlFor="account-password">Password</label><div className="password-wrap"><input id="account-password" type={visible ? "text" : "password"} autoComplete={login ? "current-password" : "new-password"} value={password} minLength={login ? 1 : 8} maxLength={128} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required /><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(v => !v)}>{visible ? "Hide" : "Show"}</button></div>
      <button className="site-button primary" type="submit" disabled={loading}>{loading ? "Please wait…" : login ? "Sign in" : "Create account"}</button>
      <button className="auth-switch" type="button" disabled={loading} onClick={() => { setLogin(v => !v); setError(""); }}>{login ? "New to SafePath? Create an account" : "Already have an account? Sign in"}</button>
    </form>{login && <p className="auth-demo">Trying the workspace?<button type="button" onClick={() => { setEmail("demo@university.edu"); setPassword("demo123"); setError(""); }}>Use demo credentials</button></p>}</div>
  </div></DashboardLayout>;
}
