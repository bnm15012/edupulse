import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X, Calendar, Loader2, AlertCircle, Trash2, Pencil, Save, CalendarDays } from "lucide-react";
import { listHolidays, addHoliday, updateHoliday, deleteHoliday, getSession } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { fmtDate, todayIST } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";

export const Route = createFileRoute("/holidays")({
  component: Holidays,
});

type Holiday = {
  id: number;
  name: string;
  date: string;
  type: "holiday" | "event" | "exam" | "other";
  description: string | null;
  isRecurring: number;
  createdAt: string | null;
};

const TYPE_COLORS: Record<string, string> = {
  holiday: "bg-emerald-100 text-emerald-700",
  event:   "bg-blue-100 text-blue-700",
  exam:    "bg-amber-100 text-amber-700",
  other:   "bg-slate-100 text-slate-600",
};

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

export default function Holidays() {
  const { tenant } = useTenant();
  const toast = useToast();
  const listFn = useServerFn(listHolidays);
  const addFn = useServerFn(addHoliday);
  const updateFn = useServerFn(updateHoliday);
  const deleteFn = useServerFn(deleteHoliday);
  const sessionFn = useServerFn(getSession);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState({ name: "", date: todayIST(), type: "holiday" as const, description: "", isRecurring: false });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const canEdit = isAdmin || role === "location_admin";

  const load = () => {
    setLoading(true);
    Promise.all([
      listFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
      sessionFn(),
    ])
      .then(([rows, session]) => {
        setHolidays(rows as Holiday[]);
        const r = (session as any)?.role ?? "";
        setRole(r);
        setIsAdmin(["super_admin", "school_admin", "location_admin"].includes(r));
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenant.schoolId, tenant.locationId]);

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", date: todayIST(), type: "holiday", description: "", isRecurring: false });
  };

  const startEdit = (h: Holiday) => {
    setEditing(h);
    setForm({ name: h.name, date: h.date, type: h.type, description: h.description ?? "", isRecurring: h.isRecurring === 1 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.date) return;
    setSaving(true);
    try {
      if (editing) {
        await updateFn({ data: { holidayId: editing.id, ...form } });
        toast("Holiday updated", "success");
      } else {
        await addFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId, ...form } });
        toast("Holiday added", "success");
      }
      resetForm();
      load();
    } catch (err: any) {
      toast(err?.message ?? "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmId) return;
    const id = confirmId;
    setConfirmId(null);
    setDeletingId(id);
    try {
      await deleteFn({ data: { holidayId: id } });
      toast("Holiday deleted", "success");
      load();
    } catch (err: any) {
      toast(err?.message ?? "Failed to delete", "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Holidays & Events</h1>
          <p className="text-sm text-slate-500 mt-0.5">Upcoming holidays, events and exam dates for this branch.</p>
        </div>
      </div>

      {canEdit && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            {editing ? <Pencil className="w-4 h-4 text-blue-500" /> : <Plus className="w-4 h-4 text-blue-500" />}
            {editing ? "Edit holiday" : "Add holiday"}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name *</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Diwali break" className={inputCls} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date *</label>
              <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className={inputCls} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as any }))} className={inputCls}>
                <option value="holiday">Holiday</option>
                <option value="event">Event</option>
                <option value="exam">Exam</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
              <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional note" className={inputCls} />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input type="checkbox" checked={form.isRecurring} onChange={(e) => setForm((p) => ({ ...p, isRecurring: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                Annual
              </label>
              <button
                type="submit"
                disabled={saving}
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-bold rounded-xl transition"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? "Update" : "Add"}
              </button>
              {editing && (
                <button type="button" onClick={resetForm} className="px-3 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm hover:bg-slate-50">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 w-40">Date</th>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Type</th>
                <th className="px-5 py-3.5">Description</th>
                {canEdit && <th className="px-5 py-3.5 text-right w-32">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: canEdit ? 5 : 4 }).map((__, j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>)}</tr>
                ))
              ) : holidays.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-5 py-14 text-center">
                    <CalendarDays className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                    <p className="text-slate-400 text-sm">No holidays added yet.</p>
                  </td>
                </tr>
              ) : (
                holidays.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4 font-medium text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {fmtDate(h.date)}
                        {h.isRecurring === 1 && <span className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">Annual</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{h.name}</td>
                    <td className="px-5 py-4">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${TYPE_COLORS[h.type] ?? TYPE_COLORS.other}`}>
                        {h.type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{h.description ?? <span className="text-slate-300">—</span>}</td>
                    {canEdit && (
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(h)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmId(h.id)} disabled={deletingId === h.id} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-40">
                            {deletingId === h.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete holiday?"
        message="This will remove the holiday from the branch calendar."
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
