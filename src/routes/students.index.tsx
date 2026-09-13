import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  X, Plus, Search, AlertCircle, Users, ChevronRight,
  User, Heart, Shield, BookOpen,
  Pencil, Save, XCircle, Baby, Trash2,
  FileText, Upload, ExternalLink, Loader2,
} from "lucide-react";
import { listStudents, addStudent, archiveStudent, listClassesForSchool, getSession } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PlanLimitDialog, parsePlanLimitError } from "@/components/plan-limit-dialog";
import { CSVImportModal } from "@/components/csv-import-modal";
import { fmtDate } from "@/lib/utils";
import { usePagination } from "@/lib/usePagination";
import { Pagination } from "@/components/pagination";

export const Route = createFileRoute("/students/")({
  component: Students,
});

// ── Types ──────────────────────────────────────────────────────────────────

type StudentRow = {
  id: number; admissionNumber: string | null; firstName: string; lastName: string;
  dateOfBirth: string | null; gender: string | null; status: string;
  currentClassId: number | null; parentName: string | null;
  parentPhone: string | null; className: string | null; allergies: string | null;
};

type ParentRecord = {
  id: number; name: string; email: string | null; phone: string | null;
  relation: string; isPrimary: number; isEmergency: number;
};
type EmergencyContact = { id: number; name: string; phone: string; relation: string };
type MedicalRecord = {
  id: number; allergies: string | null; conditions: string | null;
  medications: string | null; notes: string | null;
} | null;
type Enrollment = {
  classId: number; className: string; ageGroup: string;
  academicYear: string | null; status: string; enrolledAt: string | null;
};
type ClassOption = { id: number; name: string; ageGroup: string };

