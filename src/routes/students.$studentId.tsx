import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Baby, User, Shield, Heart, BookOpen, FileText,
  Upload, ExternalLink, Loader2, AlertCircle, Pencil, Save, XCircle, Trash2, Plus,
  BarChart2, GraduationCap, CheckCircle2, X,
} from "lucide-react";
import {
  getStudent, updateStudent, listClassesForSchool,
  updateEmergencyContact, addEmergencyContact,
  uploadDocument, listDocuments, deleteDocument,
  getStudentAttendanceSummary, uploadReportCard, listReportCards, deleteReportCard,
  promoteStudent,
} from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/students/$studentId")({
  component: StudentDetailPage,
});

// ── Types ──────────────────────────────────────────────────────────────────

type ParentRecord = {
  id: number; name: string; relation: string; phone: string | null;
  email: string | null; isPrimary: number; isEmergency: number;
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
type DetailData = {
  student: {
    id: number; admissionNumber: string | null; firstName: string; lastName: string; dateOfBirth: string | null;
    gender: string | null; status: string; currentClassId: number | null; photoUrl: string | null;
  };
  parents: ParentRecord[];
  emergency: EmergencyContact[];
  medical: MedicalRecord;
  enrollments: Enrollment[];
  currentClassName: string | null;
};
type ClassOption = { id: number; name: string; ageGroup: string };
type DocRow = { id: number; type: string; publicUrl: string | null; uploadedAt: Date | null };

// ── Helpers ────────────────────────────────────────────────────────────────

const calcAge = (dob: string | null) => {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";
const selectCls = `${inputCls} bg-white`;

const STATUS_BADGE: Record<string, string> = {
  enrolled:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  applied:    "bg-blue-50 text-blue-700 border border-blue-200",
  waitlisted: "bg-amber-50 text-amber-700 border border-amber-200",
  withdrawn:  "bg-slate-100 text-slate-500 border border-slate-200",
  graduated:  "bg-violet-50 text-violet-700 border border-violet-200",
  inquiry:    "bg-sky-50 text-sky-700 border border-sky-200",
};

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

// ── Main Component ─────────────────────────────────────────────────────────

function StudentDetailPage() {
  const { studentId: studentIdStr } = Route.useParams();
  const studentId = parseInt(studentIdStr, 10);
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const toast = useToast();

  const getFn = useServerFn(getStudent);
  const updateFn = useServerFn(updateStudent);
  const listClassesFn = useServerFn(listClassesForSchool);
  const promoteFn = useServerFn(promoteStudent);
  const uploadDocFn = useServerFn(uploadDocument);
  const listDocsFn = useServerFn(listDocuments);
  const deleteDocFn = useServerFn(deleteDocument);
  const updateEcFn = useServerFn(updateEmergencyContact);
  const addEcFn = useServerFn(addEmergencyContact);
  const getAttendanceSummaryFn = useServerFn(getStudentAttendanceSummary);
  const uploadReportCardFn = useServerFn(uploadReportCard);
  const listReportCardsFn = useServerFn(listReportCards);
  const deleteReportCardFn = useServerFn(deleteReportCard);

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "parents" | "medical" | "history" | "documents" | "attendance" | "reportcards">("overview");
  const [classes, setClasses] = useState<ClassOption[]>([]);

  // Documents state
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmDocDel, setConfirmDocDel] = useState<DocRow | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);

  // Attendance summary state
  const [attendanceSummary, setAttendanceSummary] = useState<any[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Report cards state
  type ReportCard = { id: number; academicYear: string; term: string; className: string | null; publicUrl: string | null; uploadedAt: any };
  const [reportCardsList, setReportCardsList] = useState<ReportCard[]>([]);
  const [rcLoading, setRcLoading] = useState(false);
  const [rcUploading, setRcUploading] = useState(false);
  const [rcError, setRcError] = useState("");
  const [rcYear, setRcYear] = useState("");
  const [rcTerm, setRcTerm] = useState("");
  const [rcClassId, setRcClassId] = useState<number | "">("");
  const [rcShowForm, setRcShowForm] = useState(false);
  const rcFileRef = useRef<HTMLInputElement>(null);

  // Promote state
  const [showPromote, setShowPromote] = useState(false);
  const [promoteClassId, setPromoteClassId] = useState<number | "">("");
  const [promoteYear, setPromoteYear] = useState("");
  const [promoting, setPromoting] = useState(false);

  // Edit form state
  const [ef, setEf] = useState<any>({});

  // Emergency contact inline editing
  const [ecEditing, setEcEditing] = useState<number | "new" | null>(null);
  const [ecForm, setEcForm] = useState({ name: "", phone: "", relation: "" });
  const [ecSaving, setEcSaving] = useState(false);

  // Load classes
  useEffect(() => {
    if (!tenant) return;
    listClassesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } })
      .then((r) => setClasses(r as ClassOption[]));
  }, [tenant]);

  const loadDocs = (sid: number) => {
    setDocsLoading(true); setDocsError("");
    listDocsFn({ data: { studentId: sid } })
      .then((d) => setDocs(d as DocRow[]))
      .catch((e: any) => setDocsError(e?.message ?? "Failed to load documents"))
      .finally(() => setDocsLoading(false));
  };

  // Load docs when switching to documents tab
  useEffect(() => {
    if (activeTab === "documents" && studentId) loadDocs(studentId);
    if (activeTab === "attendance" && studentId) {
      setAttendanceLoading(true);
      getAttendanceSummaryFn({ data: { studentId } })
        .then((d) => setAttendanceSummary(d as any[]))
        .catch(() => {})
        .finally(() => setAttendanceLoading(false));
    }
    if (activeTab === "reportcards" && studentId) {
      setRcLoading(true);
      listReportCardsFn({ data: { studentId } })
        .then((d) => setReportCardsList(d as any[]))
        .catch(() => {})
        .finally(() => setRcLoading(false));
    }
  }, [activeTab]);

  const load = () => {
    setLoading(true);
    getFn({ data: { studentId } })
      .then((d) => {
        setDetail(d as DetailData);
        const d2 = d as DetailData;
        setEf({
          firstName: d2.student.firstName,
          lastName: d2.student.lastName ?? "",
          dateOfBirth: d2.student.dateOfBirth ?? "",
          gender: d2.student.gender ?? "",
          bloodGroup: (d2.student as any).bloodGroup ?? "",
          currentClassId: d2.student.currentClassId ?? "",
          status: d2.student.status,
          parentId: d2.parents[0]?.id ?? undefined,
          parentName: d2.parents[0]?.name ?? "",
          parentEmail: d2.parents[0]?.email ?? "",
          parentPhone: d2.parents[0]?.phone ?? "",
          parentRelation: d2.parents[0]?.relation ?? "guardian",
          medicalId: d2.medical?.id ?? undefined,
          allergies: d2.medical?.allergies ?? "",
          conditions: d2.medical?.conditions ?? "",
          medications: d2.medical?.medications ?? "",
          medicalNotesText: d2.medical?.notes ?? "",
        });
      })
      .catch((e: any) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [studentId]);

  const eSet = (k: string, v: string) => setEf((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true); setSaveError("");
    try {
      await updateFn({
        data: {
          studentId,
          firstName: ef.firstName,
          lastName: ef.lastName || "",
          dateOfBirth: ef.dateOfBirth || undefined,
          gender: ef.gender || undefined,
          bloodGroup: ef.bloodGroup || undefined,
          currentClassId: ef.currentClassId ? Number(ef.currentClassId) : undefined,
          status: ef.status || undefined,
          parentId: ef.parentId,
          parentName: ef.parentName || undefined,
          parentEmail: ef.parentEmail || "",
          parentPhone: ef.parentPhone || undefined,
          parentRelation: ef.parentRelation || undefined,
          medicalId: ef.medicalId,
          allergies: ef.allergies || undefined,
          conditions: ef.conditions || undefined,
          medications: ef.medications || undefined,
          medicalNotesText: ef.medicalNotesText || undefined,
        },
      });
      setEditing(false);
      load();
      toast("Student updated successfully", "success");
    } catch (err: any) {
      setSaveError(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const s = detail?.student;
  const age = calcAge(s?.dateOfBirth ?? null);
  const initials = s ? `${s.firstName[0]}${s.lastName?.[0] ?? ""}`.toUpperCase() : "?";

  return (
    <div className="space-y-0 -m-8"> {/* cancel root padding to go edge-to-edge on header */}

      {/* Gradient header */}
      <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-8 pt-6 pb-0">
        <div>
          {/* Back button inside gradient */}
          <button
            onClick={() => navigate({ to: "/students" })}
            className="flex items-center gap-1.5 text-sm text-blue-200 hover:text-white font-medium transition mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Students
          </button>
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center text-xl font-extrabold text-white shadow">
                {initials}
              </div>
              {loading ? (
                <div className="space-y-2">
                  <div className="w-36 h-5 bg-white/20 rounded animate-pulse" />
                  <div className="w-24 h-3 bg-white/10 rounded animate-pulse" />
                </div>
              ) : (
                <div>
                  <h2 className="text-xl font-extrabold text-white leading-tight">
                    {s?.firstName} {s?.lastName}
                  </h2>
                  <p className="text-blue-100 text-sm mt-0.5">
                    {age != null ? `${age} yrs` : ""}
                    {detail?.currentClassName ? ` · ${detail.currentClassName}` : ""}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!loading && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              {editing && (
                <>
                  <button
                    onClick={() => { setEditing(false); setSaveError(""); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-blue-700 hover:bg-blue-50 text-xs font-bold rounded-lg transition disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Status badge */}
          {s && (
            <div className="mb-4">
              <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize border ${STATUS_BADGE[s.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                {s.status}
              </span>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 -mb-px flex-wrap">
            {([
              { key: "overview", label: "Overview" },
              { key: "parents", label: "Parents" },
              { key: "medical", label: "Medical" },
              { key: "history", label: "Class history" },
              { key: "attendance", label: "Attendance" },
              { key: "reportcards", label: "Report Cards" },
              { key: "documents", label: "Documents" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl transition ${
                  activeTab === key
                    ? "bg-slate-50 text-blue-700"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" /> {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

            {/* ── Main content (2/3) ── */}
            <div className="lg:col-span-2 space-y-4">
            {saveError && (
              <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" /> {saveError}
              </div>
            )}

            {/* Overview tab */}
            {activeTab === "overview" && (
              <Section icon={Baby} title="Student information" color="bg-blue-50 text-blue-700">
                {editing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">First name</label>
                      <input value={ef.firstName} onChange={(e) => eSet("firstName", e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Last name</label>
                      <input value={ef.lastName} onChange={(e) => eSet("lastName", e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Date of birth</label>
                      <input type="date" value={ef.dateOfBirth} onChange={(e) => eSet("dateOfBirth", e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Gender</label>
                      <select value={ef.gender} onChange={(e) => eSet("gender", e.target.value)} className={selectCls}>
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                        <option value="prefer_not_to_say">Prefer not to say</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Blood group</label>
                      <select value={ef.bloodGroup} onChange={(e) => eSet("bloodGroup", e.target.value)} className={selectCls}>
                        <option value="">Unknown</option>
                        {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Status</label>
                      <select value={ef.status} onChange={(e) => eSet("status", e.target.value)} className={selectCls}>
                        {["inquiry","applied","waitlisted","enrolled","graduated","withdrawn"].map((st) => (
                          <option key={st} value={st} className="capitalize">{st}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Class</label>
                      <select value={ef.currentClassId} onChange={(e) => eSet("currentClassId", e.target.value)} className={selectCls}>
                        <option value="">No class</option>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <InfoRow label="Admission No" value={s?.admissionNumber ?? null} />
                    <InfoRow label="Full name" value={`${s?.firstName} ${s?.lastName ?? ""}`.trim()} />
                    <InfoRow label="Date of birth" value={fmtDate(s?.dateOfBirth)} />
                    <InfoRow label="Age" value={age != null ? `${age} years old` : null} />
                    <InfoRow label="Gender" value={s?.gender?.replace("_", " ")} />
                    <InfoRow label="Blood group" value={(s as any)?.bloodGroup ?? null} />
                    <InfoRow label="Status" value={
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize border ${STATUS_BADGE[s?.status ?? ""] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {s?.status}
                      </span>
                    } />
                    <InfoRow label="Current class" value={detail?.currentClassName} />
                  </div>
                )}
              </Section>
            )}

            {/* Parents tab */}
            {activeTab === "parents" && (
              <div className="space-y-4">
                {/* Primary parent edit */}
                <Section icon={User} title="Parent / Guardian" color="bg-violet-50 text-violet-700">
                  {editing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
                        <input value={ef.parentName} onChange={(e) => eSet("parentName", e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Relation</label>
                        <select value={ef.parentRelation} onChange={(e) => eSet("parentRelation", e.target.value)} className={selectCls}>
                          <option value="father">Father</option>
                          <option value="mother">Mother</option>
                          <option value="guardian">Guardian</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
                        <input value={ef.parentPhone} onChange={(e) => eSet("parentPhone", e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
                        <input type="email" value={ef.parentEmail} onChange={(e) => eSet("parentEmail", e.target.value)} className={inputCls} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {detail?.parents.length ? detail.parents.map((p) => (
                        <div key={p.id} className="space-y-2">
                          <InfoRow label="Name" value={<span className="font-semibold">{p.name}</span>} />
                          <InfoRow label="Relation" value={<span className="capitalize">{p.relation}</span>} />
                          <InfoRow label="Phone" value={p.phone} />
                          <InfoRow label="Email" value={p.email} />
                          {p.isPrimary === 1 && (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100">Primary</span>
                          )}
                        </div>
                      )) : (
                        <p className="text-sm text-slate-400">No parent records found.</p>
                      )}
                    </div>
                  )}
                </Section>

                {/* Emergency contacts — editable */}
                <Section icon={Shield} title="Emergency contacts" color="bg-red-50 text-red-700">
                  <div className="space-y-4">
                    {detail?.emergency.map((ec) => (
                      <div key={ec.id}>
                        {ecEditing === ec.id ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Name</label>
                                <input value={ecForm.name} onChange={(e) => setEcForm(p => ({...p, name: e.target.value}))} className={inputCls} />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Phone</label>
                                <input value={ecForm.phone} onChange={(e) => setEcForm(p => ({...p, phone: e.target.value}))} className={inputCls} />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-1">Relation</label>
                                <input value={ecForm.relation} onChange={(e) => setEcForm(p => ({...p, relation: e.target.value}))} className={inputCls} />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button disabled={ecSaving} onClick={async () => {
                                setEcSaving(true);
                                try {
                                  await updateEcFn({ data: { contactId: ec.id, name: ecForm.name, phone: ecForm.phone, relation: ecForm.relation } });
                                  load(); setEcEditing(null);
                                } finally { setEcSaving(false); }
                              }} className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-60">
                                {ecSaving ? "Saving…" : "Save"}
                              </button>
                              <button onClick={() => setEcEditing(null)} className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 text-sm">
                              <p className="font-semibold text-slate-800">{ec.name} <span className="text-xs font-normal text-slate-400">({ec.relation})</span></p>
                              <p className="text-slate-500">{ec.phone}</p>
                            </div>
                            <button onClick={() => { setEcEditing(ec.id); setEcForm({ name: ec.name, phone: ec.phone, relation: ec.relation }); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 rounded-lg transition shrink-0">
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add new emergency contact */}
                    {ecEditing === "new" ? (
                      <div className="border-t border-slate-100 pt-4 space-y-2">
                        <p className="text-xs font-semibold text-slate-500">New emergency contact</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Name *</label>
                            <input value={ecForm.name} onChange={(e) => setEcForm(p => ({...p, name: e.target.value}))} className={inputCls} />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Phone *</label>
                            <input value={ecForm.phone} onChange={(e) => setEcForm(p => ({...p, phone: e.target.value}))} className={inputCls} />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Relation</label>
                            <input value={ecForm.relation} onChange={(e) => setEcForm(p => ({...p, relation: e.target.value}))} placeholder="e.g. Grandmother" className={inputCls} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button disabled={ecSaving || !ecForm.name || !ecForm.phone} onClick={async () => {
                            if (!detail) return;
                            setEcSaving(true);
                            try {
                              await addEcFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId, studentId, name: ecForm.name, phone: ecForm.phone, relation: ecForm.relation || "other" } });
                              load(); setEcEditing(null); setEcForm({ name: "", phone: "", relation: "" });
                            } finally { setEcSaving(false); }
                          }} className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-60">
                            {ecSaving ? "Saving…" : "Add contact"}
                          </button>
                          <button onClick={() => { setEcEditing(null); setEcForm({ name: "", phone: "", relation: "" }); }}
                            className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setEcEditing("new"); setEcForm({ name: "", phone: "", relation: "" }); }}
                        className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 mt-1 transition">
                        <Plus className="w-3.5 h-3.5" /> Add emergency contact
                      </button>
                    )}
                    {(!detail?.emergency.length && ecEditing !== "new") && (
                      <p className="text-sm text-slate-400">No emergency contacts yet.</p>
                    )}
                  </div>
                </Section>
              </div>
            )}

            {/* Medical tab */}
            {activeTab === "medical" && (
              <Section icon={Heart} title="Medical information" color="bg-rose-50 text-rose-700">
                {editing ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Allergies</label>
                      <input value={ef.allergies} onChange={(e) => eSet("allergies", e.target.value)} placeholder="e.g. Peanuts" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Conditions</label>
                      <input value={ef.conditions} onChange={(e) => eSet("conditions", e.target.value)} placeholder="e.g. Asthma" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Medications</label>
                      <input value={ef.medications} onChange={(e) => eSet("medications", e.target.value)} placeholder="e.g. Inhaler" className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
                      <textarea value={ef.medicalNotesText} onChange={(e) => eSet("medicalNotesText", e.target.value)} rows={3} className={`${inputCls} resize-none`} />
                    </div>
                  </div>
                ) : detail?.medical ? (
                  <div className="space-y-3">
                    <InfoRow label="Allergies" value={detail.medical.allergies} />
                    <InfoRow label="Conditions" value={detail.medical.conditions} />
                    <InfoRow label="Medications" value={detail.medical.medications} />
                    <InfoRow label="Notes" value={detail.medical.notes} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No medical records. Click Edit to add.</p>
                )}
              </Section>
            )}

            {/* Class history tab */}
            {activeTab === "history" && (
              <Section icon={BookOpen} title="Class enrollment history" color="bg-emerald-50 text-emerald-700">
                {/* Promote button */}
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => { setShowPromote(true); setPromoteClassId(""); setPromoteYear(""); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition"
                  >
                    <GraduationCap className="w-3.5 h-3.5" /> Promote to next class
                  </button>
                </div>

                {/* Promote modal */}
                {showPromote && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-slate-900">Promote student</h3>
                        <button onClick={() => setShowPromote(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Current class: <span className="font-semibold text-slate-800">{detail?.currentClassName ?? "—"}</span>
                      </p>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">New class <span className="text-red-500">*</span></label>
                        <select
                          value={promoteClassId}
                          onChange={(e) => setPromoteClassId(e.target.value ? Number(e.target.value) : "")}
                          className={selectCls}
                        >
                          <option value="">— select class —</option>
                          {classes
                            .filter((c) => c.id !== detail?.student.currentClassId)
                            .map((c) => <option key={c.id} value={c.id}>{c.name} ({c.ageGroup})</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Academic year (optional)</label>
                        <input
                          value={promoteYear}
                          onChange={(e) => setPromoteYear(e.target.value)}
                          placeholder="e.g. 2026-27"
                          className={inputCls}
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setShowPromote(false)}
                          className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={!promoteClassId || promoting}
                          onClick={async () => {
                            if (!promoteClassId) return;
                            setPromoting(true);
                            try {
                              await promoteFn({ data: { studentId, newClassId: Number(promoteClassId), academicYear: promoteYear || undefined } });
                              setShowPromote(false);
                              toast("Student promoted successfully", "success");
                              load();
                            } catch (err: any) {
                              toast(err?.message ?? "Failed to promote", "error");
                            } finally {
                              setPromoting(false);
                            }
                          }}
                          className="flex-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition"
                        >
                          {promoting ? "Promoting…" : "Promote"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Enrollment history list */}
                {!detail?.enrollments.length ? (
                  <p className="text-sm text-slate-400">No enrollment records.</p>
                ) : (
                  <div className="space-y-3">
                    {detail.enrollments.map((e, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{e.className}</p>
                          <p className="text-xs text-slate-400">{e.ageGroup}{e.academicYear ? ` · ${e.academicYear}` : ""}</p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                            e.status === "active" ? "bg-emerald-50 text-emerald-700" :
                            e.status === "promoted" ? "bg-blue-50 text-blue-700" :
                            "bg-slate-100 text-slate-500"
                          }`}>{e.status}</span>
                          {e.enrolledAt && (
                            <p className="text-xs text-slate-400 mt-1">{fmtDate(e.enrolledAt)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* Documents tab */}
            {activeTab === "documents" && (
              <Section icon={FileText} title="Documents" color="bg-indigo-50 text-indigo-700">
                {/* Upload buttons */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {(["birth_certificate", "immunization_record", "aadhar_card", "other"] as const).map((docType) => (
                    <label key={docType} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer transition ${uploading ? "opacity-50 pointer-events-none" : "bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-600 hover:text-blue-700"}`}>
                      <Upload className="w-3.5 h-3.5" />
                      {docType === "birth_certificate" ? "Birth Certificate" : docType === "immunization_record" ? "Immunization Record" : docType === "aadhar_card" ? "Aadhaar Card" : "Other"}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploading(true); setDocsError("");
                          try {
                            const reader = new FileReader();
                            const dataUrl = await new Promise<string>((res, rej) => {
                              reader.onload = () => res(reader.result as string);
                              reader.onerror = rej;
                              reader.readAsDataURL(file);
                            });
                            const result = await uploadDocFn({ data: { studentId, type: docType, fileDataUrl: dataUrl, fileName: file.name } });
                            setDocs((prev) => [{ id: (result as any).id, type: docType, publicUrl: (result as any).publicUrl, uploadedAt: new Date() }, ...prev]);
                          } catch (err: any) {
                            setDocsError(err?.message ?? "Upload failed");
                          } finally {
                            setUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                  ))}
                  {uploading && <span className="flex items-center gap-1.5 text-xs text-blue-600 font-semibold"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</span>}
                </div>

                {docsError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-xs font-semibold mb-3">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {docsError}
                  </div>
                )}

                {docsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
                  </div>
                ) : docs.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                    <p className="text-sm text-slate-400">No documents uploaded yet</p>
                    <p className="text-xs text-slate-300 mt-0.5">Upload birth certificate, immunization records, or other files</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {docs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-200 transition">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 capitalize">
                            {doc.type === "birth_certificate" ? "Birth Certificate" :
                             doc.type === "immunization_record" ? "Immunization Record" :
                             doc.type === "aadhar_card" ? "Aadhaar Card" :
                             doc.type === "photo" ? "Photo" : "Other Document"}
                          </p>
                          <p className="text-xs text-slate-400">{fmtDate(doc.uploadedAt ? String(doc.uploadedAt) : null)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {doc.publicUrl && (
                            <a href={doc.publicUrl} target="_blank" rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 transition" title="Open">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button onClick={() => setConfirmDocDel(doc)}
                            className="p-1.5 rounded-lg bg-slate-50 hover:bg-red-50 text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 transition" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <ConfirmDialog
                  open={!!confirmDocDel}
                  title="Delete Document"
                  message={`Delete this ${confirmDocDel?.type?.replace(/_/g, " ")}? This cannot be undone.`}
                  confirmLabel={deletingDoc ? "Deleting…" : "Delete"}
                  variant="danger"
                  onConfirm={async () => {
                    if (!confirmDocDel) return;
                    setDeletingDoc(true);
                    try {
                      await deleteDocFn({ data: { documentId: confirmDocDel.id } });
                      setDocs((prev) => prev.filter((d) => d.id !== confirmDocDel.id));
                      setConfirmDocDel(null);
                    } catch (e: any) { setDocsError(e?.message ?? "Delete failed"); }
                    finally { setDeletingDoc(false); }
                  }}
                  onCancel={() => setConfirmDocDel(null)}
                />
              </Section>
            )}

            {/* Attendance tab */}
            {activeTab === "attendance" && (
              <Section icon={BarChart2} title="Attendance summary" color="bg-blue-50 text-blue-700">
                {attendanceLoading ? (
                  <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
                ) : attendanceSummary.length === 0 ? (
                  <div className="text-center py-8">
                    <BarChart2 className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                    <p className="text-sm text-slate-400">No attendance data yet</p>
                    <p className="text-xs text-slate-300 mt-0.5">Attendance will appear here once it's marked for this student</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {attendanceSummary.map((m: any) => {
                      const pct = m.pct as number;
                      const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
                      const textColor = pct >= 75 ? "text-emerald-700" : pct >= 50 ? "text-amber-700" : "text-red-700";
                      const bgColor = pct >= 75 ? "bg-emerald-50" : pct >= 50 ? "bg-amber-50" : "bg-red-50";
                      return (
                        <div key={m.monthKey} className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-slate-800">{m.label}</span>
                            <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${bgColor} ${textColor}`}>{pct}%</span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-2 bg-slate-100 rounded-full mb-3">
                            <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                          {/* Stats row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                            {[
                              { label: "Present", val: m.present, cls: "text-emerald-700 bg-emerald-50" },
                              { label: "Absent", val: m.absent, cls: "text-red-700 bg-red-50" },
                              { label: "Half day", val: m.halfDay, cls: "text-amber-700 bg-amber-50" },
                              { label: "Leave", val: m.leave, cls: "text-slate-600 bg-slate-100" },
                            ].map(({ label, val, cls }) => (
                              <div key={label} className={`rounded-lg py-1.5 ${cls}`}>
                                <p className="text-base font-bold">{val}</p>
                                <p className="text-xs opacity-75">{label}</p>
                              </div>
                            ))}
                          </div>
                          {m.schoolDays > 0 && (
                            <p className="text-xs text-slate-400 mt-2 text-right">{m.schoolDays} school days</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}

            {/* Report Cards tab */}
            {activeTab === "reportcards" && (
              <Section icon={GraduationCap} title="Report Cards" color="bg-violet-50 text-violet-700">
                {/* Upload form toggle */}
                {!rcShowForm ? (
                  <button onClick={() => setRcShowForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition mb-4">
                    <Plus className="w-4 h-4" /> Upload Report Card
                  </button>
                ) : (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-violet-800">Upload Report Card</p>
                      <button onClick={() => { setRcShowForm(false); setRcYear(""); setRcTerm(""); setRcClassId(""); setRcError(""); }}
                        className="p-1 rounded-lg hover:bg-violet-100 text-violet-500"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Academic Year *</label>
                        <input value={rcYear} onChange={(e) => setRcYear(e.target.value)}
                          placeholder="e.g. 2025-26"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Term *</label>
                        <input value={rcTerm} onChange={(e) => setRcTerm(e.target.value)}
                          placeholder="e.g. Term 1, Q2, Annual"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Class (optional)</label>
                      <select value={rcClassId} onChange={(e) => setRcClassId(e.target.value ? Number(e.target.value) : "")}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none">
                        <option value="">— select class —</option>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.ageGroup})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">PDF File *</label>
                      <input ref={rcFileRef} type="file" accept="application/pdf"
                        className="w-full text-sm text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-violet-100 file:text-violet-700 file:font-semibold file:text-xs cursor-pointer" />
                    </div>
                    {rcError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{rcError}</p>}
                    <button
                      disabled={rcUploading || !rcYear || !rcTerm}
                      onClick={async () => {
                        const file = rcFileRef.current?.files?.[0];
                        if (!file) { setRcError("Please select a PDF file"); return; }
                        setRcError(""); setRcUploading(true);
                        try {
                          const reader = new FileReader();
                          const dataUrl = await new Promise<string>((res, rej) => {
                            reader.onload = () => res(reader.result as string);
                            reader.onerror = rej;
                            reader.readAsDataURL(file);
                          });
                          const result = await uploadReportCardFn({
                            data: {
                              studentId,
                              academicYear: rcYear,
                              classId: rcClassId ? Number(rcClassId) : undefined,
                              term: rcTerm,
                              fileDataUrl: dataUrl,
                              fileName: file.name,
                            },
                          }) as any;
                          const selectedClass = classes.find((c) => c.id === Number(rcClassId));
                          setReportCardsList((prev) => [{
                            id: result.id,
                            academicYear: result.academicYear,
                            term: result.term,
                            className: selectedClass?.name ?? null,
                            publicUrl: result.publicUrl,
                            uploadedAt: new Date(),
                          }, ...prev]);
                          setRcShowForm(false); setRcYear(""); setRcTerm(""); setRcClassId("");
                          if (rcFileRef.current) rcFileRef.current.value = "";
                          toast("Report card uploaded", "success");
                        } catch (err: any) { setRcError(err?.message ?? "Upload failed"); }
                        finally { setRcUploading(false); }
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-semibold rounded-xl transition">
                      {rcUploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload</>}
                    </button>
                  </div>
                )}

                {rcLoading ? (
                  <div className="space-y-3">{[1,2].map(i=><div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
                ) : reportCardsList.length === 0 ? (
                  <div className="text-center py-8">
                    <GraduationCap className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                    <p className="text-sm text-slate-400">No report cards uploaded yet</p>
                    <p className="text-xs text-slate-300 mt-0.5">Upload PDFs grouped by academic year</p>
                  </div>
                ) : (() => {
                  // Group by academic year, sorted descending
                  const byYear = new Map<string, ReportCard[]>();
                  for (const rc of reportCardsList) {
                    if (!byYear.has(rc.academicYear)) byYear.set(rc.academicYear, []);
                    byYear.get(rc.academicYear)!.push(rc);
                  }
                  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
                  return (
                    <div className="space-y-5">
                      {years.map((year) => (
                        <div key={year}>
                          {/* Year header */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-violet-700 bg-violet-100 px-2.5 py-1 rounded-full">
                              {year}
                            </span>
                            <span className="text-xs text-slate-400">{byYear.get(year)!.length} report{byYear.get(year)!.length !== 1 ? "s" : ""}</span>
                          </div>
                          {/* Cards in this year */}
                          <div className="space-y-2 pl-1 border-l-2 border-violet-100 ml-2">
                            {byYear.get(year)!.map((rc) => (
                              <div key={rc.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-violet-200 transition ml-2">
                                <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                                  <GraduationCap className="w-5 h-5 text-violet-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-800">{rc.term}</p>
                                  {rc.className && <p className="text-xs text-slate-400">{rc.className}</p>}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {rc.publicUrl && (
                                    <a href={rc.publicUrl} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 text-xs font-semibold transition">
                                      <ExternalLink className="w-3.5 h-3.5" /> View
                                    </a>
                                  )}
                                  <button onClick={async () => {
                                    if (!confirm(`Delete "${rc.term} ${year}" report card?`)) return;
                                    await deleteReportCardFn({ data: { id: rc.id } });
                                    setReportCardsList((prev) => prev.filter((r) => r.id !== rc.id));
                                  }} className="p-1.5 rounded-lg bg-slate-50 hover:bg-red-50 text-red-500 hover:text-red-700 border border-red-200 transition">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Section>
            )}
            </div>

            {/* ── Right sidebar (1/3) ── */}
            <div className="space-y-4">

              {/* Quick summary card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Quick info</p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-400">Full name</p>
                    <p className="text-sm font-semibold text-slate-800">{s?.firstName} {s?.lastName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Age</p>
                    <p className="text-sm font-semibold text-slate-800">{age != null ? `${age} years old` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Class</p>
                    <p className="text-sm font-semibold text-slate-800">{detail?.currentClassName ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Status</p>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize border ${STATUS_BADGE[s?.status ?? ""] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      {s?.status}
                    </span>
                  </div>
                  {detail?.parents[0] && (
                    <div>
                      <p className="text-xs text-slate-400">Parent</p>
                      <p className="text-sm font-semibold text-slate-800">{detail.parents[0].name}</p>
                      {detail.parents[0].phone && <p className="text-xs text-slate-500">{detail.parents[0].phone}</p>}
                    </div>
                  )}
                  {detail?.emergency[0] && (
                    <div>
                      <p className="text-xs text-slate-400">Emergency contact</p>
                      <p className="text-sm font-semibold text-slate-800">{detail.emergency[0].name}</p>
                      <p className="text-xs text-slate-500">{detail.emergency[0].phone} · {detail.emergency[0].relation}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Medical summary card */}
              {detail?.medical && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Medical summary</p>
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-400">Allergies</p>
                      <p className="text-slate-700">{detail.medical.allergies || "None recorded"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Conditions</p>
                      <p className="text-slate-700">{detail.medical.conditions || "None recorded"}</p>
                    </div>
                    {detail.medical.medications && (
                      <div>
                        <p className="text-xs text-slate-400">Medications</p>
                        <p className="text-slate-700">{detail.medical.medications}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Documents quick count */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Documents</p>
                <button
                  onClick={() => setActiveTab("documents")}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl transition"
                >
                  <span className="text-sm text-slate-600">View all documents</span>
                  <FileText className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
