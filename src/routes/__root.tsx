import { type ReactNode, useEffect, useState } from "react";
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import {
  GraduationCap,
  Users,
  UserPlus,
  DollarSign,
  Briefcase,
  DoorOpen,
  Building2,
  LayoutDashboard,
  ShieldCheck,
  CalendarCheck,
  BarChart2,
  CreditCard,
  RefreshCcw,
  BookOpen,
  ClipboardList,
  FileText,
  TrendingUp,
  Wallet,
  Megaphone,
  MoreHorizontal,
  X,
  Calendar,
  Clock,
} from "lucide-react";
import appCss from "../styles.css?url";
import { TenantProvider, useTenant } from "@/lib/tenant";
import { ToastProvider } from "@/lib/toast";
import { SchoolLocationSwitcher } from "@/components/school-location-switcher";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { UserMenu } from "@/components/user-menu";
import { useServerFn } from "@tanstack/react-start";
import { getSession, getSchoolBoard } from "@/lib/auth";
import { usePush } from "@/lib/usePush";

export const publicPaths = [
  "/", "/about", "/contact", "/pricing", "/refund-policy", "/privacy-policy", "/terms-of-service",
  "/login", "/signup", "/forgot-password", "/reset-password", "/invite", "/invoice-print",
];

// Role → home route mapping
export function roleHome(role: string | null | undefined): string {
  switch (role) {
    case "super_admin":    return "/super-admin";
    case "teacher":
    case "staff":          return "/teacher";
    case "receptionist":   return "/admissions";
    case "parent":         return "/parent";
    default:               return "/dashboard"; // school_admin, location_admin, accountant
  }
}

// Nav items visible per role
const ADMIN_NAV = [
  { to: "/dashboard",       label: "Dashboard",      icon: LayoutDashboard },
  { to: "/admissions",      label: "Admissions",     icon: UserPlus },
  { to: "/students",        label: "Students",       icon: Users },
  { to: "/attendance",      label: "Attendance",     icon: CalendarCheck },
  { to: "/daycare",         label: "Daycare",        icon: Clock },
  { to: "/fees",            label: "Fees",           icon: DollarSign },
  { to: "/academics",       label: "Academics",      icon: GraduationCap },
  { to: "/exams",           label: "Exams",          icon: ClipboardList },
  { to: "/staff",           label: "Staff",          icon: Briefcase },
  { to: "/classes",         label: "Classes",        icon: DoorOpen },
  { to: "/expenses",        label: "Expenses",       icon: Wallet },
  { to: "/pnl",             label: "P&L",            icon: TrendingUp },
  { to: "/curriculum",      label: "Activities",     icon: BookOpen },
  { to: "/holidays",        label: "Holidays",       icon: Calendar },
  { to: "/announcements",   label: "Announcements",  icon: Megaphone },
];

const SCHOOL_ADMIN_NAV = [
  ...ADMIN_NAV,
  { to: "/schools", label: "School & Branches", icon: Building2 },
];

const TEACHER_NAV = [
  { to: "/teacher",             label: "My Dashboard",  icon: LayoutDashboard },
  { to: "/attendance",          label: "Attendance",    icon: CalendarCheck   },
  { to: "/students",            label: "Students",      icon: Users           },
  { to: "/daycare",             label: "Daycare",       icon: Clock            },
  { to: "/academics",           label: "Academics",     icon: GraduationCap   },
  { to: "/exams",               label: "Exams",         icon: ClipboardList   },
  { to: "/classes",             label: "Classes",       icon: DoorOpen        },
  { to: "/curriculum",          label: "Activities",    icon: BookOpen        },
  { to: "/holidays",            label: "Holidays",      icon: Calendar        },
  { to: "/announcements",       label: "Announcements", icon: Megaphone       },
];

const PARENT_NAV = [
  { to: "/parent", label: "Profile",       icon: Users,        search: { tab: "profile" } },
  { to: "/parent", label: "Fees",          icon: DollarSign,   search: { tab: "fees" } },
  { to: "/parent", label: "Attendance",    icon: CalendarCheck, search: { tab: "attendance" } },
  { to: "/parent", label: "Academics",     icon: GraduationCap, search: { tab: "academics" } },
  { to: "/parent", label: "Activities",    icon: Calendar,     search: { tab: "activities" } },
  { to: "/parent", label: "Holidays",      icon: Calendar,     search: { tab: "holidays" } },
  { to: "/parent", label: "Announcements", icon: Megaphone,    search: { tab: "announcements" } },
];

