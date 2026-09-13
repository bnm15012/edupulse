import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Upload, X, CheckCircle2, AlertCircle, FileText, Download, Loader2 } from "lucide-react";
import { importStudentsFromCSV } from "@/lib/auth";

// ── CSV column headers (case-insensitive) ─────────────────────────────────────
const HEADERS = [
  "first_name", "last_name", "date_of_birth", "gender", "blood_group",
  "class_name", "parent_name", "parent_phone", "parent_email",
  "parent_relation", "emergency_name", "emergency_phone", "allergies",
] as const;

const REQUIRED = ["first_name", "parent_name"];

type ParsedRow = {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  bloodGroup?: string;
  className?: string;
  parentName: string;
  parentPhone?: string;
  parentEmail?: string;
  parentRelation: "mother" | "father" | "guardian" | "other";
  emergencyName?: string;
  emergencyPhone?: string;
  allergies?: string;
  _errors: string[];
  _rowNum: number;
};

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, ""));
  const colIdx = (col: string) => headerLine.indexOf(col);

  const get = (row: string[], col: string) => {
    const idx = colIdx(col);
    if (idx < 0) return "";
    // Handle quoted values
    const val = row[idx] ?? "";
    return val.replace(/^"|"$/g, "").trim();
  };

  // Parse data rows
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV split (handles basic quoting)
    const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");

    const errors: string[] = [];
    const firstName = get(cols, "first_name");
    const parentName = get(cols, "parent_name");

    if (!firstName) errors.push("first_name is required");
    if (!parentName) errors.push("parent_name is required");

    const genderRaw = get(cols, "gender").toLowerCase();
    const gender = (["male", "female", "other", "prefer_not_to_say"].includes(genderRaw) ? genderRaw : undefined) as ParsedRow["gender"];

    const relationRaw = get(cols, "parent_relation").toLowerCase();
    const parentRelation = (["mother", "father", "guardian", "other"].includes(relationRaw) ? relationRaw : "guardian") as ParsedRow["parentRelation"];

    const dob = get(cols, "date_of_birth");
    if (dob && isNaN(Date.parse(dob))) errors.push(`Invalid date_of_birth: "${dob}"`);

    rows.push({
      firstName,
      lastName: get(cols, "last_name"),
      dateOfBirth: dob || undefined,
      gender,
      bloodGroup: get(cols, "blood_group") || undefined,
      className: get(cols, "class_name") || undefined,
      parentName,
      parentPhone: get(cols, "parent_phone") || undefined,
      parentEmail: get(cols, "parent_email") || undefined,
      parentRelation,
      emergencyName: get(cols, "emergency_name") || undefined,
      emergencyPhone: get(cols, "emergency_phone") || undefined,
      allergies: get(cols, "allergies") || undefined,
      _errors: errors,
      _rowNum: i,
    });
  }
  return rows;
}

const SAMPLE_CSV = `first_name,last_name,date_of_birth,gender,blood_group,class_name,parent_name,parent_phone,parent_email,parent_relation,emergency_name,emergency_phone,allergies
Aarav,Sharma,2019-03-15,male,B+,LKG A,Priya Sharma,9811111111,priya@example.com,mother,Ravi Sharma,9811111112,
Diya,Verma,2018-07-22,female,O+,UKG B,Suresh Verma,9822222221,suresh@example.com,father,,,
Kabir,Mehta,2020-01-10,male,,Nursery A,Anita Mehta,9833333331,anita@example.com,mother,,,Peanuts`;

