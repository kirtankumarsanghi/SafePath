"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import navigation from "../../public/navigation.json";

function current(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}
export default function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    if (open) setOpen(false);
  }
  const [signedIn, setSignedIn] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const syncTheme = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("safepath-theme"); } catch (_) {}
      setTheme(saved === "light" ? "light" : "dark");
    };
    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener("safepath-theme-change", syncTheme);
    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("safepath-theme-change", syncTheme);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem("safepath-theme", next); } catch (_) {}
    document.documentElement.setAttribute("data-theme", next);
    if (next === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }
    window.dispatchEvent(new CustomEvent("safepath-theme-change", { detail: next }));
  };

  useEffect(() => {
    const sync = () => setSignedIn(!!localStorage.getItem("token"));
    sync(); window.addEventListener("storage", sync); window.addEventListener("safepath-auth-change", sync);
    if (button.current && button.current.getAttribute("aria-expanded") === "true") {
      setOpen(true);
    }
    const handleToggle = (e: Event) => {
      setOpen(Boolean((e as CustomEvent).detail));
    };
    window.addEventListener("safepath-menu-toggle", handleToggle);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("safepath-auth-change", sync);
      window.removeEventListener("safepath-menu-toggle", handleToggle);
    };
  }, []);
  const onToggle = (e: React.MouseEvent) => {
    (e.nativeEvent as any).__handledByReact = true;
    setOpen(v => !v);
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => menu.current?.querySelector<HTMLAnchorElement>("a")?.focus());
    const close = () => { setOpen(false); button.current?.focus(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Tab") {
        const items = [button.current, ...Array.from(menu.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])].filter(Boolean) as HTMLElement[];
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && (index <= 0)) { e.preventDefault(); items.at(-1)?.focus(); }
        else if (!e.shiftKey && (index === items.length - 1 || index < 0)) { e.preventDefault(); items[0]?.focus(); }
      }
    };
    const media = window.matchMedia("(min-width:1041px)");
    const onResize = () => { if (media.matches) setOpen(false); };
    window.addEventListener("keydown", onKey); media.addEventListener("change", onResize);
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); media.removeEventListener("change", onResize); };
  }, [open]);
  const accountHref = signedIn ? "/profile" : "/auth", accountText = signedIn ? "Account" : "Sign in";
  return <>
    <header className="site-header"><div className="site-header__inner">
      <a className="site-brand" href="/" aria-label="SafePath home"><span className="site-brand__mark"><Image src="/assets/logo.webp" alt="" width={34} height={34} /></span><span>SafePath</span></a>
      <nav className="site-nav" aria-label="Primary navigation">{navigation.map(item => <a key={item.href} href={item.href} aria-current={current(pathname, item.href) ? "page" : undefined}>{item.label}</a>)}</nav>
      <a className="site-account" href={accountHref}>{accountText}</a>
      <button id="theme-toggle" className="site-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"} title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>
        <svg className="icon-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        <svg className="icon-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      </button>
      <button ref={button} id="site-menu-button" className="site-menu-button" type="button" aria-expanded={open} aria-controls="site-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={onToggle}><span /><span /><span /></button>
    </div></header>
    <div ref={menu} id="site-menu" className="site-menu" role="dialog" aria-modal="true" aria-label="Site menu" hidden={!open} onClick={e => { if (e.target === e.currentTarget) { setOpen(false); button.current?.focus(); } }}>
      <div className="site-menu__panel">
        <nav aria-label="Mobile navigation">{navigation.map(item => <a key={item.href} href={item.href} aria-current={current(pathname, item.href) ? "page" : undefined} onClick={() => setOpen(false)}>{item.label}</a>)}</nav>
        <button type="button" className="site-menu__theme" onClick={() => { toggleTheme(); setOpen(false); }}>
          <span>Appearance</span>
          <span className="theme-indicator">{theme === "light" ? "Light" : "Dark"}</span>
        </button>
        <a className="site-menu__account" href={accountHref}>{accountText}</a>
        <Link className="site-menu__action" href="/maps/new">Upload a floor plan</Link>
      </div>
    </div>
  </>;
}