const SUPER_ADMIN_NAV = [
  { to: "/super-admin",                label: "Overview",        icon: BarChart2    },
  { to: "/super-admin/schools",        label: "All Schools",     icon: Building2    },
  { to: "/super-admin/subscriptions",  label: "Subscriptions",   icon: RefreshCcw   },
  { to: "/super-admin/payments",       label: "Payments",        icon: CreditCard   },
  { to: "/super-admin/plans",          label: "Plans & Pricing", icon: DollarSign   },
  { to: "/super-admin/announcements",  label: "Announcements",   icon: CalendarCheck},
];

const ACCOUNTANT_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/fees",     label: "Fees",      icon: DollarSign },
];

const RECEPTIONIST_NAV = [
  { to: "/admissions", label: "Admissions", icon: UserPlus },
  { to: "/daycare",    label: "Daycare",    icon: Clock },
  { to: "/fees",       label: "Fees",       icon: DollarSign },
  { to: "/exams",      label: "Exams",      icon: ClipboardList },
];

function navForRole(role: string | null | undefined, board?: string | null) {
  let nav;
  switch (role) {
    case "super_admin":   nav = SUPER_ADMIN_NAV; break;
    case "teacher":
    case "staff":         nav = TEACHER_NAV; break;
    case "parent":        nav = PARENT_NAV; break;
    case "accountant":    nav = ACCOUNTANT_NAV; break;
    case "receptionist":  nav = RECEPTIONIST_NAV; break;
    case "school_admin":  nav = SCHOOL_ADMIN_NAV; break;
    default:              nav = ADMIN_NAV; break;
  }
  if (board === "preschool") {
    nav = nav.filter((item) => item.to !== "/exams");
  }
  return nav;
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function SidebarContent({ role, board, onNavClick }: { role: string | null | undefined; board?: string | null; onNavClick?: () => void }) {
  const { pathname, search } = useLocation();
  const effectiveRole =
    role === "super_admin" && !pathname.startsWith("/super-admin")
      ? "school_admin"
      : role;
  const nav = navForRole(effectiveRole, board);
  const isImpersonating = role === "super_admin" && effectiveRole === "school_admin";
  const searchParams = new URLSearchParams(search);

  const isActive = (item: any) => {
    const exact = item.to === "/dashboard" || item.to === "/teacher" || item.to === "/parent" || item.to === "/super-admin";
    const pathMatch = exact ? pathname === item.to : pathname.startsWith(item.to);
    if (!item.search) return pathMatch;
    return pathMatch && searchParams.get("tab") === item.search.tab;
  };

  return (
    <>
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800 shrink-0">
        <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-indigo-600">
          <svg viewBox="0 0 64 64" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="32,13 52,23 32,33 12,23" fill="white" opacity="0.95"/>
            <rect x="48" y="23" width="2.5" height="11" rx="1.25" fill="white" opacity="0.8"/>
            <circle cx="49.25" cy="35.5" r="2.5" fill="white" opacity="0.8"/>
            <polyline points="12,44 20,44 24,38 28,51 32,41 36,44 52,44" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div className="text-sm font-bold text-white leading-tight">EduPulse</div>
          <div className="text-[10px] text-slate-400 leading-tight capitalize">
            {isImpersonating ? "Viewing as Admin" : role === "super_admin" ? "Platform Admin" : role === "parent" ? "Parent Portal" : role === "teacher" || role === "staff" ? "Teacher Portal" : "School ERP"}
          </div>
        </div>
      </div>
      {isImpersonating && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Impersonating school</span>
        </div>
      )}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">Menu</p>
        {nav.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.label}
              to={item.to}
              search={item.search}
              onClick={onNavClick}
              className={`flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-xl text-sm transition ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <item.icon className="w-5 h-5 md:w-4 md:h-4 shrink-0" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {isImpersonating && (
        <div className="px-3 pb-3 shrink-0">
          <Link
            to="/super-admin/schools"
            onClick={onNavClick}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold transition"
          >
            ← Exit to Super Admin
          </Link>
        </div>
      )}
      <div className="px-5 py-4 border-t border-slate-800 shrink-0">
        <p className="text-[11px] text-slate-600 text-center">EduPulse v1.0</p>
      </div>
    </>
  );
}

function Sidebar({ role, board }: { role: string | null | undefined; board?: string | null }) {
  return (
    /* Desktop sidebar — always visible, hidden on mobile (bottom tab bar used instead) */
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-slate-900 border-r border-slate-800">
      <SidebarContent role={role} board={board} />
    </aside>
  );
}

function BottomTabBar({ role, board }: { role: string | null | undefined; board?: string | null }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const effectiveRole =
    role === "super_admin" && !pathname.startsWith("/super-admin")
      ? "school_admin"
      : role;
  const nav = navForRole(effectiveRole, board);

  const isExact = (to: string) =>
    to === "/dashboard" || to === "/teacher" || to === "/parent" || to === "/super-admin";
  const isActive = (item: any) => {
    const exact = isExact(item.to);
    const pathMatch = exact ? pathname === item.to : pathname.startsWith(item.to);
    if (!item.search || !pathMatch) return pathMatch;
    const tab = new URLSearchParams(search).get("tab");
    return tab === item.search.tab;
  };

  const MAX_VISIBLE = 4;
  const visible = nav.slice(0, MAX_VISIBLE);
  const hidden = nav.slice(MAX_VISIBLE);
  const hiddenActive = hidden.some((i) => isActive(i));

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 h-14 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="h-14 flex items-stretch">
          {visible.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.label}
                to={item.to}
                search={item.search}
                className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2 px-1 transition rounded-lg ${
                  active ? "bg-blue-50 text-blue-600" : "text-slate-400"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="text-[10px] font-medium leading-tight truncate max-w-[70px] text-center">{item.label}</span>
              </Link>
            );
          })}
          {hidden.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2 px-1 rounded-lg transition ${
                hiddenActive || moreOpen ? "bg-blue-50 text-blue-600" : "text-slate-400"
              }`}
            >
              <MoreHorizontal className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-medium leading-tight">More</span>
            </button>
          )}
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-14 left-0 right-0">
            <div className="bg-white rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.12)] p-3 pb-5 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3 px-2">
                <span className="text-sm font-bold text-slate-800">Menu</span>
                <button onClick={() => setMoreOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {hidden.map((item) => {
                  const active = isActive(item);
                  return (
                    <button
                      key={item.label}
                      onClick={() => {
                        navigate({ to: item.to, search: item.search });
                        setMoreOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-semibold transition ${
                        active ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <item.icon className="w-5 h-5 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TopBar({ role }: { role: string | null | undefined }) {
  const { tenant, setTenant } = useTenant();
  const { pathname } = useLocation();
  const isSuperAdminViewingSchool =
    role === "super_admin" && !pathname.startsWith("/super-admin");
  const canSwitchTenant = role === "school_admin" || isSuperAdminViewingSchool;
  const subtitle =
    role === "super_admin" ? "Platform administration" :
    role === "parent"      ? "Parent & family portal" :
    (role === "teacher" || role === "staff") ? "Teacher portal" :
    "School management portal";

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shrink-0 gap-3 shadow-sm">
      <div className="min-w-0">
        <h1 className="text-sm font-bold text-slate-800 leading-tight truncate">EduPulse</h1>
        <p className="text-xs text-slate-400 leading-tight truncate">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {canSwitchTenant && <div className="hidden md:block"><SchoolLocationSwitcher current={tenant} onChange={setTenant} /></div>}
        {canSwitchTenant && <div className="hidden md:block h-7 w-px bg-slate-200" />}
        <UserMenu />
      </div>
    </header>
  );
}

function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const getSessionFn = useServerFn(getSession);
  const getSchoolBoardFn = useServerFn(getSchoolBoard);
  const { setTenant, tenant } = useTenant();
  // undefined = not checked yet, null = not authenticated, string = role
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [board, setBoard] = useState<string | null>(null);
  const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + "?"));

  useEffect(() => {
    if (isPublic) return;
    setRole(undefined); // reset to "checking" on every navigation
    getSessionFn().then((user) => {
      if (!user) {
        navigate({ to: "/login" });
        return;
      }
      // Always sync tenant from the authenticated user's school/location.
      // This is the single source of truth on every page load / refresh.
      if (user.schoolId && user.locationId) {
        const stored = typeof window !== "undefined" ? localStorage.getItem("edupulse-tenant") : null;
        let needsReset = true;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            // Keep stored tenant if it belongs to the same school, or if super admin is viewing another school
            if (parsed.schoolId === user.schoolId || user.role === "super_admin") needsReset = false;
          } catch { /* bad JSON — reset */ }
        }
        if (needsReset) {
          setTenant({ schoolId: user.schoolId, locationId: user.locationId, schoolName: "School", locationName: "Branch" });
        }
      }
      setRole(user.role);
      if (user.schoolId) {
        getSchoolBoardFn({ data: { schoolId: user.schoolId } }).then((d: any) => setBoard(d)).catch(() => setBoard(null));
      }
      // Role-based redirect
      const home = roleHome(user.role);
      const adminRoutes = ["/dashboard", "/admissions", "/students", "/students/", "/fees", "/staff", "/staff/", "/classes", "/schools", "/locations", "/curriculum", "/expenses", "/pnl", "/announcements"];
      const accountantRoutes = ["/dashboard", "/fees"];
      const receptionistRoutes = ["/admissions", "/fees", "/exams"];
      const teacherRoutes = ["/teacher", "/teacher/attendance", "/attendance", "/students", "/academics", "/exams", "/classes", "/curriculum", "/announcements", "/teacher/announcements"];
      const parentRoutes = ["/parent"];
      const superRoutes = ["/super-admin"];
      if (user.role === "teacher" || user.role === "staff") {
        if (teacherRoutes.some(r => pathname === r || pathname.startsWith(r + "/"))) {
          // allowed — do nothing
        } else if (adminRoutes.some(r => pathname === r || pathname.startsWith(r + "/")) || parentRoutes.some(r => pathname.startsWith(r)) || superRoutes.some(r => pathname.startsWith(r)))
          navigate({ to: home });
      } else if (user.role === "parent") {
        if (adminRoutes.includes(pathname) || teacherRoutes.includes(pathname) || superRoutes.includes(pathname))
          navigate({ to: home });
      } else if (user.role === "accountant") {
        if (!accountantRoutes.includes(pathname))
          navigate({ to: home });
      } else if (user.role === "receptionist") {
        if (!receptionistRoutes.includes(pathname))
          navigate({ to: home });
      }
    });
  }, [pathname]);

  useEffect(() => {
    if (isPublic) return;
    if (tenant?.schoolId) {
      getSchoolBoardFn({ data: { schoolId: tenant.schoolId } }).then((d: any) => setBoard(d)).catch(() => setBoard(null));
    }
  }, [tenant?.schoolId, isPublic]);

  if (isPublic) return <Outlet />;

  // Block rendering the page content until session check completes.
  // This prevents page components from firing data-load calls with a stale tenant.
  if (role === undefined) {
    return (
      <div className="min-h-screen flex">
        {/* Blank sidebar skeleton — desktop only */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col bg-slate-900 border-r border-slate-800">
          <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800">
            <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-indigo-600">
              <svg viewBox="0 0 64 64" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polygon points="32,13 52,23 32,33 12,23" fill="white" opacity="0.95"/>
                <rect x="48" y="23" width="2.5" height="11" rx="1.25" fill="white" opacity="0.8"/>
                <circle cx="49.25" cy="35.5" r="2.5" fill="white" opacity="0.8"/>
                <polyline points="12,44 20,44 24,38 28,51 32,41 36,44 52,44" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight">EduPulse</div>
              <div className="w-20 h-2.5 bg-slate-700 rounded animate-pulse mt-1" />
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 mx-1 rounded-xl bg-slate-800 animate-pulse my-0.5" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </nav>
        </aside>
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
          <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center shrink-0 shadow-sm">
            <div className="w-32 h-4 bg-slate-200 rounded animate-pulse" />
          </header>
          <main className="flex-1 p-8 overflow-auto flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <svg className="animate-spin w-7 h-7 text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-sm font-medium">Loading…</span>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar role={role} board={board} />
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
        <TopBar role={role} />
        {/* Announcement banner — shown to all non-super-admin roles */}
        {role && role !== "super_admin" && (
          <div className="shrink-0">
            <AnnouncementBanner />
          </div>
        )}
        <main className="flex-1 p-4 pb-14 md:p-8 overflow-auto">
          <Outlet />
        </main>
        {/* Mobile bottom tab bar */}
        <BottomTabBar role={role} board={board} />
      </div>
    </div>
  );
}

function RootComponent() {
  return (
    <TenantProvider>
      <ToastProvider>
        <RegisterSW />
        <AppShell />
      </ToastProvider>
    </TenantProvider>
  );
}

function RegisterSW() {
  usePush();
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

export const Route = createRootRoute({
  head: () => ({
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#2563eb" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { title: "EduPulse" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => <p className="p-8">Page not found</p>,
});
