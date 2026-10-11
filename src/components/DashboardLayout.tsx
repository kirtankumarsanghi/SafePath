import type { ReactNode } from "react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <div className="sp-shell dark"><SiteHeader /><main className="sp-main"><div className="sp-main__inner">{children}</div></main><SiteFooter /></div>;
}
