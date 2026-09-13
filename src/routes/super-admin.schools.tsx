import { createFileRoute, useNavigate, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSuperAdminDashboard, toggleSchoolStatus, viewAsSchoolAdmin } from "@/lib/auth";
import {
  Building2, CheckCircle2, Ban, ArrowRight, AlertCircle, Loader2, Search, Settings,
} from "lucide-react";
import { useTenant } from "@/lib/tenant";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/super-admin/schools")({
  component: SchoolsRoot,
});

function SchoolsRoot() {
  const { pathname } = useLocation();
  // If we're on a child route (e.g. /super-admin/schools/2), render the child
  if (pathname !== "/super-admin/schools" && pathname !== "/super-admin/schools/") {
    return <Outlet />;
  }
  return <SuperAdminSchools />;
}

type School = {
  id: number; name: string; email: string | null; city: string | null; state: string | null;
  plan: string | null; status: string | null; createdAt: string | null;
  studentCount: number;
  subscription: { plan: string; status: string | null; amount: number; billingCycle: string | null } | null;
};

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

function SuperAdminSchools() {
  const getDashFn = useServerFn(getSuperAdminDashboard);
  const toggleFn  = useServerFn(toggleSchoolStatus);
  const viewFn    = useServerFn(viewAsSchoolAdmin);
  const { setTenant } = useTenant();
  const navigate = useNavigate();

  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [toggling, setToggling] = useState<number | null>(null);
  const [search, setSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    getDashFn()
      .then((d: any) => setSchools(d.schools))
      .catch((e: any) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (school: School) => {
    const next = school.status === "active" ? "suspended" : "active";
    setToggling(school.id);
    try {
      await toggleFn({ data: { schoolId: school.id, status: next } });
      setSchools((prev) => prev.map((s) => s.id === school.id ? { ...s, status: next } : s));
    } catch (e: any) { setError(e?.message ?? "Toggle failed"); }
    finally { setToggling(null); }
  };

  const handleView = async (school: School) => {
    try {
      const tenant = await viewFn({ data: { schoolId: school.id } });
      setTenant(tenant as any);
      navigate({ to: "/dashboard" });
    } catch (e: any) { setError(e?.message ?? "Failed to view school"); }
  };

  const filtered = schools.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.city ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">All Schools</h1>
        <p className="text-sm text-slate-500 mt-0.5">Every school registered on EduPulse</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      {/* Stat chips */}
      {!loading && (
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "All",       value: "all",      count: schools.length },
            { label: "Active",    value: "active",   count: schools.filter(s => s.status === "active").length },
            { label: "Suspended", value: "suspended",count: schools.filter(s => s.status === "suspended").length },
            { label: "Pending",   value: "pending",  count: schools.filter(s => s.status === "pending").length },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                statusFilter === f.value
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              }`}
            >
              {f.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${statusFilter === f.value ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                {f.count}
              </span>
            </button>
          ))}
          {/* Search */}
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search schools…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition w-56"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-blue-600 rounded-full" />
            <span className="text-sm font-bold text-slate-800">Schools</span>
            <span className="text-xs text-slate-400">({filtered.length})</span>
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <div className="w-9 h-9 rounded-xl bg-slate-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-40" />
                  <div className="h-2.5 bg-slate-100 rounded animate-pulse w-28" />
                </div>
                <div className="h-6 w-16 bg-slate-100 rounded-full animate-pulse" />
                <div className="h-6 w-16 bg-slate-100 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-400">No schools found</p>
          </div>
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
                            <p className="text-xs text-slate-400">
                              ₹{school.subscription.amount}/{school.subscription.billingCycle?.replace("ly", "")}
                            </p>
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
                        <Link
                          to="/super-admin/schools/$schoolId"
                          params={{ schoolId: String(school.id) }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition"
                        >
                          <Settings className="w-3.5 h-3.5" /> Manage
                        </Link>
                        <button
                          onClick={() => handleView(school)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                        >
                          <ArrowRight className="w-3.5 h-3.5" /> View
                        </button>
                        <button
                          onClick={() => handleToggle(school)}
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
    </div>
  );
}
