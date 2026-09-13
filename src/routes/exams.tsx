import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ClipboardList, FileText, Plus, X, Pencil, Trash2, Save, Printer,
  AlertCircle, Loader2, CheckCircle2, Download, Users,
} from "lucide-react";
import {
  manageExam, listExams, deleteExam,
  upsertExamSubject, listExamSubjects, deleteExamSubject,
  getStudentsForMarks, listStudentMarks, saveStudentMarks,
  listClasses, listSubjects,
  getSchoolBoard, getExamsPageContext,
  getStudentAcademicReport, getConsolidatedClassReport, markReportCardIssued,
} from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/exams")({
  component: ExamsPage,
});

type ClassRow = { id: number; name: string; ageGroup: string };
type Subject = { id: number; name: string };
type Exam = { id: number; classId: number; academicYear: string; term: string; examType: string; startDate: string | null; endDate: string | null; status: string };
type ExamSubject = { id: number; subjectId: number; name: string; maxMarks: string; examDate: string | null };
type Student = { id: number; firstName: string; lastName: string };

const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

// ─── Consolidated report card — one student, all exams for the year ──────────
function ConsolidatedReportCard({ report, onClose }: { report: any; onClose?: () => void }) {
  if (!report) return null;

  const handlePrint = () => window.print();

  const handleDownload = () => {
    // Open print dialog with destination hint for PDF save
    const style = document.createElement("style");
    style.id = "__rc_dl_hint";
    style.textContent = `@page { size: A4; margin: 15mm; }`;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.getElementById("__rc_dl_hint")?.remove(), 1000);
  };

  const addressLine = [report.schoolAddress, report.schoolCity, report.schoolState].filter(Boolean).join(", ");

  return (
    <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden print:border-0 print:rounded-none print:shadow-none">

      {/* ── School letterhead ── */}
      <div className="flex items-center gap-5 px-8 pt-8 pb-5 border-b border-slate-200 print:pb-4">
        {report.schoolLogoUrl && (
          <img src={report.schoolLogoUrl} alt="School logo" className="h-16 w-16 object-contain rounded-xl border border-slate-100 bg-white p-1 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-extrabold text-slate-900 leading-tight">{report.schoolName}</h1>
          {addressLine && <p className="text-xs text-slate-500 mt-0.5">{addressLine}</p>}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {report.schoolPhone && <span className="text-xs text-slate-400">{report.schoolPhone}</span>}
            {report.schoolEmail && <span className="text-xs text-slate-400">{report.schoolEmail}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Academic Report Card</p>
          <span className="inline-block mt-1 px-2.5 py-0.5 text-xs font-bold uppercase rounded-full bg-blue-100 text-blue-700">{report.board}</span>
          <p className="text-xs text-slate-500 mt-1">{report.academicYear}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-2 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 print:hidden self-start"><X className="w-4 h-4" /></button>
        )}
      </div>

      {/* ── Student info ── */}
      <div className="mx-8 mt-5 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><p className="text-xs text-slate-400">Student</p><p className="font-bold text-slate-800">{report.student.firstName} {report.student.lastName}</p></div>
        <div><p className="text-xs text-slate-400">Class</p><p className="font-semibold text-slate-700">{report.className}</p></div>
        <div><p className="text-xs text-slate-400">Academic Year</p><p className="font-semibold text-slate-700">{report.academicYear}</p></div>
        <div><p className="text-xs text-slate-400">Board</p><p className="font-semibold text-slate-700">{report.board?.toUpperCase()}</p></div>
      </div>

      {/* ── One section per exam ── */}
      <div className="px-8 space-y-5 pb-4">
        {report.exams.map((exam: any) => (
          <div key={exam.examId} className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-800">{exam.term}</p>
                <p className="text-xs text-slate-400 capitalize">{exam.examType}{exam.startDate ? ` · ${fmtDate(exam.startDate)}` : ""}</p>
              </div>
              {exam.hasMarks ? (
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-700">{exam.termPercentage}%</p>
                  <p className="text-xs text-slate-500">Grade: <span className="font-bold">{exam.termGrade ?? "—"}</span>{exam.termGradePoint ? ` · ${exam.termGradePoint} GP` : ""}</p>
                </div>
              ) : (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Results awaited</span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Subject</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">Max</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">Scored</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">%</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">Grade</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">GP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {exam.subjects.map((s: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-2 font-medium text-slate-700">{s.subjectName}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{s.maxMarks}</td>
                    <td className="px-3 py-2 text-center font-semibold text-slate-800">{s.marks ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{s.percentage ? `${s.percentage}%` : "—"}</td>
                    <td className="px-3 py-2 text-center font-bold text-blue-700">{s.grade ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{s.gradePoint ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* ── Overall summary ── */}
      {report.overallPercentage && (
        <div className="mx-8 mb-6 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-6 py-4">
          <div>
            <p className="text-sm font-bold text-blue-800">Overall Result — {report.academicYear}</p>
            <p className="text-xs text-blue-600">{report.className} · {report.board}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-blue-700">{report.overallPercentage}%</p>
            <p className="text-xs text-blue-600 font-semibold">Grade: {report.overallGrade ?? "—"}{report.overallGradePoint ? ` (${report.overallGradePoint} GP)` : ""}</p>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="px-8 pb-8 flex items-center gap-3 print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition"
        >
          <Download className="w-4 h-4" /> Download PDF
        </button>
      </div>
    </div>
  );
}

function ExamsPage() {
  const { tenant } = useTenant();
  const toast = useToast();

  // Context: role-aware
  const [isAdmin, setIsAdmin] = useState(true);
  const [assignedClassIds, setAssignedClassIds] = useState<number[]>([]);
  const [contextLoaded, setContextLoaded] = useState(false);

  // Default tab for all users; context load adjusts to "marks" for teachers
  const [activeTab, setActiveTab] = useState<"exams" | "marks" | "reportcard">("exams");

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedClass, setSelectedClass] = useState<number>(0);

  const listClassesFn         = useServerFn(listClasses);
  const listSubjectsFn        = useServerFn(listSubjects);
  const manageExamFn          = useServerFn(manageExam);
  const listExamsFn           = useServerFn(listExams);
  const deleteExamFn          = useServerFn(deleteExam);
  const upsertExamSubjectFn   = useServerFn(upsertExamSubject);
  const listExamSubjectsFn    = useServerFn(listExamSubjects);
  const deleteExamSubjectFn   = useServerFn(deleteExamSubject);
  const getStudentsFn         = useServerFn(getStudentsForMarks);
  const listStudentMarksFn    = useServerFn(listStudentMarks);
  const saveStudentMarksFn    = useServerFn(saveStudentMarks);
  const getStudentReportFn    = useServerFn(getStudentAcademicReport);
  const getClassReportFn      = useServerFn(getConsolidatedClassReport);
  const markReportIssuedFn    = useServerFn(markReportCardIssued);
  const getSchoolBoardFn      = useServerFn(getSchoolBoard);
  const getContextFn          = useServerFn(getExamsPageContext);

  const [schoolBoard, setSchoolBoard] = useState<string>("generic");

  // Exams tab
  const [examForm, setExamForm] = useState<{ id?: number; classId: number; academicYear: string; term: string; examType: string; startDate: string; endDate: string; status: string } | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [esForm, setEsForm] = useState<{ subjectId: number; maxMarks: string; examDate: string } | null>(null);

  // Marks tab
  const [students, setStudents] = useState<Student[]>([]);
  const [marksData, setMarksData] = useState<Record<number, Record<number, { marks: string; grade: string }>>>({});

  // Report card tab
  const [rcClass, setRcClass]   = useState<number>(0);
  const [rcYear, setRcYear]     = useState("");
  const [rcStudent, setRcStudent] = useState<number | "">("");
  const [rcStudents, setRcStudents] = useState<Student[]>([]);
  // Consolidated report for single student
  const [singleReport, setSingleReport] = useState<any>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  // Consolidated class report (all students)
  const [classReport, setClassReport] = useState<any[] | null>(null);
  const [classReportLoading, setClassReportLoading] = useState(false);
  const [classReportView, setClassReportView] = useState<"list" | "single">("list");
  const [classReportSelected, setClassReportSelected] = useState<any>(null);

  // Load context + data
  useEffect(() => {
    if (!tenant) return;
    getContextFn().then((ctx: any) => {
      setIsAdmin(ctx.isAdmin);
      setAssignedClassIds(ctx.assignedClassIds ?? []);
      // Always start on Exams tab — all roles see same UI
      setContextLoaded(true);
    }).catch(() => setContextLoaded(true));

    listClassesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } }).then((d) => setClasses(d as ClassRow[]));
    listSubjectsFn({ data: { schoolId: tenant.schoolId } }).then((d) => setSubjects(d as Subject[]));
    loadExams();
    getSchoolBoardFn({ data: { schoolId: tenant.schoolId } }).then((d: any) => setSchoolBoard(d));
  }, [tenant]);

  useEffect(() => {
    if (selectedClass) {
      getStudentsFn({ data: { classId: selectedClass } }).then((d) => setStudents(d as Student[]));
    }
  }, [selectedClass]);

  // Load students for Report Cards class picker (separate from marks tab)
  useEffect(() => {
    if (rcClass) {
      getStudentsFn({ data: { classId: rcClass } }).then((d) => { setRcStudents(d as Student[]); setRcStudent(""); setSingleReport(null); });
    } else {
      setRcStudents([]); setRcStudent("");
    }
  }, [rcClass]);

  useEffect(() => {
    // Always load exam subjects whenever an exam is selected (needed by both exams and marks tabs)
    if (selectedExam) {
      listExamSubjectsFn({ data: { examId: selectedExam.id } }).then((d) => setExamSubjects(d as ExamSubject[]));
    } else {
      setExamSubjects([]);
    }
    if (activeTab === "marks" && selectedExam && selectedClass) {
      getStudentsFn({ data: { classId: selectedClass } }).then((d) => setStudents(d as Student[]));
      listStudentMarksFn({ data: { classId: selectedClass, examId: selectedExam.id } }).then((d: any) => {
        const m: Record<number, Record<number, { marks: string; grade: string }>> = {};
        for (const row of d) {
          if (!m[row.studentId]) m[row.studentId] = {};
          m[row.studentId][row.examSubjectId] = { marks: row.marks ?? "", grade: row.grade ?? "" };
        }
        setMarksData(m);
      });
    }
  }, [activeTab, selectedExam, selectedClass]);

  const loadExams = () => {
    if (!tenant) return;
    listExamsFn({ data: {} }).then((d) => setExams(d as Exam[]));
  };

  if (!tenant || !contextLoaded) return <p className="text-sm text-slate-500">Loading…</p>;

  if (schoolBoard === "preschool") {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Exams & marks not used in preschool mode</h2>
        <p className="text-sm text-slate-500">This school is configured as a preschool. Grades, exams and report-card marks are not applicable.</p>
        <p className="text-sm text-slate-500 mt-2">If this is a primary/secondary school, go to <strong>Academics → Board & Grading</strong> and change the board.</p>
      </div>
    );
  }

  // Classes visible to this user (all for admin, assigned for teacher)
  const visibleClasses = isAdmin
    ? classes
    : classes.filter((c) => assignedClassIds.includes(c.id));

  // All tabs visible to everyone — role only controls action buttons
  const tabs = [
    { key: "exams" as const,      label: "Exams",        icon: ClipboardList },
    { key: "marks" as const,      label: "Marks Entry",  icon: FileText },
    { key: "reportcard" as const, label: "Report Cards", icon: FileText },
  ];

  return (
    <div className="w-full max-w-none space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Exams & Marks</h1>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-slate-200">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition ${activeTab === key ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-500 hover:text-slate-700"}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── EXAMS TAB ───────────────────────────────────────────────────────── */}
      {activeTab === "exams" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-800">Exams</h2>
              {isAdmin && (
                <button onClick={() => setExamForm({ classId: selectedClass || 0, academicYear: "", term: "", examType: "", startDate: "", endDate: "", status: "active" })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">
                  <Plus className="w-3.5 h-3.5" /> Add exam
                </button>
              )}
            </div>

            {examForm && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Class</label>
                    <select value={examForm.classId} onChange={(e) => setExamForm({ ...examForm, classId: Number(e.target.value) })} className={inputCls + " bg-white w-full"}>
                      <option value={0}>— select class —</option>
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Academic Year</label>
                    <input value={examForm.academicYear} onChange={(e) => setExamForm({ ...examForm, academicYear: e.target.value })} className={inputCls + " w-full"} placeholder="2025-26" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Term</label>
                    <input value={examForm.term} onChange={(e) => setExamForm({ ...examForm, term: e.target.value })} className={inputCls + " w-full"} placeholder="Term 1" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Exam Type</label>
                    <select value={examForm.examType} onChange={(e) => setExamForm({ ...examForm, examType: e.target.value })} className={inputCls + " bg-white w-full"}>
                      <option value="">— select —</option>
                      <option value="unit">Unit Test</option>
                      <option value="term">Term Exam</option>
                      <option value="final">Final Exam</option>
                      <option value="assignment">Assignment</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">Start Date</label>
                    <input type="date" value={examForm.startDate} onChange={(e) => setExamForm({ ...examForm, startDate: e.target.value })} className={inputCls + " w-full"} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">End Date</label>
                    <input type="date" value={examForm.endDate} onChange={(e) => setExamForm({ ...examForm, endDate: e.target.value })} className={inputCls + " w-full"} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    if (!examForm) return;
                    if (!examForm.classId) { toast("Please select a class", "error"); return; }
                    if (!examForm.academicYear.trim()) { toast("Academic year is required", "error"); return; }
                    if (!examForm.term.trim()) { toast("Term is required", "error"); return; }
                    const payload: any = { ...examForm, academicYear: examForm.academicYear.trim(), term: examForm.term.trim(), examType: examForm.examType || "other", status: examForm.status, classId: examForm.classId };
                    if (!payload.startDate) delete payload.startDate;
                    if (!payload.endDate) delete payload.endDate;
                    if (!payload.id) delete payload.id;
                    try {
                      await manageExamFn({ data: payload });
                      setExamForm(null); loadExams(); toast("Exam saved", "success");
                    } catch (err: any) { toast(err?.message ?? "Failed to save exam", "error"); }
                  }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition">Save</button>
                  <button onClick={() => setExamForm(null)} className="px-3 py-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 text-xs font-semibold rounded-lg transition">Cancel</button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {exams.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No exams created yet.</p>
              ) : (
                exams.map((e, i) => (
                  <div key={e.id} onClick={() => { if (selectedExam?.id === e.id) { setSelectedExam(null); setExamSubjects([]); } else { setSelectedExam(e); } }}
                    className={`p-3 rounded-xl border cursor-pointer transition ${selectedExam?.id === e.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-400 w-5">{i + 1}</span>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{e.term} · {e.academicYear} · {classes.find((c) => c.id === e.classId)?.name ?? "Class " + e.classId}</p>
                          <p className="text-xs text-slate-500"><span className="capitalize">{e.examType}</span>{e.startDate || e.endDate ? ` · ${e.startDate || "—"} to ${e.endDate || "—"}` : null}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{e.status}</span>
                        {isAdmin && <>
                          <button onClick={(ev) => { ev.stopPropagation(); setExamForm({ id: e.id, classId: e.classId, academicYear: e.academicYear, term: e.term, examType: e.examType || "", startDate: e.startDate || "", endDate: e.endDate || "", status: e.status }); }} className="p-1.5 text-blue-500 hover:text-blue-700"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={async (ev) => { ev.stopPropagation(); await deleteExamFn({ data: { id: e.id } }); loadExams(); }} className="p-1.5 text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {selectedExam && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-4">{selectedExam.term} · Subjects & Schedule</h3>
              {(() => {
                const scheduled = examSubjects.filter((es) => es.examDate).sort((a, b) => (a.examDate as string).localeCompare(b.examDate as string));
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Subjects</h4>
                        {isAdmin && !esForm && <button onClick={() => setEsForm({ subjectId: 0, maxMarks: "100", examDate: "" })} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition"><Plus className="w-3.5 h-3.5" /> Add subject</button>}
                      </div>
                      {esForm && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <select value={esForm.subjectId} onChange={(e) => setEsForm({ ...esForm, subjectId: Number(e.target.value) })} className={inputCls + " bg-white"}>
                              <option value={0}>— subject —</option>
                              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <input type="number" value={esForm.maxMarks} onChange={(e) => setEsForm({ ...esForm, maxMarks: e.target.value })} className={inputCls} placeholder="Max marks" />
                            <input type="date" value={esForm.examDate} onChange={(e) => setEsForm({ ...esForm, examDate: e.target.value })} className={inputCls} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={async () => {
                              if (!esForm.subjectId) { toast("Please select a subject", "error"); return; }
                              if (!esForm.maxMarks || Number(esForm.maxMarks) <= 0) { toast("Max marks must be greater than 0", "error"); return; }
                              const payload: any = { examId: selectedExam.id, subjectId: esForm.subjectId, maxMarks: String(esForm.maxMarks) };
                              if (esForm.examDate) {
                                if (selectedExam.startDate && esForm.examDate < selectedExam.startDate) { toast(`Exam date must be on or after ${selectedExam.startDate}`, "error"); return; }
                                if (selectedExam.endDate && esForm.examDate > selectedExam.endDate) { toast(`Exam date must be on or before ${selectedExam.endDate}`, "error"); return; }
                                payload.examDate = esForm.examDate;
                              }
                              try {
                                await upsertExamSubjectFn({ data: payload });
                                setEsForm(null);
                                const d = await listExamSubjectsFn({ data: { examId: selectedExam.id } });
                                setExamSubjects(d as ExamSubject[]);
                                toast("Subject saved", "success");
                              } catch (err: any) { toast(err?.message ?? "Failed to save subject", "error"); }
                            }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition">Save</button>
                            <button onClick={() => setEsForm(null)} className="px-3 py-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 text-xs font-semibold rounded-lg transition">Cancel</button>
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        {examSubjects.map((es, i) => (
                          <div key={es.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                            <span className="text-xs font-semibold text-slate-400 w-5">{i + 1}</span>
                            <div>
                              <p className="text-sm text-slate-800">{es.name}</p>
                              <p className="text-xs text-slate-500">{es.examDate ? fmtDate(es.examDate) : "No date set"}</p>
                            </div>
                            <span className="text-xs text-slate-600">Max {es.maxMarks}</span>
                            {isAdmin && <button onClick={async () => { await deleteExamSubjectFn({ data: { id: es.id } }); setExamSubjects((p) => p.filter((x) => x.id !== es.id)); }} className="p-1.5 text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-3">Schedule</h4>
                      {scheduled.length === 0 ? (
                        <p className="text-xs text-slate-400">No subject dates set yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {scheduled.map((es, i) => (
                            <div key={es.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-400 w-5">{i + 1}</span>
                                <span className="w-24 text-sm font-semibold text-blue-700">{fmtDate(es.examDate)}</span>
                                <span className="text-sm text-slate-800">{es.name}</span>
                              </div>
                              <span className="text-xs text-slate-500">Max {es.maxMarks}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── MARKS ENTRY TAB ─────────────────────────────────────────────────── */}
      {activeTab === "marks" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm overflow-x-auto">

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <select value={selectedClass} onChange={(e) => { setSelectedClass(Number(e.target.value)); setMarksData({}); setSelectedExam(null); }} className={inputCls + " w-48 bg-white"}>
              <option value={0}>— class —</option>
              {visibleClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={selectedExam?.id ?? 0} onChange={(e) => { const ex = exams.find((x) => x.id === Number(e.target.value)); setSelectedExam(ex ?? null); }} className={inputCls + " w-48 bg-white"}>
              <option value={0}>— exam —</option>
              {exams.filter((e) => e.classId === selectedClass).map((e) => <option key={e.id} value={e.id}>{e.term} {e.academicYear}</option>)}
            </select>
          </div>

          {(() => {
            if (!selectedClass) return <p className="text-sm text-slate-400">Select a class and exam to start entering marks.</p>;
            const className = visibleClasses.find((c) => c.id === selectedClass)?.name ?? "this class";
            const classExams = exams.filter((e) => e.classId === selectedClass);
            if (classExams.length === 0) return (
              <p className="text-sm text-slate-500">
                No exams found for <strong className="text-slate-700">{className}</strong>.
                {isAdmin ? " Create an exam in the Exams tab first." : " Ask your admin to create an exam for this class."}
              </p>
            );
            if (!selectedExam) return <p className="text-sm text-slate-400">Select an exam for <strong className="text-slate-700">{className}</strong> to enter marks.</p>;
            if (students.length === 0) return <p className="text-sm text-slate-500">No students found in <strong className="text-slate-700">{className}</strong>.</p>;
            if (examSubjects.length === 0) return <p className="text-sm text-slate-500">No subjects added to this exam yet. {isAdmin ? "Go to the Exams tab to add subjects." : "Ask your admin to add subjects to this exam."}</p>;
            return (
              <table className="w-full text-sm border border-slate-200 rounded-2xl overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-xs font-bold text-slate-600 text-center w-14">S.No.</th>
                    <th className="text-left px-4 py-2 text-xs font-bold text-slate-600">Student</th>
                    {examSubjects.map((es) => <th key={es.id} className="px-4 py-2 text-xs font-bold text-slate-600 text-center">{es.name}<br /><span className="font-normal text-slate-400">/{es.maxMarks}</span></th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s, i) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-2 text-center text-slate-500 text-xs font-semibold">{i + 1}</td>
                      <td className="px-4 py-2 font-medium text-slate-800">{s.firstName} {s.lastName}</td>
                      {examSubjects.map((es) => {
                        const val = marksData[s.id]?.[es.id]?.marks ?? "";
                        return (
                          <td key={es.id} className="px-2 py-2">
                            <input
                              value={val}
                              onChange={(e) => {
                                const v = e.target.value;
                                setMarksData((prev) => ({
                                  ...prev,
                                  [s.id]: { ...(prev[s.id] ?? {}), [es.id]: { ...prev[s.id]?.[es.id], marks: v } },
                                }));
                              }}
                              className="w-20 mx-auto block text-center px-2 py-1 rounded-lg border border-slate-200 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                              placeholder="—"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}

          {selectedExam && selectedClass && students.length > 0 && examSubjects.length > 0 && (
            <button onClick={async () => {
              const payload = [];
              for (const [studentId, subs] of Object.entries(marksData)) {
                for (const [examSubjectId, v] of Object.entries(subs)) {
                  if (v.marks !== "") {
                    payload.push({ studentId: Number(studentId), examSubjectId: Number(examSubjectId), marks: v.marks, grade: v.grade });
                  }
                }
              }
              if (!payload.length) { toast("No marks to save", "error"); return; }
              try {
                await saveStudentMarksFn({ data: { marks: payload } });
                toast("Marks saved successfully", "success");
              } catch (err: any) {
                toast(err?.message ?? "Failed to save marks", "error");
              }
            }} className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition">
              <Save className="w-4 h-4" /> Save all marks
            </button>
          )}
        </div>
      )}

      {/* ── REPORT CARDS TAB ────────────────────────────────────────────────── */}
      {activeTab === "reportcard" && (
        <div className="space-y-6">

          {/* ── Full class consolidated report ────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-800">Full Class Report Cards</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Generates one consolidated report card per student — all exams/terms in the selected academic year as sections.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <select value={rcClass} onChange={(e) => { setRcClass(Number(e.target.value)); setClassReport(null); setClassReportView("list"); }}
                className={inputCls + " bg-white"}>
                <option value={0}>— class —</option>
                {visibleClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input value={rcYear} onChange={(e) => setRcYear(e.target.value)} className={inputCls} placeholder="Academic year e.g. 2025-26" />
              {isAdmin ? (
                <button
                  disabled={!rcClass || !rcYear || classReportLoading}
                  onClick={async () => {
                    setClassReportLoading(true); setClassReport(null); setClassReportView("list");
                    try {
                      const d = await getClassReportFn({ data: { classId: rcClass, academicYear: rcYear } }) as any;
                      const list = d.students ?? [];
                      setClassReport(list);
                      if (!list.length) toast("No enrolled students found in this class", "error");
                      else {
                        toast(`${list.length} report cards generated`, "success");
                        // Mark each student's report card as issued so parents can see it
                        list.forEach((s: any) => markReportIssuedFn({ data: { studentId: s.id, classId: rcClass, academicYear: rcYear } }).catch(() => {}));
                      }
                    } catch (err: any) {
                      toast(err?.message ?? "Failed to generate report cards", "error");
                    } finally { setClassReportLoading(false); }
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition"
                >
                  {classReportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {classReportLoading ? "Generating…" : "Generate all"}
                </button>
              ) : (
                <p className="text-xs text-slate-400 self-center">Generation is done by the admin.</p>
              )}
            </div>

            {/* Class report — student list */}
            {classReport && classReport.length > 0 && classReportView === "list" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-700">
                    {classReport.length} students · <strong>{classes.find(c => c.id === rcClass)?.name}</strong> · {rcYear}
                  </p>
                  <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 print:hidden">
                    <Printer className="w-3.5 h-3.5" /> Print all
                  </button>
                </div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {classReport.map((rc: any, i: number) => {
                    const hasAnyMarks = rc.exams?.some((e: any) => e.hasMarks);
                    return (
                      <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400 w-6 shrink-0">{i + 1}</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{rc.student?.firstName} {rc.student?.lastName}</p>
                            {hasAnyMarks ? (
                              <p className="text-xs text-slate-500">
                                Overall: <span className="font-bold text-blue-700">{rc.overallPercentage ?? "—"}%</span>
                                {rc.overallGrade ? <span> · Grade <span className="font-bold">{rc.overallGrade}</span></span> : null}
                                <span className="text-slate-400"> · {rc.exams?.filter((e: any) => e.hasMarks).length}/{rc.exams?.length} exams completed</span>
                              </p>
                            ) : (
                              <p className="text-xs text-amber-600">No marks entered yet</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => { setClassReportSelected(rc); setClassReportView("single"); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" /> View
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Single student consolidated view */}
            {classReportView === "single" && classReportSelected && (
              <div className="mt-4">
                <button onClick={() => setClassReportView("list")} className="mb-4 text-xs text-blue-600 hover:underline flex items-center gap-1 print:hidden">
                  ← Back to class list
                </button>
                <ConsolidatedReportCard report={classReportSelected} onClose={() => setClassReportView("list")} />
              </div>
            )}
          </div>

          {/* ── Single student report ──────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-800 mb-1">Single Student Report Card</h2>
            <p className="text-xs text-slate-400 mb-4">Full consolidated report for one student — all exams in the selected year.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <select value={rcClass} onChange={(e) => setRcClass(Number(e.target.value))}
                className={inputCls + " bg-white"}>
                <option value={0}>— class —</option>
                {visibleClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={rcStudent} onChange={(e) => setRcStudent(e.target.value ? Number(e.target.value) : "")} className={inputCls + " bg-white"}
                disabled={!rcClass || rcStudents.length === 0}>
                <option value="">{!rcClass ? "— select class first —" : rcStudents.length === 0 ? "Loading…" : "— student —"}</option>
                {rcStudents.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
              </select>
              <input value={rcYear} onChange={(e) => setRcYear(e.target.value)} className={inputCls} placeholder="Academic year e.g. 2025-26" />
            </div>
            <button
              disabled={!rcClass || !rcStudent || !rcYear || singleLoading}
              onClick={async () => {
                if (!rcClass || !rcStudent || !rcYear) return;
                setSingleLoading(true); setSingleReport(null);
                try {
                  const d = await getStudentReportFn({ data: { studentId: Number(rcStudent), classId: rcClass, academicYear: rcYear } });
                  setSingleReport(d);
                  // Admin: mark as issued so parent can see it was generated
                  if (isAdmin) markReportIssuedFn({ data: { studentId: Number(rcStudent), classId: rcClass, academicYear: rcYear } }).catch(() => {});
                } catch (err: any) { toast(err?.message ?? "Failed to load", "error"); }
                finally { setSingleLoading(false); }
              }}
              className="mb-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition"
            >
              {singleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {singleLoading ? "Loading…" : "View Report Card"}
            </button>
            {singleReport && <ConsolidatedReportCard report={singleReport} onClose={() => setSingleReport(null)} />}
          </div>
        </div>
      )}
    </div>
  );
}