function downloadSample() {
  const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "edupulse_students_sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type Step = "upload" | "preview" | "result";
type ImportResult = { imported: number; skipped: { row: number; name: string; reason: string }[] };

interface Props {
  schoolId: number;
  locationId: number;
  onClose: () => void;
  onImported: () => void;
}

export function CSVImportModal({ schoolId, locationId, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const importFn = useServerFn(importStudentsFromCSV);

  const validRows = rows.filter((r) => r._errors.length === 0);
  const invalidRows = rows.filter((r) => r._errors.length > 0);

  function handleFile(file: File) {
    setError("");
    if (!file.name.endsWith(".csv")) { setError("Please upload a .csv file"); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (!parsed.length) { setError("No data rows found. Check your CSV format."); return; }
      setRows(parsed);
      setStep("preview");
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    if (!validRows.length) return;
    setImporting(true);
    setError("");
    try {
      const res = await importFn({
        data: {
          schoolId,
          locationId,
          rows: validRows.map(({ _errors, _rowNum, ...r }) => r),
        },
      }) as ImportResult;
      setResult(res);
      setStep("result");
      if (res.imported > 0) onImported();
    } catch (err: any) {
      setError(err?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Import Students from CSV</h2>
              <p className="text-xs text-slate-500">
                {step === "upload" ? "Upload a CSV file with student details" :
                 step === "preview" ? `${rows.length} rows parsed — ${validRows.length} valid, ${invalidRows.length} with errors` :
                 "Import complete"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-5">
              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition"
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">Click to upload or drag & drop</p>
                <p className="text-xs text-slate-400 mt-1">CSV files only · Max 500 rows</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              {/* Column reference */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Expected CSV columns</p>
                  <button onClick={downloadSample} className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-semibold">
                    <Download className="w-3.5 h-3.5" /> Download sample
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {HEADERS.map((h) => (
                    <span key={h} className={`text-xs px-2 py-0.5 rounded-full font-mono ${REQUIRED.includes(h as any) ? "bg-indigo-100 text-indigo-700 font-bold" : "bg-slate-100 text-slate-600"}`}>
                      {h}{REQUIRED.includes(h as any) ? " *" : ""}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">* Required. All other columns are optional.</p>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ── */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Summary pills */}
              <div className="flex gap-3">
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-700">{validRows.length} will be imported</span>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-bold text-amber-700">{invalidRows.length} will be skipped</span>
                  </div>
                )}
              </div>

              {/* Error rows */}
              {invalidRows.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-amber-200">
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Rows with errors (will be skipped)</p>
                  </div>
                  <div className="divide-y divide-amber-100 max-h-36 overflow-y-auto">
                    {invalidRows.map((r) => (
                      <div key={r._rowNum} className="px-4 py-2 flex items-start gap-3">
                        <span className="text-xs text-amber-500 font-mono shrink-0">Row {r._rowNum}</span>
                        <span className="text-xs font-medium text-amber-800">{r.firstName || "(unnamed)"}</span>
                        <span className="text-xs text-amber-600 ml-auto">{r._errors.join("; ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Valid rows preview table */}
              {validRows.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Preview — {validRows.length} students</p>
                  </div>
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr className="text-left text-slate-500 font-semibold">
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">DOB</th>
                          <th className="px-3 py-2">Class</th>
                          <th className="px-3 py-2">Parent</th>
                          <th className="px-3 py-2">Phone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {validRows.map((r) => (
                          <tr key={r._rowNum} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-400 font-mono">{r._rowNum}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{r.firstName} {r.lastName}</td>
                            <td className="px-3 py-2 text-slate-500">{r.dateOfBirth ?? "—"}</td>
                            <td className="px-3 py-2 text-slate-500">{r.className ?? "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{r.parentName}</td>
                            <td className="px-3 py-2 text-slate-500">{r.parentPhone ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Result ── */}
          {step === "result" && result && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-lg font-bold text-slate-900">{result.imported} student{result.imported !== 1 ? "s" : ""} imported successfully</p>
                {result.skipped.length > 0 && (
                  <p className="text-sm text-amber-600 mt-1">{result.skipped.length} row{result.skipped.length !== 1 ? "s" : ""} skipped</p>
                )}
              </div>

              {result.skipped.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-amber-200">
                    <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Skipped rows</p>
                  </div>
                  <div className="divide-y divide-amber-100 max-h-48 overflow-y-auto">
                    {result.skipped.map((s) => (
                      <div key={s.row} className="px-4 py-2 flex items-start gap-3">
                        <span className="text-xs text-amber-500 font-mono shrink-0">Row {s.row}</span>
                        <span className="text-xs font-medium text-amber-800">{s.name}</span>
                        <span className="text-xs text-amber-600 ml-auto">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          {step === "upload" && (
            <>
              <span />
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium">Cancel</button>
            </>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => { setStep("upload"); setRows([]); setError(""); }} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium">
                ← Back
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{fileName}</span>
                <button
                  onClick={handleImport}
                  disabled={!validRows.length || importing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-bold rounded-xl transition"
                >
                  {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4" /> Import {validRows.length} students</>}
                </button>
              </div>
            </>
          )}
          {step === "result" && (
            <>
              <span />
              <button onClick={onClose} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition">
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
