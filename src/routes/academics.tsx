import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen, Clock, Plus, X, Pencil, Trash2, Save,
  AlertCircle, Loader2, CheckCircle2, GraduationCap, Award, SlidersHorizontal, ChevronDown, ChevronRight, Search,
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

  // Class subjects — per-class expanded view with inline add
  const [selectedClass, setSelectedClass] = useState<number>(0);
  const [classSubjectIds, setClassSubjectIds] = useState<number[]>([]);
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null);
  // classSubjectsMap: classId -> full subject objects assigned to that class
  type ClassSubject = { id: number; name: string; code: string | null };
  const [classSubjectsMap, setClassSubjectsMap] = useState<Record<number, ClassSubject[]>>({});
  const [addingSubjectForClass, setAddingSubjectForClass] = useState<number | null>(null);
  const [newSubjectForm, setNewSubjectForm] = useState<{ name: string; code: string }>({ name: "", code: "" });
  const [savingNewSubject, setSavingNewSubject] = useState(false);
  const [removingSubjectId, setRemovingSubjectId] = useState<number | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");

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

      {/* Subjects — tabular view with search */}
      {activeTab === "subjects" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header + search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">Subjects by Class</h2>
              <p className="text-xs text-slate-400 mt-0.5">Expand a class to manage its subjects.</p>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                placeholder="Search class or subject…"
                className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
              />
            </div>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-12 px-6 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <div className="col-span-3">Class</div>
            <div className="col-span-4">Subject</div>
            <div className="col-span-3">Code</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          {classes.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No classes found. Add classes first.</p>}

          {classes
            .filter((c) => {
              if (!subjectSearch) return true;
              const q = subjectSearch.toLowerCase();
              if (c.name.toLowerCase().includes(q)) return true;
              // also show if any assigned subject matches
              const csubs = classSubjectsMap[c.id] ?? [];
              return csubs.some((s) => s.name.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q));
            })
            .map((c) => {
              const isOpen = expandedClassId === c.id;
              const csubs = classSubjectsMap[c.id] ?? [];
              const isAddingHere = addingSubjectForClass === c.id;
              const filteredSubs = subjectSearch
                ? csubs.filter((s) => s.name.toLowerCase().includes(subjectSearch.toLowerCase()) || (s.code ?? "").toLowerCase().includes(subjectSearch.toLowerCase()))
                : csubs;

              return (
                <div key={c.id} className="border-b border-slate-100 last:border-0">
                  {/* Class header row */}
                  <button
                    className="w-full grid grid-cols-12 items-center px-6 py-3.5 hover:bg-slate-50 transition text-left"
                    onClick={async () => {
                      if (isOpen) { setExpandedClassId(null); setAddingSubjectForClass(null); return; }
                      setExpandedClassId(c.id);
                      if (!classSubjectsMap[c.id]) {
                        const d = await getClassSubjectsFn({ data: { classId: c.id } });
                        setClassSubjectsMap((prev) => ({ ...prev, [c.id]: (d as any[]).map((x) => ({ id: x.subjectId, name: x.name, code: x.code })) }));
                      }
                    }}
                  >
                    <div className="col-span-3 flex items-center gap-2">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.ageGroup}</p>
                      </div>
                    </div>
                    <div className="col-span-4 text-xs text-slate-400 italic">
                      {classSubjectsMap[c.id] !== undefined ? `${csubs.length} subject${csubs.length !== 1 ? "s" : ""}` : "Click to load"}
                    </div>
                    <div className="col-span-3" />
                    <div className="col-span-2" />
                  </button>

                  {/* Subject rows */}
                  {isOpen && (
                    <>
                      {filteredSubs.map((s) => (
                        <div key={s.id} className="grid grid-cols-12 items-center px-6 py-2.5 bg-slate-50 border-t border-slate-100">
                          <div className="col-span-3" />
                          <div className="col-span-4 text-sm text-slate-800">{s.name}</div>
                          <div className="col-span-3 text-xs text-slate-400">{s.code ?? "—"}</div>
                          <div className="col-span-2 flex justify-end">
                            <button
                              disabled={removingSubjectId === s.id}
                              onClick={async () => {
                                if (!confirm(`Remove ${s.name} from ${c.name}?`)) return;
                                setRemovingSubjectId(s.id);
                                try {
                                  const remaining = csubs.filter((x) => x.id !== s.id);
                                  await setClassSubjectsFn({ data: { classId: c.id, subjectIds: remaining.map((x) => x.id) } });
                                  setClassSubjectsMap((prev) => ({ ...prev, [c.id]: remaining }));
                                  toast(`${s.name} removed`, "success");
                                } catch { toast("Failed to remove", "error"); }
                                finally { setRemovingSubjectId(null); }
                              }}
                              className="p-1.5 text-red-400 hover:text-red-600 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Empty state */}
                      {csubs.length === 0 && !isAddingHere && (
                        <div className="grid grid-cols-12 px-6 py-2.5 bg-slate-50 border-t border-slate-100">
                          <div className="col-span-3" />
                          <div className="col-span-9 text-xs text-slate-400 italic">No subjects yet.</div>
                        </div>
                      )}

                      {/* Inline add row */}
                      {isAddingHere ? (
                        <div className="grid grid-cols-12 items-center gap-2 px-6 py-2.5 bg-blue-50 border-t border-blue-100">
                          <div className="col-span-3" />
                          <div className="col-span-4">
                            <input
                              autoFocus
                              value={newSubjectForm.name}
                              onChange={(e) => setNewSubjectForm((p) => ({ ...p, name: e.target.value }))}
                              placeholder="Subject name *"
                              className={inputCls}
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              value={newSubjectForm.code}
                              onChange={(e) => setNewSubjectForm((p) => ({ ...p, code: e.target.value }))}
                              placeholder="Code"
                              className={inputCls}
                            />
                          </div>
                          <div className="col-span-3 flex gap-2 justify-end">
                            <button
                              disabled={savingNewSubject || !newSubjectForm.name.trim()}
                              onClick={async () => {
                                setSavingNewSubject(true);
                                try {
                                  const res: any = await manageSubjectFn({ data: { name: newSubjectForm.name.trim(), code: newSubjectForm.code.trim() } });
                                  const newId = res?.id;
                                  const allSubs: any[] = await listSubjectsFn({ data: { schoolId: tenant.schoolId } }) as any[];
                                  setSubjects(allSubs);
                                  const matched = allSubs.find((s: any) => s.name === newSubjectForm.name.trim());
                                  const sid = matched?.id ?? newId;
                                  if (sid) {
                                    const updated = [...csubs, { id: sid, name: newSubjectForm.name.trim(), code: newSubjectForm.code.trim() || null }];
                                    await setClassSubjectsFn({ data: { classId: c.id, subjectIds: updated.map((x) => x.id) } });
                                    setClassSubjectsMap((prev) => ({ ...prev, [c.id]: updated }));
                                  }
                                  setNewSubjectForm({ name: "", code: "" });
                                  setAddingSubjectForClass(null);
                                  toast("Subject added", "success");
                                } catch (err: any) { toast(err?.message ?? "Failed", "error"); }
                                finally { setSavingNewSubject(false); }
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold rounded-lg"
                            >
                              {savingNewSubject ? "Adding…" : "Add"}
                            </button>
                            <button
                              onClick={() => { setAddingSubjectForClass(null); setNewSubjectForm({ name: "", code: "" }); }}
                              className="px-3 py-1.5 border border-slate-200 bg-white text-slate-500 text-xs rounded-lg hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-12 px-6 py-2.5 bg-slate-50 border-t border-slate-100">
                          <div className="col-span-3" />
                          <div className="col-span-9">
                            <button
                              onClick={(e) => { e.stopPropagation(); setAddingSubjectForClass(c.id); setNewSubjectForm({ name: "", code: "" }); }}
                              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold transition"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add subject
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
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
                try {
                  await setSchoolBoardFn({ data: { schoolId: tenant.schoolId, board: schoolBoard as any } });
                  if (schoolBoard !== "preschool") {
                    await seedDefaultGradingScalesFn({ data: { board: schoolBoard } });
                    const d = await listGradingScalesFn({ data: { board: schoolBoard } });
                    setGradingScalesList(d as Scale[]);
                    toast("Board saved and default grading scales applied", "success");
                  } else {
                    toast("Board saved successfully", "success");
                  }
                } catch (err: any) {
                  toast(err?.message ?? "Failed to save board", "error");
                }
              }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">Save board</button>
              {schoolBoard !== "preschool" && (
                <button onClick={async () => {
                  try {
                    const result = await seedDefaultGradingScalesFn({ data: { board: schoolBoard } }) as any;
                    const d = await listGradingScalesFn({ data: { board: schoolBoard } });
                    setGradingScalesList(d as Scale[]);
                    if (result?.alreadyExisted) {
                      toast(`${schoolBoard} grading scales already set up — no changes made`, "success");
                    } else {
                      toast(`${schoolBoard} default grading scales loaded`, "success");
                    }
                  } catch (err: any) {
                    toast(err?.message ?? "Failed to load grading scales", "error");
                  }
                }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg">Load default scales</button>
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
