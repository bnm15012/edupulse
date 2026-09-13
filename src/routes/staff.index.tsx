import { createFileRoute, useNavigate } from "@tanstack/react-router";
// This is the index route for /staff — the list page.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  X, Plus, Search, Mail, CheckCircle2, AlertCircle,
  ChevronRight, Briefcase, Pencil, Trash2, ShieldCheck, Clock, UserX,
} from "lucide-react";
import { listStaff, addStaffMember, archiveStaff, resendStaffInvite, getSession } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PlanLimitDialog, parsePlanLimitError } from "@/components/plan-limit-dialog";
import { usePagination } from "@/lib/usePagination";
import { Pagination } from "@/components/pagination";

export const Route = createFileRoute("/staff/")({
  component: Staff,
});

// ── Types ──────────────────────────────────────────────────────────────────

type StaffRow = {
  id: number; firstName: string; lastName: string;
  email: string | null; phone: string | null;
  role: string; joinDate: string | null; salary: string | null;
  status: string; backgroundCheckStatus: string; backgroundCheckDocUrl: string | null;
  classes: string[];
  userId: number | null;
  loginStatus: "active" | "invited" | "none";
  loginRole: string | null;
};

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

const ROLE_BADGE: Record<string, string> = {
  teacher:   "bg-blue-50 text-blue-700 border-blue-200",
  assistant: "bg-sky-50 text-sky-700 border-sky-200",
  admin:     "bg-violet-50 text-violet-700 border-violet-200",
  principal: "bg-amber-50 text-amber-700 border-amber-200",
  support:   "bg-slate-100 text-slate-600 border-slate-200",
};
const BG_BADGE: Record<string, string> = {
  verified:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending:     "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-sky-50 text-sky-700 border-sky-200",
  rejected:    "bg-red-50 text-red-700 border-red-200",
  expired:     "bg-slate-100 text-slate-500 border-slate-200",
};
const STATUS_BADGE: Record<string, string> = {
  active:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive:   "bg-slate-100 text-slate-500 border-slate-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
  on_leave:   "bg-orange-50 text-orange-700 border-orange-200",
};

// ── Login status badge ─────────────────────────────────────────────────────

function LoginBadge({ status }: { status: "active" | "invited" | "none" }) {
  if (status === "active") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
      <ShieldCheck className="w-3 h-3" /> Active
    </span>
  );
  if (status === "invited") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="w-3 h-3" /> Invited
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-500 border border-slate-200">
      <UserX className="w-3 h-3" /> No login
    </span>
  );
}

// ── Shared Staff Form ──────────────────────────────────────────────────────

