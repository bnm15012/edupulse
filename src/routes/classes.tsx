import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  X, Plus, Search, Users, AlertCircle, ChevronRight,
  DoorOpen, Clock, Pencil, Save, XCircle, Trash2,
} from "lucide-react";
import { listClasses, addClass, updateClass, archiveClass, getSession } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";

export const Route = createFileRoute("/classes")({
  component: Classes,
});

type ClassRow = {
  id: number; name: string; ageGroup: string; roomName: string | null;
  capacity: number; startTime: string | null; endTime: string | null;
  status: string; academicYear: string | null; enrolledCount: number;
  sortOrder: number | null;
};

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

// ── Class Form (shared by Add modal & Edit drawer) ─────────────────────────

function ClassForm({
  initial, onSubmit, onCancel, saving, error, submitLabel,
}: {
  initial?: Partial<ClassRow>;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
  submitLabel: string;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    ageGroup: initial?.ageGroup ?? "",
    roomName: initial?.roomName ?? "",
    capacity: String(initial?.capacity ?? ""),
    startTime: initial?.startTime ?? "",
    endTime: initial?.endTime ?? "",
    academicYear: initial?.academicYear ?? "",
    status: (initial?.status ?? "active") as "active" | "inactive",
    sortOrder: String(initial?.sortOrder ?? "0"),
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...f, capacity: parseInt(f.capacity) || 1, sortOrder: parseInt(f.sortOrder) || 0 });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Class name *</label>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Nursery A" className={inputCls} required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Age group *</label>
          <input value={f.ageGroup} onChange={(e) => set("ageGroup", e.target.value)} placeholder="e.g. 3–4 years" className={inputCls} required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Room name</label>
          <input value={f.roomName} onChange={(e) => set("roomName", e.target.value)} placeholder="e.g. Sunflower Room" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Capacity *</label>
          <input type="number" min={1} value={f.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="20" className={inputCls} required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Class order (hierarchy)</label>
          <input type="number" min={0} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} placeholder="e.g. 1=Nursery, 2=LKG, 3=UKG…" className={inputCls} />
          <p className="text-xs text-slate-400 mt-1">Lower number = earlier in the progression</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Academic year</label>
          <input value={f.academicYear} onChange={(e) => set("academicYear", e.target.value)} placeholder="2025–26" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Start time</label>
          <input type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">End time</label>
          <input type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} className={inputCls} />
        </div>
        {initial?.id && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
            <select value={f.status} onChange={(e) => set("status", e.target.value)} className={`${inputCls} bg-white`}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        )}
      </div>
      {error && (
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

// ── Add Modal ──────────────────────────────────────────────────────────────

function AddClassModal({ onClose, onSaved, schoolId, locationId }: {
  onClose: () => void; onSaved: () => void; schoolId: number; locationId: number;
}) {
  const addFn = useServerFn(addClass);
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (f: any) => {
    setSaving(true); setError("");
    try {
      await addFn({ data: { schoolId, locationId, name: f.name, ageGroup: f.ageGroup, roomName: f.roomName || undefined, capacity: f.capacity, startTime: f.startTime || undefined, endTime: f.endTime || undefined, academicYear: f.academicYear || undefined, sortOrder: f.sortOrder ?? 0 } });
      toast("Class added successfully", "success");
      onSaved();
    } catch (err: any) { setError(err?.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-900">Add Class / Room</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          <ClassForm onSubmit={submit} onCancel={onClose} saving={saving} error={error} submitLabel="Save Class" />
        </div>
      </div>
    </div>
  );
}

// ── Edit Drawer ────────────────────────────────────────────────────────────

function EditClassDrawer({ cls, onClose, onUpdated, onArchived, isAdmin = true }: {
  cls: ClassRow; onClose: () => void; onUpdated: (c: ClassRow) => void; onArchived: (id: number) => void; isAdmin?: boolean;
}) {
  const updateFn = useServerFn(updateClass);
  const archiveFn = useServerFn(archiveClass);
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState("");

  const pct = Math.round((cls.enrolledCount / cls.capacity) * 100);
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-500";

  const submit = async (f: any) => {
    setSaving(true); setError("");
    try {
      await updateFn({ data: { classId: cls.id, name: f.name, ageGroup: f.ageGroup, roomName: f.roomName || undefined, capacity: f.capacity, startTime: f.startTime || undefined, endTime: f.endTime || undefined, academicYear: f.academicYear || undefined, status: f.status, sortOrder: f.sortOrder ?? 0 } });
      toast("Class saved successfully", "success");
      onUpdated({ ...cls, ...f });
    } catch (err: any) { setError(err?.message ?? "Failed to save"); }
    finally { setSaving(false); }
  };

  const doArchive = async () => {
    setArchiving(true);
    try { await archiveFn({ data: { classId: cls.id } }); onArchived(cls.id); }
    catch { setArchiving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-6 pt-6 pb-5 rounded-t-2xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 border-2 border-white/30 rounded-2xl flex items-center justify-center shrink-0">
                <DoorOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-white">{cls.name}</h2>
                <p className="text-blue-100 text-sm">{cls.roomName ?? "No room"} · {cls.ageGroup}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition"><X className="w-5 h-5" /></button>
          </div>
          {/* Fill bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-white/70 mb-1">
              <span>{cls.enrolledCount} enrolled</span>
              <span>Capacity: {cls.capacity} ({pct}%)</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div className={`${barColor} h-2 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {isAdmin ? (
            <>
              <ClassForm initial={cls} onSubmit={submit} onCancel={onClose} saving={saving} error={error} submitLabel="Save Changes" />
              {/* Deactivate */}
              <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
                <p className="text-sm font-semibold text-slate-700 mb-1">Deactivate class</p>
                <p className="text-xs text-slate-400 mb-3">Marks this class as inactive. Existing students are unaffected.</p>
                {confirmArchive ? (
                  <div className="flex gap-2">
                    <button onClick={doArchive} disabled={archiving} className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-60">
                      {archiving ? "Deactivating…" : "Yes, deactivate"}
                    </button>
                    <button onClick={() => setConfirmArchive(false)} className="px-4 py-2 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmArchive(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition">
                    <Trash2 className="w-3.5 h-3.5" /> Deactivate
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Read-only view for teachers */
            <div className="space-y-3 text-sm">
              {[
                ["Age Group", cls.ageGroup],
                ["Room", cls.roomName ?? "—"],
                ["Timing", cls.startTime ? `${cls.startTime} – ${cls.endTime ?? "?"}` : "—"],
                ["Academic Year", (cls as any).academicYear ?? "—"],
                ["Capacity", `${cls.enrolledCount} / ${cls.capacity}`],
                ["Status", cls.status],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500 text-xs font-semibold uppercase tracking-wide">{label}</span>
                  <span className="text-slate-800 font-medium capitalize">{value}</span>
                </div>
              ))}
              <button onClick={onClose} className="mt-2 w-full px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

function Classes() {
  const { tenant } = useTenant();
  const listFn = useServerFn(listClasses);
  const sessionFn = useServerFn(getSession);
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<ClassRow | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const isAdmin = ["super_admin", "school_admin", "location_admin"].includes(role ?? "");

  const load = () => {
    setLoading(true);
    listFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } })
      .then((d) => setRows(d as ClassRow[]))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenant.schoolId, tenant.locationId]);
  useEffect(() => { sessionFn().then((u) => u && setRole(u.role)); }, []);

  const filtered = rows.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.roomName ?? "").toLowerCase().includes(q) || c.ageGroup.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Classes & Rooms</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Loading…" : `${rows.filter(r => r.status === "active").length} active class${rows.filter(r => r.status === "active").length !== 1 ? "es" : ""}`}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm">
            <Plus className="w-4 h-4" /> Add Class
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" placeholder="Search by class, room or age group…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition" />
      </div>

      {error && <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-12 bg-slate-50 animate-pulse" />
          {[1,2,3,4].map(i => <div key={i} className="h-14 border-b border-slate-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center shadow-sm">
          <DoorOpen className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p className="text-slate-400 text-sm">{rows.length === 0 ? "No classes yet. Add your first class!" : "No classes match your search."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-700 w-16">S.No</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">Class</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">Age Group</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">Room</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">Timing</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">Enrolled</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700 w-24">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c, i) => {
                const pct = Math.round((c.enrolledCount / c.capacity) * 100);
                const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-500";
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="transition hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-slate-500 w-16">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                    </td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">{c.ageGroup}</span></td>
                    <td className="px-4 py-3 text-slate-500">{c.roomName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{c.startTime ? `${c.startTime} – ${c.endTime ?? "?"}` : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-slate-600">{c.enrolledCount}/{c.capacity}</span>
                        <span className="font-semibold text-slate-800 w-8">{pct}%</span>
                      </div>
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full ml-auto mt-1.5">
                        <div className={`${barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 w-24">
                      {c.status === "inactive" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full">Inactive</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && <AddClassModal onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} schoolId={tenant.schoolId} locationId={tenant.locationId} />}
      {selected && (
        <EditClassDrawer
          cls={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => { setRows((p) => p.map((r) => r.id === updated.id ? updated : r)); setSelected(updated); }}
          onArchived={(id) => { setRows((p) => p.map((r) => r.id === id ? { ...r, status: "inactive" } : r)); setSelected(null); }}
        />
      )}
    </div>
  );
}
