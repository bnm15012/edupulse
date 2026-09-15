import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Users, UserPlus, DollarSign, Briefcase, DoorOpen, ArrowRight, TrendingUp, AlertCircle, CalendarCheck, CheckCircle2, XCircle, Cake, Calendar } from "lucide-react";
import { useTenant } from "@/lib/tenant";
import { getDashboardStats, getAttendanceSummary, getUpcomingBirthdays, getUpcomingHolidays } from "@/lib/auth";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

const STAT_CONFIG = [
  { label: "Inquiries",    key: "inquiries",    icon: UserPlus,   gradient: "from-blue-500 to-blue-600",    bg: "bg-blue-50",   text: "text-blue-700",  link: "/admissions" },
  { label: "Students",     key: "students",     icon: Users,      gradient: "from-emerald-500 to-emerald-600", bg: "bg-emerald-50", text: "text-emerald-700", link: "/students" },
  { label: "Classes",      key: "classes",      icon: DoorOpen,   gradient: "from-violet-500 to-violet-600", bg: "bg-violet-50", text: "text-violet-700", link: "/classes" },
  { label: "Staff",        key: "staff",        icon: Briefcase,  gradient: "from-amber-500 to-amber-600",   bg: "bg-amber-50",  text: "text-amber-700", link: "/staff" },
  { label: "Pending Fees", key: "pendingFees",  icon: DollarSign, gradient: "from-rose-500 to-rose-600",    bg: "bg-rose-50",   text: "text-rose-700",  link: "/fees" },
] as const;

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    new:            "bg-blue-50 text-blue-700",
    contacted:      "bg-sky-50 text-sky-700",
    tour_scheduled: "bg-amber-50 text-amber-700",
    enrolled:       "bg-emerald-50 text-emerald-700",
    overdue:        "bg-red-50 text-red-700",
  };
  return map[status] ?? "bg-slate-100 text-slate-600";
};

