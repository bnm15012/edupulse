import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  X, Plus, Search, AlertCircle, ChevronRight, UserPlus,
  User, FileText,
  Pencil, Save, XCircle, ArrowRight, CheckCircle2, Trash2, Mail, Loader2,
} from "lucide-react";
import { listInquiries, addInquiry, updateInquiry, archiveInquiry, sendParentInvite, enrollFromAdmission, listClassesForSchool, getSession } from "@/lib/auth";
import { CSVImportModal } from "@/components/csv-import-modal";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { fmtDate, fmtDateShort, todayIST } from "@/lib/utils";
import { usePagination } from "@/lib/usePagination";
import { Pagination } from "@/components/pagination";

export const Route = createFileRoute("/admissions")({
  component: Admissions,
});

// ── Types ──────────────────────────────────────────────────────────────────

type Inquiry = {
  id: number;
  parentName: string;
  email: string | null;
  phone: string | null;
  childName: string;
  childDob: string | null;
  programInterest: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// ── Status pipeline config ─────────────────────────────────────────────────

const STATUSES = [
  { key: "new",            label: "New",            color: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "contacted",      label: "Contacted",      color: "bg-sky-50 text-sky-700 border-sky-200" },
  { key: "tour_scheduled", label: "Tour Scheduled", color: "bg-violet-50 text-violet-700 border-violet-200" },
  { key: "applied",        label: "Applied",        color: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "waitlisted",     label: "Waitlisted",     color: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "enrolled",       label: "Enrolled",       color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "rejected",       label: "Rejected",       color: "bg-red-50 text-red-700 border-red-200" },
] as const;

type StatusKey = typeof STATUSES[number]["key"];

function statusConfig(key: string) {
  return STATUSES.find((s) => s.key === key) ?? { key, label: key, color: "bg-slate-100 text-slate-600 border-slate-200" };
}

const PIPELINE_STEPS: StatusKey[] = ["new", "contacted", "tour_scheduled", "applied", "enrolled"];

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

// ── Add Inquiry Modal ──────────────────────────────────────────────────────

function AddInquiryModal({
  onClose, onSaved, schoolId, locationId,
}: {
  onClose: () => void; onSaved: () => void; schoolId: number; locationId: number;
}) {
  const addFn = useServerFn(addInquiry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    parentName: "", email: "", phone: "", childName: "", childDob: "",
    programInterest: "", source: "", notes: "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await addFn({
        data: {
          schoolId, locationId,
          parentName: f.parentName,
          email: f.email || undefined,
          phone: f.phone || undefined,
          childName: f.childName,
          childDob: f.childDob || undefined,
          programInterest: f.programInterest || undefined,
          source: f.source || undefined,
          notes: f.notes || undefined,
        },
      });
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save inquiry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-slate-900">Add Inquiry</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-5">

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Parent / Guardian</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Parent name *</label>
                <input value={f.parentName} onChange={(e) => set("parentName", e.target.value)} placeholder="Ravi Kumar" className={inputCls} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="ravi@email.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
                <input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" className={inputCls} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Child</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Child name *</label>
                <input value={f.childName} onChange={(e) => set("childName", e.target.value)} placeholder="Aarav Kumar" className={inputCls} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date of birth</label>
                <input type="date" value={f.childDob} onChange={(e) => set("childDob", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Program interest</label>
                <select value={f.programInterest} onChange={(e) => set("programInterest", e.target.value)} className={`${inputCls} bg-white`}>
                  <option value="">Select program</option>
                  {["Toddler", "Nursery", "Jr. KG", "Sr. KG", "Playgroup"].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Source</label>
                <select value={f.source} onChange={(e) => set("source", e.target.value)} className={`${inputCls} bg-white`}>
                  <option value="">Select source</option>
                  {["Walk-in", "Website", "Referral", "Social media", "Ad", "Other"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
            <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Any notes about this inquiry…" className={`${inputCls} resize-none`} />
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold transition">
              {saving ? "Saving…" : "Save Inquiry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Inquiry Detail Drawer ──────────────────────────────────────────────────

function InquiryDrawer({
  inquiry: initial,
  onClose,
  onUpdated,
  schoolId,
  locationId,
  isAdmin = true,
}: {
  inquiry: Inquiry;
  onClose: () => void;
  onUpdated: (updated: Inquiry) => void;
  schoolId: number;
  locationId: number;
  isAdmin?: boolean;
}) {
  const updateFn = useServerFn(updateInquiry);
  const sendInviteFn = useServerFn(sendParentInvite);
  const enrollFn = useServerFn(enrollFromAdmission);
  const listClassesFn = useServerFn(listClassesForSchool);
  const [inquiry, setInquiry] = useState<Inquiry>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [error, setError] = useState("");
  const toDateStr = (v: string | null | undefined) => {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  };
  const [ef, setEf] = useState({ ...initial, childDob: toDateStr(initial.childDob) });
  const eSet = (k: string, v: string) => setEf((p) => ({ ...p, [k]: v }));
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  // Enroll modal state
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [classes, setClasses] = useState<{ id: number; name: string; ageGroup: string }[]>([]);
  const [enrollForm, setEnrollForm] = useState({
    firstName: inquiry.childName?.split(" ")[0] ?? "",
    lastName: inquiry.childName?.split(" ").slice(1).join(" ") ?? "",
    childDob: toDateStr(inquiry.childDob),
    gender: "" as "" | "male" | "female" | "other" | "prefer_not_to_say",
    classId: "",
    startDate: todayIST(),
    parentName: inquiry.parentName,
    parentEmail: inquiry.email ?? "",
    parentPhone: inquiry.phone ?? "",
  });
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollError, setEnrollError] = useState("");
  const eFormSet = (k: string, v: string) => setEnrollForm((p) => ({ ...p, [k]: v }));

  const openEnrollModal = () => {
    listClassesFn({ data: { schoolId, locationId } })
      .then((cls) => setClasses((cls as any[]).map((c) => ({ id: c.id, name: c.name, ageGroup: c.ageGroup }))))
      .catch(() => {});
    setEnrollOpen(true);
  };

  const doEnroll = async () => {
    setEnrollSaving(true); setEnrollError("");
    try {
      await enrollFn({
        data: {
          inquiryId: inquiry.id,
          schoolId,
          locationId,
          firstName: enrollForm.firstName,
          lastName: enrollForm.lastName,
          childDob: enrollForm.childDob || undefined,
          gender: (enrollForm.gender || undefined) as any,
          classId: enrollForm.classId ? parseInt(enrollForm.classId) : undefined,
          startDate: enrollForm.startDate || undefined,
          parentName: enrollForm.parentName,
          parentEmail: enrollForm.parentEmail || undefined,
          parentPhone: enrollForm.parentPhone || undefined,
        },
      });
      const updated = { ...inquiry, status: "enrolled" } as Inquiry;
      setInquiry(updated);
      setEf((p) => ({ ...p, status: "enrolled" }));
      onUpdated(updated);
      setEnrollOpen(false);
    } catch (err: any) {
      setEnrollError(err?.message ?? "Failed to enroll");
    } finally {
      setEnrollSaving(false);
    }
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      await updateFn({
        data: {
          inquiryId: inquiry.id,
          parentName: ef.parentName || undefined,
          email: ef.email || "",
          phone: ef.phone || undefined,
          childName: ef.childName || undefined,
          childDob: ef.childDob || undefined,
          programInterest: ef.programInterest || undefined,
          source: ef.source || undefined,
          notes: ef.notes || undefined,
          status: ef.status as StatusKey,
        },
      });
      const updated = { ...inquiry, ...ef } as Inquiry;
      setInquiry(updated);
      setEditing(false);
      onUpdated(updated);
    } catch (err: any) {
      setError(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const moveStatus = async (newStatus: StatusKey) => {
    if (newStatus === "enrolled") {
      openEnrollModal();
      return;
    }
    setStatusSaving(true);
    try {
      await updateFn({ data: { inquiryId: inquiry.id, status: newStatus } });
      const updated = { ...inquiry, status: newStatus };
      setInquiry(updated);
      setEf((p) => ({ ...p, status: newStatus }));
      onUpdated(updated);
    } catch { /* silent */ }
    finally { setStatusSaving(false); }
  };

  const cfg = statusConfig(inquiry.status);
  const currentPipelineIdx = PIPELINE_STEPS.indexOf(inquiry.status as StatusKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[92vh] bg-slate-50 flex flex-col shadow-2xl overflow-hidden rounded-2xl">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-6 pt-6 pb-0 shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 border-2 border-white/30 rounded-2xl flex items-center justify-center text-lg font-extrabold text-white shrink-0">
                {inquiry.parentName[0]}
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-white leading-tight">{inquiry.childName}</h2>
                <p className="text-blue-100 text-sm">{inquiry.parentName} · {inquiry.programInterest ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && !editing && (
                <button onClick={() => { setEf({ ...inquiry, childDob: toDateStr(inquiry.childDob) }); setEditing(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              )}
              {isAdmin && editing && (
                <>
                  <button onClick={() => { setEditing(false); setError(""); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition">
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </button>
                  <button onClick={save} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-blue-700 hover:bg-blue-50 text-xs font-bold rounded-lg transition disabled:opacity-60">
                    <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
                  </button>
                </>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Status badge */}
          <div className="mb-4">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border capitalize ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>

          {/* Pipeline stepper — admin only */}
          {isAdmin && (
            <div className="flex items-center gap-1 pb-4 overflow-x-auto">
              {PIPELINE_STEPS.map((step, idx) => {
                const sCfg = statusConfig(step);
                const isDone = currentPipelineIdx > idx;
                const isCurrent = inquiry.status === step;
                return (
                  <div key={step} className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => !isCurrent && !statusSaving && moveStatus(step)}
                      disabled={statusSaving || isCurrent}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition ${
                        isCurrent
                          ? "bg-white text-blue-700 border-white shadow"
                          : isDone
                          ? "bg-white/30 text-white border-white/30 hover:bg-white/40"
                          : "bg-white/10 text-white/60 border-white/20 hover:bg-white/20"
                      }`}
                    >
                      {isDone && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                      {sCfg.label}
                    </button>
                    {idx < PIPELINE_STEPS.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-white/30 shrink-0" />
                    )}
                  </div>
                );
              })}
              {/* Waitlisted / Rejected outside pipeline */}
              {(inquiry.status === "waitlisted" || inquiry.status === "rejected") ? null : (
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <span className="text-white/30 text-xs">·</span>
                  <button
                    onClick={() => !statusSaving && moveStatus("rejected")}
                    disabled={statusSaving}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-red-500/20 text-red-200 border-red-300/30 hover:bg-red-500/30 transition"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Parent info */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-violet-50 text-violet-700">
              <User className="w-4 h-4" />
              <h3 className="text-sm font-bold">Parent / Guardian</h3>
            </div>
            <div className="p-5 space-y-3">
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-1 sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
                    <input value={ef.parentName} onChange={(e) => eSet("parentName", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
                    <input type="email" value={ef.email ?? ""} onChange={(e) => eSet("email", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
                    <input value={ef.phone ?? ""} onChange={(e) => eSet("phone", e.target.value)} className={inputCls} />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="Name" value={inquiry.parentName} />
                  <InfoRow label="Email" value={inquiry.email} />
                  <InfoRow label="Phone" value={inquiry.phone} />
                  {/* Parent portal invite — admin only, when enrolled and has email */}
                  {isAdmin && inquiry.status === "enrolled" && inquiry.email && (
                    <div className="pt-2 border-t border-slate-100">
                      {inviteToken ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
                            <CheckCircle2 className="w-4 h-4" /> Parent invite created
                          </div>
                          <p className="text-xs text-emerald-600">Email sending is disabled in local mode. Share the link manually:</p>
                          <div className="flex items-center gap-2 bg-emerald-100 rounded-lg px-3 py-2">
                            <span className="text-xs text-emerald-700 flex-1">Invite link (click to copy)</span>
                            <button
                              onClick={() => {
                                const url = `${window.location.origin}/invite?token=${inviteToken}`;
                                navigator.clipboard.writeText(url);
                              }}
                              className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                            >
                              Copy link
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            setInviteSending(true);
                            try {
                              const res = await sendInviteFn({ data: { inquiryId: inquiry.id } }) as any;
                              setInviteToken(res.inviteToken);
                            } catch (err: any) {
                              setError(err?.message ?? "Failed to send invite");
                            } finally { setInviteSending(false); }
                          }}
                          disabled={inviteSending}
                          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition disabled:opacity-50"
                        >
                          {inviteSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                          {inviteSending ? "Sending…" : "Send parent portal invite"}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Child info */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-blue-50 text-blue-700">
              <UserPlus className="w-4 h-4" />
              <h3 className="text-sm font-bold">Child</h3>
            </div>
            <div className="p-5 space-y-3">
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Child name</label>
                    <input value={ef.childName} onChange={(e) => eSet("childName", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Date of birth</label>
                    <input type="date" value={ef.childDob ?? ""} onChange={(e) => eSet("childDob", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Program</label>
                    <select value={ef.programInterest ?? ""} onChange={(e) => eSet("programInterest", e.target.value)} className={`${inputCls} bg-white`}>
                      <option value="">Select</option>
                      {["Toddler", "Nursery", "Jr. KG", "Sr. KG", "Playgroup"].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Source</label>
                    <select value={ef.source ?? ""} onChange={(e) => eSet("source", e.target.value)} className={`${inputCls} bg-white`}>
                      <option value="">Select</option>
                      {["Walk-in", "Website", "Referral", "Social media", "Ad", "Other"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="Child name" value={inquiry.childName} />
                  <InfoRow label="Date of birth" value={fmtDate(inquiry.childDob)} />
                  <InfoRow label="Program" value={inquiry.programInterest} />
                  <InfoRow label="Source" value={inquiry.source} />
                </>
              )}
            </div>
          </div>

          {/* Status (edit only) */}
          {editing && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-amber-50 text-amber-700">
                <CheckCircle2 className="w-4 h-4" />
                <h3 className="text-sm font-bold">Status</h3>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => eSet("status", s.key)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-full border transition ${
                        ef.status === s.key ? s.color + " ring-2 ring-offset-1 ring-blue-400" : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50 text-slate-600">
              <FileText className="w-4 h-4" />
              <h3 className="text-sm font-bold">Notes</h3>
            </div>
            <div className="p-5">
              {editing ? (
                <textarea value={ef.notes ?? ""} onChange={(e) => eSet("notes", e.target.value)} rows={4} placeholder="Add notes about this inquiry…" className={`${inputCls} resize-none`} />
              ) : inquiry.notes ? (
                <p className="text-sm text-slate-700 leading-relaxed">{inquiry.notes}</p>
              ) : (
                <p className="text-sm text-slate-400">No notes yet.</p>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="flex gap-4 text-xs text-slate-400 px-1">
            {inquiry.createdAt && (
              <span>Created {fmtDate(inquiry.createdAt)}</span>
            )}
            {inquiry.updatedAt && (
              <span>· Updated {fmtDate(inquiry.updatedAt)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Enroll Confirmation Modal */}
      {enrollOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setEnrollOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">Enroll Student</h2>
                <p className="text-xs text-slate-500 mt-0.5">Confirm details and assign to a class</p>
              </div>
              <button onClick={() => setEnrollOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Child details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">First name *</label>
                  <input value={enrollForm.firstName} onChange={(e) => eFormSet("firstName", e.target.value)}
                    className={inputCls} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Last name</label>
                  <input value={enrollForm.lastName} onChange={(e) => eFormSet("lastName", e.target.value)}
                    className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date of birth</label>
                  <input type="date" value={enrollForm.childDob} onChange={(e) => eFormSet("childDob", e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Gender</label>
                  <select value={enrollForm.gender} onChange={(e) => eFormSet("gender", e.target.value)}
                    className={`${inputCls} bg-white`}>
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              {/* Class assignment */}
              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Assign to class</label>
                <select value={enrollForm.classId} onChange={(e) => eFormSet("classId", e.target.value)}
                  className={`${inputCls} bg-white`}>
                  <option value="">No class yet</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} {c.ageGroup ? `(${c.ageGroup})` : ""}</option>
                  ))}
                </select>
                {classes.length === 0 && <p className="text-xs text-slate-500 mt-1.5">No classes found. Create a class in <strong>Classes</strong> first.</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Start date</label>
                <input type="date" value={enrollForm.startDate} onChange={(e) => eFormSet("startDate", e.target.value)}
                  className={inputCls} />
              </div>
              {/* Parent details */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Parent / Guardian</p>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Name *</label>
                  <input value={enrollForm.parentName} onChange={(e) => eFormSet("parentName", e.target.value)}
                    className={inputCls} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                    <input type="email" value={enrollForm.parentEmail} onChange={(e) => eFormSet("parentEmail", e.target.value)}
                      className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
                    <input value={enrollForm.parentPhone} onChange={(e) => eFormSet("parentPhone", e.target.value)}
                      className={inputCls} />
                  </div>
                </div>
              </div>
              {enrollError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {enrollError}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setEnrollOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition">
                  Cancel
                </button>
                <button onClick={doEnroll} disabled={enrollSaving || !enrollForm.firstName || !enrollForm.parentName}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-bold transition flex items-center gap-2">
                  {enrollSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling…</> : <><CheckCircle2 className="w-4 h-4" /> Confirm Enrolment</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-slate-400 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 font-medium flex-1">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

function Admissions() {
  const { tenant } = useTenant();
  const toast = useToast();
  const listFn = useServerFn(listInquiries);
  const archiveFn = useServerFn(archiveInquiry);
  const sessionFn = useServerFn(getSession);

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmInquiry, setConfirmInquiry] = useState<Inquiry | null>(null);
  const [isAdmin, setIsAdmin] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const [csvOpen, setCsvOpen] = useState(false);

  const PAGE_SIZE = 12;

  const load = () => {
    setLoading(true);
    listFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } })
      .then((d) => setInquiries(d as Inquiry[]))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenant.schoolId, tenant.locationId]);
  useEffect(() => { sessionFn().then((u: any) => { if (u) { setIsAdmin(["super_admin","school_admin","location_admin"].includes(u.role)); setUserRole(u.role); } }); }, []);

  const handleDelete = (inq: Inquiry, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmInquiry(inq);
  };

  const doDelete = async () => {
    if (!confirmInquiry) return;
    const inq = confirmInquiry;
    setConfirmInquiry(null);
    setDeletingId(inq.id);
    try {
      await archiveFn({ data: { inquiryId: inq.id } });
      setInquiries((prev) => prev.filter((i) => i.id !== inq.id));
      toast(`Inquiry for ${inq.childName} archived`, "success");
    } catch (err: any) {
      toast(err?.message ?? "Failed to archive inquiry", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return inquiries.filter((i) => {
      const matchSearch =
        i.parentName.toLowerCase().includes(q) ||
        i.childName.toLowerCase().includes(q) ||
        (i.programInterest ?? "").toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || i.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [inquiries, search, filterStatus]);

  const { pageItems, currentPage, setCurrentPage, totalPages } = usePagination(filtered, PAGE_SIZE);

  // Count by status for filter chips
  const counts = inquiries.reduce((acc, i) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admissions & Enrollment</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? "Loading…" : `${inquiries.length} inquir${inquiries.length !== 1 ? "ies" : "y"}`}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {(userRole === "super_admin" || userRole === "school_admin") && (
              <button
                onClick={() => setCsvOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition shadow-sm shrink-0"
              >
                <FileText className="w-4 h-4" />
                Import CSV
              </button>
            )}
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Inquiry
            </button>
          </div>
        )}
      </div>

      {/* Search + status filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by parent, child or program…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition w-full sm:w-72"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition ${filterStatus === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
          >
            All ({inquiries.length})
          </button>
          {STATUSES.filter((s) => counts[s.key]).map((s) => (
            <button
              key={s.key}
              onClick={() => setFilterStatus(s.key === filterStatus ? "all" : s.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition ${filterStatus === s.key ? s.color + " ring-1 ring-offset-1 ring-blue-400" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}
            >
              {s.label} ({counts[s.key]})
            </button>
          ))}
        </div>
      </div>

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
              <th className="px-5 py-3.5">Parent</th>
              <th className="px-5 py-3.5">Child</th>
              <th className="px-5 py-3.5">Program</th>
              <th className="px-5 py-3.5">Source</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Date</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : pageItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-14 text-center">
                  <UserPlus className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                  <p className="text-slate-400 text-sm">
                    {inquiries.length === 0 ? "No inquiries yet. Add your first one!" : "No inquiries match your search."}
                  </p>
                </td>
              </tr>
            ) : (
              pageItems.map((inq, i) => {
                const cfg = statusConfig(inq.status);
                return (
                  <tr
                    key={inq.id}
                    onClick={() => setSelected(inq)}
                    className="hover:bg-blue-50/40 transition cursor-pointer group"
                  >
                    <td className="px-5 py-4 text-slate-500 w-16">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center text-xs font-bold text-violet-600 shrink-0">
                          {inq.parentName[0]}
                        </div>
                        <span className="font-semibold text-slate-900 group-hover:text-blue-700 transition">{inq.parentName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{inq.childName}</td>
                    <td className="px-5 py-4 text-slate-600">{inq.programInterest ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-400 text-xs">{inq.source ?? "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400 text-xs">
                      {fmtDate(inq.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelected(inq); }}
                          className="p-1.5 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={(e) => handleDelete(inq, e)}
                            disabled={deletingId === inq.id}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition disabled:opacity-40"
                            title="Archive inquiry"
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
        <AddInquiryModal
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load(); toast("Inquiry added successfully", "success"); }}
          schoolId={tenant.schoolId}
          locationId={tenant.locationId}
        />
      )}

      {/* Detail drawer */}
      {selected && (
        <InquiryDrawer
          inquiry={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          schoolId={tenant.schoolId}
          locationId={tenant.locationId}
          onUpdated={(updated) => {
            setInquiries((prev) => prev.map((i) => i.id === updated.id ? updated : i));
            setSelected(updated);
            toast(updated.status === "enrolled" ? `${updated.childName} enrolled successfully!` : "Inquiry updated", "success");
          }}
        />
      )}

      <ConfirmDialog
        open={confirmInquiry !== null}
        title="Archive inquiry?"
        message={confirmInquiry ? `Archive inquiry for "${confirmInquiry.childName}" from ${confirmInquiry.parentName}? It will be removed from the admissions list.` : ""}
        confirmLabel="Archive"
        onConfirm={doDelete}
        onCancel={() => setConfirmInquiry(null)}
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
