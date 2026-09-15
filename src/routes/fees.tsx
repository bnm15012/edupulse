import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  X, Plus, Search, AlertCircle, ChevronRight, DollarSign,
  Pencil, Save, XCircle, CheckCircle2, Clock, Ban, Layers, Trash2,
  Banknote, Send, CreditCard, Loader2, RefreshCw,
} from "lucide-react";
import { listInvoices, addInvoice, updateInvoice, listStudents, listFeeStructures, addFeeStructure, updateFeeStructure, archiveFeeStructure, listClassesForSchool, runFeeAutomation, markInvoicePaid, sendInvoice, createRazorpayOrder, verifyRazorpayPayment, getSession } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { fmtDate, fmtDateShort } from "@/lib/utils";
import { usePagination } from "@/lib/usePagination";
import { Pagination } from "@/components/pagination";

export const Route = createFileRoute("/fees")({
  component: Fees,
});

// ── Types ──────────────────────────────────────────────────────────────────

type Invoice = {
  id: number; studentId: number; studentName: string; className: string | null;
  amount: string; dueDate: string | null; status: string;
  paidAt: string | null; createdAt: string | null;
};
type StudentOption = { id: number; firstName: string; lastName: string };
type FeeStructure = {
  id: number; name: string; amount: string; frequency: string;
  dueDay: number | null; description: string | null;
  classId: number | null; className: string | null; createdAt: string | null;
};
type ClassOption = { id: number; name: string; ageGroup: string };

const STATUS: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-600 border-slate-200",
  sent:      "bg-blue-50 text-blue-700 border-blue-200",
  paid:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  overdue:   "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-400 border-slate-200",
  refunded:  "bg-violet-50 text-violet-700 border-violet-200",
};

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

