import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getSuperAdminSchoolDetail,
  updateSchoolSubscription,
  toggleSchoolStatus,
  viewAsSchoolAdmin,
  toggleSchoolDaycare,
} from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { fmtDate } from "@/lib/utils";
import {
  ArrowLeft, Building2, Users, Briefcase, MapPin,
  CreditCard, CheckCircle2, AlertCircle, Pencil, Plus,
  X, Loader2, ArrowRight, Ban,
} from "lucide-react";

export const Route = createFileRoute("/super-admin/schools/$schoolId")({
  component: SchoolDetailPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────
type School = {
  id: number; name: string; email: string | null; phone: string | null;
  city: string | null; state: string | null; address: string | null;
  plan: string | null; status: string | null; createdAt: any;
  maxStudents: number | null; maxStaff: number | null; maxLocations: number | null;
};
type Location = { id: number; name: string; city: string | null; status: string | null; capacity: number | null };
type Subscription = {
  id: number; plan: string; planId: number; amount: string | number; billingCycle: string | null;
  status: string | null; currentPeriodStart: any; currentPeriodEnd: any; startedAt: any;
  daycareEnabled: number | null;
};
type Payment = {
  id: number; amount: number; status: string | null; paidAt: any;
  razorpayOrderId: string | null; razorpayPaymentId: string | null;
};

const PLAN_BADGE: Record<string, string> = {
  free:       "bg-slate-100 text-slate-600",
  growth:     "bg-blue-50 text-blue-700",
  enterprise: "bg-violet-50 text-violet-700",
};
const SUB_STATUS_BADGE: Record<string, string> = {
  active:   "bg-emerald-50 text-emerald-700",
  trialing: "bg-blue-50 text-blue-600",
  past_due: "bg-amber-50 text-amber-700",
  canceled: "bg-red-50 text-red-600",
  paused:   "bg-slate-100 text-slate-500",
};
const inputCls = "w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition bg-white";

// ── Edit Subscription Modal ────────────────────────────────────────────────────
function EditSubscriptionModal({
  sub, schoolId, onClose, onSaved,
}: {
  sub: Subscription | null; schoolId: number; onClose: () => void; onSaved: () => void;
}) {
  const updateFn = useServerFn(updateSchoolSubscription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    planId:       sub?.planId ?? 2,
    amount:       String(Number(sub?.amount ?? 1999)),
    billingCycle: (sub?.billingCycle ?? "monthly") as "monthly" | "yearly" | "lifetime",
    status:       (sub?.status ?? "active") as "trialing"|"active"|"past_due"|"canceled"|"paused",
    maxStudents:  "",
    maxStaff:     "",
    maxLocations: "",
  });
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await updateFn({
        data: {
          schoolId,
          planId: f.planId,
          amount: Number(f.amount),
          billingCycle: f.billingCycle,
          status: f.status,
          ...(f.maxStudents  ? { maxStudents:  Number(f.maxStudents)  } : {}),
          ...(f.maxStaff     ? { maxStaff:     Number(f.maxStaff)     } : {}),
          ...(f.maxLocations ? { maxLocations: Number(f.maxLocations) } : {}),
        },
      });
      onSaved();
    } catch (err: any) { setError(err?.message ?? "Failed to update"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Edit Subscription</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Plan</label>
              <select value={f.planId} onChange={(e) => set("planId", Number(e.target.value))} className={`${inputCls} bg-white`}>
                <option value={1}>Free</option>
                <option value={2}>Growth</option>
                <option value={3}>Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount (₹/period)</label>
              <input type="number" value={f.amount} onChange={(e) => set("amount", e.target.value)} className={inputCls} min="0" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Billing cycle</label>
              <select value={f.billingCycle} onChange={(e) => set("billingCycle", e.target.value as any)} className={`${inputCls} bg-white`}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
              <select value={f.status} onChange={(e) => set("status", e.target.value as any)} className={`${inputCls} bg-white`}>
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="past_due">Past due</option>
                <option value="paused">Paused</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>
          </div>

          {/* Plan limits override */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Custom limits (leave blank to keep current)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max students</label>
                <input type="number" value={f.maxStudents} onChange={(e) => set("maxStudents", e.target.value)} placeholder="e.g. 200" className={inputCls} min="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max staff</label>
                <input type="number" value={f.maxStaff} onChange={(e) => set("maxStaff", e.target.value)} placeholder="e.g. 20" className={inputCls} min="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Max branches</label>
                <input type="number" value={f.maxLocations} onChange={(e) => set("maxLocations", e.target.value)} placeholder="e.g. 5" className={inputCls} min="0" />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold transition">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



// ── Main page ─────────────────────────────────────────────────────────────────
function SchoolDetailPage() {
  const { schoolId: schoolIdStr } = Route.useParams();
  const schoolId = Number(schoolIdStr);
  const navigate  = useNavigate();
  const { setTenant } = useTenant();

  const getDetailFn      = useServerFn(getSuperAdminSchoolDetail);
  const toggleFn         = useServerFn(toggleSchoolStatus);
  const viewFn           = useServerFn(viewAsSchoolAdmin);
  const toggleDaycareFn  = useServerFn(toggleSchoolDaycare);
  const [daycareToggling, setDaycareToggling] = useState(false);

  const [data, setData]           = useState<{ school: School; locations: Location[]; subscription: Subscription | null; payments: Payment[]; stats: { staffCount: number; studentCount: number } } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [editSubOpen, setEditSubOpen] = useState(false);
  const [toggling, setToggling]       = useState(false);

  const load = () => {
    setLoading(true);
    getDetailFn({ data: { schoolId } })
      .then((d) => setData(d as any))
      .catch((e: any) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [schoolId]);

  const handleToggle = async () => {
    if (!data) return;
    const next = data.school.status === "active" ? "suspended" : "active";
    setToggling(true);
    try {
      await toggleFn({ data: { schoolId, status: next } });
      setData((d) => d ? { ...d, school: { ...d.school, status: next } } : d);
    } catch (e: any) { setError(e?.message ?? "Toggle failed"); }
    finally { setToggling(false); }
  };

  const handleDaycareToggle = async () => {
    if (!data?.subscription) return;
    const next = !data.subscription.daycareEnabled;
    setDaycareToggling(true);
    try {
      await toggleDaycareFn({ data: { schoolId, enabled: next } });
      setData((d) => d ? { ...d, subscription: d.subscription ? { ...d.subscription, daycareEnabled: next ? 1 : 0 } : null } : d);
    } catch (e: any) { setError(e?.message ?? "Toggle failed"); }
    finally { setDaycareToggling(false); }
  };

  const handleView = async () => {
    try {
      const tenant = await viewFn({ data: { schoolId } });
      setTenant(tenant as any);
      navigate({ to: "/dashboard" });
    } catch (e: any) { setError(e?.message ?? "Failed"); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
        <AlertCircle className="w-5 h-5 shrink-0" /> {error || "School not found"}
      </div>
    );
  }

  const { school, locations, subscription, payments, stats } = data;
  const totalCollected = payments.filter((p) => p.status === "captured").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate({ to: "/super-admin/schools" })}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3 transition"
          >
            <ArrowLeft className="w-4 h-4" /> All Schools
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">{school.name}</h1>
              <p className="text-sm text-slate-500">{[school.city, school.state].filter(Boolean).join(", ") || school.email}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-8">
          <button
            onClick={handleView}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
          >
            <ArrowRight className="w-4 h-4" /> View as admin
          </button>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-xl border transition disabled:opacity-50 ${
              school.status === "active"
                ? "bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
            }`}
          >
            {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : school.status === "active" ? <><Ban className="w-4 h-4" /> Suspend</> : <><CheckCircle2 className="w-4 h-4" /> Activate</>}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Students",  value: stats.studentCount, icon: Users,     color: "text-blue-600",   bg: "bg-blue-50"   },
          { label: "Staff",     value: stats.staffCount,   icon: Briefcase, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Branches",  value: locations.length,   icon: MapPin,    color: "text-emerald-600",bg: "bg-emerald-50"},
          { label: "Collected", value: `₹${totalCollected.toLocaleString("en-IN")}`, icon: CreditCard, color: "text-amber-600",  bg: "bg-amber-50"  },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left col: subscription + school info */}
        <div className="col-span-1 lg:col-span-2 space-y-5">
          {/* Subscription card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-blue-600 rounded-full" />
                <span className="text-sm font-bold text-slate-800">Subscription</span>
              </div>
              <button
                onClick={() => setEditSubOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
            {subscription ? (
              <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Plan</p>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${PLAN_BADGE[subscription.plan] ?? "bg-slate-100 text-slate-600"}`}>
                    {subscription.plan}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Status</p>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${SUB_STATUS_BADGE[subscription.status ?? ""] ?? "bg-slate-100 text-slate-500"}`}>
                    {subscription.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Amount</p>
                  <p className="text-sm font-bold text-slate-900">₹{Number(subscription.amount).toLocaleString("en-IN")}<span className="font-normal text-slate-400">/{subscription.billingCycle?.replace("ly","") ?? "mo"}</span></p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Current period</p>
                  <p className="text-sm text-slate-700">
                    {subscription.currentPeriodStart ? fmtDate(subscription.currentPeriodStart) : "—"}
                    {" – "}
                    {subscription.currentPeriodEnd   ? fmtDate(subscription.currentPeriodEnd)   : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Started</p>
                  <p className="text-sm text-slate-700">{fmtDate(subscription.startedAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Limits</p>
                  <p className="text-xs text-slate-600">{school.maxStudents ?? "∞"} students · {school.maxStaff ?? "∞"} staff · {school.maxLocations ?? "∞"} branches</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-2">Daycare add-on</p>
                  <button
                    onClick={handleDaycareToggle}
                    disabled={daycareToggling}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg border transition disabled:opacity-50 ${
                      subscription.daycareEnabled
                        ? "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
                        : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {daycareToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : subscription.daycareEnabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-400 inline-block" />}
                    {subscription.daycareEnabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-6 py-8 text-center">
                <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400 mb-3">No subscription yet</p>
                <button onClick={() => setEditSubOpen(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition">
                  <Plus className="w-4 h-4" /> Create subscription
                </button>
              </div>
            )}
          </div>

          {/* Payment history */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <span className="text-sm font-bold text-slate-800">Payment history</span>
                <span className="text-xs text-slate-400">({payments.length})</span>
              </div>
            </div>
            {payments.length === 0 ? (
              <div className="py-10 text-center">
                <CreditCard className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No payments recorded yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="px-5 py-3.5 text-slate-600">{fmtDate(p.paidAt)}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900">₹{p.amount.toLocaleString("en-IN")}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${
                          p.status === "captured" ? "bg-emerald-50 text-emerald-700" :
                          p.status === "failed"   ? "bg-red-50 text-red-600" :
                          "bg-slate-100 text-slate-500"
                        }`}>
                          {p.status === "captured" ? "Paid" : p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400 font-mono">
                        {p.razorpayPaymentId ?? p.razorpayOrderId ?? "Manual"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>

        {/* Right col: school info + branches */}
        <div className="space-y-5">
          {/* School info */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <div className="w-1 h-5 bg-violet-500 rounded-full" />
              <span className="text-sm font-bold text-slate-800">School info</span>
            </div>
            <div className="px-5 py-4 space-y-3">
            {[
              { label: "Email",   value: school.email },
              { label: "Phone",   value: school.phone },
              { label: "City",    value: school.city },
              { label: "State",   value: school.state },
              { label: "Address", value: school.address },
              { label: "Joined",  value: fmtDate(school.createdAt) },
            ].map(({ label, value }) => value ? (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-slate-400 text-xs">{label}</span>
                <span className="text-slate-700 text-xs font-medium text-right max-w-[60%]">{value}</span>
              </div>
            ) : null)}
            </div>
          </div>

          {/* Branches */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <div className="w-1 h-5 bg-amber-400 rounded-full" />
              <span className="text-sm font-bold text-slate-800">Branches</span>
              <span className="text-xs text-slate-400">({locations.length})</span>
            </div>
            <div className="divide-y divide-slate-100">
              {locations.map((loc) => (
                <div key={loc.id} className="px-5 py-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{loc.name}</p>
                    <p className="text-xs text-slate-400">{loc.city ?? "—"}{loc.capacity ? ` · ${loc.capacity} capacity` : ""}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${loc.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {loc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {editSubOpen && (
        <EditSubscriptionModal
          sub={subscription}
          schoolId={schoolId}
          onClose={() => setEditSubOpen(false)}
          onSaved={() => { setEditSubOpen(false); load(); }}
        />
      )}
    </div>
  );
}
