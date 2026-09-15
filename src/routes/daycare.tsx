import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Clock, Save, Loader2, Baby } from "lucide-react";
import { listDaycareSessions, saveDaycareSessions, listClassesForSchool } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { todayIST } from "@/lib/utils";

export const Route = createFileRoute("/daycare")({
  component: DaycarePage,
});

type SessionRow = {
  studentId: number;
  firstName: string;
  lastName: string;
  currentClassId: number | null;
  className: string | null;
  classEndTime: string | null;
  sessionId?: number | null;
  inTime: string;
  outTime: string;
  notes: string;
};

type ClassOption = { id: number; name: string };

function timeToMin(t: string) {
  if (!t || !t.includes(":")) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatHours(inTime: string, outTime: string, classEndTime: string | null, facilityType: string) {
  const inM = timeToMin(inTime);
  const outM = timeToMin(outTime);
  if (inM == null || outM == null || outM <= inM) return 0;
  if (facilityType === "daycare") return +(outM - inM) / 60;
  if (!classEndTime) return 0;
  const endM = timeToMin(classEndTime);
  if (endM == null) return 0;
  const startM = Math.max(inM, endM);
  if (outM <= startM) return 0;
  return +(outM - startM) / 60;
}

function DaycarePage() {
  const { tenant } = useTenant();
  const toast = useToast();
  const listFn = useServerFn(listDaycareSessions);
  const saveFn = useServerFn(saveDaycareSessions);
  const classesFn = useServerFn(listClassesForSchool);

  const [date, setDate] = useState(todayIST());
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | "all">("all");
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [facilityType, setFacilityType] = useState("school");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    classesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } })
      .then((c: any) => setClasses(c ?? []))
      .catch(() => {});
  }, [tenant, classesFn]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listFn({
        data: {
          schoolId: tenant.schoolId,
          locationId: tenant.locationId,
          sessionDate: date,
          classId: selectedClassId === "all" ? undefined : Number(selectedClassId),
        },
      }) as any;
      setFacilityType(data?.[0]?.facilityType ?? "school");
      setRows((data ?? []).map((r: any) => ({
        studentId: r.studentId,
        firstName: r.firstName,
        lastName: r.lastName,
        currentClassId: r.currentClassId,
        className: r.className,
        classEndTime: r.classEndTime,
        sessionId: r.sessionId,
        inTime: r.inTime ?? "",
        outTime: r.outTime ?? "",
        notes: r.notes ?? "",
      })));
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, selectedClassId, tenant, listFn]);

  const updateRow = (studentId: number, key: keyof SessionRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, [key]: value } : r)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const sessions = rows
        .filter((r) => r.inTime || r.outTime)
        .map((r) => ({
          studentId: r.studentId,
          sessionId: r.sessionId || undefined,
          inTime: r.inTime,
          outTime: r.outTime,
          notes: r.notes,
        }));
      await saveFn({
        data: {
          schoolId: tenant.schoolId,
          locationId: tenant.locationId,
          sessionDate: date,
          sessions,
        },
      });
      toast.success("Daycare sessions saved");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Baby className="w-6 h-6 text-blue-600" />
            Daycare
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Record in/out times and track daycare hours</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl transition shadow-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Class</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value === "all" ? "all" : Number(e.target.value))}
              className={inputCls}
            >
              <option value="all">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3.5">Student</th>
                <th className="px-4 py-3.5">Class</th>
                <th className="px-4 py-3.5">School ends</th>
                <th className="px-4 py-3.5">In time</th>
                <th className="px-4 py-3.5">Out time</th>
                <th className="px-4 py-3.5">Daycare hrs</th>
                <th className="px-4 py-3.5 w-48">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading…
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No students found for the selected class.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const hrs = formatHours(r.inTime, r.outTime, r.classEndTime, facilityType);
                  return (
                    <tr key={r.studentId} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {r.firstName} {r.lastName}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{r.className ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-500">
                        <div className="flex items-center gap-1 text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          {r.classEndTime ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="time"
                          value={r.inTime}
                          onChange={(e) => updateRow(r.studentId, "inTime", e.target.value)}
                          className={inputCls}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="time"
                          value={r.outTime}
                          onChange={(e) => updateRow(r.studentId, "outTime", e.target.value)}
                          className={inputCls}
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {hrs > 0 ? hrs.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={r.notes}
                          onChange={(e) => updateRow(r.studentId, "notes", e.target.value)}
                          placeholder="Notes"
                          className={inputCls}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
