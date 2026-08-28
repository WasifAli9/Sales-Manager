import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  Target,
  Layers,
  Eye,
  Zap,
  Settings,
  TrendingUp,
  Users,
  Shield,
  Sun,
  Moon,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ReactNode, useState } from "react";
import { PasskeySetupBanner } from "./passkey-setup";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const NAV_TABS = [
  { name: "My Day", path: "/", icon: LayoutDashboard },
  { name: "Products", path: "/products", icon: Package },
  { name: "Leads", path: "/leads", icon: Users },
  { name: "Goals", path: "/goals", icon: Target },
  { name: "Stack", path: "/stack", icon: Layers },
  { name: "Vision", path: "/vision", icon: Eye },
  { name: "Director", path: "/chat", icon: Zap },
  { name: "Settings", path: "/settings", icon: Settings },
] as const;

function navActive(location: string, path: string) {
  return location === path || (path !== "/" && location.startsWith(path));
}

function RoleBadge() {
  const { user } = useAuth();
  if (user?.role === "member") {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/20">
        <Shield className="w-2.5 h-2.5 text-amber-400" />
        <span className="text-[9px] text-amber-400 font-medium">Member</span>
      </div>
    );
  }
  if (user?.role === "admin") {
    return (
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-400/10 border border-blue-400/20">
        <Shield className="w-2.5 h-2.5 text-blue-400" />
        <span className="text-[9px] text-blue-400 font-medium">Admin</span>
      </div>
    );
  }
  return null;
}

function NavLinks({
  onNavigate,
  showSettings = true,
}: {
  onNavigate?: () => void;
  showSettings?: boolean;
}) {
  const [location] = useLocation();
  const { toggle, isLight } = useTheme();
  const mainTabs = NAV_TABS.filter((t) => t.path !== "/settings");
  const settingsTab = NAV_TABS.find((t) => t.path === "/settings")!;

  return (
    <>
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-4">
        {mainTabs.map((tab) => {
          const active = navActive(location, tab.path);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              href={tab.path}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 min-h-[44px]",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-black/5",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {tab.name}
            </Link>
          );
        })}
      </nav>

      {showSettings && (
        <div className="px-3 py-3 border-t border-border/20 space-y-0.5">
          <button
            type="button"
            onClick={toggle}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-muted-foreground hover:text-foreground hover:bg-black/5 min-h-[44px]"
            title={isLight ? "Switch to dark mode" : "Switch to light mode"}
          >
            {isLight ? (
              <Moon className="w-4 h-4 shrink-0" />
            ) : (
              <Sun className="w-4 h-4 shrink-0" />
            )}
            {isLight ? "Dark mode" : "Light mode"}
          </button>

          {(() => {
            const active = navActive(location, settingsTab.path);
            const Icon = settingsTab.icon;
            return (
              <Link
                href={settingsTab.path}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 min-h-[44px]",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-black/5",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {settingsTab.name}
              </Link>
            );
          })()}
        </div>
      )}
    </>
  );
}

// ── Desktop sidebar ────────────────────────────────────────────────────────
function SideNav() {
  return (
    <aside
      className="hidden lg:flex w-56 xl:w-60 shrink-0 flex-col h-full border-r border-border/30"
      style={{ backgroundColor: "var(--sidebar-bg)" }}
    >
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm leading-none text-foreground">Sales Manager</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Sales Command Centre
            </p>
          </div>
          <RoleBadge />
        </div>
      </div>

      <NavLinks />
    </aside>
  );
}

// ── Mobile header + burger menu ────────────────────────────────────────────
function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="lg:hidden sticky top-0 z-50 flex items-center gap-3 px-3 h-14 border-b border-border/30 bg-background/95 backdrop-blur shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-none text-foreground truncate">
              Sales Manager
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              Sales Command Centre
            </p>
          </div>
        </div>
        <RoleBadge />
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[min(100vw-3rem,18rem)] p-0 border-r border-border/30"
          style={{ backgroundColor: "var(--sidebar-bg)" }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-full pt-6">
            <div className="px-5 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm leading-none text-foreground">
                    Sales Manager
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Sales Command Centre
                  </p>
                </div>
              </div>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── App shell ──────────────────────────────────────────────────────────────
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col text-foreground lg:h-dvh lg:min-h-0 lg:flex-row lg:overflow-hidden"
      style={{ backgroundColor: "var(--shell-bg)" }}
    >
      <SideNav />

      <div className="flex min-h-0 min-w-0 flex-1 justify-center lg:justify-start lg:overflow-hidden lg:bg-background">
        <div
          className={cn(
            "relative flex w-full min-h-dvh flex-col bg-background",
            "max-w-md shadow-2xl border-x border-border/20",
            "lg:h-full lg:min-h-0 lg:max-w-none lg:overflow-hidden lg:shadow-none lg:border-none",
          )}
        >
          <MobileNav />
          <main className="relative min-w-0 flex-1 overflow-x-hidden lg:app-scroll lg:min-h-0 lg:overflow-y-auto">
            <PasskeySetupBanner />
            <div className="lg:mx-auto lg:w-full lg:max-w-5xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
