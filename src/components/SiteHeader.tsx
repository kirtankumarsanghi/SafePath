"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import navigation from "../../public/navigation.json";

function current(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}
export default function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
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
  useEffect(() => { setOpen(false); }, [pathname]);
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
      <a className="site-brand" href="/" aria-label="SafePath home"><span className="site-brand__mark"><img src="/assets/logo.webp" alt="" width={34} height={34} /></span><span>SafePath</span></a>
      <nav className="site-nav" aria-label="Primary navigation">{navigation.map(item => <a key={item.href} href={item.href} aria-current={current(pathname, item.href) ? "page" : undefined}>{item.label}</a>)}</nav>
      <a className="site-account" href={accountHref}>{accountText}</a>
      <button ref={button} id="site-menu-button" className="site-menu-button" type="button" aria-expanded={open} aria-controls="site-menu" aria-label={open ? "Close menu" : "Open menu"} onClick={onToggle}><span /><span /><span /></button>
    </div></header>
    <div ref={menu} id="site-menu" className="site-menu" role="dialog" aria-modal="true" aria-label="Site menu" hidden={!open} onClick={e => { if (e.target === e.currentTarget) { setOpen(false); button.current?.focus(); } }}>
      <div className="site-menu__panel"><nav aria-label="Mobile navigation">{navigation.map(item => <a key={item.href} href={item.href} aria-current={current(pathname, item.href) ? "page" : undefined} onClick={() => setOpen(false)}>{item.label}</a>)}</nav><a className="site-menu__account" href={accountHref}>{accountText}</a><a className="site-menu__action" href="/maps/new">Upload a floor plan</a></div>
    </div>
  </>;
}
