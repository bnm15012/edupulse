import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getParentPortal, updateChildPersonal, updateParentContact, getCurriculumActivities, createRazorpayOrder, verifyRazorpayPayment, getStudentAttendanceSummary, listReportCards, listSchoolAnnouncements, getStudentAcademicReport, getStudentAllYearsReport } from "@/lib/auth";
import { Users, DollarSign, AlertCircle, CheckCircle2, Clock, CreditCard, BookOpen, Calendar, X, Image, Loader2, BarChart2, GraduationCap, ExternalLink, Megaphone, HeartPulse, ChevronDown } from "lucide-react";
import { fmtDate, fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/parent")({
  component: ParentPortal,
  validateSearch: (search: any) => ({ tab: search?.tab }),
});

type Child = {
  id: number; firstName: string; lastName: string;
  dateOfBirth: string | null; gender: string | null; bloodGroup: string | null; status: string; currentClassId: number | null; className: string | null; classAcademicYear: string | null;
};
type Fee = {
  id: number; studentId: number; amount: string;
  dueDate: string | null; status: string; razorpayOrderId: string | null;
  paidAt: string | null; paidMethod: string | null;
  feeName: string | null; feeFrequency: string | null;
};
type ParentContact = {
  id: number; studentId: number; name: string; relation: string; phone: string | null; address: string | null;
};
type EmergencyContact = {
  id: number; studentId: number; name: string; relation: string; phone: string;
};
type PortalData = {
  user: { firstName: string | null; lastName: string | null; email: string };
  children: Child[];
  fees: Fee[];
  parentContacts: ParentContact[];
  emergencyContacts: EmergencyContact[];
  medicalNotes: MedicalNote[];
};
type MedicalNote = { studentId: number; allergies: string | null; conditions: string | null; medications: string | null; notes: string | null; };
type Activity = {
  id: number; classId: number; className: string; title: string;
  description: string | null; activityDate: Date | string; photoUrl: string | null;
  createdAt: Date | string | null; uploaderName: string;
};

const STATUS_BADGE: Record<string, string> = {
  enrolled:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  applied:    "bg-blue-50 text-blue-700 border-blue-200",
  waitlisted: "bg-amber-50 text-amber-700 border-amber-200",
  withdrawn:  "bg-slate-100 text-slate-500 border-slate-200",
};
const FEE_BADGE: Record<string, string> = {
  paid:    "bg-emerald-50 text-emerald-700",
  overdue: "bg-red-50 text-red-700",
  sent:    "bg-blue-50 text-blue-700",
  draft:   "bg-slate-100 text-slate-600",
};

function ProfileItem({ label, value, capitalize, upper }: { label: string; value: string | null; capitalize?: boolean; upper?: boolean }) {
  if (!value) return (
    <div>
      <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="block font-semibold text-slate-900">—</span>
    </div>
  );
  let display = value;
  if (capitalize) display = display.charAt(0).toUpperCase() + display.slice(1);
  if (upper) display = display.toUpperCase();
  return (
    <div>
      <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="block font-semibold text-slate-900">{display}</span>
    </div>
  );
}