function Dashboard() {
  const { tenant } = useTenant();
  const statsFn = useServerFn(getDashboardStats);
  const attendanceSummaryFn = useServerFn(getAttendanceSummary);
  const birthdaysFn = useServerFn(getUpcomingBirthdays);
  const holidaysFn = useServerFn(getUpcomingHolidays);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    stats: { inquiries: number; students: number; classes: number; staff: number; pendingFees: number };
    recentInquiries: { parentName: string; childName: string; programInterest: string | null; status: string }[];
    upcomingDues: { amount: string; dueDate: string | null; status: string; firstName: string | null; lastName: string | null }[];
  } | null>(null);
  const [attendance, setAttendance] = useState<{ students: { present: number; absent: number; marked: number; enrolled: number }; staff: { present: number; marked: number } } | null>(null);
  const [birthdays, setBirthdays] = useState<{ id: number; name: string; dateOfBirth: string; birthdayThisYear: string; daysUntil: number; ageTurning: number; className: string | null }[]>([]);
  const [holidays, setHolidays] = useState<{ id: number; name: string; date: string; type: string; description: string | null }[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      statsFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
      attendanceSummaryFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
      birthdaysFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
      holidaysFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }),
    ])
      .then(([stats, att, bdays, hdays]) => { setData(stats as any); setAttendance(att as any); setBirthdays((bdays as any).birthdays ?? []); setHolidays((hdays as any) ?? []); })
      .catch((err) => setError(err?.message ?? "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [tenant.schoolId, tenant.locationId]);

  const stats = data?.stats ?? { inquiries: 0, students: 0, classes: 0, staff: 0, pendingFees: 0 };

  return (
    <div className="space-y-7">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {tenant.schoolName} &mdash; {tenant.locationName}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          Live data
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 h-28 animate-pulse shadow-sm" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {STAT_CONFIG.map((cfg) => {
              const Icon = cfg.icon;
              const value = stats[cfg.key];
              return (
                <Link
                  key={cfg.label}
                  to={cfg.link}
                  className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition overflow-hidden"
                >
                  {/* Coloured top stripe */}
                  <div className={`h-1.5 bg-gradient-to-r ${cfg.gradient}`} />
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                        <Icon className={`w-4.5 h-4.5 w-5 h-5 ${cfg.text}`} />
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="text-2xl font-extrabold text-slate-900 leading-none mb-1">{value}</div>
                    <div className="text-xs text-slate-500 font-medium">{cfg.label}</div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Attendance today widget */}
          <Link to="/attendance" className="group block bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-teal-500 to-cyan-500" />
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
                    <CalendarCheck className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Today's Attendance</p>
                    <p className="text-xs text-slate-400">{attendance ? `${attendance.students.marked} of ${attendance.students.enrolled} students marked` : "Loading…"}</p>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
              </div>
              {attendance && (
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-bold text-slateald-800">{attendance.students.present}</span>
                    <span className="text-xs text-slate-400">present</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-bold text-slate-800">{attendance.students.absent}</span>
                    <span className="text-xs text-slate-400">absent</span>
                  </div>
                  {attendance.students.marked > 0 && (
                    <div className="ml-auto">
                      <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all"
                          style={{ width: `${Math.round((attendance.students.present / Math.max(attendance.students.marked, 1)) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1 text-right">
                        {Math.round((attendance.students.present / Math.max(attendance.students.marked, 1)) * 100)}% present
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Link>

          {/* Bottom panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">

            {/* Upcoming birthdays */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-pink-500 rounded-full" />
                  <h2 className="text-sm font-bold text-slate-800">Upcoming Birthdays</h2>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {birthdays.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-slate-400 text-center">No birthdays in the next 30 days.</p>
                ) : (
                  birthdays.map((b) => (
                    <div key={b.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 transition">
                      <div>
                        <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                          <Cake className="w-3.5 h-3.5 text-pink-500" />
                          {b.name}
                        </p>
                        <p className="text-xs text-slate-400">{b.className ? `${b.className} · ` : ""}Turning {b.ageTurning}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">{b.birthdayThisYear}</p>
                        <p className="text-[11px] text-pink-600 font-medium">
                          {b.daysUntil === 0 ? "Today" : b.daysUntil === 1 ? "Tomorrow" : `In ${b.daysUntil} days`}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Upcoming holidays */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-violet-500 rounded-full" />
                  <h2 className="text-sm font-bold text-slate-800">Upcoming Holidays</h2>
                </div>
                <Link to="/holidays" className="text-xs text-violet-600 hover:underline font-medium flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-slate-50">
                {holidays.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-slate-400 text-center">No holidays in the next 30 days.</p>
                ) : (
                  holidays.map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 transition">
                      <div>
                        <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-violet-500" />
                          {h.name}
                        </p>
                        <p className="text-xs text-slate-400 capitalize">{h.type}{h.description ? ` · ${h.description}` : ""}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-600 whitespace-nowrap">{fmtDate(h.date)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent inquiries */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-blue-600 rounded-full" />
                  <h2 className="text-sm font-bold text-slate-800">Recent Inquiries</h2>
                </div>
                <Link to="/admissions" className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-slate-50">
                {!data?.recentInquiries.length ? (
                  <p className="px-6 py-8 text-sm text-slate-400 text-center">No recent inquiries for this branch.</p>
                ) : (
                  data.recentInquiries.map((inq, i) => (
                    <div key={i} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 transition">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{inq.childName}</p>
                        <p className="text-xs text-slate-400">{inq.programInterest ?? "General"}</p>
                      </div>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusBadge(inq.status)}`}>
                        {inq.status.replace("_", " ")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Upcoming fee dues */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-rose-500 rounded-full" />
                  <h2 className="text-sm font-bold text-slate-800">Upcoming Fee Dues</h2>
                </div>
                <Link to="/fees" className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="divide-y divide-slate-50">
                {!data?.upcomingDues.length ? (
                  <p className="px-6 py-8 text-sm text-slate-400 text-center">No upcoming dues for this branch.</p>
                ) : (
                  data.upcomingDues.map((due, i) => (
                    <div key={i} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 transition">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{due.firstName} {due.lastName}</p>
                        <p className="text-xs text-slate-400">{due.dueDate ?? "—"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{due.amount}</span>
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusBadge(due.status)}`}>
                          {due.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
