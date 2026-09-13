import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSuperAdminDashboard, toggleSchoolStatus, viewAsSchoolAdmin, getPlatformRevenue } from "@/lib/auth";
import {
  Building2, Users, GraduationCap, AlertCircle, CheckCircle2, Ban,
  TrendingUp, ArrowRight, IndianRupee, BarChart2, RefreshCcw,
  Activity, Loader2, Clock, XCircle, AlertTriangle,
} from "lucide-react";
import { useTenant } from "@/lib/tenant";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/super-admin")({
  component: SuperAdminPanel,
});

// ── Types ──────────────────────────────────────────────────────────────────
type School = {
  id: number; name: string; email: string | null; city: string | null; state: string | null;
  plan: string | null; status: string | null; createdAt: string | null;
  studentCount: number;
  subscription: { plan: string; status: string | null; amount: number; billingCycle: string | null } | null;
};
type DashData = {
  schools: School[];
  stats: { totalSchools: number; activeSchools: number; totalStudents: number; totalUsers: number; newSchools30d: number };
};
type Revenue = {
  mrr: number; arr: number; totalRevenue: number; revenue30d: number;
  churnedThisMonth: number; trialsExpiringSoon: number;
  activeCount: number; trialingCount: number; canceledCount: number; pastDueCount: number;
  planBreakdown: Record<string, number>;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` :
  n >= 1000   ? `₹${(n / 1000).toFixed(1)}K`   : `₹${n.toLocaleString("en-IN")}`;

const PLAN_BADGE: Record<string, string> = {
  free:       "bg-slate-100 text-slate-600",
  growth:     "bg-blue-50 text-blue-700",
  enterprise: "bg-violet-50 text-violet-700",
};
const STATUS_BADGE: Record<string, string> = {
  active:    "bg-emerald-50 text-emerald-700",
  suspended: "bg-red-50 text-red-700",
  pending:   "bg-amber-50 text-amber-700",
  archived:  "bg-slate-100 text-slate-500",
};
const SUB_STATUS_BADGE: Record<string, string> = {
  active:   "bg-emerald-50 text-emerald-700",
  trialing: "bg-blue-50 text-blue-600",
  past_due: "bg-amber-50 text-amber-700",
  canceled: "bg-red-50 text-red-600",
  paused:   "bg-slate-100 text-slate-500",
};

// ── Revenue Cards ──────────────────────────────────────────────────────────
function RevenueSection({ rev, loading }: { rev: Revenue | null; loading: boolean }) {
  if (loading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-200 h-28 animate-pulse" />)}
    </div>
  );
  if (!rev) return null;

  const totalActive = rev.activeCount + rev.trialingCount;
  const planEntries = Object.entries(rev.planBreakdown).sort((a,b) => b[1]-a[1]);
  const maxPlan = Math.max(...planEntries.map(([,v]) => v), 1);

  return (
    <div className="space-y-4">
      {/* Revenue metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "MRR",
            value: fmt(rev.mrr),
            sub: `ARR ${fmt(rev.arr)}`,
            icon: IndianRupee,
            stripe: "from-emerald-500 to-teal-500",
            bg: "bg-emerald-50", text: "text-emerald-700",
          },
          {
            label: "Total Revenue",
            value: fmt(rev.totalRevenue),
            sub: `+${fmt(rev.revenue30d)} last 30d`,
            icon: TrendingUp,
            stripe: "from-blue-500 to-indigo-500",
            bg: "bg-blue-50", text: "text-blue-700",
          },
          {
            label: "Active Subscriptions",
            value: totalActive,
            sub: `${rev.activeCount} paid · ${rev.trialingCount} trial`,
            icon: Activity,
            stripe: "from-violet-500 to-purple-500",
            bg: "bg-violet-50", text: "text-violet-700",
          },
          {
            label: "Churn / Issues",
            value: rev.canceledCount,
            sub: `${rev.churnedThisMonth} cancelled this month · ${rev.pastDueCount} past due`,
            icon: rev.canceledCount > 0 ? XCircle : CheckCircle2,
            stripe: rev.canceledCount > 0 ? "from-red-400 to-rose-500" : "from-emerald-400 to-green-500",
            bg: rev.canceledCount > 0 ? "bg-red-50" : "bg-emerald-50",
            text: rev.canceledCount > 0 ? "text-red-600" : "text-emerald-700",
          },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className={`h-1.5 bg-gradient-to-r ${c.stripe}`} />
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.bg}`}>
                  <c.icon className={`w-5 h-5 ${c.text}`} />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-slate-900 leading-none mb-1">{c.value}</div>
              <div className="text-xs text-slate-500 font-medium">{c.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Plan breakdown + alerts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Plan breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-bold text-slate-800">Plan Breakdown</span>
            <span className="ml-auto text-xs text-slate-400">{totalActive} active/trial</span>
          </div>
          {planEntries.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No active subscriptions yet</p>
          ) : (
            <div className="space-y-3">
              {planEntries.map(([plan, cnt]) => (
                <div key={plan} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${PLAN_BADGE[plan] ?? "bg-slate-100 text-slate-600"}`}>{plan}</span>
                    <span className="font-bold text-slate-700">{cnt} school{cnt !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.round((cnt / maxPlan) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold text-slate-800">Alerts</span>
          </div>
          <div className="space-y-3">
            {rev.trialsExpiringSoon > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-800">{rev.trialsExpiringSoon} trial{rev.trialsExpiringSoon !== 1 ? "s" : ""} expiring within 7 days</p>
                  <p className="text-xs text-amber-600 mt-0.5">Consider reaching out to convert these schools</p>
                </div>
              </div>
            )}
            {rev.pastDueCount > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-red-800">{rev.pastDueCount} subscription{rev.pastDueCount !== 1 ? "s" : ""} past due</p>
                  <p className="text-xs text-red-600 mt-0.5">Payment collection may be required</p>
                </div>
              </div>
            )}
            {rev.churnedThisMonth > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-50 border border-rose-200">
                <RefreshCcw className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-rose-800">{rev.churnedThisMonth} cancellation{rev.churnedThisMonth !== 1 ? "s" : ""} this month</p>
                  <p className="text-xs text-rose-600 mt-0.5">Review win-back strategies</p>
                </div>
              </div>
            )}
            {rev.trialsExpiringSoon === 0 && rev.pastDueCount === 0 && rev.churnedThisMonth === 0 && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-xs font-bold text-emerald-700">All clear — no urgent issues</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Schools Table ──────────────────────────────────────────────────────────
function SchoolsTable({
  schools, search, onSearch, toggling, onToggle, onView,
}: {
  schools: School[]; search: string;
  onSearch: (v: string) => void;
  toggling: number | null;
  onToggle: (s: School) => void;
  onView: (s: School) => void;
}) {
  const filtered = schools.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (s.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-blue-600 rounded-full" />
          <h2 className="text-sm font-bold text-slate-800">All Schools</h2>
          <span className="text-xs text-slate-400">({filtered.length})</span>
        </div>
        <input
          type="text" placeholder="Search schools…"
          value={search} onChange={(e) => onSearch(e.target.value)}
          className="px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition w-52"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-slate-400">No schools found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5">School</th>
                <th className="px-5 py-3.5">Location</th>
                <th className="px-5 py-3.5">Plan</th>
                <th className="px-5 py-3.5">Subscription</th>
                <th className="px-5 py-3.5">Students</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Joined</th>
                <th className="px-5 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((school) => (
                <tr key={school.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{school.name}</p>
                        <p className="text-xs text-slate-400">{school.email ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-xs">
                    {[school.city, school.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${PLAN_BADGE[school.plan ?? "free"] ?? "bg-slate-100 text-slate-600"}`}>
                      {school.plan ?? "free"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {school.subscription ? (
                      <div className="space-y-0.5">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${SUB_STATUS_BADGE[school.subscription.status ?? ""] ?? "bg-slate-100 text-slate-500"}`}>
                          {school.subscription.status}
                        </span>
                        {school.subscription.amount > 0 && (
                          <p className="text-xs text-slate-400">₹{school.subscription.amount}/{school.subscription.billingCycle?.replace("ly","")}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-900">{school.studentCount}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${STATUS_BADGE[school.status ?? "pending"] ?? "bg-slate-100 text-slate-600"}`}>
                      {school.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-xs">{fmtDate(school.createdAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onView(school)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                      >
                        <ArrowRight className="w-3.5 h-3.5" /> View
                      </button>
                      <button
                        onClick={() => onToggle(school)}
                        disabled={toggling === school.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition disabled:opacity-50 ${
                          school.status === "active"
                            ? "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                            : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {toggling === school.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : school.status === "active"
                            ? <><Ban className="w-3.5 h-3.5" /> Suspend</>
                            : <><CheckCircle2 className="w-3.5 h-3.5" /> Activate</>
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Overview Dashboard ─────────────────────────────────────────────────────
function SuperAdminDashboard() {
  const getDashFn = useServerFn(getSuperAdminDashboard);
  const getRevFn  = useServerFn(getPlatformRevenue);

  const [data, setData]             = useState<DashData | null>(null);
  const [rev, setRev]               = useState<Revenue | null>(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [loadingRev, setLoadingRev]   = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    getDashFn()
      .then((d) => setData(d as DashData))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoadingDash(false));
    getRevFn()
      .then((r) => setRev(r as Revenue))
      .catch(() => {})
      .finally(() => setLoadingRev(false));
  }, []);

  if (loadingDash) return (
    <div className="space-y-4">
      {[1,2,3,4,5].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-200 h-24 animate-pulse" />)}
    </div>
  );

  const stats = data?.stats;

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">EduPulse platform — live metrics</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Live data
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      {/* Platform health cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Schools",  value: stats?.totalSchools  ?? 0, icon: Building2,    stripe: "from-blue-500 to-blue-600",      bg: "bg-blue-50",    text: "text-blue-700"    },
          { label: "Active Schools", value: stats?.activeSchools ?? 0, icon: CheckCircle2, stripe: "from-emerald-500 to-emerald-600", bg: "bg-emerald-50", text: "text-emerald-700" },
          { label: "Total Students", value: stats?.totalStudents ?? 0, icon: GraduationCap,stripe: "from-violet-500 to-violet-600",  bg: "bg-violet-50",  text: "text-violet-700"  },
          { label: "Platform Users", value: stats?.totalUsers    ?? 0, icon: Users,        stripe: "from-amber-500 to-amber-600",    bg: "bg-amber-50",   text: "text-amber-700"   },
          { label: "New (30 days)",  value: stats?.newSchools30d ?? 0, icon: TrendingUp,   stripe: "from-teal-500 to-cyan-500",      bg: "bg-teal-50",    text: "text-teal-700"    },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className={`h-1.5 bg-gradient-to-r ${s.stripe}`} />
            <div className="p-5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.text}`} />
              </div>
              <div className="text-2xl font-extrabold text-slate-900 leading-none mb-1">{s.value}</div>
              <div className="text-xs text-slate-500 font-medium">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Revenue &amp; Subscriptions</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <RevenueSection rev={rev} loading={loadingRev} />
    </div>
  );
}

function SuperAdminPanel() {
  const { pathname } = useLocation();
  if (pathname === "/super-admin" || pathname === "/super-admin/") {
    return <SuperAdminDashboard />;
  }
  return <Outlet />;
}