// Load Razorpay checkout.js script
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function ParentPortal() {
  const getPortalFn         = useServerFn(getParentPortal);
  const updateChildFn       = useServerFn(updateChildPersonal);
  const updateParentFn      = useServerFn(updateParentContact);
  const getActivitiesFn     = useServerFn(getCurriculumActivities);
  const createOrderFn       = useServerFn(createRazorpayOrder);
  const verifyFn            = useServerFn(verifyRazorpayPayment);
  const getAttendanceFn        = useServerFn(getStudentAttendanceSummary);
  const listReportCardsFn      = useServerFn(listReportCards);
  const getAcademicReportFn    = useServerFn(getStudentAcademicReport);
  const getAllYearsReportFn     = useServerFn(getStudentAllYearsReport);

  const listAnnouncementsFn = useServerFn(listSchoolAnnouncements);

  const { tab } = useSearch({ from: "/parent" }) as { tab?: "profile" | "fees" | "attendance" | "academics" | "report" | "activities" | "announcements" };
  const navigate = useNavigate();
  const activeTab = tab ?? "profile";

  const [data, setData]         = useState<PortalData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [activeChild, setActiveChild] = useState<number>(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [payError, setPayError] = useState<string>("");
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [editForm, setEditForm] = useState<{ bloodGroup: string; gender: string; dateOfBirth: string }>({ bloodGroup: "", gender: "", dateOfBirth: "" });

  // Academic profile state
  const [attendanceSummary, setAttendanceSummary] = useState<any[]>([]);
  const [expandedYear, setExpandedYear]   = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const byYear = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of attendanceSummary) {
      const year = (m.monthKey as string).slice(0, 4);
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [attendanceSummary]);
  const [reportCardsList, setReportCardsList] = useState<any[]>([]);
  const [academicReport, setAcademicReport] = useState<any | null>(null);
  const [allYearsReports, setAllYearsReports] = useState<any[]>([]);
  const [rcViewReport, setRcViewReport] = useState<any | null>(null);
  const [rcViewLoading, setRcViewLoading] = useState(false);

  const [announcementsList, setAnnouncementsList] = useState<any[]>([]);
  const [academicLoading, setAcademicLoading] = useState(false);

  // Activity hierarchy expand state
  const [actExpandedYears, setActExpandedYears]   = useState<Set<string>>(new Set());
  const [actExpandedMonths, setActExpandedMonths] = useState<Set<string>>(new Set());
  const [actExpandedDates, setActExpandedDates]   = useState<Set<string>>(new Set());
  const actHasInit = useRef(false);

  useEffect(() => {
    if (!actHasInit.current && activities.length) {
      actHasInit.current = true;
      const byYear = new Map<string, Map<string, Map<string, Activity[]>>>();
      for (const act of activities) {
        const dateKey = new Date(act.activityDate as string).toISOString().slice(0, 10);
        const [y, m] = dateKey.split("-");
        const yearKey = y;
        const monthKey = `${y}-${m}`;
        if (!byYear.has(yearKey)) byYear.set(yearKey, new Map());
        const byMonth = byYear.get(yearKey)!;
        if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
        const byDate = byMonth.get(monthKey)!;
        if (!byDate.has(dateKey)) byDate.set(dateKey, []);
        byDate.get(dateKey)!.push(act);
      }
      const sortedYears = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
      const firstYear = sortedYears[0];
      const byMonth = byYear.get(firstYear)!;
      const sortedMonths = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
      const firstMonth = sortedMonths[0];
      const byDate = byMonth.get(firstMonth)!;
      const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
      const firstDate = sortedDates[0];
      setActExpandedYears(new Set([firstYear]));
      setActExpandedMonths(new Set([firstMonth]));
      setActExpandedDates(new Set([firstDate]));
    }
  }, [activities]);

  // Default to the profile tab in the URL if none is set
  useEffect(() => {
    if (!tab) navigate({ to: "/parent", search: { tab: "profile" }, replace: true });
  }, [tab, navigate]);

  const handlePayNow = async (fee: Fee) => {
    setPayingId(fee.id); setPayError("");
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Failed to load Razorpay. Check your internet connection.");

      const order = await createOrderFn({ data: { invoiceId: fee.id } }) as { orderId: string; amount: number; keyId: string };

      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: "INR",
          order_id: order.orderId,
          name: "School Fee Payment",
          description: `Invoice #${fee.id}`,
          prefill: { email: data?.user.email ?? "" },
          theme: { color: "#6366f1" },
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              await verifyFn({ data: {
                invoiceId: fee.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }});
              // Update local state
              setData((prev) => prev ? {
                ...prev,
                fees: prev.fees.map((f) => f.id === fee.id ? { ...f, status: "paid", paidAt: new Date().toISOString(), paidMethod: "razorpay" } : f),
              } : prev);
              resolve();
            } catch (err: any) { reject(err); }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
        });
        rzp.open();
      });
    } catch (err: any) {
      if (err?.message !== "Payment cancelled") {
        setPayError(err?.message ?? "Payment failed. Please try again.");
      }
    } finally {
      setPayingId(null);
    }
  };

  const handleSavePersonal = async () => {
    if (!child) return;
    setSaving(true); setError("");
    try {
      const payload: any = { studentId: child.id };
      if (editForm.gender) payload.gender = editForm.gender;
      if (editForm.bloodGroup) payload.bloodGroup = editForm.bloodGroup;
      if (editForm.dateOfBirth) payload.dateOfBirth = editForm.dateOfBirth;
      await updateChildFn({ data: payload });
      const refreshed = await getPortalFn() as PortalData;
      setData(refreshed);
      setEditing(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    Promise.all([
      getPortalFn().then((d) => setData(d as PortalData)),
      getActivitiesFn({ data: {} }).then((a) => setActivities(a as Activity[])).catch(() => {}),
    ])
      .catch((e) => setError(e?.message ?? "Failed to load portal"))
      .finally(() => setLoading(false));
  }, []);

  // Load academic data whenever active child changes
  useEffect(() => {
    if (!data?.children[activeChild]?.id) return;
    const child = data.children[activeChild];
    const childId = child.id;
    setAcademicLoading(true);
    setAttendanceSummary([]); setReportCardsList([]); setAnnouncementsList([]); setAcademicReport(null);
    setAllYearsReports([]); setExpandedYear(null);

    Promise.all([
      getAttendanceFn({ data: { studentId: childId } }).then((d) => setAttendanceSummary(d as any[])).catch(() => {}),
      listReportCardsFn({ data: { studentId: childId } }).then((d) => setReportCardsList(d as any[])).catch(() => {}),
      listAnnouncementsFn({ data: { target: "parents" } }).then((d) => setAnnouncementsList(d as any[])).catch(() => {}),
      getAllYearsReportFn({ data: { studentId: childId } })
        .then((reports: any) => {
          const list = (reports ?? []) as any[];
          setAllYearsReports(list);
          // Auto-expand the most recent year
          if (list.length > 0) setExpandedYear(list[0].academicYear);
        }).catch(() => {}),
    ]).finally(() => setAcademicLoading(false));
  }, [activeChild, data?.children.length]);

  if (loading) return (
    <div className="space-y-4">
      {[1,2].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-200 h-32 animate-pulse" />)}
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
      <AlertCircle className="w-5 h-5 shrink-0" /> {error}
    </div>
  );

  const child = data?.children[activeChild];
  const childFees = data?.fees.filter((f) => f.studentId === child?.id) ?? [];
  const totalDue = childFees
    .filter((f) => ["sent","overdue"].includes(f.status))
    .reduce((a, f) => a + parseFloat(f.amount), 0);
  const pendingFees = childFees.filter((f) => ["sent","overdue"].includes(f.status));
  const paidFees = childFees.filter((f) => f.status === "paid");

  const yearStats = (months: any[]) => {
    const totalDays = months.reduce((a, m) => a + ((m.schoolDays as number) || 0), 0);
    const weighted = months.reduce((a, m) => a + ((m.pct as number) || 0) * ((m.schoolDays as number) || 0), 0);
    return { totalDays, pct: totalDays > 0 ? Math.round(weighted / totalDays) : 0 };
  };

  const renderMonth = (m: any) => {
    const pct = m.pct as number;
    const barColor = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
    const badgeColor = pct >= 75 ? "bg-emerald-50 text-emerald-700" : pct >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
    const expanded = expandedMonth === m.monthKey;
    const days = (m.days ?? []) as { date: string; status: string }[];
    return (
      <div key={m.monthKey} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
        <button
          onClick={() => setExpandedMonth(expanded ? null : m.monthKey)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">{m.label}</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{m.present}P · {m.absent}A</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{pct}%</span>
          </div>
        </button>
        <div className="w-full h-1.5 bg-slate-100 mx-4 mb-3" style={{ width: "calc(100% - 2rem)" }}>
          <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        {expanded && (
          <div className="px-4 pb-4 space-y-2">
            {days.map((d: any) => {
              const status = d.status as string;
              const badge = status === "present"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : status === "absent"
                ? "bg-red-50 text-red-700 border-red-200"
                : status === "half_day"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-slate-100 text-slate-600 border-slate-200";
              const label = status === "half_day" ? "Half day" : status.charAt(0).toUpperCase() + status.slice(1);
              return (
                <div key={d.date} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <span className="text-sm text-slate-700">{fmtDate(d.date)}</span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${badge}`}>{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-7">

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
          Welcome, {data?.user.firstName ?? "Parent"}!
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Your child's school portal</p>
      </div>

      {/* No children */}
      {!data?.children.length && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">No children linked yet</h3>
          <p className="text-sm text-slate-400">Contact your school admin to link your child to this account.</p>
        </div>
      )}

      {/* Child selector tabs (if multiple children) */}
      {(data?.children.length ?? 0) > 1 && (
        <div className="flex gap-2 flex-wrap">
          {data!.children.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActiveChild(i)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                i === activeChild
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              }`}
            >
              {c.firstName} {c.lastName}
            </button>
          ))}
        </div>
      )}

      {child && (
        <>
          {activeTab === "profile" && (<>
          {/* Child full profile card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-blue-500 to-violet-600" />
            <div className="p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-100 flex items-center justify-center text-xl sm:text-2xl font-extrabold text-blue-600 shrink-0">
                  {child.firstName[0]}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl font-extrabold text-slate-900">{child.firstName} {child.lastName}</h2>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_BADGE[child.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      {child.status}
                    </span>
                  </div>
                  {editing ? (
                    <div className="flex flex-col sm:flex-row gap-3 mt-3">
                      <input type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm((f) => ({ ...f, dateOfBirth: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
                      <select value={editForm.gender} onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm">
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                        <option value="prefer_not_to_say">Prefer not to say</option>
                      </select>
                      <input type="text" placeholder="Blood group" value={editForm.bloodGroup} onChange={(e) => setEditForm((f) => ({ ...f, bloodGroup: e.target.value }))} className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm w-28" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3 text-sm">
                      <ProfileItem label="Date of birth" value={child.dateOfBirth ? fmtDate(child.dateOfBirth) : null} />
                      <ProfileItem label="Gender" value={child.gender ? child.gender.replace("_", " ") : null} capitalize />
                      <ProfileItem label="Blood group" value={child.bloodGroup} upper />
                      <ProfileItem label="Class" value={child.className} />
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {editing ? (
                    <div className="flex gap-2">
                      <button onClick={handleSavePersonal} disabled={saving} className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:bg-emerald-400 transition">{saving ? "Saving..." : "Save"}</button>
                      <button onClick={() => setEditing(false)} disabled={saving} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditForm({ bloodGroup: child.bloodGroup ?? "", gender: child.gender ?? "", dateOfBirth: child.dateOfBirth ?? "" }); setEditing(true); }} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition">Edit</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Parent / Guardian contacts */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-violet-50 text-violet-700">
              <Users className="w-4 h-4" />
              <h3 className="text-sm font-bold">Parents / Guardians</h3>
            </div>
            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.parentContacts.filter((p) => p.studentId === child.id).length === 0 ? (
                <p className="text-sm text-slate-400 col-span-2">No parent contacts on record.</p>
              ) : data.parentContacts.filter((p) => p.studentId === child.id).map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{p.name}</span>
                    <span className="text-xs text-slate-500 capitalize">({p.relation})</span>
                  </div>
                  {p.phone ? <div className="text-sm text-slate-600"><span className="text-slate-400 text-xs uppercase tracking-wide">Phone</span> <span className="block font-medium">{p.phone}</span></div> : null}
                  {p.address ? <div className="text-sm text-slate-600"><span className="text-slate-400 text-xs uppercase tracking-wide">Address</span> <span className="block font-medium">{p.address}</span></div> : null}
                </div>
              ))}
            </div>
          </div>

          {/* Emergency contacts */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-rose-50 text-rose-700">
              <AlertCircle className="w-4 h-4" />
              <h3 className="text-sm font-bold">Emergency Contacts</h3>
            </div>
            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.emergencyContacts.filter((e) => e.studentId === child.id).length === 0 ? (
                <p className="text-sm text-slate-400 col-span-2">No emergency contacts on record.</p>
              ) : data.emergencyContacts.filter((e) => e.studentId === child.id).map((e) => (
                <div key={e.id} className="rounded-xl border border-slate-200 p-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{e.name}</span>
                    <span className="text-xs text-slate-500 capitalize">({e.relation})</span>
                  </div>
                  <div className="text-sm text-slate-600"><span className="text-slate-400 text-xs uppercase tracking-wide">Phone</span> <span className="block font-medium">{e.phone}</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* Medical information */}
          {(() => {
            const medical = data.medicalNotes.find((m) => m.studentId === child.id);
            return (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-emerald-50 text-emerald-700">
                  <HeartPulse className="w-4 h-4" />
                  <h3 className="text-sm font-bold">Medical Information</h3>
                </div>
                <div className="p-4 sm:p-5">
                  {!medical ? (
                    <p className="text-sm text-slate-400">No medical information on record.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {medical.allergies && (
                        <div>
                          <span className="text-xs text-slate-400 uppercase tracking-wide">Allergies</span>
                          <p className="text-sm text-slate-700 font-medium">{medical.allergies}</p>
                        </div>
                      )}
                      {medical.conditions && (
                        <div>
                          <span className="text-xs text-slate-400 uppercase tracking-wide">Conditions</span>
                          <p className="text-sm text-slate-700 font-medium">{medical.conditions}</p>
                        </div>
                      )}
                      {medical.medications && (
                        <div>
                          <span className="text-xs text-slate-400 uppercase tracking-wide">Medications</span>
                          <p className="text-sm text-slate-700 font-medium">{medical.medications}</p>
                        </div>
                      )}
                      {medical.notes && (
                        <div>
                          <span className="text-xs text-slate-400 uppercase tracking-wide">Notes</span>
                          <p className="text-sm text-slate-700 font-medium">{medical.notes}</p>
                        </div>
                      )}
                      {!medical.allergies && !medical.conditions && !medical.medications && !medical.notes && (
                        <p className="text-sm text-slate-400 col-span-2">No medical details recorded.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          </>)}

          {activeTab === "fees" && (<>
          {/* Fee summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total due",     value: `₹${totalDue.toLocaleString("en-IN")}`, icon: DollarSign, color: totalDue > 0 ? "text-red-600" : "text-emerald-600", bg: totalDue > 0 ? "bg-red-50" : "bg-emerald-50", stripe: totalDue > 0 ? "from-red-500 to-rose-500" : "from-emerald-500 to-teal-500" },
              { label: "Pending invoices", value: childFees.filter(f=>["sent","overdue"].includes(f.status)).length, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", stripe: "from-amber-400 to-orange-500" },
              { label: "Total invoices",   value: childFees.length,                                                 icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50", stripe: "from-blue-500 to-blue-600" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className={`h-1.5 bg-gradient-to-r ${s.stripe}`} />
                <div className="p-5 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <div>
                    <div className={`text-xl font-extrabold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-slate-500">{s.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pay error banner */}
          {payError && (
            <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" /> {payError}
              <button onClick={() => setPayError("")} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Pending invoices */}
          {pendingFees.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-red-500 to-orange-500" />
              <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
                <div className="w-1 h-5 bg-red-500 rounded-full" />
                <h2 className="text-sm font-bold text-slate-800">Pending Payments</h2>
                <span className="ml-auto text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">{pendingFees.length} due</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3.5">Fee</th>
                      <th className="px-5 py-3.5">Amount</th>
                      <th className="px-5 py-3.5">Due date</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingFees.map((fee) => (
                      <tr key={fee.id} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-800 text-sm">{fee.feeName ?? `Invoice #${fee.id}`}</p>
                          {fee.feeFrequency && <p className="text-xs text-slate-400 capitalize mt-0.5">{fee.feeFrequency.replace("_", " ")}</p>}
                        </td>
                        <td className="px-5 py-4 font-bold text-slate-900">₹{parseFloat(fee.amount).toLocaleString("en-IN")}</td>
                        <td className="px-5 py-4 text-slate-500">
                          {fee.dueDate ?? "—"}
                          {fee.status === "overdue" && <span className="ml-1 text-xs text-red-500 font-semibold">(overdue)</span>}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize ${FEE_BADGE[fee.status] ?? "bg-slate-100 text-slate-600"}`}>
                            {fee.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => handlePayNow(fee)}
                            disabled={payingId === fee.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-bold rounded-lg transition"
                          >
                            {payingId === fee.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                            {payingId === fee.id ? "Processing…" : "Pay online"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-2">
                <span>💡 You can also pay in cash at the school reception — staff will mark it as paid.</span>
              </div>
            </div>
          )}

          {/* Paid invoices */}
          {paidFees.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-bold text-slate-800">Payment History</h2>
                <span className="ml-auto text-xs text-slate-400">{paidFees.length} paid</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3.5">Fee</th>
                      <th className="px-5 py-3.5">Amount</th>
                      <th className="px-5 py-3.5">Paid on</th>
                      <th className="px-5 py-3.5">Method</th>
                      <th className="px-5 py-3.5">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paidFees.map((fee) => (
                      <tr key={fee.id} className="hover:bg-slate-50 transition">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-800 text-sm">{fee.feeName ?? `Invoice #${fee.id}`}</p>
                          {fee.feeFrequency && <p className="text-xs text-slate-400 capitalize mt-0.5">{fee.feeFrequency.replace("_", " ")}</p>}
                        </td>
                        <td className="px-5 py-4 font-bold text-emerald-700">₹{parseFloat(fee.amount).toLocaleString("en-IN")}</td>
                        <td className="px-5 py-4 text-slate-500">
                          {fee.paidAt ? new Date(fee.paidAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-5 py-4">
                          <span className="capitalize text-slate-600 text-xs font-medium">{fee.paidMethod?.replace("_", " ") ?? "—"}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No invoices at all */}
          {childFees.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm text-slate-400">No invoices for this child yet.</p>
            </div>
          )}

          </>)}

          {activeTab === "attendance" && (<>
          {/* Attendance */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 bg-emerald-500 rounded-full" />
              <Calendar className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-800">Attendance</h2>
            </div>
            {academicLoading ? (
              <div className="p-6 space-y-3">{[1,2].map(i=><div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
            ) : attendanceSummary.length === 0 ? (
              <div className="p-10 text-center">
                <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                <p className="text-sm text-slate-400">No attendance data yet</p>
              </div>
            ) : (
              <div className="p-6 space-y-2">
                {byYear.map(([year, months]) => {
                  const open = expandedYear === year;
                  const { pct } = yearStats(months);
                  const barColor = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
                  const badgeColor = pct >= 75 ? "bg-emerald-50 text-emerald-700" : pct >= 50 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
                  return (
                    <div key={year} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <button
                        onClick={() => setExpandedYear(open ? null : year)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-700">{year}</span>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{months.reduce((a: number, m: any) => a + (m.present || 0), 0)}P · {months.reduce((a: number, m: any) => a + (m.absent || 0), 0)}A</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{pct}%</span>
                        </div>
                      </button>
                      {open && (
                        <div className="p-2 space-y-2 bg-slate-50/50">
                          {months.map(renderMonth)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </>)}

          {activeTab === "academics" && (<>

          {/* Marks & Results — year accordion */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 bg-blue-600 rounded-full" />
              <BarChart2 className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-800">Marks & Results</h2>
            </div>
            {academicLoading ? (
              <div className="p-6 space-y-3">{[1,2,3].map(i=><div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
            ) : allYearsReports.length === 0 ? (
              <div className="p-8 text-center">
                <GraduationCap className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">No exam results available yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {allYearsReports.map((report: any) => {
                  const isOpen = expandedYear === report.academicYear;
                  return (
                    <div key={report.academicYear}>
                      {/* Year accordion header */}
                      <button
                        onClick={() => setExpandedYear(isOpen ? null : report.academicYear)}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition text-left"
                      >
                        <div className="flex items-center gap-3">
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                          <div>
                            <p className="text-sm font-bold text-slate-800">{report.academicYear}</p>
                            <p className="text-xs text-slate-400">{report.className}</p>
                          </div>
                        </div>
                        {report.overallPercentage && (
                          <div className="text-right">
                            <p className="text-sm font-bold text-blue-700">{report.overallPercentage}%</p>
                            <p className="text-xs text-slate-500">Overall · {report.overallGrade ?? "—"}</p>
                          </div>
                        )}
                      </button>

                      {/* Year content — exams */}
                      {isOpen && (
                        <div className="px-6 pb-6 space-y-4 bg-slate-50/50">
                          {report.exams.map((exam: any) => (
                            <div key={exam.examId} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{exam.term}</p>
                                  <p className="text-xs text-slate-400 capitalize">{exam.examType}{exam.startDate ? ` · ${fmtDate(exam.startDate)}` : ""}</p>
                                </div>
                                {exam.hasMarks ? (
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-blue-700">{exam.termPercentage}%</p>
                                    <p className="text-xs text-slate-500">Grade: <span className="font-bold">{exam.termGrade ?? "—"}</span></p>
                                  </div>
                                ) : (
                                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Results awaited</span>
                                )}
                              </div>
                              {exam.subjects.length > 0 && (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-100">
                                      <th className="text-left px-4 py-2 text-slate-500 font-semibold">Subject</th>
                                      <th className="px-3 py-2 text-slate-500 font-semibold text-center">Max</th>
                                      <th className="px-3 py-2 text-slate-500 font-semibold text-center">Scored</th>
                                      <th className="px-3 py-2 text-slate-500 font-semibold text-center">%</th>
                                      <th className="px-3 py-2 text-slate-500 font-semibold text-center">Grade</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50">
                                    {exam.subjects.map((s: any, i: number) => (
                                      <tr key={i} className="hover:bg-slate-50 transition">
                                        <td className="px-4 py-2 font-medium text-slate-700">{s.subjectName}</td>
                                        <td className="px-3 py-2 text-center text-slate-500">{s.maxMarks}</td>
                                        <td className="px-3 py-2 text-center font-semibold text-slate-800">{s.marks ?? "—"}</td>
                                        <td className="px-3 py-2 text-center text-slate-600">{s.percentage ? `${s.percentage}%` : "—"}</td>
                                        <td className="px-3 py-2 text-center">
                                          {s.grade ? <span className="font-bold text-blue-700">{s.grade}</span> : <span className="text-slate-300">—</span>}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          ))}
                          {/* Overall for this year */}
                          {report.overallPercentage && (
                            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
                              <p className="text-sm font-bold text-blue-800">Overall ({report.academicYear})</p>
                              <div className="text-right">
                                <p className="text-lg font-extrabold text-blue-700">{report.overallPercentage}%</p>
                                <p className="text-xs text-blue-600">Grade: <span className="font-bold">{report.overallGrade ?? "—"}</span></p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Report Card PDFs (uploaded by admin) */}
          {(reportCardsList.length > 0 || !academicLoading) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 bg-violet-600 rounded-full" />
              <GraduationCap className="w-4 h-4 text-violet-600" />
              <h2 className="text-sm font-bold text-slate-800">Report Cards</h2>
            </div>
            {academicLoading ? (
              <div className="p-6 space-y-2">{[1,2].map(i=><div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
            ) : reportCardsList.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-400">No report cards issued yet by the school.</p>
              </div>
            ) : (() => {
              const byYearMap = new Map<string, any[]>();
              for (const rc of reportCardsList) {
                const yr = rc.academicYear ?? "Unknown";
                if (!byYearMap.has(yr)) byYearMap.set(yr, []);
                byYearMap.get(yr)!.push(rc);
              }
              const years = [...byYearMap.keys()].sort((a, b) => b.localeCompare(a));
              const child = data?.children[activeChild];
              return (
                <div className="p-6 space-y-4">
                  {rcViewReport && (
                    <div className="mb-4 border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                        <p className="text-xs font-semibold text-slate-600">Report Card — {rcViewReport.academicYear}</p>
                        <button onClick={() => setRcViewReport(null)} className="p-1 hover:bg-slate-200 rounded-lg"><X className="w-3.5 h-3.5 text-slate-400" /></button>
                      </div>
                      {/* Inline report card view */}
                      <div className="p-4 text-xs">
                        <p className="font-bold text-slate-800 mb-1">{rcViewReport.schoolName}</p>
                        <p className="text-slate-500 mb-3">{rcViewReport.className} · {rcViewReport.academicYear} · {rcViewReport.board?.toUpperCase()}</p>
                        {rcViewReport.exams?.map((exam: any) => (
                          <div key={exam.examId} className="mb-3 rounded-lg border border-slate-200 overflow-hidden">
                            <div className="flex justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                              <p className="font-bold text-slate-700">{exam.term}</p>
                              {exam.hasMarks && <p className="font-bold text-blue-700">{exam.termPercentage}% · {exam.termGrade}</p>}
                            </div>
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/60">
                                  <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Subject</th>
                                  <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Max</th>
                                  <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Scored</th>
                                  <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Grade</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {exam.subjects.map((s: any, i: number) => (
                                  <tr key={i}>
                                    <td className="px-3 py-1.5 text-slate-700">{s.subjectName}</td>
                                    <td className="px-2 py-1.5 text-center text-slate-500">{s.maxMarks}</td>
                                    <td className="px-2 py-1.5 text-center font-semibold">{s.marks ?? "—"}</td>
                                    <td className="px-2 py-1.5 text-center font-bold text-blue-700">{s.grade ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                        {rcViewReport.overallPercentage && (
                          <div className="flex justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                            <p className="font-bold text-blue-800">Overall</p>
                            <p className="font-extrabold text-blue-700">{rcViewReport.overallPercentage}% · {rcViewReport.overallGrade}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {years.map((year) => (
                    <div key={year}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-violet-700 bg-violet-100 px-2.5 py-0.5 rounded-full">{year}</span>
                      </div>
                      <div className="space-y-2 border-l-2 border-violet-100 ml-2 pl-3">
                        {byYearMap.get(year)!.map((rc: any) => (
                          <div key={rc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                              <GraduationCap className="w-4 h-4 text-violet-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800">{rc.term ?? "Report Card"}</p>
                              {rc.className && <p className="text-xs text-slate-400">{rc.className}</p>}
                            </div>
                            {rc.publicUrl ? (
                              <a href={rc.publicUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition shrink-0">
                                <ExternalLink className="w-3 h-3" /> Download PDF
                              </a>
                            ) : child?.currentClassId ? (
                              <button
                                disabled={rcViewLoading}
                                onClick={async () => {
                                  setRcViewLoading(true);
                                  try {
                                    const d = await getAcademicReportFn({ data: { studentId: child.id, classId: rc.classId ?? child.currentClassId!, academicYear: rc.academicYear } });
                                    setRcViewReport(d);
                                  } catch {}
                                  finally { setRcViewLoading(false); }
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-semibold transition shrink-0"
                              >
                                {rcViewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />} View
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          )}

          </>)}

          {activeTab === "announcements" && (<>
          {/* Announcements */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <div className="w-1 h-5 bg-pink-600 rounded-full" />
              <Megaphone className="w-4 h-4 text-pink-600" />
              <h2 className="text-sm font-bold text-slate-800">Announcements</h2>
            </div>
            {announcementsList.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-slate-400">No announcements</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {announcementsList.map((a: any) => (
                  <div key={a.id} className="p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <Megaphone className="w-4 h-4 text-pink-500" />
                      <h3 className="font-semibold text-slate-900 text-sm">{a.title}</h3>
                    </div>
                    {a.message && <p className="text-xs text-slate-500">{a.message}</p>}
                    <p className="text-[10px] text-slate-400 mt-1">{fmtDateTime(a.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div></>)}

          {activeTab === "activities" && (<>
          {/* Curriculum Activity Feed — year → month → date */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-violet-600 rounded-full" />
              <BookOpen className="w-4 h-4 text-violet-600" />
              <h2 className="text-base font-bold text-slate-800">Classroom Activities</h2>
              {activities.length > 0 && <span className="ml-auto text-xs text-slate-400">{activities.length} activities</span>}
            </div>

            {!activities.length ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center mb-3">
                  <BookOpen className="w-6 h-6 text-violet-300" />
                </div>
                <p className="text-sm text-slate-500 font-medium">No activities posted yet</p>
                <p className="text-xs text-slate-400 mt-1">Your child's teacher will post classroom activities here</p>
              </div>
            ) : (() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().slice(0, 10);

              // Build year → month → date → activities
              const byYear = new Map<string, Map<string, Map<string, Activity[]>>>();
              for (const act of activities) {
                const dateKey = new Date(act.activityDate as string).toISOString().slice(0, 10);
                const [y, mo] = dateKey.split("-");
                const yearKey = y, monthKey = `${y}-${mo}`;
                if (!byYear.has(yearKey)) byYear.set(yearKey, new Map());
                const byMonth = byYear.get(yearKey)!;
                if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
                const byDate = byMonth.get(monthKey)!;
                if (!byDate.has(dateKey)) byDate.set(dateKey, []);
                byDate.get(dateKey)!.push(act);
              }
              const sortedYears = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

              return (
                <div className="space-y-8">
                  {sortedYears.map((yearKey) => {
                    const byMonth = byYear.get(yearKey)!;
                    const sortedMonths = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
                    return (
                      <div key={yearKey}>
                        {/* Year row */}
                        <button
                          type="button"
                          onClick={() => setActExpandedYears((prev) => { const n = new Set(prev); n.has(yearKey) ? n.delete(yearKey) : n.add(yearKey); return n; })}
                          className="w-full flex items-center gap-3 mb-5 group"
                        >
                          <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${actExpandedYears.has(yearKey) ? "" : "-rotate-90"}`} />
                          <span className="text-lg font-extrabold text-slate-900">{yearKey}</span>
                          <div className="flex-1 h-0.5 bg-slate-200 rounded-full" />
                        </button>

                        {actExpandedYears.has(yearKey) && (
                          <div className="space-y-6">
                            {sortedMonths.map((monthKey) => {
                              const byDate = byMonth.get(monthKey)!;
                              const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
                              const monthLabel = new Date(`${monthKey}-01`).toLocaleDateString("en-IN", { month: "long" });
                              const totalInMonth = sortedDates.reduce((s, dk) => s + byDate.get(dk)!.length, 0);

                              return (
                                <div key={monthKey} className="pl-2 border-l-4 border-violet-100">
                                  {/* Month row */}
                                  <button
                                    type="button"
                                    onClick={() => setActExpandedMonths((prev) => { const n = new Set(prev); n.has(monthKey) ? n.delete(monthKey) : n.add(monthKey); return n; })}
                                    className="w-full flex items-center gap-2 mb-4 group"
                                  >
                                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${actExpandedMonths.has(monthKey) ? "" : "-rotate-90"}`} />
                                    <span className="text-base font-bold text-violet-700">{monthLabel}</span>
                                    <span className="text-xs text-slate-400">· {totalInMonth} {totalInMonth === 1 ? "activity" : "activities"}</span>
                                  </button>

                                  {actExpandedMonths.has(monthKey) && (
                                    <div className="space-y-5">
                                      {sortedDates.map((dateKey) => {
                                        const dayActs = byDate.get(dateKey)!;
                                        const dayLabel = dateKey === todayStr ? "Today" : dateKey === yesterdayStr ? "Yesterday"
                                          : new Date(dateKey).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
                                        const isExpanded = actExpandedDates.has(dateKey);

                                        return (
                                          <div key={dateKey}>
                                            {/* Date row */}
                                            <button
                                              type="button"
                                              onClick={() => setActExpandedDates((prev) => { const n = new Set(prev); n.has(dateKey) ? n.delete(dateKey) : n.add(dateKey); return n; })}
                                              className="w-full flex items-center gap-2 mb-3 group"
                                            >
                                              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`} />
                                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                              <span className="text-sm font-semibold text-slate-700">{dayLabel}</span>
                                              <span className="text-xs text-slate-400">· {dayActs.length} {dayActs.length === 1 ? "photo" : "photos"}</span>
                                              <div className="flex-1 h-px bg-slate-100" />
                                            </button>

                                            {/* Photo grid */}
                                            {isExpanded && (
                                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                {dayActs.map((act) => (
                                                  <div
                                                    key={act.id}
                                                    className={`bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm ${act.photoUrl ? "cursor-pointer" : ""}`}
                                                    onClick={() => act.photoUrl && setLightbox(act.photoUrl)}
                                                  >
                                                    {act.photoUrl ? (
                                                      <img src={act.photoUrl} alt={act.title} className="w-full h-32 object-cover hover:scale-105 transition-transform duration-200" />
                                                    ) : (
                                                      <div className="w-full h-32 bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center">
                                                        <Image className="w-8 h-8 text-violet-300" />
                                                      </div>
                                                    )}
                                                    <div className="px-3 py-2">
                                                      <p className="text-xs font-semibold text-slate-800 truncate">{act.title}</p>
                                                      {act.description && <p className="text-xs text-slate-400 truncate mt-0.5">{act.description}</p>}
                                                      <p className="text-xs text-slate-400 mt-1">{act.className} · {act.uploaderName}</p>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div></>)}
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition">
            <X className="w-5 h-5" />
          </button>
          <img src={lightbox} alt="Activity" className="max-w-full max-h-full rounded-xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
