import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen, Clock, Plus, X, Pencil, Trash2, Save,
  AlertCircle, Loader2, CheckCircle2, GraduationCap, Award, SlidersHorizontal, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  manageSubject, listSubjects, deleteSubject,
  setClassSubjects, getClassSubjects,
  upsertTimetable, getTimetable, deleteTimetable,
  listClassesForSchool,
  getSchoolBoard, setSchoolBoard,
  listGradingScales, manageGradingScale, deleteGradingScale, seedDefaultGradingScales,
} from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";

export const Route = createFileRoute("/academics")({
  component: AcademicsPage,
});

type Subject = { id: number; name: string; code: string | null; status: string };
type ClassRow = { id: number; name: string; ageGroup: string };
type TT = { id: number; dayOfWeek: number; periodNumber: number; startTime: string | null; endTime: string | null; subjectId: number | null; teacherId: number | null; subjectName: string | null; teacherName: string | null };

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

function AcademicsPage() {
  const { tenant } = useTenant();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"subjects" | "timetable" | "grading">("subjects");

  // Server fns
  const manageSubjectFn = useServerFn(manageSubject);
  const listSubjectsFn = useServerFn(listSubjects);
  const deleteSubjectFn = useServerFn(deleteSubject);
  const getClassSubjectsFn = useServerFn(getClassSubjects);
  const setClassSubjectsFn = useServerFn(setClassSubjects);
  const upsertTimetableFn = useServerFn(upsertTimetable);
  const getTimetableFn = useServerFn(getTimetable);
  const deleteTimetableFn = useServerFn(deleteTimetable);
  const listClassesFn = useServerFn(listClassesForSchool);
  const getSchoolBoardFn = useServerFn(getSchoolBoard);
  const setSchoolBoardFn = useServerFn(setSchoolBoard);
  const listGradingScalesFn = useServerFn(listGradingScales);
  const manageGradingScaleFn = useServerFn(manageGradingScale);
  const deleteGradingScaleFn = useServerFn(deleteGradingScale);
  const seedDefaultGradingScalesFn = useServerFn(seedDefaultGradingScales);

  // Shared data
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Subjects
  const [subjectForm, setSubjectForm] = useState<{ id?: number; name: string; code: string } | null>(null);
  const [savingSubject, setSavingSubject] = useState(false);

  // Class subjects (merged into subjects tab)
  const [selectedClass, setSelectedClass] = useState<number>(0);
  const [classSubjectIds, setClassSubjectIds] = useState<number[]>([]);
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null);
  const [classSubjectsMap, setClassSubjectsMap] = useState<Record<number, number[]>>({});
  const [savingClassSubjects, setSavingClassSubjects] = useState<number | null>(null);

  // Timetable
  const [tt, setTt] = useState<TT[]>([]);
  const [ttForm, setTtForm] = useState<{ id?: number; dayOfWeek: number; periodNumber: number; startTime: string; endTime: string; subjectId: number; teacherId: number } | null>(null);

  // Grading / board
  const ALLOWED_BOARDS = ["preschool", "CBSE", "ICSE"];
  const [schoolBoard, setSchoolBoardValue] = useState<string>("preschool");
  type Scale = { id: number; board: string; name: string; minPercentage: string | number; maxPercentage: string | number; gradePoint: string | number | null };
  const [gradingScalesList, setGradingScalesList] = useState<Scale[]>([]);
  const [scaleForm, setScaleForm] = useState<{ id?: number; name: string; minPercentage: string; maxPercentage: string; gradePoint: string } | null>(null);

  useEffect(() => {
    if (!tenant) return;
    listSubjectsFn({ data: { schoolId: tenant.schoolId } }).then((d) => setSubjects(d as Subject[]));
    listClassesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }).then((d) => setClasses(d as ClassRow[]));
    getSchoolBoardFn({ data: { schoolId: tenant.schoolId } }).then((d: any) => setSchoolBoardValue(ALLOWED_BOARDS.includes(d) ? d : "preschool"));
  }, [tenant]);

  useEffect(() => {
    if (!tenant) return;
    if (activeTab === "subjects") listSubjectsFn({ data: { schoolId: tenant.schoolId } }).then((d) => setSubjects(d as Subject[]));
    if (activeTab === "grading") {
      listGradingScalesFn({ data: { board: schoolBoard } }).then((d: any) => setGradingScalesList(d));
    }
  }, [activeTab, tenant, schoolBoard]);

  // class subjects are now loaded on-demand when a class row is expanded

  useEffect(() => {
    if (activeTab === "timetable" && selectedClass) {
      getTimetableFn({ data: { classId: selectedClass } }).then((d) => setTt(d as TT[]));
    }
  }, [activeTab, selectedClass]);

  if (!tenant) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="w-full max-w-none space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Academics</h1>

      <div className="flex gap-2 border-b border-slate-200">
        {([
          { key: "subjects", label: "Subjects", icon: BookOpen },
          { key: "timetable", label: "Timetable", icon: Clock },
          { key: "grading", label: "Board & Grading", icon: Award },
        ] as any[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === key ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Subjects + Class Subjects (merged) */}
      {activeTab === "subjects" && (
        <div className="space-y-6">
          {/* Global subjects list */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-800">Subjects</h2>
                <p className="text-xs text-slate-400 mt-0.5">School-wide subject library. Assign them to classes below.</p>
              </div>
              <button onClick={() => setSubjectForm({ name: "", code: "" })} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition">
                <Plus className="w-3.5 h-3.5" /> Add subject
              </button>
            </div>

            <div className="space-y-2">
              {subjectForm && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Name *</label>
                    <input value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} className={inputCls} placeholder="e.g. Mathematics" />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Code</label>
                    <input value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })} className={inputCls} placeholder="e.g. MATH" />
                  </div>
                  <div className="flex items-center gap-2 self-end">
                    <button onClick={() => setSubjectForm(null)} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 text-xs font-semibold transition hover:bg-red-100">
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button disabled={savingSubject || !subjectForm.name} onClick={async () => {
                      setSavingSubject(true);
                      try {
                        await manageSubjectFn({ data: { id: subjectForm.id, name: subjectForm.name, code: subjectForm.code } });
                        setSubjectForm(null);
                        const d = await listSubjectsFn({ data: { schoolId: tenant.schoolId } });
                        setSubjects(d as Subject[]);
                        toast("Subject saved", "success");
                      } catch (err: any) { toast(err?.message ?? "Save failed", "error"); }
                      finally { setSavingSubject(false); }
                    }} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-semibold transition">
                      <Save className="w-3.5 h-3.5" /> {savingSubject ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
              {subjects.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                    {s.code && <p className="text-xs text-slate-400">{s.code}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setSubjectForm({ id: s.id, name: s.name, code: s.code ?? "" })} className="p-1.5 text-blue-500 hover:text-blue-700"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={async () => {
                      if (!confirm("Delete this subject?")) return;
                      await deleteSubjectFn({ data: { id: s.id } });
                      setSubjects((p) => p.filter((x) => x.id !== s.id));
                    }} className="p-1.5 text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              {subjects.length === 0 && !subjectForm && <p className="text-sm text-slate-400 text-center py-8">No subjects yet. Add one above.</p>}
            </div>
          </div>

          {/* Per-class subject assignment */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Class Subjects</h2>
              <p className="text-xs text-slate-400 mt-0.5">Click a class to assign subjects to it.</p>
            </div>
            {classes.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No classes found.</p>}
            {classes.map((c) => {
              const isOpen = expandedClassId === c.id;
              return (
                <div key={c.id} className="border-b border-slate-100 last:border-0">
                  <button
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition text-left"
                    onClick={async () => {
                      if (isOpen) { setExpandedClassId(null); return; }
                      setExpandedClassId(c.id);
                      if (!classSubjectsMap[c.id]) {
                        const d = await getClassSubjectsFn({ data: { classId: c.id } });
                        setClassSubjectsMap((prev) => ({ ...prev, [c.id]: (d as any[]).map((x) => x.subjectId) }));
                      }
                    }}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.ageGroup}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {classSubjectsMap[c.id] !== undefined && (
                        <span className="text-xs text-slate-500">{classSubjectsMap[c.id].length} subject{classSubjectsMap[c.id].length !== 1 ? "s" : ""}</span>
                      )}
                      {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-4 bg-slate-50 border-t border-slate-100">
                      <div className="pt-3 space-y-2">
                        {subjects.map((s) => (
                          <label key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 cursor-pointer transition">
                            <input
                              type="checkbox"
                              checked={(classSubjectsMap[c.id] ?? []).includes(s.id)}
                              onChange={(e) => {
                                setClassSubjectsMap((prev) => {
                                  const cur = prev[c.id] ?? [];
                                  return { ...prev, [c.id]: e.target.checked ? [...cur, s.id] : cur.filter((id) => id !== s.id) };
                                });
                              }}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            <span className="text-sm text-slate-800">{s.name}</span>
                            {s.code && <span className="text-xs text-slate-400">({s.code})</span>}
                          </label>
                        ))}
                        {subjects.length === 0 && <p className="text-xs text-slate-400">No subjects in library yet.</p>}
                        <button
                          disabled={savingClassSubjects === c.id}
                          onClick={async () => {
                            setSavingClassSubjects(c.id);
                            try {
                              await setClassSubjectsFn({ data: { classId: c.id, subjectIds: classSubjectsMap[c.id] ?? [] } });
                              toast(`${c.name} subjects saved`, "success");
                            } catch { toast("Save failed", "error"); }
                            finally { setSavingClassSubjects(null); }
                          }}
                          className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-semibold rounded-lg transition"
                        >
                          {savingClassSubjects === c.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timetable */}
      {activeTab === "timetable" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-800">Timetable</h2>
            <select value={selectedClass} onChange={(e) => setSelectedClass(Number(e.target.value))} className={inputCls + " w-48 bg-white"}>
              <option value={0}>— select class —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {ttForm && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <select value={ttForm.dayOfWeek} onChange={(e) => setTtForm({ ...ttForm, dayOfWeek: Number(e.target.value) })} className={inputCls + " bg-white"}>
                  {DAYS.map((d, i) => i > 0 && <option key={i} value={i}>{d}</option>)}
                </select>
                <div className="flex flex-col">
                  <label className="text-[10px] text-slate-500 font-medium mb-1">Period</label>
                  <input type="number" value={ttForm.periodNumber} onChange={(e) => setTtForm({ ...ttForm, periodNumber: Number(e.target.value) })} className={inputCls} placeholder="#" />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] text-slate-500 font-medium mb-1">Start</label>
                  <input value={ttForm.startTime} onChange={(e) => setTtForm({ ...ttForm, startTime: e.target.value })} className={inputCls} placeholder="09:00" />
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] text-slate-500 font-medium mb-1">End</label>
                  <input value={ttForm.endTime} onChange={(e) => setTtForm({ ...ttForm, endTime: e.target.value })} className={inputCls} placeholder="09:45" />
                </div>
                <select value={ttForm.subjectId} onChange={(e) => setTtForm({ ...ttForm, subjectId: Number(e.target.value) })} className={inputCls + " bg-white"}>
                  <option value={0}>— subject —</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={async () => {
                  if (!selectedClass) return;
                  if (!ttForm.periodNumber || ttForm.periodNumber < 1) { toast("Enter a valid period number", "error"); return; }
                  try {
                    await upsertTimetableFn({ data: { ...ttForm, classId: selectedClass } });
                    setTtForm(null);
                    const d = await getTimetableFn({ data: { classId: selectedClass } });
                    setTt(d as TT[]);
                    toast("Saved", "success");
                  } catch (err: any) { toast(err?.message ?? "Save failed", "error"); }
                }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow transition cursor-pointer">Save</button>
                <button onClick={() => setTtForm(null)} className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg shadow-sm hover:shadow transition cursor-pointer">Cancel</button>
              </div>
            </div>
          )}

          <button onClick={() => setTtForm({ dayOfWeek: 1, periodNumber: 1, startTime: "", endTime: "", subjectId: 0, teacherId: 0 })} className="mb-4 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition">
            <Plus className="w-3.5 h-3.5" /> Add period
          </button>

          <div className="space-y-4">
            {DAYS.filter((_, i) => i > 0).map((d, dayIdx) => {
              const dayRows = tt.filter((t) => t.dayOfWeek === dayIdx + 1);
              return (
                <div key={d}>
                  <h3 className="text-sm font-bold text-slate-700 mb-2">{d}</h3>
                  {dayRows.length === 0 ? <p className="text-xs text-slate-400">No periods</p> : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {dayRows.sort((a,b) => a.periodNumber - b.periodNumber).map((row) => (
                        <div key={row.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-500">P{row.periodNumber}</span>
                            <div className="flex gap-1">
                              <button onClick={() => setTtForm({ id: row.id, dayOfWeek: row.dayOfWeek, periodNumber: row.periodNumber, startTime: row.startTime ?? "", endTime: row.endTime ?? "", subjectId: row.subjectId ?? 0, teacherId: row.teacherId ?? 0 })} className="p-1 text-blue-500 hover:text-blue-700"><Pencil className="w-3 h-3" /></button>
                              <button onClick={async () => { await deleteTimetableFn({ data: { id: row.id } }); setTt((p) => p.filter((x) => x.id !== row.id)); }} className="p-1 text-red-500 hover:text-red-700"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-slate-800">{row.subjectName ?? "—"}</p>
                          <p className="text-xs text-slate-400">{row.startTime} - {row.endTime}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Board & Grading */}
      {activeTab === "grading" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-base font-bold text-slate-800 mb-3">School Board</h2>
            <div className="flex items-center gap-3">
              <select value={schoolBoard} onChange={(e) => setSchoolBoardValue(e.target.value)} className={inputCls + " w-48 bg-white"}>
                <option value="preschool">Preschool (no exams/marks)</option>
                <option value="CBSE">CBSE</option>
                <option value="ICSE">ICSE</option>
              </select>
              <button onClick={async () => {
                if (!tenant) return;
                await setSchoolBoardFn({ data: { schoolId: tenant.schoolId, board: schoolBoard as any } });
                // Auto-seed default grading scales for the selected board
                if (schoolBoard !== "preschool") {
                  await seedDefaultGradingScalesFn({ data: { board: schoolBoard } });
                  const d = await listGradingScalesFn({ data: { board: schoolBoard } });
                  setGradingScalesList(d as Scale[]);
                }
                toast("Board saved" + (schoolBoard !== "preschool" ? " and default scales applied" : ""), "success");
              }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">Save board</button>
              {schoolBoard !== "preschool" && (
                <button onClick={async () => {
                  await seedDefaultGradingScalesFn({ data: { board: schoolBoard } });
                  const d = await listGradingScalesFn({ data: { board: schoolBoard } });
                  setGradingScalesList(d as Scale[]);
                  toast("Default scales seeded", "success");
                }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg">Re-seed scales</button>
              )}
            </div>
          </div>

          {schoolBoard !== "preschool" && (
          <div>
            <h2 className="text-base font-bold text-slate-800 mb-3">Grading Scale — {schoolBoard}</h2>
            {scaleForm && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <input value={scaleForm.name} onChange={(e) => setScaleForm({ ...scaleForm, name: e.target.value })} className={inputCls} placeholder="A1" />
                  <input type="number" value={scaleForm.minPercentage} onChange={(e) => setScaleForm({ ...scaleForm, minPercentage: e.target.value })} className={inputCls} placeholder="Min %" />
                  <input type="number" value={scaleForm.maxPercentage} onChange={(e) => setScaleForm({ ...scaleForm, maxPercentage: e.target.value })} className={inputCls} placeholder="Max %" />
                  <input type="number" step="0.1" value={scaleForm.gradePoint} onChange={(e) => setScaleForm({ ...scaleForm, gradePoint: e.target.value })} className={inputCls} placeholder="Grade point" />
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    if (!tenant) return;
                    await manageGradingScaleFn({ data: {
                      id: scaleForm.id,
                      board: schoolBoard,
                      name: scaleForm.name,
                      minPercentage: parseFloat(scaleForm.minPercentage),
                      maxPercentage: parseFloat(scaleForm.maxPercentage),
                      gradePoint: scaleForm.gradePoint ? parseFloat(scaleForm.gradePoint) : undefined,
                    } });
                    setScaleForm(null);
                    const d = await listGradingScalesFn({ data: { board: schoolBoard } });
                    setGradingScalesList(d as Scale[]);
                    toast("Saved", "success");
                  }} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">Save</button>
                  <button onClick={() => setScaleForm(null)} className="px-3 py-1.5 text-slate-600 text-xs font-semibold">Cancel</button>
                </div>
              </div>
            )}
            <button onClick={() => setScaleForm({ name: "", minPercentage: "", maxPercentage: "", gradePoint: "" })} className="mb-3 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg"><Plus className="w-3.5 h-3.5" /> Add scale</button>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-slate-50"><tr><th className="px-4 py-2 text-left">Grade</th><th className="px-4 py-2">Min %</th><th className="px-4 py-2">Max %</th><th className="px-4 py-2">Grade Point</th><th></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {gradingScalesList.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 font-bold text-slate-800">{s.name}</td>
                    <td className="px-4 py-2 text-center">{s.minPercentage}</td>
                    <td className="px-4 py-2 text-center">{s.maxPercentage}</td>
                    <td className="px-4 py-2 text-center">{s.gradePoint ?? "—"}</td>
                    <td className="px-4 py-2 text-right flex gap-1 justify-end">
                      <button onClick={() => setScaleForm({ id: s.id, name: s.name, minPercentage: String(s.minPercentage), maxPercentage: String(s.maxPercentage), gradePoint: s.gradePoint ? String(s.gradePoint) : "" })} className="p-1 text-blue-500 hover:text-blue-700"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => { await deleteGradingScaleFn({ data: { id: s.id } }); setGradingScalesList((p) => p.filter((x) => x.id !== s.id)); }} className="p-1 text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
            {gradingScalesList.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No grading scales for {schoolBoard}. Click "Seed default scales" or add manually.</p>}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