type DetailData = {
  student: {
    id: number; firstName: string; lastName: string; dateOfBirth: string | null;
    gender: string | null; status: string; currentClassId: number | null; photoUrl: string | null;
  };
  parents: ParentRecord[];
  emergency: EmergencyContact[];
  medical: MedicalRecord;
  enrollments: Enrollment[];
  currentClassName: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";
const selectCls = `${inputCls} bg-white`;

function calcAge(dob: string | null) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

const STATUS_BADGE: Record<string, string> = {
  enrolled:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  applied:    "bg-blue-50 text-blue-700 border border-blue-200",
  waitlisted: "bg-amber-50 text-amber-700 border border-amber-200",
  withdrawn:  "bg-slate-100 text-slate-500 border border-slate-200",
  graduated:  "bg-violet-50 text-violet-700 border border-violet-200",
  inquiry:    "bg-sky-50 text-sky-700 border border-sky-200",
};

// ── Section card used in the drawer ───────────────────────────────────────

function Section({ icon: Icon, title, color, children }: {
  icon: React.ElementType; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className={`flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 ${color}`}>
        <Icon className="w-4 h-4" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-slate-400 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 font-medium flex-1">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

// ── Add Student Modal ──────────────────────────────────────────────────────

function AddStudentModal({
  onClose, onSaved, classes, schoolId, locationId,
}: {
  onClose: () => void;
  onSaved: () => void;
  classes: ClassOption[];
  schoolId: number;
  locationId: number;
}) {
  const addFn = useServerFn(addStudent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    firstName: "", lastName: "", dateOfBirth: "", gender: "" as any,
    bloodGroup: "", currentClassId: "" as any,
    parentName: "", parentEmail: "", parentPhone: "",
    parentRelation: "guardian" as any,
    allergies: "", conditions: "", medications: "", medicalNotes: "",
    emergencyName: "", emergencyPhone: "", emergencyRelation: "",
  });

  const set = (key: string, val: string) => setF((p) => ({ ...p, [key]: val }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await addFn({
        data: {
          schoolId, locationId,
          firstName: f.firstName, lastName: f.lastName,
          dateOfBirth: f.dateOfBirth || undefined,
          gender: f.gender || undefined,
          bloodGroup: f.bloodGroup || undefined,
          currentClassId: f.currentClassId ? Number(f.currentClassId) : undefined,
          parentName: f.parentName,
          parentEmail: f.parentEmail || undefined,
          parentPhone: f.parentPhone || undefined,
          parentRelation: f.parentRelation,
          allergies: f.allergies || undefined,
          conditions: f.conditions || undefined,
          medications: f.medications || undefined,
          medicalNotes: f.medicalNotes || undefined,
          emergencyName: f.emergencyName || undefined,
          emergencyPhone: f.emergencyPhone || undefined,
          emergencyRelation: f.emergencyRelation || undefined,
        },
      });
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save student");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">Add Student</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-6">

          {/* Basic info */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Student details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">First name *</label>
                <input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Aarav" className={inputCls} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last name</label>
                <input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Kumar" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date of birth</label>
                <input type="date" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Gender</label>
                <select value={f.gender} onChange={(e) => set("gender", e.target.value)} className={selectCls}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Blood group</label>
                <select value={f.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} className={selectCls}>
                  <option value="">Unknown</option>
                  {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Class</label>
                <select value={f.currentClassId} onChange={(e) => set("currentClassId", e.target.value)} className={selectCls}>
                  <option value="">No class yet</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.ageGroup})</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Parent */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Parent / Guardian</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name *</label>
                <input value={f.parentName} onChange={(e) => set("parentName", e.target.value)} placeholder="Ravi Kumar" className={inputCls} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Relation</label>
                <select value={f.parentRelation} onChange={(e) => set("parentRelation", e.target.value)} className={selectCls}>
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="guardian">Guardian</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
                <input value={f.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} placeholder="98765 43210" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                <input type="email" value={f.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} placeholder="ravi@email.com" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Emergency contact */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Emergency contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name</label>
                <input value={f.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} placeholder="Sunita Kumar" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
                <input value={f.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} placeholder="91234 56789" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Relation</label>
                <input value={f.emergencyRelation} onChange={(e) => set("emergencyRelation", e.target.value)} placeholder="Grandmother" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Medical */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Medical information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Allergies</label>
                <input value={f.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="e.g. Peanuts, None" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Conditions</label>
                <input value={f.conditions} onChange={(e) => set("conditions", e.target.value)} placeholder="e.g. Asthma" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Medications</label>
                <input value={f.medications} onChange={(e) => set("medications", e.target.value)} placeholder="e.g. Inhaler" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Additional notes</label>
                <textarea value={f.medicalNotes} onChange={(e) => set("medicalNotes", e.target.value)} rows={2} placeholder="Any other relevant medical info…" className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>

          {error && !parsePlanLimitError(error) && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          {error && parsePlanLimitError(error) && (
            <PlanLimitDialog error={error} onClose={() => setError("")} />
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold transition">
              {saving ? "Saving…" : "Save Student"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Students Page ─────────────────────────────────────────────────────

const ADMIN_ROLES = ["super_admin", "school_admin", "location_admin"];

function Students() {
  const { tenant } = useTenant();
  const toast = useToast();
  const navigate = useNavigate();
  const listFn = useServerFn(listStudents);
  const listClassesFn = useServerFn(listClassesForSchool);
  const archiveFn = useServerFn(archiveStudent);
  const sessionFn = useServerFn(getSession);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmStudent, setConfirmStudent] = useState<StudentRow | null>(null);
  const [isAdmin, setIsAdmin] = useState(true);
  const [csvOpen, setCsvOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>("");

  const PAGE_SIZE = 12;

  const load = () => {
    setLoading(true);
    Promise.all([
      listFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
      listClassesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
    ])
      .then(([s, c]) => { setStudents(s as StudentRow[]); setClasses(c as ClassOption[]); })
      .catch((e) => setError(e?.message ?? "Failed to load students"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenant.schoolId, tenant.locationId]);
  useEffect(() => { sessionFn().then((u: any) => { if (u) { setIsAdmin(ADMIN_ROLES.includes(u.role)); setUserRole(u.role); } }); }, []);

  const handleDelete = (s: StudentRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmStudent(s);
  };

  const doDelete = async () => {
    if (!confirmStudent) return;
    const s = confirmStudent;
    setConfirmStudent(null);
    setDeletingId(s.id);
    try {
      await archiveFn({ data: { studentId: s.id } });
      setStudents((prev) => prev.filter((r) => r.id !== s.id));
      toast(`${s.firstName} ${s.lastName} archived`, "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to archive student", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students.filter((s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      (s.parentName ?? "").toLowerCase().includes(q) ||
      (s.className ?? "").toLowerCase().includes(q)
    );
  }, [students, search]);

  const { pageItems, currentPage, setCurrentPage, totalPages } = usePagination(filtered, PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Loading…" : `${students.length} student${students.length !== 1 ? "s" : ""} enrolled`}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {(userRole === "super_admin" || userRole === "school_admin") && (
              <button
                onClick={() => setCsvOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition shadow-sm shrink-0"
              >
                <Upload className="w-4 h-4" />
                <span>Import CSV</span>
              </button>
            )}
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Student</span>
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, parent or class…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-5 py-3.5 w-16">S.No</th>
              <th className="px-5 py-3.5">Adm. No</th>
              <th className="px-5 py-3.5">Name</th>
              <th className="px-5 py-3.5">Age</th>
              <th className="px-5 py-3.5">Class</th>
              <th className="px-5 py-3.5">Parent</th>
              <th className="px-5 py-3.5">Phone</th>
              <th className="px-5 py-3.5">Allergy</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 10 }).map((__, j) => (
                    <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : pageItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-12 text-center">
                  <Users className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                  <p className="text-slate-400 text-sm">{students.length === 0 ? "No students yet. Add your first student!" : "No students match your search."}</p>
                </td>
              </tr>
            ) : (
              pageItems.map((s, i) => {
                const age = calcAge(s.dateOfBirth);
                return (
                  <tr
                    key={s.id}
                    onClick={() => navigate({ to: "/students/$studentId", params: { studentId: String(s.id) } })}
                    className="hover:bg-blue-50/40 transition cursor-pointer group"
                  >
                    <td className="px-5 py-4 text-slate-500 w-16">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-5 py-4 text-slate-600 font-mono text-xs">{s.admissionNumber ?? "—"}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0">
                          {s.firstName[0]}{s.lastName?.[0] ?? ""}
                        </div>
                        <span className="font-semibold text-slate-900 group-hover:text-blue-700 transition">
                          {s.firstName} {s.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{age != null ? `${age}y` : "—"}</td>
                    <td className="px-5 py-4">
                      {s.className
                        ? <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">{s.className}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{s.parentName ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-500">{s.parentPhone ?? "—"}</td>
                    <td className="px-5 py-4">
                      {s.allergies
                        ? <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-red-50 text-red-700">{s.allergies}</span>
                        : <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-400">None</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize border ${STATUS_BADGE[s.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate({ to: "/students/$studentId", params: { studentId: String(s.id) } }); }}
                          className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition"
                          title="View"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={(e) => handleDelete(s, e)}
                            disabled={deletingId === s.id}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition disabled:opacity-40"
                            title="Archive student"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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

      {/* Add modal */}
      {addOpen && (
        <AddStudentModal
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load(); toast("Student added successfully", "success"); }}
          classes={classes}
          schoolId={tenant.schoolId}
          locationId={tenant.locationId}
        />
      )}

      <ConfirmDialog
        open={confirmStudent !== null}
        title="Archive student?"
        message={confirmStudent ? `"${confirmStudent.firstName} ${confirmStudent.lastName}" will be removed from active lists. This can be reversed by updating their status.` : ""}
        confirmLabel="Archive"
        onConfirm={doDelete}
        onCancel={() => setConfirmStudent(null)}
      />

      {csvOpen && (
        <CSVImportModal
          schoolId={tenant.schoolId}
          locationId={tenant.locationId}
          onClose={() => setCsvOpen(false)}
          onImported={() => { load(); setCsvOpen(false); }}
        />
      )}
    </div>
  );
}
