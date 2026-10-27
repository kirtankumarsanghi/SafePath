"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { requestHeaders } from "@/lib/map-model";
import { getJSON, shortDate } from "@/lib/workspace-client";
interface User { id: number; name: string | null; email: string; createdAt: string }
export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null), [name, setName] = useState("");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!localStorage.getItem("token")) { queueMicrotask(() => setLoading(false)); return () => controller.abort(); }
    fetch("/api/auth/me", { headers: requestHeaders(false), signal: controller.signal }).then(async r => {
      const data = await r.json();
      if (r.status === 401) { localStorage.removeItem("token"); window.dispatchEvent(new Event("safepath-auth-change")); return null; }
      if (!r.ok) throw new Error(data.error || "Your account could not be loaded."); return data.user as User;
    }).then(value => { if (!controller.signal.aborted) { setUser(value); setName(value?.name ?? ""); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (saving || !user) return; setSaving(true); setSaved(false); setError("");
    try { const data = await getJSON<{ user: User }>("/api/auth/me", { method: "PATCH", headers: requestHeaders(), body: JSON.stringify({ name }) }); setUser(data.user); setName(data.user.name ?? ""); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Changes could not be saved."); } finally { setSaving(false); }
  }
  function signOut() { localStorage.removeItem("token"); window.dispatchEvent(new Event("safepath-auth-change")); window.location.assign("/"); }
  return <DashboardLayout><header className="workspace-head"><div><span className="workspace-kicker">Account</span><h1>Profile & settings</h1><p>Manage your display name and current session. Your email is used to sign in.</p></div></header>
    {error && <div className="workspace-alert" role="alert">{error} <button className="site-link" onClick={() => { setLoading(true); setError(""); setRetry(v => v + 1); }}>Try again</button></div>}
    {loading ? <div className="workspace-skeleton" /> : !user ? <div className="workspace-empty"><h2>Sign in to manage your account</h2><p>You can still explore maps and the simulator as a guest. Sign in to update your account details.</p><Link className="site-button primary" href="/auth">Sign in</Link></div> : <div className="profile-columns"><form className="workspace-panel account-form" onSubmit={save}><h2>Personal details</h2><p>Signed in as {user.email}</p>{saved && <div className="workspace-alert success" role="status">Your display name has been saved.</div>}<label htmlFor="profile-name">Display name</label><input id="profile-name" value={name} autoComplete="name" maxLength={100} required onChange={e => { setName(e.target.value); setSaved(false); }} /><label htmlFor="profile-email">Email</label><input id="profile-email" value={user.email} disabled /><button className="site-button primary" type="submit" disabled={saving || name.trim() === (user.name ?? "")}>{saving ? "Saving changes…" : "Save changes"}</button></form><aside className="workspace-guide"><h2>Current session</h2><p className="account-session">Account created {shortDate(user.createdAt)}.</p><p>Signing out removes this browser’s session. It does not delete your account.</p><button className="site-button" type="button" onClick={signOut} style={{ marginTop: 18 }}>Sign out</button></aside></div>}
  </DashboardLayout>;
}