function StaffForm({ initial, onSubmit, onCancel, saving, error, submitLabel, showInvite }: {
  initial?: Partial<StaffRow>;
  onSubmit: (d: any) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
  submitLabel: string;
  showInvite?: boolean;
}) {
  const [f, setF] = useState({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    role: (initial?.role ?? "teacher") as any,
    joinDate: initial?.joinDate ?? "",
    salary: initial?.salary ?? "",
    status: (initial?.status ?? "active") as any,
    backgroundCheckStatus: (initial?.backgroundCheckStatus ?? "pending") as any,
    sendInvite: false,
    appRole: "teacher" as "teacher" | "staff" | "accountant" | "receptionist" | "location_admin",
  });
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(f); }} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">First name *</label>
          <input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Neha" className={inputCls} required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last name</label>
          <input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Gupta" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
          <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="neha@school.com" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
          <input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Job title</label>
          <select value={f.role} onChange={(e) => set("role", e.target.value)} className={`${inputCls} bg-white`}>
            <option value="teacher">Teacher</option>
            <option value="assistant">Assistant</option>
            <option value="admin">Admin</option>
            <option value="principal">Principal</option>
            <option value="support">Support</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Join date</label>
          <input type="date" value={f.joinDate ?? ""} onChange={(e) => set("joinDate", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Salary (₹)</label>
          <input type="number" value={f.salary ?? ""} onChange={(e) => set("salary", e.target.value)} placeholder="25000" className={inputCls} />
        </div>
        {initial?.id && (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
              <select value={f.status} onChange={(e) => set("status", e.target.value)} className={`${inputCls} bg-white`}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On leave</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Background check</label>
              <select value={f.backgroundCheckStatus} onChange={(e) => set("backgroundCheckStatus", e.target.value)} className={`${inputCls} bg-white`}>
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Invite section — only shown when adding new staff */}
      {showInvite && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={f.sendInvite}
              onChange={(e) => set("sendInvite", e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-sm font-semibold text-slate-700">Send login invite</span>
          </label>
          {f.sendInvite && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">App access role</label>
              <select value={f.appRole} onChange={(e) => set("appRole", e.target.value)} className={`${inputCls} bg-white`}>
                <option value="teacher">Teacher — dashboard, attendance, classes, exams, activities</option>
                <option value="staff">Staff — same as Teacher</option>
                <option value="accountant">Accountant — fees only</option>
                <option value="receptionist">Receptionist — admissions and fees only</option>
                <option value="location_admin">Location Admin — full branch access</option>
              </select>
              {!f.email && (
                <p className="text-xs text-amber-600 mt-1.5">Add an email address above to send the invite.</p>
              )}
            </div>
          )}
        </div>
      )}

      {error && !parsePlanLimitError(error) && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold transition">
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ── Add Staff Modal ────────────────────────────────────────────────────────

function AddStaffModal({ onClose, onSaved, schoolId, locationId }: {
  onClose: () => void; onSaved: (inviteToken?: string) => void; schoolId: number; locationId: number;
}) {
  const addFn = useServerFn(addStaffMember);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (f: any) => {
    setSaving(true); setError("");
    try {
      const res = await addFn({
        data: {
          schoolId, locationId,
          firstName: f.firstName, lastName: f.lastName,
          email: f.email || undefined, phone: f.phone || undefined,
          role: f.role, joinDate: f.joinDate || undefined, salary: f.salary || undefined,
          sendInvite: f.sendInvite && !!f.email,
          appRole: f.appRole,
        },
      }) as any;
      onSaved(res?.inviteToken ?? undefined);
    } catch (err: any) { setError(err?.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <>
      {error && parsePlanLimitError(error) && (
        <PlanLimitDialog error={error} onClose={() => setError("")} />
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
            <h2 className="text-lg font-bold text-slate-900">Add Staff Member</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6">
            <StaffForm onSubmit={submit} onCancel={onClose} saving={saving} error={error} submitLabel="Save Staff" showInvite />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Invite success dialog ──────────────────────────────────────────────────

function InviteSuccessDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/invite?token=${token}`;
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">Invite created</h3>
        <p className="text-sm text-slate-500 mb-4">Email sending is disabled in local mode. Share the link manually:</p>
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 mb-5">
          <span className="text-xs text-slate-400 font-mono truncate flex-1">Invite link (click to copy)</span>
          <button
            onClick={copyLink}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${copied ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        <button onClick={onClose} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">Done</button>
      </div>
    </div>
  );
}

// ── Resend Invite Modal ────────────────────────────────────────────────────

function ResendInviteModal({ staff, onClose }: { staff: StaffRow; onClose: () => void }) {
  const resendFn = useServerFn(resendStaffInvite);
  const [appRole, setAppRole] = useState<"teacher" | "staff" | "accountant" | "receptionist" | "location_admin">(
    (staff.loginRole as any) ?? "teacher"
  );
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const send = async () => {
    setLoading(true); setError("");
    try {
      const res = await resendFn({ data: { staffId: staff.id, appRole } }) as any;
      setToken(res.inviteToken);
    } catch (err: any) { setError(err?.message ?? "Failed"); }
    finally { setLoading(false); }
  };

  if (token) return <InviteSuccessDialog token={token} onClose={onClose} />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Send Login Invite</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500">
          Sending invite to <span className="font-semibold text-slate-700">{staff.email}</span>
        </p>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">App access role</label>
          <select value={appRole} onChange={(e) => setAppRole(e.target.value as any)} className={`${inputCls} bg-white`}>
            <option value="teacher">Teacher — dashboard, attendance, classes, exams, activities</option>
            <option value="staff">Staff — same as Teacher</option>
            <option value="accountant">Accountant — fees only</option>
            <option value="receptionist">Receptionist — admissions and fees only</option>
            <option value="location_admin">Location Admin — full branch access</option>
          </select>
        </div>
        {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
          <button onClick={send} disabled={loading} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-sm font-bold transition">
            {loading ? "Sending…" : <><Mail className="w-4 h-4" /> Send Invite</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

function Staff() {
  const { tenant } = useTenant();
  const toast = useToast();
  const navigate = useNavigate();
  const listFn = useServerFn(listStaff);
  const archiveFn = useServerFn(archiveStaff);
  const sessionFn = useServerFn(getSession);

  const [isAdmin, setIsAdmin] = useState(true);
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"active" | "archived">("active");
  const [addOpen, setAddOpen] = useState(false);
  const [inviteSuccessToken, setInviteSuccessToken] = useState<string | null>(null);

  const PAGE_SIZE = 12;
  const [resendTarget, setResendTarget] = useState<StaffRow | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmStaff, setConfirmStaff] = useState<StaffRow | null>(null);

  const load = () => {
    setLoading(true);
    listFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } })
      .then((s) => setRows(s as StaffRow[]))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [tenant.schoolId, tenant.locationId]);
  useEffect(() => { sessionFn().then((u: any) => u && setIsAdmin(["super_admin","school_admin","location_admin"].includes(u.role))); }, []);

  const doDelete = async () => {
    if (!confirmStaff) return;
    const s = confirmStaff;
    setConfirmStaff(null);
    setDeletingId(s.id);
    try {
      await archiveFn({ data: { staffId: s.id } });
      setRows((prev) => prev.map((r) => r.id === s.id ? { ...r, status: "terminated" } : r));
      toast(`${s.firstName} ${s.lastName} terminated`, "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to terminate staff member", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const activeRows = useMemo(() => rows.filter((s) => s.status !== "terminated"), [rows]);
  const archivedRows = useMemo(() => rows.filter((s) => s.status === "terminated"), [rows]);

  const filtered = useMemo(() => {
    const base = view === "active" ? activeRows : archivedRows;
    const q = search.toLowerCase();
    return base.filter((s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      s.classes.join(" ").toLowerCase().includes(q)
    );
  }, [view, activeRows, archivedRows, search]);

  const { pageItems, currentPage, setCurrentPage, totalPages } = usePagination(filtered, PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff & Teachers</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Loading…" : `${view === "active" ? activeRows.length : archivedRows.length} ${view} staff member${(view === "active" ? activeRows.length : archivedRows.length) !== 1 ? "s" : ""}`}
          </p>
        </div>
        {isAdmin && view === "active" && (
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Staff</span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="relative max-w-sm w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by name, role or class…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setView("active"); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${view === "active" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Active ({activeRows.length})
          </button>
          <button
            onClick={() => { setView("archived"); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${view === "archived" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Archived ({archivedRows.length})
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 w-16">S.No</th>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Job Title</th>
                <th className="px-5 py-3.5">Classes</th>
                <th className="px-5 py-3.5">Phone</th>
                <th className="px-5 py-3.5">BG Check</th>
                <th className="px-5 py-3.5">Login</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((__, j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>)}</tr>
                ))
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center">
                    <Briefcase className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                    <p className="text-slate-400 text-sm">
                      {rows.length === 0
                        ? "No staff yet. Add your first member!"
                        : search
                          ? "No staff match your search."
                          : view === "active"
                            ? "No active staff."
                            : "No archived staff."}
                    </p>
                  </td>
                </tr>
              ) : (
                pageItems.map((s, i) => (
                  <tr key={s.id} onClick={() => navigate({ to: "/staff/$staffId", params: { staffId: String(s.id) } })} className="hover:bg-blue-50/40 transition cursor-pointer group">
                    <td className="px-5 py-4 text-slate-500 w-16">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                          {s.firstName[0]}{s.lastName?.[0] ?? ""}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 group-hover:text-blue-700 transition">{s.firstName} {s.lastName}</span>
                          {s.email && <p className="text-xs text-slate-400">{s.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize border ${ROLE_BADGE[s.role] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{s.role}</span>
                    </td>
                    <td className="px-5 py-4">
                      {s.classes.length ? (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700">{s.classes.join(", ")}</span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{s.phone ?? "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize border ${BG_BADGE[s.backgroundCheckStatus] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
                        {s.backgroundCheckStatus.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <LoginBadge status={s.loginStatus} />
                        {s.loginStatus !== "active" && s.email && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setResendTarget(s); }}
                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Send invite"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate({ to: "/staff/$staffId", params: { staffId: String(s.id) } }); }}
                            className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isAdmin && view === "active" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmStaff(s); }}
                            disabled={deletingId === s.id}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition disabled:opacity-40"
                            title="Terminate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition ml-1" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filtered.length}
          pageSize={PAGE_SIZE}
        />
      </div>

      {addOpen && (
        <AddStaffModal
          onClose={() => setAddOpen(false)}
          onSaved={(token) => {
            setAddOpen(false);
            load();
            toast("Staff member added", "success");
            if (token) setInviteSuccessToken(token);
          }}
          schoolId={tenant.schoolId}
          locationId={tenant.locationId}
        />
      )}

      {inviteSuccessToken && <InviteSuccessDialog token={inviteSuccessToken} onClose={() => setInviteSuccessToken(null)} />}
      {resendTarget && <ResendInviteModal staff={resendTarget} onClose={() => { setResendTarget(null); load(); }} />}

      <ConfirmDialog
        open={confirmStaff !== null}
        title="Terminate staff member?"
        message={confirmStaff ? `"${confirmStaff.firstName} ${confirmStaff.lastName}" will be marked as terminated. You can reactivate them later by editing their status.` : ""}
        confirmLabel="Terminate"
        onConfirm={doDelete}
        onCancel={() => setConfirmStaff(null)}
      />
    </div>
  );
}
