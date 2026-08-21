import { Link, useLocation } from "wouter";
import { LayoutDashboard, Package, Target, Layers, Eye, Zap, Settings, TrendingUp, Users, Shield, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";
import { PasskeySetupBanner } from "./passkey-setup";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

const NAV_TABS = [
  { name: "Today",    path: "/",         icon: LayoutDashboard },
  { name: "Products", path: "/products", icon: Package },
  { name: "Leads",    path: "/leads",    icon: Users },
  { name: "Goals",    path: "/goals",    icon: Target },
  { name: "Stack",    path: "/stack",    icon: Layers },
  { name: "Vision",   path: "/vision",   icon: Eye },
  { name: "Director", path: "/chat",     icon: Zap },
  { name: "Settings", path: "/settings", icon: Settings },
] as const;

function navActive(location: string, path: string) {
  return location === path || (path !== "/" && location.startsWith(path));
}

// ── Desktop sidebar ────────────────────────────────────────────────────────
function SideNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toggle, isLight } = useTheme();
  const _isMember = user?.role === "member"; // kept for lint; replaced by direct role checks below
  const mainTabs = NAV_TABS.filter(t => t.path !== "/settings");
  const settingsTab = NAV_TABS.find(t => t.path === "/settings")!;

  return (
    <aside
      className="hidden lg:flex w-56 xl:w-60 shrink-0 flex-col h-full border-r border-border/30"
      style={{ backgroundColor: "var(--sidebar-bg)" }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm leading-none text-foreground">Closer</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Sales Command Centre</p>
          </div>
          {user?.role === "member" && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/20">
              <Shield className="w-2.5 h-2.5 text-amber-400" />
              <span className="text-[9px] text-amber-400 font-medium">Member</span>
            </div>
          )}
          {user?.role === "admin" && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-400/10 border border-blue-400/20">
              <Shield className="w-2.5 h-2.5 text-blue-400" />
              <span className="text-[9px] text-blue-400 font-medium">Admin</span>
            </div>
          )}
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-4">
        {mainTabs.map(tab => {
          const active = navActive(location, tab.path);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {tab.name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Settings + theme toggle */}
      <div className="px-3 py-3 border-t border-border/20 space-y-0.5">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-muted-foreground hover:text-foreground hover:bg-black/5"
          title={isLight ? "Switch to dark mode" : "Switch to light mode"}
        >
          {isLight
            ? <Moon className="w-4 h-4 shrink-0" />
            : <Sun  className="w-4 h-4 shrink-0" />}
          {isLight ? "Dark mode" : "Light mode"}
        </button>

        {/* Settings */}
        {(() => {
          const active = navActive(location, settingsTab.path);
          const Icon = settingsTab.icon;
          return (
            <Link
              href={settingsTab.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {settingsTab.name}
            </Link>
          );
        })()}
      </div>
    </aside>
  );
}

// ── Mobile bottom nav ──────────────────────────────────────────────────────
export function BottomNav() {
  const [location] = useLocation();
  const { toggle, isLight } = useTheme();

  return (
    <>
      {/* Fade gradient above nav */}
      <div className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 pointer-events-none h-12 bg-gradient-to-t from-background to-transparent lg:hidden" />
      <nav className="absolute bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border/50 pb-safe lg:hidden">
        <div className="flex justify-around items-center h-16 px-1">
          {NAV_TABS.map(tab => {
            const active = navActive(location, tab.path);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                href={tab.path}
                className="flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 tap-highlight-transparent"
              >
                <Icon className={cn("w-5 h-5 transition-colors duration-200", active ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-[9px] font-medium tracking-wide transition-colors duration-200", active ? "text-primary" : "text-muted-foreground")}>
                  {tab.name}
                </span>
              </Link>
            );
          })}
          {/* Theme toggle — compact icon at the far right on mobile */}
          <button
            onClick={toggle}
            className="flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 tap-highlight-transparent"
            title={isLight ? "Dark mode" : "Light mode"}
          >
            {isLight
              ? <Moon className="w-5 h-5 text-muted-foreground" />
              : <Sun  className="w-5 h-5 text-muted-foreground" />}
            <span className="text-[9px] font-medium tracking-wide text-muted-foreground">
              {isLight ? "Dark" : "Light"}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

// ── App shell ──────────────────────────────────────────────────────────────
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    // Outer wrapper: full viewport, dark bg, flex row on desktop
    <div
      className="h-[100dvh] w-full text-foreground overflow-hidden lg:flex"
      style={{ backgroundColor: "var(--shell-bg)" }}
    >

      {/* Desktop sidebar */}
      <SideNav />

      {/* Content area */}
      <div className="flex-1 flex justify-center overflow-hidden lg:justify-start lg:bg-background">
        {/*
          Phone-frame on mobile (max-w-md, border, shadow)
          Full-width on desktop (no frame constraints)
        */}
        <div className={cn(
          "w-full bg-background h-full relative flex flex-col overflow-hidden",
          // mobile frame
          "max-w-md shadow-2xl border-x border-border/20",
          // desktop: remove frame
          "lg:max-w-none lg:shadow-none lg:border-none",
        )}>
          <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col w-full relative">
            <PasskeySetupBanner />
            {/* On desktop, constrain + centre content */}
            <div className="flex-1 flex flex-col lg:max-w-5xl lg:w-full lg:mx-auto lg:self-start lg:min-h-full">
              {children}
            </div>
          </main>
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
