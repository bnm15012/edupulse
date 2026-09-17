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

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 pb-1.5 border-b border-slate-100">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, required, children, span2 }: { label: string; required?: boolean; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={span2 ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}{required && " *"}</label>
      {children}
    </div>
  );
}

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
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  const [f, setF] = useState({
    // Student
    firstName: "", lastName: "", nickName: "", dateOfBirth: "",
    gender: "" as any, bloodGroup: "", nationality: "Indian",
    religion: "", category: "" as any, aadharNumber: "",
    birthCertificateNumber: "", currentClassId: "" as any,
    // Academic
    academicYear: "", previousSchoolName: "", previousSchoolTC: "", medium: "" as any,
    // Daycare
    daycareType: "not_enrolled" as any, mealPreference: "no_preference" as any,
    authorizedPickup1Name: "", authorizedPickup1Phone: "", authorizedPickup1Relation: "",
    authorizedPickup2Name: "", authorizedPickup2Phone: "", authorizedPickup2Relation: "",
    // Transport
    transportRequired: false, transportRoute: "",
    // Primary parent
    parentName: "", parentEmail: "", parentPhone: "", parentAlternatePhone: "",
    parentRelation: "guardian" as any, parentAddress: "",
    parentQualification: "", parentOccupation: "", parentOrganisation: "",
    parentDesignation: "", parentOfficeAddress: "", parentOfficePhone: "",
    parentWorkTimings: "", parentAadhar: "",
    // Second parent
    parent2Name: "", parent2Email: "", parent2Phone: "", parent2AlternatePhone: "",
    parent2Relation: "" as any,
    parent2Qualification: "", parent2Occupation: "", parent2Organisation: "",
    parent2Designation: "", parent2OfficeAddress: "", parent2OfficePhone: "",
    parent2WorkTimings: "", parent2Aadhar: "",
    // Medical
    allergies: "", conditions: "", medications: "", specialNeeds: "",
    immunizationRecord: "", doctorName: "", doctorPhone: "", doctorAddress: "",
    medicalNotes: "",
    // Emergency
    emergencyName: "", emergencyPhone: "", emergencyRelation: "",
    // Consents
    photoVideoConsent: false, medicalTreatmentConsent: false, dataPrivacyConsent: false,
  });

  const set = (key: string, val: string | boolean) => setF((p) => ({ ...p, [key]: val }));
  const toggleDay = (d: string) => setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  const buildAuthorizedPickup = () => {
    const persons = [];
    if (f.authorizedPickup1Name) persons.push({ name: f.authorizedPickup1Name, phone: f.authorizedPickup1Phone, relation: f.authorizedPickup1Relation });
    if (f.authorizedPickup2Name) persons.push({ name: f.authorizedPickup2Name, phone: f.authorizedPickup2Phone, relation: f.authorizedPickup2Relation });
    return persons.length ? JSON.stringify(persons) : undefined;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await addFn({
        data: {
          schoolId, locationId,
          firstName: f.firstName, lastName: f.lastName,
          nickName: f.nickName || undefined,
          dateOfBirth: f.dateOfBirth || undefined,
          gender: f.gender || undefined,
          bloodGroup: f.bloodGroup || undefined,
          nationality: f.nationality || undefined,
          religion: f.religion || undefined,
          category: f.category || undefined,
          aadharNumber: f.aadharNumber || undefined,
          birthCertificateNumber: f.birthCertificateNumber || undefined,
          currentClassId: f.currentClassId ? Number(f.currentClassId) : undefined,
          academicYear: f.academicYear || undefined,
          previousSchoolName: f.previousSchoolName || undefined,
          previousSchoolTC: f.previousSchoolTC || undefined,
          medium: f.medium || undefined,
          daycareType: f.daycareType || undefined,
          daycareDays: selectedDays.length ? selectedDays.join(",") : undefined,
          authorizedPickupPersons: buildAuthorizedPickup(),
          mealPreference: f.mealPreference || undefined,
          transportRequired: f.transportRequired,
          transportRoute: f.transportRoute || undefined,
          photoVideoConsent: f.photoVideoConsent,
          medicalTreatmentConsent: f.medicalTreatmentConsent,
          dataPrivacyConsent: f.dataPrivacyConsent,
          // Primary parent
          parentName: f.parentName,
          parentEmail: f.parentEmail || undefined,
          parentPhone: f.parentPhone || undefined,
          parentAlternatePhone: f.parentAlternatePhone || undefined,
          parentRelation: f.parentRelation,
          parentAddress: f.parentAddress || undefined,
          parentQualification: f.parentQualification || undefined,
          parentOccupation: f.parentOccupation || undefined,
          parentOrganisation: f.parentOrganisation || undefined,
          parentDesignation: f.parentDesignation || undefined,
          parentOfficeAddress: f.parentOfficeAddress || undefined,
          parentOfficePhone: f.parentOfficePhone || undefined,
          parentWorkTimings: f.parentWorkTimings || undefined,
          parentAadhar: f.parentAadhar || undefined,
          // Second parent
          parent2Name: f.parent2Name || undefined,
          parent2Email: f.parent2Email || undefined,
          parent2Phone: f.parent2Phone || undefined,
          parent2AlternatePhone: f.parent2AlternatePhone || undefined,
          parent2Relation: f.parent2Relation || undefined,
          parent2Qualification: f.parent2Qualification || undefined,
          parent2Occupation: f.parent2Occupation || undefined,
          parent2Organisation: f.parent2Organisation || undefined,
          parent2Designation: f.parent2Designation || undefined,
          parent2OfficeAddress: f.parent2OfficeAddress || undefined,
          parent2OfficePhone: f.parent2OfficePhone || undefined,
          parent2WorkTimings: f.parent2WorkTimings || undefined,
          parent2Aadhar: f.parent2Aadhar || undefined,
          // Medical
          allergies: f.allergies || undefined,
          conditions: f.conditions || undefined,
          medications: f.medications || undefined,
          specialNeeds: f.specialNeeds || undefined,
          immunizationRecord: f.immunizationRecord || undefined,
          doctorName: f.doctorName || undefined,
          doctorPhone: f.doctorPhone || undefined,
          doctorAddress: f.doctorAddress || undefined,
          medicalNotes: f.medicalNotes || undefined,
          // Emergency
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">Add Student</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-7">

          {/* ── Student Details ── */}
          <FormSection title="Student Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First name" required>
                <input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Aarav" className={inputCls} required />
              </Field>
              <Field label="Last name">
                <input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Kumar" className={inputCls} />
              </Field>
              <Field label="Nick name / preferred name">
                <input value={f.nickName} onChange={(e) => set("nickName", e.target.value)} placeholder="Avi" className={inputCls} />
              </Field>
              <Field label="Date of birth">
                <input type="date" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Gender">
                <select value={f.gender} onChange={(e) => set("gender", e.target.value)} className={selectCls}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </Field>
              <Field label="Blood group">
                <select value={f.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} className={selectCls}>
                  <option value="">Unknown</option>
                  {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
              </Field>
              <Field label="Nationality">
                <input value={f.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="Indian" className={inputCls} />
              </Field>
              <Field label="Religion">
                <input value={f.religion} onChange={(e) => set("religion", e.target.value)} placeholder="e.g. Hindu, Muslim, Christian…" className={inputCls} />
              </Field>
              <Field label="Category">
                <select value={f.category} onChange={(e) => set("category", e.target.value)} className={selectCls}>
                  <option value="">Select</option>
                  <option value="general">General</option>
                  <option value="obc">OBC</option>
                  <option value="sc">SC</option>
                  <option value="st">ST</option>
                  <option value="ews">EWS</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Aadhar number">
                <input value={f.aadharNumber} onChange={(e) => set("aadharNumber", e.target.value)} placeholder="XXXX XXXX XXXX" className={inputCls} maxLength={14} />
              </Field>
              <Field label="Birth certificate number">
                <input value={f.birthCertificateNumber} onChange={(e) => set("birthCertificateNumber", e.target.value)} placeholder="BC123456" className={inputCls} />
              </Field>
            </div>
          </FormSection>

          {/* ── Academic Info ── */}
          <FormSection title="Academic Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Class / Grade">
                <select value={f.currentClassId} onChange={(e) => set("currentClassId", e.target.value)} className={selectCls}>
                  <option value="">No class yet</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.ageGroup})</option>)}
                </select>
              </Field>
              <Field label="Academic year">
                <input value={f.academicYear} onChange={(e) => set("academicYear", e.target.value)} placeholder="2025-26" className={inputCls} />
              </Field>
              <Field label="Medium of instruction">
                <select value={f.medium} onChange={(e) => set("medium", e.target.value)} className={selectCls}>
                  <option value="">Select</option>
                  <option value="english">English</option>
                  <option value="hindi">Hindi</option>
                  <option value="regional">Regional</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Previous school name">
                <input value={f.previousSchoolName} onChange={(e) => set("previousSchoolName", e.target.value)} placeholder="Sunshine Preschool" className={inputCls} />
              </Field>
              <Field label="Transfer certificate (TC) number">
                <input value={f.previousSchoolTC} onChange={(e) => set("previousSchoolTC", e.target.value)} placeholder="TC/2024/1234" className={inputCls} />
              </Field>
            </div>
          </FormSection>

          {/* ── Daycare Requirements ── */}
          <FormSection title="Daycare Requirements">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Day care type">
                <select value={f.daycareType} onChange={(e) => set("daycareType", e.target.value)} className={selectCls}>
                  <option value="not_enrolled">Not enrolled in daycare</option>
                  <option value="full_day">Full day care</option>
                  <option value="half_day">Half day care</option>
                  <option value="extended_hour">Extended hour day care</option>
                </select>
              </Field>
              <Field label="Meal preference">
                <select value={f.mealPreference} onChange={(e) => set("mealPreference", e.target.value)} className={selectCls}>
                  <option value="no_preference">No preference</option>
                  <option value="veg">Vegetarian</option>
                  <option value="non_veg">Non-Vegetarian</option>
                  <option value="jain">Jain</option>
                  <option value="vegan">Vegan</option>
                </select>
              </Field>
              {f.daycareType !== "not_enrolled" && (
                <Field label="Days required" span2>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DAYS_OF_WEEK.map((d) => (
                      <button
                        key={d} type="button"
                        onClick={() => toggleDay(d)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${selectedDays.includes(d) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}
                      >{d}</button>
                    ))}
                  </div>
                </Field>
              )}
            </div>
            {/* Authorized pickup persons */}
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-500 mb-2">Authorized pickup persons</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <input value={f.authorizedPickup1Name} onChange={(e) => set("authorizedPickup1Name", e.target.value)} placeholder="Name" className={inputCls} />
                <input value={f.authorizedPickup1Phone} onChange={(e) => set("authorizedPickup1Phone", e.target.value)} placeholder="Phone" className={inputCls} />
                <input value={f.authorizedPickup1Relation} onChange={(e) => set("authorizedPickup1Relation", e.target.value)} placeholder="Relation (e.g. Grandmother)" className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input value={f.authorizedPickup2Name} onChange={(e) => set("authorizedPickup2Name", e.target.value)} placeholder="Name" className={inputCls} />
                <input value={f.authorizedPickup2Phone} onChange={(e) => set("authorizedPickup2Phone", e.target.value)} placeholder="Phone" className={inputCls} />
                <input value={f.authorizedPickup2Relation} onChange={(e) => set("authorizedPickup2Relation", e.target.value)} placeholder="Relation" className={inputCls} />
              </div>
            </div>
          </FormSection>

          {/* ── Transport ── */}
          <FormSection title="Transport">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Transport required">
                <div className="flex items-center gap-3 mt-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={f.transportRequired} onChange={(e) => set("transportRequired", e.target.checked)} className="rounded" />
                    Yes, bus/transport required
                  </label>
                </div>
              </Field>
              {f.transportRequired && (
                <Field label="Route / stop">
                  <input value={f.transportRoute} onChange={(e) => set("transportRoute", e.target.value)} placeholder="e.g. Route 3 – MG Road" className={inputCls} />
                </Field>
              )}
            </div>
          </FormSection>

          {/* ── Primary Parent / Guardian ── */}
          <FormSection title="Primary Parent / Guardian">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name" required>
                <input value={f.parentName} onChange={(e) => set("parentName", e.target.value)} placeholder="Ravi Kumar" className={inputCls} required />
              </Field>
              <Field label="Relation">
                <select value={f.parentRelation} onChange={(e) => set("parentRelation", e.target.value)} className={selectCls}>
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="guardian">Guardian</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Phone">
                <input value={f.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} placeholder="98765 43210" className={inputCls} />
              </Field>
              <Field label="Alternate phone">
                <input value={f.parentAlternatePhone} onChange={(e) => set("parentAlternatePhone", e.target.value)} placeholder="98765 00000" className={inputCls} />
              </Field>
              <Field label="Email">
                <input type="email" value={f.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} placeholder="ravi@email.com" className={inputCls} />
              </Field>
              <Field label="Aadhar number">
                <input value={f.parentAadhar} onChange={(e) => set("parentAadhar", e.target.value)} placeholder="XXXX XXXX XXXX" className={inputCls} maxLength={14} />
              </Field>
              <Field label="Residential address" span2>
                <input value={f.parentAddress} onChange={(e) => set("parentAddress", e.target.value)} placeholder="House No, Street, City, PIN" className={inputCls} />
              </Field>
              <Field label="Qualification">
                <input value={f.parentQualification} onChange={(e) => set("parentQualification", e.target.value)} placeholder="e.g. B.Tech, MBA" className={inputCls} />
              </Field>
              <Field label="Occupation">
                <input value={f.parentOccupation} onChange={(e) => set("parentOccupation", e.target.value)} placeholder="e.g. Software Engineer" className={inputCls} />
              </Field>
              <Field label="Organisation / Company">
                <input value={f.parentOrganisation} onChange={(e) => set("parentOrganisation", e.target.value)} placeholder="e.g. Infosys Ltd." className={inputCls} />
              </Field>
              <Field label="Designation">
                <input value={f.parentDesignation} onChange={(e) => set("parentDesignation", e.target.value)} placeholder="e.g. Senior Manager" className={inputCls} />
              </Field>
              <Field label="Office phone">
                <input value={f.parentOfficePhone} onChange={(e) => set("parentOfficePhone", e.target.value)} placeholder="080-12345678" className={inputCls} />
              </Field>
              <Field label="Work timings">
                <input value={f.parentWorkTimings} onChange={(e) => set("parentWorkTimings", e.target.value)} placeholder="9 AM – 6 PM" className={inputCls} />
              </Field>
              <Field label="Office address" span2>
                <input value={f.parentOfficeAddress} onChange={(e) => set("parentOfficeAddress", e.target.value)} placeholder="Office address" className={inputCls} />
              </Field>
            </div>
          </FormSection>

          {/* ── Second Parent / Guardian ── */}
          <FormSection title="Second Parent / Guardian (optional)">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name">
                <input value={f.parent2Name} onChange={(e) => set("parent2Name", e.target.value)} placeholder="Priya Kumar" className={inputCls} />
              </Field>
              <Field label="Relation">
                <select value={f.parent2Relation} onChange={(e) => set("parent2Relation", e.target.value)} className={selectCls}>
                  <option value="">Select</option>
                  <option value="father">Father</option>
                  <option value="mother">Mother</option>
                  <option value="guardian">Guardian</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Phone">
                <input value={f.parent2Phone} onChange={(e) => set("parent2Phone", e.target.value)} placeholder="98765 00001" className={inputCls} />
              </Field>
              <Field label="Alternate phone">
                <input value={f.parent2AlternatePhone} onChange={(e) => set("parent2AlternatePhone", e.target.value)} placeholder="98765 00002" className={inputCls} />
              </Field>
              <Field label="Email">
                <input type="email" value={f.parent2Email} onChange={(e) => set("parent2Email", e.target.value)} placeholder="priya@email.com" className={inputCls} />
              </Field>
              <Field label="Aadhar number">
                <input value={f.parent2Aadhar} onChange={(e) => set("parent2Aadhar", e.target.value)} placeholder="XXXX XXXX XXXX" className={inputCls} maxLength={14} />
              </Field>
              <Field label="Qualification">
                <input value={f.parent2Qualification} onChange={(e) => set("parent2Qualification", e.target.value)} placeholder="e.g. M.Com" className={inputCls} />
              </Field>
              <Field label="Occupation">
                <input value={f.parent2Occupation} onChange={(e) => set("parent2Occupation", e.target.value)} placeholder="e.g. Teacher" className={inputCls} />
              </Field>
              <Field label="Organisation / Company">
                <input value={f.parent2Organisation} onChange={(e) => set("parent2Organisation", e.target.value)} placeholder="e.g. Delhi Public School" className={inputCls} />
              </Field>
              <Field label="Designation">
                <input value={f.parent2Designation} onChange={(e) => set("parent2Designation", e.target.value)} placeholder="e.g. HOD" className={inputCls} />
              </Field>
              <Field label="Office phone">
                <input value={f.parent2OfficePhone} onChange={(e) => set("parent2OfficePhone", e.target.value)} placeholder="080-98765432" className={inputCls} />
              </Field>
              <Field label="Work timings">
                <input value={f.parent2WorkTimings} onChange={(e) => set("parent2WorkTimings", e.target.value)} placeholder="8 AM – 4 PM" className={inputCls} />
              </Field>
              <Field label="Office address" span2>
                <input value={f.parent2OfficeAddress} onChange={(e) => set("parent2OfficeAddress", e.target.value)} placeholder="Office address" className={inputCls} />
              </Field>
            </div>
          </FormSection>

          {/* ── Emergency Contact ── */}
          <FormSection title="Emergency Contact">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Name">
                <input value={f.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} placeholder="Sunita Kumar" className={inputCls} />
              </Field>
              <Field label="Phone">
                <input value={f.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} placeholder="91234 56789" className={inputCls} />
              </Field>
              <Field label="Relation">
                <input value={f.emergencyRelation} onChange={(e) => set("emergencyRelation", e.target.value)} placeholder="Grandmother" className={inputCls} />
              </Field>
            </div>
          </FormSection>

          {/* ── Medical Information ── */}
          <FormSection title="Medical Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Food / medicine allergies">
                <input value={f.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="e.g. Peanuts, Penicillin" className={inputCls} />
              </Field>
              <Field label="Chronic conditions">
                <input value={f.conditions} onChange={(e) => set("conditions", e.target.value)} placeholder="e.g. Asthma, Diabetes" className={inputCls} />
              </Field>
              <Field label="Daily medications">
                <input value={f.medications} onChange={(e) => set("medications", e.target.value)} placeholder="e.g. Inhaler, Insulin" className={inputCls} />
              </Field>
              <Field label="Special needs / disabilities">
                <input value={f.specialNeeds} onChange={(e) => set("specialNeeds", e.target.value)} placeholder="e.g. Hearing impairment, Dyslexia" className={inputCls} />
              </Field>
              <Field label="Doctor name">
                <input value={f.doctorName} onChange={(e) => set("doctorName", e.target.value)} placeholder="Dr. Mehta" className={inputCls} />
              </Field>
              <Field label="Doctor phone">
                <input value={f.doctorPhone} onChange={(e) => set("doctorPhone", e.target.value)} placeholder="98765 43210" className={inputCls} />
              </Field>
              <Field label="Doctor address" span2>
                <input value={f.doctorAddress} onChange={(e) => set("doctorAddress", e.target.value)} placeholder="Clinic address" className={inputCls} />
              </Field>
              <Field label="Immunization / vaccination record" span2>
                <textarea value={f.immunizationRecord} onChange={(e) => set("immunizationRecord", e.target.value)} rows={2} placeholder="e.g. BCG, OPV, DPT all given; MMR pending" className={`${inputCls} resize-none`} />
              </Field>
              <Field label="Additional medical notes" span2>
                <textarea value={f.medicalNotes} onChange={(e) => set("medicalNotes", e.target.value)} rows={2} placeholder="Any other relevant info…" className={`${inputCls} resize-none`} />
              </Field>
            </div>
          </FormSection>

          {/* ── Consents ── */}
          <FormSection title="Consents & Declarations">
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={f.photoVideoConsent} onChange={(e) => set("photoVideoConsent", e.target.checked)} className="mt-0.5 rounded" />
                <span className="text-sm text-slate-700">I consent to the school/daycare photographing or recording my child for educational and promotional purposes.</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={f.medicalTreatmentConsent} onChange={(e) => set("medicalTreatmentConsent", e.target.checked)} className="mt-0.5 rounded" />
                <span className="text-sm text-slate-700">I authorise the school/daycare to seek emergency medical treatment for my child if I cannot be reached in time. (Medical fees will be borne by me.)</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={f.dataPrivacyConsent} onChange={(e) => set("dataPrivacyConsent", e.target.checked)} className="mt-0.5 rounded" />
                <span className="text-sm text-slate-700">I agree to the collection and secure storage of my child's personal data for school/daycare administration purposes.</span>
              </label>
            </div>
          </FormSection>

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
