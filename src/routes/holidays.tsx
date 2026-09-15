import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, X, Calendar, Loader2, AlertCircle, Trash2, Pencil, Save, CalendarDays, Search } from "lucide-react";
import { listHolidays, addHoliday, updateHoliday, deleteHoliday, getSession, listClasses } from "@/lib/auth";
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
  classId: number | null;
  className?: string | null;
  createdAt: string | null;
};

type ClassItem = { id: number; name: string };

const TYPE_COLORS: Record<string, string> = {
  holiday: "bg-emerald-100 text-emerald-700",
  event:   "bg-blue-100 text-blue-700",
  exam:    "bg-amber-100 text-amber-700",
  other:   "bg-slate-100 text-slate-600",
};

const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

export default function Holidays() {
  const { tenant } = useTenant();
  const toast = useToast();
  const listFn = useServerFn(listHolidays);
  const addFn = useServerFn(addHoliday);
  const updateFn = useServerFn(updateHoliday);
  const deleteFn = useServerFn(deleteHoliday);
  const sessionFn = useServerFn(getSession);
  const classesFn = useServerFn(listClasses);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<{ id?: number; name: string; date: string; type: "holiday" | "event" | "exam" | "other"; description: string; isRecurring: boolean; classId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const canEdit = isAdmin || role === "location_admin";

  const filteredHolidays = useMemo(() => {
    const q = search.toLowerCase();
    return holidays.filter((h) =>
      (h.name ?? "").toLowerCase().includes(q)
      || (h.description ?? "").toLowerCase().includes(q)
      || h.type.toLowerCase().includes(q)
      || (h.className ?? "").toLowerCase().includes(q)
      || h.date.includes(q)
    );
  }, [holidays, search]);

  const load = () => {
    if (!tenant) return;
    setLoading(true);
    Promise.all([
      listFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
      sessionFn(),
      classesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
    ])
      .then(([rows, session, classRows]) => {
        const classList = (classRows as { id: number; name: string }[]).map((c) => ({ id: c.id, name: c.name }));
        setClasses(classList);
        const classNameById = new Map(classList.map((c) => [c.id, c.name]));
        setHolidays((rows as any[]).map((h) => ({ ...h, className: h.classId ? classNameById.get(h.classId) ?? null : null })));
        const r = (session as any)?.role ?? "";
        setRole(r);
        setIsAdmin(["super_admin", "school_admin", "location_admin"].includes(r));
      })
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenant?.schoolId, tenant?.locationId]);

  const startAdd = () => {
    setForm({ name: "", date: todayIST(), type: "holiday", description: "", isRecurring: false, classId: "" });
  };

  const startEdit = (h: Holiday) => {
    setForm({
      id: h.id,
      name: h.name,
      date: h.date,
      type: h.type,
      description: h.description ?? "",
      isRecurring: h.isRecurring === 1,
      classId: h.classId?.toString() ?? "",
    });
  };

  const cancelForm = () => setForm(null);

  const save = async () => {
    if (!form || !form.name.trim() || !form.date) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        date: form.date,
        type: form.type,
        description: form.description,
        isRecurring: form.isRecurring,
        classId: form.classId ? Number(form.classId) : undefined,
      };
      if (form.id) {
        await updateFn({ data: { holidayId: form.id, ...payload } });
        toast("Holiday updated", "success");
      } else {
        await addFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId, ...payload } });
        toast("Holiday added", "success");
      }
      setForm(null);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Holidays & Events</h1>
          <p className="text-sm text-slate-500 mt-0.5">Upcoming holidays, events and exam dates for this branch.</p>
        </div>
        {canEdit && (
          <button onClick={startAdd} className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition">
            <Plus className="w-4 h-4" /> Add Holiday
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + " bg-white pl-9 h-10 w-full sm:max-w-sm"} placeholder="Search by name, type, description, class or date" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5 w-16">S.No</th>
                <th className="px-5 py-3.5 w-48">Date</th>
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5">Type</th>
                <th className="px-5 py-3.5 w-48">Class</th>
                <th className="px-5 py-3.5">Description</th>
                {canEdit && <th className="px-5 py-3.5 text-right w-32">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {form && canEdit && (
                <tr className="bg-slate-50">
                  <td className="px-5 py-3 text-slate-400 w-16 text-center font-semibold">—</td>
                  <td className="px-5 py-3 w-48">
                    <div className="flex items-center gap-2">
                      <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls + " bg-white flex-1 min-w-0"} required />
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer whitespace-nowrap">
                        <input type="checkbox" checked={form.isRecurring} onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })} className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        Annual
                      </label>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Diwali break" className={inputCls + " bg-white"} required />
                  </td>
                  <td className="px-5 py-3">
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className={inputCls + " bg-white"}>
                      <option value="holiday">Holiday</option>
                      <option value="event">Event</option>
                      <option value="exam">Exam</option>
                      <option value="other">Other</option>
                    </select>
                  </td>
                  <td className="px-5 py-3 w-48">
                    <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} className={inputCls + " bg-white"}>
                      <option value="">All classes in this branch</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional note" className={inputCls + " bg-white"} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={cancelForm} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 text-xs font-semibold transition hover:bg-red-100">
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                      <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-semibold transition">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: canEdit ? 7 : 6 }).map((__, j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>)}</tr>
                ))
              ) : filteredHolidays.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-5 py-14 text-center">
                    <CalendarDays className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                    <p className="text-slate-400 text-sm">
                      {search ? "No matching holidays" : "No holidays added yet."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredHolidays.map((h, i) => (
                  <tr key={h.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4 text-slate-500 w-16">{i + 1}</td>
                    <td className="px-5 py-4 font-medium text-slate-800 whitespace-nowrap w-40">
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
                    <td className="px-5 py-4 text-slate-500 w-48">{h.classId ? h.className : <span className="text-slate-300 text-xs">All classes</span>}</td>
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
