import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, Wallet, Search, Save, X } from "lucide-react";
import { manageExpense, listExpenses, deleteExpense, listStaff, getSession } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { useToast } from "@/lib/toast";
import { usePagination } from "@/lib/usePagination";
import { Pagination } from "@/components/pagination";
import { todayIST } from "@/lib/utils";

export const Route = createFileRoute("/expenses")({
  component: ExpensesPage,
});

type Expense = { id: number; category: string; description: string | null; amount: string; expenseDate: string | null };
type StaffOption = { id: number; firstName: string; lastName: string; salary: string | null };

const CATEGORIES = ["salary", "electricity", "rent", "supplies", "transport", "maintenance", "other"];
const PAGE_SIZE = 12;
const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function ExpensesPage() {
  const { tenant } = useTenant();
  const toast = useToast();
  const manageExpenseFn = useServerFn(manageExpense);
  const listExpensesFn = useServerFn(listExpenses);
  const deleteExpenseFn = useServerFn(deleteExpense);
  const listStaffFn = useServerFn(listStaff);
  const sessionFn = useServerFn(getSession);

  const [isAdmin, setIsAdmin] = useState(true);

  const today = todayIST();
  const [year, month] = today.split("-").map(Number);
  const firstOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [form, setForm] = useState<{ id?: number; category: string; description: string; amount: string; expenseDate: string; staffId?: number } | null>(null);

  const filteredExpenses = useMemo(() => {
    const q = search.toLowerCase();
    return expenses.filter((e) =>
      (e.category ?? "").toLowerCase().includes(q)
      || (e.description ?? "").toLowerCase().includes(q)
      || (e.amount ?? "").includes(q)
      || (e.expenseDate ?? "").includes(q)
    );
  }, [expenses, search]);

  const { pageItems, currentPage, setCurrentPage, totalPages } = usePagination(filteredExpenses, PAGE_SIZE);

  const load = async () => {
    if (!tenant) return;
    const e = await listExpensesFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId, from, to } }) as Expense[];
    setExpenses(e);
  };

  useEffect(() => {
    if (!tenant) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  useEffect(() => { sessionFn().then((u: any) => u && setIsAdmin(["super_admin","school_admin","location_admin"].includes(u.role))); }, []);

  useEffect(() => {
    if (!tenant) return;
    listStaffFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId } })
      .then((rows: any[]) => setStaffList(rows.map((r) => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, salary: r.salary ? String(r.salary) : null }))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  if (!tenant) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
        {isAdmin && <button onClick={() => setForm({ category: CATEGORIES[0], description: "", amount: "", expenseDate: today, staffId: undefined })} className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"><Plus className="w-4 h-4" /> Add Expense</button>}
      </div>

      {/* Date filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="w-full sm:w-40">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls + " bg-white h-10 w-full"} />
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls + " bg-white h-10 w-full"} />
          </div>
        </div>
        <button onClick={load} className="w-full sm:w-auto sm:mt-auto h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl"><Wallet className="w-4 h-4 inline-block mr-1.5" /> View</button>
      </div>

      {/* Expenses list */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputCls + " bg-white pl-9 h-10 w-full sm:max-w-sm"} placeholder="Search by category, description, amount, date" />
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="text-left px-4 py-2.5 font-semibold text-slate-700 w-16">S.No</th><th className="text-left px-4 py-2.5 font-semibold text-slate-700">Category</th><th className="text-left px-4 py-2.5 font-semibold text-slate-700">Description</th><th className="text-left px-4 py-2.5 font-semibold text-slate-700">Date</th><th className="px-4 py-2.5 text-right font-semibold text-slate-700">Amount</th><th className="px-4 py-2.5 text-right font-semibold text-slate-700">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {/* New expense row — only shown when adding (no id) */}
              {form && !form.id && (
                <tr className="bg-blue-50 border-b border-blue-100">
                  <td className="px-4 py-2.5 text-slate-400 w-16 text-center font-semibold">New</td>
                  <td className="px-4 py-2.5"><select value={form.category} onChange={(e) => {
                    const newCategory = e.target.value;
                    const leavingSalary = form.category === "salary" && newCategory !== "salary";
                    const enteringSalary = newCategory === "salary";
                    setForm({ ...form, category: newCategory, staffId: undefined, description: (leavingSalary || enteringSalary) ? "" : form.description });
                  }} className={inputCls + " bg-white w-full"}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select></td>
                  <td className="px-4 py-2.5">
                    {form.category === "salary" ? (
                      <select value={form.staffId ?? ""} onChange={(e) => {
                        const staffId = Number(e.target.value);
                        const staff = staffList.find((s) => s.id === staffId);
                        if (staff) setForm({ ...form, staffId, description: `${staff.firstName} ${staff.lastName}`.trim(), amount: staff.salary || "" });
                        else setForm({ ...form, staffId: undefined, description: "", amount: "" });
                      }} className={inputCls + " bg-white w-full"}>
                        <option value="">Select staff</option>
                        {staffList.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                      </select>
                    ) : (
                      <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls + " w-full"} placeholder="Description" />
                    )}
                  </td>
                  <td className="px-4 py-2.5"><input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className={inputCls + " bg-white w-full"} /></td>
                  <td className="px-4 py-2.5"><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls + " w-full"} placeholder="Amount" /></td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setForm(null)} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 text-xs font-semibold transition hover:bg-red-100"><X className="w-3.5 h-3.5" /> Cancel</button>
                      <button onClick={async () => {
                        await manageExpenseFn({ data: { schoolId: tenant.schoolId, locationId: tenant.locationId, category: form.category as any, amount: form.amount, description: form.description, expenseDate: form.expenseDate } });
                        setForm(null); await load(); toast("Expense added", "success");
                      }} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition"><Save className="w-3.5 h-3.5" /> Save</button>
                    </div>
                  </td>
                </tr>
              )}
              {pageItems.map((e, i) => (
                form && form.id === e.id ? (
                  /* Inline edit row — replaces the existing row */
                  <tr key={e.id} className="bg-amber-50 border-b border-amber-100">
                    <td className="px-4 py-2.5 text-slate-400 w-16 text-center font-semibold">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-2.5"><select value={form.category} onChange={(ev) => {
                      const newCategory = ev.target.value;
                      const leavingSalary = form.category === "salary" && newCategory !== "salary";
                      const enteringSalary = newCategory === "salary";
                      setForm({ ...form, category: newCategory, staffId: undefined, description: (leavingSalary || enteringSalary) ? "" : form.description });
                    }} className={inputCls + " bg-white w-full"}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select></td>
                    <td className="px-4 py-2.5">
                      {form.category === "salary" ? (
                        <select value={form.staffId ?? ""} onChange={(ev) => {
                          const staffId = Number(ev.target.value);
                          const staff = staffList.find((s) => s.id === staffId);
                          if (staff) setForm({ ...form, staffId, description: `${staff.firstName} ${staff.lastName}`.trim(), amount: staff.salary || "" });
                          else setForm({ ...form, staffId: undefined, description: "", amount: "" });
                        }} className={inputCls + " bg-white w-full"}>
                          <option value="">Select staff</option>
                          {staffList.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                        </select>
                      ) : (
                        <input value={form.description} onChange={(ev) => setForm({ ...form, description: ev.target.value })} className={inputCls + " w-full"} placeholder="Description" />
                      )}
                    </td>
                    <td className="px-4 py-2.5"><input type="date" value={form.expenseDate} onChange={(ev) => setForm({ ...form, expenseDate: ev.target.value })} className={inputCls + " bg-white w-full"} /></td>
                    <td className="px-4 py-2.5"><input type="number" value={form.amount} onChange={(ev) => setForm({ ...form, amount: ev.target.value })} className={inputCls + " w-full"} placeholder="Amount" /></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setForm(null)} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 text-xs font-semibold transition hover:bg-red-100"><X className="w-3.5 h-3.5" /> Cancel</button>
                        <button onClick={async () => {
                          await manageExpenseFn({ data: { id: form.id, schoolId: tenant.schoolId, locationId: tenant.locationId, category: form.category as any, amount: form.amount, description: form.description, expenseDate: form.expenseDate } });
                          setForm(null); await load(); toast("Expense updated", "success");
                        }} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition"><Save className="w-3.5 h-3.5" /> Save</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={e.id} className="hover:bg-slate-50 even:bg-white">
                    <td className="px-4 py-2.5 text-slate-500 w-16">{(currentPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-2.5 capitalize">{e.category}</td>
                    <td className="px-4 py-2.5 text-slate-500">{e.description || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500">{e.expenseDate ? new Date(e.expenseDate).toLocaleDateString("en-IN") : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800">{money(parseFloat(e.amount))}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isAdmin && <>
                        <button onClick={() => setForm({ id: e.id, category: e.category, description: e.description ?? "", amount: String(e.amount), expenseDate: e.expenseDate ? new Date(e.expenseDate).toISOString().slice(0, 10) : today, staffId: undefined })} className="p-1.5 text-blue-500 hover:text-blue-700"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={async () => { await deleteExpenseFn({ data: { id: e.id, schoolId: tenant.schoolId, locationId: tenant.locationId } }); await load(); }} className="p-1.5 text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>}
                    </td>
                  </tr>
                )
              ))}
              {pageItems.length === 0 && !form && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{search ? "No matching expenses" : "No expenses found"}</td></tr>}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredExpenses.length}
          pageSize={PAGE_SIZE}
        />
      </div>
    </div>
  );
}