function fmt(amount: string) {
  return `₹${parseFloat(amount).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ── Add Invoice Modal ──────────────────────────────────────────────────────

function AddInvoiceModal({ onClose, onSaved, schoolId, locationId, students }: {
  onClose: () => void; onSaved: () => void; schoolId: number; locationId: number; students: StudentOption[];
}) {
  const addFn = useServerFn(addInvoice);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ studentId: "", amount: "", dueDate: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await addFn({ data: { schoolId, locationId, studentId: parseInt(f.studentId), amount: f.amount, dueDate: f.dueDate || undefined } });
      onSaved();
    } catch (err: any) { setError(err?.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-900">Create Invoice</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Student *</label>
            <select value={f.studentId} onChange={(e) => set("studentId", e.target.value)} className={`${inputCls} bg-white`} required>
              <option value="">Select a student</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount (₹) *</label>
            <input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="4500" className={inputCls} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Due date</label>
            <input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={inputCls} />
          </div>
          {error && <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold transition">
              {saving ? "Creating…" : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Invoice Detail Drawer ──────────────────────────────────────────────────

function InvoiceDrawer({ invoice: initial, onClose, onUpdated }: {
  invoice: Invoice; onClose: () => void; onUpdated: (inv: Invoice) => void;
}) {
  const updateFn = useServerFn(updateInvoice);
  const [inv, setInv] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ef, setEf] = useState({ amount: initial.amount, dueDate: initial.dueDate ?? "", status: initial.status });
  const eSet = (k: string, v: string) => setEf((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true); setError("");
    try {
      await updateFn({ data: { invoiceId: inv.id, amount: ef.amount, dueDate: ef.dueDate || undefined, status: ef.status as any } });
      const updated = { ...inv, amount: ef.amount, dueDate: ef.dueDate || null, status: ef.status };
      setInv(updated); setEditing(false); onUpdated(updated);
    } catch (err: any) { setError(err?.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  const quickStatus = async (newStatus: string) => {
    try {
      await updateFn({ data: { invoiceId: inv.id, status: newStatus as any } });
      const updated = { ...inv, status: newStatus };
      setInv(updated); setEf((p) => ({ ...p, status: newStatus })); onUpdated(updated);
    } catch { /* silent */ }
  };

  const cfg = STATUS[inv.status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-blue-600 px-6 pt-6 pb-5 shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 border-2 border-white/30 rounded-2xl flex items-center justify-center text-xl font-extrabold text-white shrink-0">
                {inv.studentName[0]}
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-white">{inv.studentName}</h2>
                <p className="text-white/70 text-2xl font-bold mt-0.5">{fmt(inv.amount)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!editing && (
                <button onClick={() => { setEf({ amount: inv.amount, dueDate: inv.dueDate ?? "", status: inv.status }); setEditing(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              {editing && (
                <>
                  <button onClick={() => { setEditing(false); setError(""); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition">
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button onClick={save} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-bold rounded-lg transition disabled:opacity-60">
                    <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
                  </button>
                </>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition"><X className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Status badge + quick actions */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border capitalize ${cfg}`}>{inv.status}</span>
            {isOverdue && inv.status !== "overdue" && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-600 border border-red-200">Due date passed</span>
            )}
          </div>

          {/* Quick status buttons */}
          {!editing && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {inv.status !== "paid" && (
                <button onClick={() => quickStatus("paid")}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-white/15 hover:bg-white/25 text-white rounded-lg transition">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark paid
                </button>
              )}
              {inv.status !== "sent" && inv.status !== "paid" && (
                <button onClick={() => quickStatus("sent")}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-white/15 hover:bg-white/25 text-white rounded-lg transition">
                  <Clock className="w-3.5 h-3.5" /> Mark sent
                </button>
              )}
              {inv.status !== "cancelled" && inv.status !== "paid" && (
                <button onClick={() => quickStatus("cancelled")}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-white/15 hover:bg-white/25 text-white rounded-lg transition">
                  <Ban className="w-3.5 h-3.5" /> Cancel
                </button>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-emerald-50 text-emerald-700">
              <DollarSign className="w-4 h-4" />
              <h3 className="text-sm font-bold">Invoice details</h3>
            </div>
            <div className="p-5 space-y-3">
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (₹)</label>
                    <input type="number" min="0" step="0.01" value={ef.amount} onChange={(e) => eSet("amount", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Due date</label>
                    <input type="date" value={ef.dueDate} onChange={(e) => eSet("dueDate", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                    <select value={ef.status} onChange={(e) => eSet("status", e.target.value)} className={`${inputCls} bg-white`}>
                      {["draft","sent","paid","overdue","cancelled","refunded"].map((s) => (
                        <option key={s} value={s} className="capitalize">{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="Student" value={inv.studentName} />
                  <InfoRow label="Amount" value={<span className="text-lg font-bold text-emerald-700">{fmt(inv.amount)}</span>} />
                  <InfoRow label="Due date" value={fmtDate(inv.dueDate)} />
                  <InfoRow label="Status" value={<span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize border ${STATUS[inv.status] ?? ""}`}>{inv.status}</span>} />
                  {inv.paidAt && <InfoRow label="Paid at" value={fmtDate(inv.paidAt)} />}
                  {inv.createdAt && <InfoRow label="Created" value={fmtDate(inv.createdAt)} />}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Fee Structure Modal (Add / Edit) ──────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  monthly: "Monthly", quarterly: "Quarterly", annually: "Annually", one_time: "One-time",
};

function FeeStructureModal({ initial, onClose, onSaved, schoolId, locationId, classes }: {
  initial?: FeeStructure;
  onClose: () => void; onSaved: () => void;
  schoolId: number; locationId: number; classes: ClassOption[];
}) {
  const addFn = useServerFn(addFeeStructure);
  const updateFn = useServerFn(updateFeeStructure);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    name: initial?.name ?? "",
    amount: initial?.amount ?? "",
    frequency: (initial?.frequency ?? "monthly") as "monthly" | "quarterly" | "annually" | "one_time",
    dueDay: String(initial?.dueDay ?? "1"),
    classId: String(initial?.classId ?? ""),
    description: initial?.description ?? "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (initial) {
        await updateFn({ data: { feeStructureId: initial.id, name: f.name, amount: f.amount, frequency: f.frequency, dueDay: parseInt(f.dueDay) || 1, classId: f.classId ? parseInt(f.classId) : undefined, description: f.description || undefined } });
      } else {
        await addFn({ data: { schoolId, locationId, name: f.name, amount: f.amount, frequency: f.frequency, dueDay: parseInt(f.dueDay) || 1, classId: f.classId ? parseInt(f.classId) : undefined, description: f.description || undefined } });
      }
      onSaved();
    } catch (err: any) { setError(err?.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-violet-600" />
            <h2 className="text-lg font-bold text-slate-900">{initial ? "Edit" : "Add"} Fee Structure</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name *</label>
            <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Monthly Tuition Fee" className={inputCls} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Amount (₹) *</label>
              <input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="4500" className={inputCls} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Frequency *</label>
              <select value={f.frequency} onChange={(e) => set("frequency", e.target.value)} className={`${inputCls} bg-white`}>
                {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Due day of month</label>
              <input type="number" min="1" max="31" value={f.dueDay} onChange={(e) => set("dueDay", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Applicable class</label>
              <select value={f.classId} onChange={(e) => set("classId", e.target.value)} className={`${inputCls} bg-white`}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.ageGroup})</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
            <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Optional details…" className={`${inputCls} resize-none`} />
          </div>
          {error && <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-bold transition">
              {saving ? "Saving…" : initial ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Fee Structures Tab ────────────────────────────────────────────────────

function FeeStructuresTab({ schoolId, locationId, classes, isAdmin = true }: { schoolId: number; locationId: number; classes: ClassOption[]; isAdmin?: boolean }) {
  const listFn = useServerFn(listFeeStructures);
  const archiveFn = useServerFn(archiveFeeStructure);

  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [confirmFs, setConfirmFs] = useState<FeeStructure | null>(null);

  const PAGE_SIZE = 12;
  const { pageItems, currentPage, setCurrentPage, totalPages } = usePagination(structures, PAGE_SIZE);

  const load = () => {
    setLoading(true);
    listFn({ data: { schoolId, locationId } })
      .then((d) => setStructures(d as FeeStructure[]))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [schoolId, locationId]);

  const remove = (fs: FeeStructure) => setConfirmFs(fs);

  const doRemove = async () => {
    if (!confirmFs) return;
    const fs = confirmFs;
    setConfirmFs(null);
    try { await archiveFn({ data: { feeStructureId: fs.id } }); load(); }
    catch (e: any) { setError(e?.message ?? "Failed to delete"); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? "Loading…" : `${structures.length} fee structure${structures.length !== 1 ? "s" : ""}`}</p>
        {isAdmin && (
          <button onClick={() => { setEditing(null); setModalOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition shadow-sm">
            <Plus className="w-4 h-4" /> Add Structure
          </button>
        )}
      </div>

      {error && <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}</div>
      ) : structures.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Layers className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-semibold mb-1">No fee structures yet</p>
          <p className="text-slate-400 text-sm">Create a fee structure to use as a template for invoices.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 w-16">S.No</th>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Amount</th>
                <th className="px-5 py-3.5">Frequency</th>
                <th className="px-5 py-3.5">Due day</th>
                <th className="px-5 py-3.5">Class</th>
                <th className="px-5 py-3.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map((fs, i) => (
                <tr key={fs.id} className="hover:bg-slate-50 transition group">
                  <td className="px-5 py-4 text-slate-500 w-16">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{fs.name}</p>
                    {fs.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">{fs.description}</p>}
                  </td>
                  <td className="px-5 py-4 font-bold text-violet-700">{fmt(fs.amount)}</td>
                  <td className="px-5 py-4">
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-violet-50 text-violet-700 border border-violet-200">{FREQ_LABELS[fs.frequency] ?? fs.frequency}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-500">{fs.dueDay ? `Day ${fs.dueDay}` : "—"}</td>
                  <td className="px-5 py-4 text-slate-500">{fs.className ?? <span className="text-slate-300">All classes</span>}</td>
                  <td className="px-5 py-4">
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => { setEditing(fs); setModalOpen(true); }}
                          className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-500 hover:text-violet-700 transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remove(fs)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-700 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={structures.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      {modalOpen && (
        <FeeStructureModal
          initial={editing ?? undefined}
          schoolId={schoolId} locationId={locationId} classes={classes}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); load(); }}
        />
      )}

      <ConfirmDialog
        open={confirmFs !== null}
        title="Delete fee structure?"
        message={confirmFs ? `Delete "${confirmFs.name}"? Any invoices linked to this structure will be unaffected.` : ""}
        confirmLabel="Delete"
        onConfirm={doRemove}
        onCancel={() => setConfirmFs(null)}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-slate-400 w-24 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 font-medium flex-1">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

// ── Cash Payment Modal ──────────────────────────────────────────────────────

function CashPaymentModal({ inv, onClose, onPaid }: { inv: Invoice; onClose: () => void; onPaid: () => void }) {
  const markPaidFn = useServerFn(markInvoicePaid);
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "cheque" | "other">("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await markPaidFn({ data: { invoiceId: inv.id, method, notes: notes || undefined } });
      onPaid();
    } catch (err: any) { setError(err?.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">Mark as Paid</h2>
            <p className="text-xs text-slate-500 mt-0.5">{inv.studentName} — {fmt(inv.amount)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Payment method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-500">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cash received at reception on 5 Sept"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500 focus:bg-white" />
          </div>
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-bold transition">
              {saving ? "Marking paid…" : "Confirm Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Fees() {
  const { tenant } = useTenant();
  const toast = useToast();
  const listFn = useServerFn(listInvoices);
  const listStudentsFn = useServerFn(listStudents);
  const listClassesFn = useServerFn(listClassesForSchool);
  const updateFn = useServerFn(updateInvoice);
  const runAutomationFn = useServerFn(runFeeAutomation);
  const sendInvoiceFn = useServerFn(sendInvoice);
  const sessionFn = useServerFn(getSession);

  const [isAdmin, setIsAdmin] = useState(true);
  const [tab, setTab] = useState<"invoices" | "structures">("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [automating, setAutomating] = useState(false);
  const [error, setError] = useState("");

  const PAGE_SIZE = 12;
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterClass, setFilterClass] = useState<number | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [confirmInvoice, setConfirmInvoice] = useState<Invoice | null>(null);
  const [cashPayInvoice, setCashPayInvoice] = useState<Invoice | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      listFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
      listStudentsFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
      listClassesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
    ])
      .then(([inv, stu, cls]) => {
        setInvoices(inv as Invoice[]);
        setStudents((stu as any[]).map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName })));
        setClasses((cls as any[]).map((c) => ({ id: c.id, name: c.name, ageGroup: c.ageGroup })));
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  const loadInvoices = (classId: number | undefined) => {
    setLoading(true);
    listFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId, classId } })
      .then((inv) => setInvoices(inv as Invoice[]))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Auto-run fee automation on mount (overdue flip + monthly generation)
    runAutomationFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } })
      .catch(() => {}); // silent — non-fatal
  }, [tenant.schoolId, tenant.locationId]);

  useEffect(() => {
    if (filterClass !== "all") {
      loadInvoices(filterClass);
    } else {
      loadInvoices(undefined);
    }
  }, [filterClass, tenant.schoolId, tenant.locationId]);
  useEffect(() => { sessionFn().then((u: any) => u && setIsAdmin(["super_admin","school_admin","location_admin"].includes(u.role))); }, []);

  const handleCancel = (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmInvoice(inv);
  };

  const doCancel = async () => {
    if (!confirmInvoice) return;
    const inv = confirmInvoice;
    setConfirmInvoice(null);
    setCancellingId(inv.id);
    try {
      await updateFn({ data: { invoiceId: inv.id, status: "cancelled" } });
      setInvoices((p) => p.map((i) => i.id === inv.id ? { ...i, status: "cancelled" } : i));
      toast(`Invoice for ${inv.studentName} cancelled`, "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to cancel invoice", "error");
    } finally {
      setCancellingId(null);
    }
  };

  const handleSendInvoice = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    setSendingId(inv.id);
    try {
      await sendInvoiceFn({ data: { invoiceId: inv.id } });
      setInvoices((p) => p.map((i) => i.id === inv.id ? { ...i, status: "sent" } : i));
      toast(`Invoice sent to parent${inv.studentName ? ` for ${inv.studentName}` : ""}`, "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to send invoice", "error");
    } finally {
      setSendingId(null);
    }
  };

  const handleRunAutomation = async () => {
    setAutomating(true);
    try {
      const result = await runAutomationFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }) as any;
      const generated = result?.generated ?? 0;
      toast(`Automation complete${generated > 0 ? ` — ${generated} invoice(s) generated` : ""}`, "success");
      load();
    } catch (err: any) {
      toast(err?.message ?? "Automation failed", "error");
    } finally {
      setAutomating(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter((inv) => {
      const matchSearch = inv.studentName.toLowerCase().includes(q) || inv.status.toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || inv.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [invoices, search, filterStatus]);

  const { pageItems, currentPage, setCurrentPage, totalPages } = usePagination(filtered, PAGE_SIZE);

  const totalPaid = invoices.filter(i => i.status === "paid").reduce((a, i) => a + parseFloat(i.amount), 0);
  const totalPending = invoices.filter(i => i.status === "sent" || i.status === "draft").reduce((a, i) => a + parseFloat(i.amount), 0);
  const totalOverdue = invoices.filter(i => i.status === "overdue").reduce((a, i) => a + parseFloat(i.amount), 0);

  const statusKeys = ["draft", "sent", "paid", "overdue", "cancelled"];
  const counts = invoices.reduce((acc, i) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fee Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Invoices, structures &amp; payment tracking</p>
        </div>
        {tab === "invoices" && isAdmin && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button onClick={handleRunAutomation} disabled={automating}
              className="inline-flex items-center gap-2 px-3 py-2.5 border border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 text-sm font-semibold rounded-xl transition disabled:opacity-50"
              title="Auto-flip overdue invoices and generate monthly invoices from fee structures">
              {automating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Run Automation</span>
            </button>
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm">
              <Plus className="w-4 h-4" /> <span>Create Invoice</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(["invoices", "structures"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition capitalize ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {t === "invoices" ? "Invoices" : "Fee Structures"}
          </button>
        ))}
      </div>

      {tab === "invoices" && (
        <>
          {/* Summary cards */}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Collected", amount: totalPaid, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                { label: "Pending", amount: totalPending, color: "text-amber-700 bg-amber-50 border-amber-200" },
                { label: "Overdue", amount: totalOverdue, color: "text-red-700 bg-red-50 border-red-200" },
              ].map((card) => (
                <div key={card.label} className={`rounded-2xl border p-4 ${card.color}`}>
                  <p className="text-xs font-bold uppercase tracking-wide opacity-70">{card.label}</p>
                  <p className="text-2xl font-extrabold mt-1">{fmt(String(card.amount))}</p>
                </div>
              ))}
            </div>
          )}

          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search by student or status…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition w-full sm:w-64" />
            </div>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm w-full sm:w-48"
            >
              <option value="all">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setFilterStatus("all")} className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition ${filterStatus === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
                All ({invoices.length})
              </button>
              {statusKeys.filter(s => counts[s]).map((s) => (
                <button key={s} onClick={() => setFilterStatus(s === filterStatus ? "all" : s)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition capitalize ${filterStatus === s ? (STATUS[s] + " ring-1 ring-offset-1 ring-blue-400") : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                  {s} ({counts[s]})
                </button>
              ))}
            </div>
          </div>

          {error && <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>}

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5 w-16">S.No</th>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Class</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5">Due date</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Created</th>
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
                      <DollarSign className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                      <p className="text-slate-400 text-sm">{invoices.length === 0 ? "No invoices yet. Create your first one!" : "No invoices match your search."}</p>
                    </td>
                  </tr>
                ) : (
                  pageItems.map((inv, i) => {
                    const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "paid";
                    return (
                      <tr key={inv.id} onClick={() => setSelected(inv)} className="hover:bg-blue-50/40 transition cursor-pointer group">
                        <td className="px-5 py-4 text-slate-500 w-16">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center text-xs font-bold text-emerald-600 shrink-0">
                              {inv.studentName[0]}
                            </div>
                            <span className="font-semibold text-slate-900 group-hover:text-blue-700 transition">{inv.studentName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-500">{inv.className ?? <span className="text-slate-300">—</span>}</td>
                        <td className="px-5 py-4 font-bold text-slate-800">{fmt(inv.amount)}</td>
                        <td className="px-5 py-4">
                          <span className={isOverdue ? "text-red-600 font-semibold" : "text-slate-500"}>
                            {fmtDateShort(inv.dueDate)}
                            {isOverdue && <span className="ml-1 text-xs text-red-400">(overdue)</span>}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize border ${STATUS[inv.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-400 text-xs">
                          {fmtDateShort(inv.createdAt)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {isAdmin && (<>
                              {/* Send (draft → sent + email parent) */}
                              {inv.status === "draft" && (
                                <button
                                  onClick={(e) => handleSendInvoice(inv, e)}
                                  disabled={sendingId === inv.id}
                                  className="p-1.5 rounded-lg text-violet-500 hover:text-violet-700 hover:bg-violet-50 transition disabled:opacity-40"
                                  title="Send invoice to parent"
                                >
                                  {sendingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {/* Resend reminder */}
                              {(inv.status === "sent" || inv.status === "overdue") && (
                                <button
                                  onClick={(e) => handleSendInvoice(inv, e)}
                                  disabled={sendingId === inv.id}
                                  className="p-1.5 rounded-lg text-violet-500 hover:text-violet-700 hover:bg-violet-50 transition disabled:opacity-40"
                                  title="Resend / remind parent"
                                >
                                  {sendingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {/* Mark as Paid (cash/manual) */}
                              {(inv.status === "sent" || inv.status === "overdue") && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setCashPayInvoice(inv); }}
                                  className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition"
                                  title="Mark as paid (cash/manual)"
                                >
                                  <Banknote className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelected(inv); }}
                                className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition"
                                title="Edit invoice"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {inv.status !== "cancelled" && inv.status !== "paid" && (
                                <button
                                  onClick={(e) => handleCancel(inv, e)}
                                  disabled={cancellingId === inv.id}
                                  className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition disabled:opacity-40"
                                  title="Cancel invoice"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>)}
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition ml-1" />
                          </div>
                        </td>
                      </tr>
                    );
                  })
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
        </>
      )}

      {tab === "structures" && (
        <FeeStructuresTab schoolId={tenant.schoolId} locationId={tenant.locationId} classes={classes} isAdmin={isAdmin} />
      )}

      {addOpen && <AddInvoiceModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); toast("Invoice created", "success"); }} schoolId={tenant.schoolId} locationId={tenant.locationId} students={students} />}
      {selected && (
        <InvoiceDrawer
          invoice={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => { setInvoices((p) => p.map((i) => i.id === updated.id ? updated : i)); setSelected(updated); toast("Invoice updated", "success"); }}
        />
      )}

      <ConfirmDialog
        open={confirmInvoice !== null}
        title="Cancel invoice?"
        message={confirmInvoice ? `Cancel invoice for "${confirmInvoice.studentName}" (₹${confirmInvoice.amount})? Status will be set to cancelled.` : ""}
        confirmLabel="Cancel invoice"
        variant="warning"
        onConfirm={doCancel}
        onCancel={() => setConfirmInvoice(null)}
      />

      {cashPayInvoice && (
        <CashPaymentModal
          inv={cashPayInvoice}
          onClose={() => setCashPayInvoice(null)}
          onPaid={() => {
            setInvoices((p) => p.map((i) => i.id === cashPayInvoice.id ? { ...i, status: "paid" } : i));
            toast(`Payment recorded for ${cashPayInvoice.studentName}`, "success");
            setCashPayInvoice(null);
          }}
        />
      )}
    </div>
  );
}
