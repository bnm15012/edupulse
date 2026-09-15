import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarCheck, ChevronDown, CheckCircle2, XCircle,
  Clock, AlertCircle, Users, BookOpen, Save, History,
  BarChart2, Loader2,
} from "lucide-react";
import {
  listClassesForSchool,
  getStudentAttendanceForDate,
  markStudentAttendance,
  getAttendanceHistory,
  listStudents,
} from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { fmtDate, todayIST } from "@/lib/utils";

export const Route = createFileRoute("/attendance")({
  component: AttendancePage,
});

// ── Types ──────────────────────────────────────────────────────────────────
type AttendanceStatus = "present" | "absent" | "half_day" | "leave";
type ClassOption = { id: number; name: string; ageGroup: string | null; startTime: string | null; endTime: string | null };
type StudentRow = { id: number; firstName: string; lastName: string; status?: AttendanceStatus; inTime?: string; outTime?: string };
type HistoryRow = { id: number; date: string; status: AttendanceStatus; notes: string | null; studentId: number; firstName: string; lastName: string; classId: number; className: string };

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; icon: React.ReactNode }> = {
  present:  { label: "Present",  color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  absent:   { label: "Absent",   color: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100",               icon: <XCircle className="w-3.5 h-3.5" /> },
  half_day: { label: "Half Day", color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",       icon: <Clock className="w-3.5 h-3.5" /> },
  leave:    { label: "Leave",    color: "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200",      icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  present:  "bg-emerald-50 text-emerald-700 border border-emerald-200",
  absent:   "bg-red-50 text-red-600 border border-red-200",
  half_day: "bg-amber-50 text-amber-700 border border-amber-200",
  leave:    "bg-slate-100 text-slate-500 border border-slate-200",
};

const today = todayIST;

// ── Mark Attendance Tab ────────────────────────────────────────────────────
function MarkTab({ classes, schoolId, locationId }: { classes: ClassOption[]; schoolId: number; locationId: number }) {
  const toast = useToast();
  const getStudentsFn       = useServerFn(listStudents);
  const getAttendanceFn     = useServerFn(getStudentAttendanceForDate);
  const markAttendanceFn    = useServerFn(markStudentAttendance);

  const [selectedClass, setSelectedClass] = useState<ClassOption | null>(classes[0] ?? null);
  const [date, setDate]         = useState(today());
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [facilityType, setFacilityType] = useState("school");
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  const isDaycare = facilityType === "both" || facilityType === "daycare";

  const load = async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      const [allStudents, existing] = await Promise.all([
        getStudentsFn({ data: { schoolId, locationId } }) as Promise<any[]>,
        getAttendanceFn({ data: { schoolId, locationId, classId: selectedClass.id, date } }),
      ]);
      const classStudents = (allStudents as any[]).filter((s: any) => s.currentClassId === selectedClass.id && s.status === "enrolled");
      const { sessionTaken, records, facilityType: ft } = existing as any;
      const existingMap = new Map((records as any[]).map((e: any) => [e.studentId, { status: e.status as AttendanceStatus, inTime: e.inTime ?? "", outTime: e.outTime ?? "" }]));
      if (isMounted.current) {
        setFacilityType(ft ?? "school");
        setAlreadyMarked(sessionTaken);
        setStudents(classStudents.map((s: any) => ({
          id: s.id, firstName: s.firstName, lastName: s.lastName,
          status: existingMap.get(s.id)?.status ?? "present",
          inTime: existingMap.get(s.id)?.inTime ?? "",
          outTime: existingMap.get(s.id)?.outTime ?? "",
        })));
      }
    } catch (e: any) {
      if (isMounted.current) toast(e?.message ?? "Failed to load", "error");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  useEffect(() => { isMounted.current = true; load(); }, [selectedClass?.id, date]);

  const setStatus = (studentId: number, status: AttendanceStatus) =>
    setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, status } : s));

  const setTime = (studentId: number, field: "inTime" | "outTime", val: string) =>
    setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, [field]: val } : s));

  const markAll = (status: AttendanceStatus) =>
    setStudents((prev) => prev.map((s) => ({ ...s, status })));

  const save = async () => {
    if (!selectedClass || students.length === 0) return;
    setSaving(true);
    try {
      await markAttendanceFn({
        data: {
          schoolId, locationId, classId: selectedClass.id, date,
          withDaycare: isDaycare,
          records: students.map((s) => ({
            studentId: s.id,
            status: s.status!,
            inTime: s.inTime || undefined,
            outTime: s.outTime || undefined,
          })),
        },
      });
      setAlreadyMarked(true);
      toast(`Attendance saved for ${selectedClass.name} — ${date}`, "success");
    } catch (e: any) {
      toast(e?.message ?? "Failed to save attendance", "error");
    } finally {
      setSaving(false);
    }
  };

  const present  = students.filter((s) => s.status === "present").length;
  const absent   = students.filter((s) => s.status === "absent").length;
  const halfDay  = students.filter((s) => s.status === "half_day").length;
  const leave    = students.filter((s) => s.status === "leave").length;

  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* Class selector */}
          <div className="relative w-full sm:w-auto">
            <select
              value={selectedClass?.id ?? ""}
              onChange={(e) => setSelectedClass(classes.find((c) => c.id === Number(e.target.value)) ?? null)}
              className="w-full sm:w-auto appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name} {c.startTime ? `· ${c.startTime}–${c.endTime}` : ""}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* Date picker */}
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value || today())}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />

          {alreadyMarked && (
            <span className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Already marked
            </span>
          )}
        </div>

        {/* Bulk actions */}
        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto sm:ml-auto">
          {(["present", "absent", "half_day", "leave"] as AttendanceStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => markAll(s)}
              className={`px-2 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${STATUS_CONFIG[s].color}`}
            >
              All {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      {students.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Present",  value: present,  cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { label: "Absent",   value: absent,   cls: "bg-red-50 border-red-200 text-red-600" },
            { label: "Half Day", value: halfDay,  cls: "bg-amber-50 border-amber-200 text-amber-700" },
            { label: "Leave",    value: leave,    cls: "bg-slate-100 border-slate-200 text-slate-500" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border px-4 py-3 text-center ${s.cls}`}>
              <div className="text-2xl font-extrabold">{s.value}</div>
              <div className="text-xs font-semibold mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Student list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-blue-600 rounded-full" />
            <span className="text-sm font-bold text-slate-800">
              {selectedClass?.name ?? "Select a class"}
            </span>
            {selectedClass && (
              <span className="text-xs text-slate-400">
                {selectedClass.startTime}–{selectedClass.endTime} · {students.length} students
              </span>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving || loading || students.length === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-bold transition shadow-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save Attendance"}
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading students…
          </div>
        ) : students.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-400">No enrolled students in this class</p>
          </div>
        ) : (
          <>
          {isDaycare && (
            <div className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-violet-50 border-b border-violet-100">
              <span className="text-xs font-semibold text-violet-600">School + Daycare branch</span>
              <span className="text-xs text-violet-400">— Enter in/out times for daycare billing (optional per student)</span>
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {students.map((s, idx) => {
              const initials = `${s.firstName?.[0] ?? ""}${s.lastName?.[0] ?? ""}`.toUpperCase();
              const isAbsent = s.status === "absent" || s.status === "leave";
              return (
                <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-3.5 hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3 w-full sm:w-auto sm:min-w-[200px]">
                    <span className="text-xs text-slate-300 w-5 text-right font-mono">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {initials}
                    </div>
                    <span className="flex-1 text-sm font-semibold text-slate-800">
                      {s.firstName} {s.lastName}
                    </span>
                  </div>
                  {/* Status buttons */}
                  <div className="grid grid-cols-4 gap-1.5 w-full sm:w-auto">
                    {(["present", "absent", "half_day", "leave"] as AttendanceStatus[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatus(s.id, st)}
                        className={`flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-1.5 text-[10px] sm:text-xs font-semibold rounded-lg border transition ${
                          s.status === st
                            ? STATUS_CONFIG[st].color + " ring-2 ring-offset-1 " + (st === "present" ? "ring-emerald-400" : st === "absent" ? "ring-red-400" : st === "half_day" ? "ring-amber-400" : "ring-slate-300")
                            : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"
                        }`}
                      >
                        {STATUS_CONFIG[st].icon}
                        <span className="hidden sm:inline">{STATUS_CONFIG[st].label}</span>
                      </button>
                    ))}
                  </div>
                  {/* Daycare in/out times — only for daycare-enabled branches */}
                  {isDaycare && (
                    <div className="flex items-center gap-2 ml-auto">
                      <input
                        type="time"
                        value={s.inTime ?? ""}
                        disabled={isAbsent}
                        onChange={(e) => setTime(s.id, "inTime", e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 disabled:opacity-40 disabled:bg-slate-50 w-28"
                        placeholder="In"
                        title="Arrival time"
                      />
                      <span className="text-slate-300 text-xs">→</span>
                      <input
                        type="time"
                        value={s.outTime ?? ""}
                        disabled={isAbsent}
                        onChange={(e) => setTime(s.id, "outTime", e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 disabled:opacity-40 disabled:bg-slate-50 w-28"
                        placeholder="Out"
                        title="Departure time"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────
function HistoryTab({ classes, schoolId, locationId }: { classes: ClassOption[]; schoolId: number; locationId: number }) {
  const toast = useToast();
  const historyFn = useServerFn(getAttendanceHistory);

  const [classFilter, setClassFilter] = useState<number | "all">("all");
  const [fromDate, setFromDate] = useState(() => {
    const [y, m, d] = today().split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, d));
    from.setUTCDate(from.getUTCDate() - 6);
    return from.toISOString().slice(0, 10);
  });
  const [toDate, setToDate]     = useState(today());
  const [rows, setRows]         = useState<HistoryRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const histMounted = useRef(true);
  useEffect(() => () => { histMounted.current = false; }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await historyFn({
        data: {
          schoolId, locationId,
          classId:  classFilter === "all" ? undefined : classFilter,
          fromDate, toDate,
        },
      }) as HistoryRow[];
      if (histMounted.current) setRows(res);
    } catch (e: any) {
      if (histMounted.current) toast(e?.message ?? "Failed to load history", "error");
    } finally {
      if (histMounted.current) setLoading(false);
    }
  };

  useEffect(() => { histMounted.current = true; load(); }, [classFilter, fromDate, toDate]);

  // Group rows by date
  const byDate = rows.reduce<Record<string, HistoryRow[]>>((acc, r) => {
    (acc[r.date] = acc[r.date] ?? []).push(r);
    return acc;
  }, {});

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          >
            <option value="all">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value || toDate)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition" />
        <span className="text-slate-400 text-sm">to</span>
        <input type="date" value={toDate} max={today()} min={fromDate} onChange={(e) => setToDate(e.target.value || today())}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition" />
        <span className="text-xs text-slate-400 ml-auto">{rows.length} records</span>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 flex items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading history…
        </div>
      ) : dates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <History className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p className="text-sm text-slate-400">No attendance records in this date range</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dates.map((date) => {
            const dayRows = byDate[date];
            const present = dayRows.filter((r) => r.status === "present").length;
            const absent  = dayRows.filter((r) => r.status === "absent").length;
            const other   = dayRows.length - present - absent;
            return (
              <div key={date} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <CalendarCheck className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-bold text-slate-800">{fmtDate(date)}</span>
                  </div>
                  <div className="flex gap-3 text-xs font-semibold">
                    <span className="text-emerald-600">{present} present</span>
                    <span className="text-red-500">{absent} absent</span>
                    {other > 0 && <span className="text-amber-600">{other} other</span>}
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {dayRows.map((r) => (
                    <div key={r.id} className="flex items-center gap-4 px-6 py-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {r.firstName?.[0] ?? ""}{r.lastName?.[0] ?? ""}
                      </div>
                      <span className="flex-1 text-sm text-slate-700 font-medium">{r.firstName} {r.lastName}</span>
                      <span className="text-xs text-slate-400">{r.className}</span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status]}`}>
                        {STATUS_CONFIG[r.status].label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
function AttendancePage() {
  const { tenant } = useTenant();
  const toast = useToast();
  const listClassesFn = useServerFn(listClassesForSchool);

  const [tab, setTab]         = useState<"mark" | "history">("mark");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const pageMounted = useRef(true);
  useEffect(() => () => { pageMounted.current = false; }, []);

  useEffect(() => {
    pageMounted.current = true;
    listClassesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } })
      .then((d) => { if (pageMounted.current) setClasses((d as any[]).map((c: any) => ({ id: c.id, name: c.name, ageGroup: c.ageGroup, startTime: c.startTime, endTime: c.endTime }))); })
      .catch((e: any) => { if (pageMounted.current) toast(e?.message ?? "Failed to load classes", "error"); })
      .finally(() => { if (pageMounted.current) setLoading(false); });
  }, [tenant.schoolId, tenant.locationId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Mark and track student attendance by class</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key: "mark" as const,    label: "Mark Attendance", icon: <CalendarCheck className="w-4 h-4" /> },
          { key: "history" as const, label: "History",         icon: <History className="w-4 h-4" /> },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading…
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-200" />
          <p className="text-sm text-slate-400">No classes found for this branch</p>
        </div>
      ) : tab === "mark" ? (
        <MarkTab classes={classes} schoolId={tenant.schoolId} locationId={tenant.locationId} />
      ) : (
        <HistoryTab classes={classes} schoolId={tenant.schoolId} locationId={tenant.locationId} />
      )}
    </div>
  );
}
