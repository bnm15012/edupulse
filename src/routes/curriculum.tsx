import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTeacherDashboard, getSession, listClasses, uploadCurriculumActivity, getCurriculumActivities, deleteCurriculumActivity, updateCurriculumActivity } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { ImagePlus, Trash2, X, Upload, BookOpen, Calendar, ChevronDown, AlertCircle, Loader2, Plus, Image, Pencil } from "lucide-react";
import { todayIST } from "@/lib/utils";
import Swal from "sweetalert2";

export const Route = createFileRoute("/curriculum")({
  component: CurriculumPage,
});

type ClassInfo = { classId: number; className: string };
type Activity = {
  id: number;
  classId: number;
  className: string;
  title: string;
  description: string | null;
  activityDate: Date | string;
  photoUrl: string | null;
  createdAt: Date | string | null;
  uploaderName: string;
};

const ADMIN_ROLES = ["school_admin", "location_admin", "super_admin"];

function toInputDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function formatDisplayDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function CurriculumPage() {
  const { tenant }      = useTenant();
  const getSessionFn    = useServerFn(getSession);
  const getDashFn       = useServerFn(getTeacherDashboard);
  const listClassesFn   = useServerFn(listClasses);
  const uploadFn        = useServerFn(uploadCurriculumActivity);
  const getActivitiesFn = useServerFn(getCurriculumActivities);
  const deleteFn        = useServerFn(deleteCurriculumActivity);
  const updateFn        = useServerFn(updateCurriculumActivity);

  const [canManage, setCanManage]     = useState(false);
  const [classes, setClasses]         = useState<ClassInfo[]>([]);
  const [activities, setActivities]   = useState<Activity[]>([]);
  const [selectedClass, setSelectedClass] = useState<number | "">("");
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [showUpload, setShowUpload]   = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [lightbox, setLightbox]       = useState<string | null>(null);

  const today = todayIST();

  // Upload form state
  const [upClass, setUpClass]         = useState<number | "">("");
  const [upTitle, setUpTitle]         = useState("");
  const [upDesc, setUpDesc]           = useState("");
  const [upDate, setUpDate]           = useState(today);
  const [upFile, setUpFile]           = useState<File | null>(null);
  const [upPreview, setUpPreview]     = useState<string | null>(null);
  const [upFiles, setUpFiles]         = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading]     = useState(false);
  const [upError, setUpError]         = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    if (!tenant) return;
    try {
      const session = (await getSessionFn()) as { role: string; schoolId: number; locationId: number } | null;
      const role = session?.role ?? "";
      const admin = ADMIN_ROLES.includes(role);
      const manageable = admin || role === "teacher" || role === "staff";
      setCanManage(manageable);

      if (admin) {
        // Admin: get all classes for the selected location
        const cls = (await listClassesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } })) as { id: number; name: string }[];
        const mapped = cls.map((c) => ({ classId: c.id, className: c.name }));
        setClasses(mapped);
        if (mapped.length) setUpClass(mapped[0].classId);
      } else {
        // Teacher: get only assigned classes
        const dash = (await getDashFn()) as { myClasses: { classId: number; className: string }[] };
        setClasses(dash.myClasses);
        if (dash.myClasses.length) setUpClass(dash.myClasses[0].classId);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load classes");
    }

    try {
      const acts = (await getActivitiesFn({ data: {} })) as Activity[];
      setActivities(acts);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load activities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [tenant]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setUpPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const readFile = (file: File) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve((ev.target?.result as string) ?? "");
      reader.readAsDataURL(file);
    });

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newFiles: { file: File; preview: string }[] = [];
    for (const file of files) {
      const preview = await readFile(file);
      if (preview) newFiles.push({ file, preview });
    }
    setUpFiles((prev) => [...prev, ...newFiles]);
    if (e.target) e.target.value = "";
  };

  const removeUpFile = (index: number) => {
    setUpFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upClass) { setUpError("Please select a class"); return; }
    setUpError(""); setUploading(true);
    try {
      if (editingId) {
        const fileDataUrl = upFile && upPreview ? upPreview : undefined;
        const fileName = upFile ? upFile.name : undefined;
        await updateFn({
          data: {
            id: editingId,
            classId: Number(upClass),
            title: upTitle,
            description: upDesc || undefined,
            activityDate: upDate,
            fileDataUrl,
            fileName,
          },
        });
      } else {
        const files = upFiles.map((f) => ({ fileDataUrl: f.preview, fileName: f.file.name }));
        await uploadFn({
          data: {
            classId: Number(upClass),
            title: upTitle,
            description: upDesc || undefined,
            activityDate: upDate,
            files,
          },
        });
      }
      // Reset form
      setUpTitle(""); setUpDesc(""); setUpDate(today); setUpFile(null); setUpPreview(null); setUpFiles([]); setEditingId(null);
      if (fileRef.current) fileRef.current.value = "";
      setShowUpload(false);
      // Reload activities
      const acts = (await getActivitiesFn({ data: { classId: selectedClass || undefined } })) as Activity[];
      setActivities(acts);
    } catch (err: any) {
      setUpError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const startAdd = () => {
    setEditingId(null);
    setUpClass(classes[0]?.classId ?? "");
    setUpTitle("");
    setUpDesc("");
    setUpDate(today);
    setUpFile(null);
    setUpPreview(null);
    setUpFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    setShowUpload(true);
  };

  const startEdit = (act: Activity) => {
    setEditingId(act.id);
    setUpClass(act.classId);
    setUpTitle(act.title);
    setUpDesc(act.description ?? "");
    setUpDate(toInputDate(act.activityDate));
    setUpFile(null);
    setUpPreview(act.photoUrl);
    setUpFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    setShowUpload(true);
  };

  const handleDelete = async (id: number) => {
    const { isConfirmed } = await Swal.fire({
      title: "Delete activity?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ef4444",
    });
    if (!isConfirmed) return;
    try {
      await deleteFn({ data: { id } });
      setActivities((prev) => prev.filter((a) => a.id !== id));
      await Swal.fire({ icon: "success", title: "Deleted", showConfirmButton: false, timer: 1500 });
    } catch (e: any) {
      await Swal.fire({ icon: "error", title: "Delete failed", text: e?.message ?? "Please try again." });
    }
  };

  const handleClassFilter = async (classId: number | "") => {
    setSelectedClass(classId);
    try {
      const acts = (await getActivitiesFn({ data: { classId: classId || undefined } })) as Activity[];
      setActivities(acts);
    } catch {}
  };

  const filtered = selectedClass ? activities.filter((a) => a.classId === selectedClass) : activities;

  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const hasInit = useRef(false);

  useEffect(() => {
    if (!hasInit.current && filtered.length) {
      hasInit.current = true;
      const byYear = new Map<string, Map<string, Map<string, Activity[]>>>();
      for (const act of filtered) {
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
      setExpandedYears(new Set([firstYear]));
      setExpandedMonths(new Set([firstMonth]));
      setExpandedDates(new Set([firstDate]));
    }
  }, [filtered]);

  const toggleYear = (yearKey: string) => {
    setExpandedYears((prev) => { const n = new Set(prev); if (n.has(yearKey)) n.delete(yearKey); else n.add(yearKey); return n; });
  };
  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => { const n = new Set(prev); if (n.has(monthKey)) n.delete(monthKey); else n.add(monthKey); return n; });
  };
  const toggleDate = (dateKey: string) => {
    setExpandedDates((prev) => { const n = new Set(prev); if (n.has(dateKey)) n.delete(dateKey); else n.add(dateKey); return n; });
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide";

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-200 h-40 animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">Curriculum Activities</h1>
          <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">Upload photos of classroom activities visible to parents</p>
          <p className="text-sm text-slate-500 mt-0.5 sm:hidden">Upload classroom activity photos</p>
        </div>
        <button
          onClick={startAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow-sm transition shrink-0 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" /> Add Activity
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      {/* Class filter */}
      {classes.length === 0 ? (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4 border border-slate-200">No classes found. Create a class in <strong>Classes</strong> before uploading activities.</p>
      ) : classes.length > 1 && (
        <div className="relative w-full sm:w-64">
          <select
            value={selectedClass}
            onChange={(e) => handleClassFilter(e.target.value ? Number(e.target.value) : "")}
            className="w-full appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>{c.className}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      )}

      {/* Activity feed — grouped by date */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 border-dashed flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
            <ImagePlus className="w-8 h-8 text-blue-400" />
          </div>
          <p className="text-slate-700 font-semibold mb-1">No activities yet</p>
          <p className="text-slate-400 text-sm mb-5">Upload photos of classroom activities to keep parents updated</p>
          <button onClick={startAdd} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition">
            Upload first activity
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {(() => {
            const todayStr = todayIST();
            const [y, m, d] = todayStr.split("-").map(Number);
            const yesterday = new Date(Date.UTC(y, m - 1, d - 1));
            const yesterdayStr = yesterday.toISOString().slice(0, 10);

            // Group: year -> month -> date -> activities
            const byYear = new Map<string, Map<string, Map<string, Activity[]>>>();
            for (const act of filtered) {
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

            return sortedYears.map((yearKey) => {
              const byMonth = byYear.get(yearKey)!;
              const sortedMonths = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

              return (
                <div key={yearKey}>
                  {/* Year header */}
                  <button
                    type="button"
                    onClick={() => toggleYear(yearKey)}
                    className="w-full flex items-center gap-3 mb-6 group"
                  >
                    <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${expandedYears.has(yearKey) ? "" : "-rotate-90"}`} />
                    <span className="text-lg font-extrabold text-slate-900">{yearKey}</span>
                    <div className="flex-1 h-0.5 bg-slate-200 rounded-full" />
                  </button>

                  {expandedYears.has(yearKey) && (
                  <div className="space-y-8">
                    {sortedMonths.map((monthKey) => {
                      const byDate = byMonth.get(monthKey)!;
                      const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
                      const monthLabel = new Date(`${monthKey}-01`).toLocaleDateString("en-IN", { month: "long" });
                      const totalInMonth = sortedDates.reduce((s, d) => s + byDate.get(d)!.length, 0);

                      return (
                        <div key={monthKey} className="pl-2 border-l-4 border-blue-100">
                          {/* Month header */}
                          <button
                            type="button"
                            onClick={() => toggleMonth(monthKey)}
                            className="w-full flex items-center gap-2 mb-5 group"
                          >
                            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${expandedMonths.has(monthKey) ? "" : "-rotate-90"}`} />
                            <span className="text-base font-bold text-blue-700">{monthLabel}</span>
                            <span className="text-xs text-slate-400">· {totalInMonth} {totalInMonth === 1 ? "activity" : "activities"}</span>
                          </button>

                          {expandedMonths.has(monthKey) && (
                          <div className="space-y-6">
                            {sortedDates.map((dateKey) => {
                              const dayActs = byDate.get(dateKey)!;
                              const dayLabel =
                                dateKey === todayStr ? "Today"
                                : dateKey === yesterdayStr ? "Yesterday"
                                : new Date(dateKey).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });

                              const isExpanded = expandedDates.has(dateKey);

                              return (
                                <div key={dateKey}>
                                  {/* Date header */}
                                  <button
                                    type="button"
                                    onClick={() => toggleDate(dateKey)}
                                    className="w-full flex items-center gap-2 mb-3 group"
                                  >
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`} />
                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-sm font-semibold text-slate-700">{dayLabel}</span>
                                    <span className="text-xs text-slate-400">· {dayActs.length} {dayActs.length === 1 ? "photo" : "photos"}</span>
                                    <div className="flex-1 h-px bg-slate-100" />
                                  </button>

                                  {/* Photo cards */}
                                  {isExpanded && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                      {dayActs.map((act) => (
                                      <div
                                        key={act.id}
                                        onClick={() => canManage && startEdit(act)}
                                        className={`bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition group ${canManage ? "cursor-pointer" : ""}`}
                                      >
                                        {act.photoUrl ? (
                                          <div className="relative h-32 cursor-pointer overflow-hidden bg-slate-100" onClick={(e) => { e.stopPropagation(); setLightbox(act.photoUrl!); }}>
                                            <img src={act.photoUrl} alt={act.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                          </div>
                                        ) : (
                                          <div className="h-32 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                                            <Image className="w-8 h-8 text-blue-200" />
                                          </div>
                                        )}
                                        <div className="p-2.5">
                                          <div className="flex items-start justify-between gap-1">
                                            <h3 className="font-semibold text-slate-900 text-xs leading-snug line-clamp-2 flex-1">{act.title}</h3>
                                            {canManage && (
                                              <div className="flex items-center gap-0.5">
                                                <button onClick={(e) => { e.stopPropagation(); startEdit(act); }} className="shrink-0 p-1 rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition">
                                                  <Pencil className="w-3 h-3" />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete(act.id); }} className="shrink-0 p-1 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition">
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                                            <Calendar className="w-3 h-3" />
                                            {formatDisplayDate(act.activityDate)}
                                          </div>
                                          {act.description && <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{act.description}</p>}
                                          <span className="inline-flex items-center gap-1 text-xs text-slate-400 mt-1">
                                            <BookOpen className="w-3 h-3" /> {act.className}
                                          </span>
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
            });
          })()}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowUpload(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2.5">
                <ImagePlus className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">{editingId ? "Edit Activity" : "Add Activity"}</h2>
              </div>
              <button onClick={() => setShowUpload(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="p-6 space-y-4">
              {/* Class */}
              <div>
                <label className={labelCls}>Class</label>
                <div className="relative">
                  <select
                    value={upClass}
                    onChange={(e) => setUpClass(Number(e.target.value))}
                    className={`${inputCls} appearance-none pr-8`}
                    required
                  >
                    <option value="">Select class</option>
                    {classes.map((c) => (
                      <option key={c.classId} value={c.classId}>{c.className}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {classes.length === 0 && <p className="text-xs text-slate-500 mt-1.5">No classes found. Create a class in <strong>Classes</strong> first.</p>}
              </div>

              {/* Title */}
              <div>
                <label className={labelCls}>Activity title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={upTitle}
                  onChange={(e) => setUpTitle(e.target.value)}
                  placeholder="e.g. Clay modelling — animals"
                  className={inputCls}
                  required
                />
              </div>

              {/* Date */}
              <div>
                <label className={labelCls}>Activity date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={upDate}
                  onChange={(e) => setUpDate(e.target.value)}
                  className={inputCls}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>Description (optional)</label>
                <textarea
                  value={upDesc}
                  onChange={(e) => setUpDesc(e.target.value)}
                  placeholder="What did the children learn or do?"
                  className={`${inputCls} resize-none`}
                  rows={3}
                />
              </div>

              {/* Photo upload */}
              <div>
                {editingId ? (
                  <>
                    <label className={labelCls}>Photo (optional)</label>
                    {upPreview ? (
                      <div className="relative rounded-xl overflow-hidden border border-slate-200">
                        <img src={upPreview} alt="Preview" className="w-full max-h-48 object-cover" />
                        <button
                          type="button"
                          onClick={() => { setUpFile(null); setUpPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                          className="absolute top-2 right-2 p-1.5 bg-slate-900/60 hover:bg-slate-900/80 rounded-lg text-white transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
                        <Upload className="w-7 h-7 text-slate-300" />
                        <span className="text-sm text-slate-500">Click to upload a photo</span>
                        <span className="text-xs text-slate-400">JPG, PNG, WEBP up to 10 MB</span>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </label>
                    )}
                  </>
                ) : (
                  <>
                    <label className={labelCls}>Photos (optional)</label>
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-2">
                      {upFiles.map((f, i) => (
                        <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                          <img src={f.preview} alt={f.file.name} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeUpFile(i)}
                            className="absolute top-1 right-1 p-0.5 bg-slate-900/60 hover:bg-slate-900/80 rounded-md text-white transition"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
                      <Upload className="w-6 h-6 text-slate-300" />
                      <span className="text-sm text-slate-500">Click to add photos</span>
                      <span className="text-xs text-slate-400">JPG, PNG, WEBP up to 10 MB each</span>
                      <input
                        ref={fileRef}
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleFilesChange}
                      />
                    </label>
                  </>
                )}
              </div>

              {upError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{upError}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowUpload(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50 transition">
                  Cancel
                </button>
                <button type="submit" disabled={uploading || !upTitle || !upClass} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> {editingId ? "Saving…" : "Uploading…"}</> : <>{editingId ? "Update" : <><Upload className="w-4 h-4" /> Upload</>}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition">
            <X className="w-5 h-5" />
          </button>
          <img src={lightbox} alt="Activity photo" className="max-w-full max-h-full rounded-xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
