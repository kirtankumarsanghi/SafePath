"use client";
import { useEffect, useState, type ReactNode } from "react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const sync = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("safepath-theme");
      } catch (_) {}
      const active = saved === "light" ? "light" : "dark";
      setTheme(active);
      document.documentElement.setAttribute("data-theme", active);
      if (active === "light") {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("safepath-theme-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("safepath-theme-change", sync);
    };
  }, []);

  return (
    <div className={`sp-shell ${theme}`}>
      <SiteHeader />
      <main className="sp-main">
        <div className="sp-main__inner">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

