import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getInvoicePrintData } from "@/lib/auth";
import { Download, Printer, ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/invoice-print")({
  component: InvoicePrint,
});

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function InvoicePrint() {
  const { invoiceId } = useSearch({ from: "/invoice-print" }) as { invoiceId: number };
  const getFn = useServerFn(getInvoicePrintData);
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getFn({ data: { invoiceId: Number(invoiceId) } }).then(setData as any);
  }, [invoiceId]);

  const print = () => window.print();

  const downloadPdf = async () => {
    if (!invoiceRef.current) return;
    setDownloading(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const filename = `invoice-${invoiceId}-${data?.invoice?.month ?? "draft"}.pdf`;
      await html2pdf()
        .set({
          margin: 10,
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(invoiceRef.current)
        .save();
    } finally {
      setDownloading(false);
    }
  };

  if (!data) return <p className="p-8 text-sm text-slate-500">Loading invoice…</p>;

  const { invoice, student, parents, school, location } = data;

  const branchAddress = [
    location?.address,
    [location?.city, location?.state].filter(Boolean).join(", "),
    [location?.pincode, location?.phone].filter(Boolean).join(" · "),
  ].filter(Boolean).join(" · ") || school?.address;

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:py-0 print:bg-white">
      <div className="max-w-5xl mx-auto px-4">

        {/* Top bar — back + print actions */}
        <div className="no-print flex items-center justify-between gap-3 mb-4 print:hidden">
          <button
            onClick={() => navigate({ to: "/fees" })}
            className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 text-sm font-medium rounded-lg hover:bg-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Fees
          </button>
          <div className="flex items-center gap-2">
            <button onClick={print} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
            <button onClick={downloadPdf} disabled={downloading} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-500 text-white text-sm font-semibold rounded-lg transition">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? "Generating…" : "Download PDF"}
            </button>
          </div>
        </div>

        {/* Invoice card */}
        <div ref={invoiceRef} className="bg-white p-10 shadow-lg rounded-2xl print:shadow-none print:rounded-none print:p-0">

          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-slate-100 pb-6 mb-6">
            <div className="flex items-start gap-4">
              {school?.logoUrl
                ? <img src={school.logoUrl} alt="School logo" className="w-16 h-16 object-contain rounded-xl border border-slate-200" />
                : <div className="w-16 h-16 bg-slate-100 rounded-xl" />}
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{school?.name}</h1>
                <p className="text-sm text-slate-500 mt-1">{branchAddress}</p>
                {school?.email && <p className="text-xs text-slate-400 mt-0.5">{school.email} · {school?.phone}</p>}
                <p className="text-xs text-slate-400 mt-0.5 capitalize">Branch: {location?.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-700">Invoice #{invoice.id}</p>
              {invoice.details?.isPartialMonth
                ? <p className="text-sm text-slate-500">{invoice.details.fromDate} to {invoice.details.toDate} <span className="text-xs text-amber-600 font-semibold">(Partial month)</span></p>
                : <p className="text-sm text-slate-500">Month: {invoice.month}</p>
              }
              <p className="text-xs text-slate-400">Generated: {new Date(invoice.createdAt).toLocaleDateString("en-IN")}</p>
              <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${invoice.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {invoice.status}
              </span>
            </div>
          </div>

          {/* Billed to */}
          <div className="mb-8">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed to</h2>
            <p className="text-lg font-bold text-slate-900">{student?.firstName} {student?.lastName}</p>
            {student?.className && <p className="text-sm text-slate-600">Class: {student.className}</p>}
            {parents?.length > 0 && (
              <div className="mt-2 text-sm text-slate-500 space-y-0.5">
                {parents.map((p: any, i: number) => <p key={i}>{p.name}{p.phone ? ` · ${p.phone}` : ""}</p>)}
              </div>
            )}
          </div>

          {/* Line items */}
          <table className="w-full text-sm border border-slate-200 mb-6">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-slate-700">Description</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.details?.items?.length ? (
                invoice.details.items.map((item: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-slate-700">
                      {item.name}
                      {item.feeType === "daycare_hourly" && item.hours != null && (
                        <span className="block text-xs text-slate-500">{item.hours} hrs × {money(item.rate)}/hr</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{money(item.amount)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-3 text-slate-700">Monthly fee — {invoice.month}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{money(invoice.amount)}</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td className="px-4 py-2 text-right font-semibold text-slate-700">Total</td>
                <td className="px-4 py-2 text-right font-bold text-slate-900">{money(invoice.amount)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Daycare session breakdown */}
          {invoice.details?.daycareSessions?.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Daycare details</h3>
              <table className="w-full text-sm border border-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Date</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">In</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-700">Out</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-700">Daycare hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.details.daycareSessions.map((s: any, i: number) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-slate-700">{s.date}</td>
                      <td className="px-4 py-2 text-slate-600">{s.inTime ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{s.outTime ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">{s.hours ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Due summary */}
          <div className="bg-slate-50 rounded-xl p-5 mb-8">
            <div className="flex justify-between py-1.5"><span className="text-slate-600">Total Amount</span><span className="font-semibold text-slate-900">{money(invoice.amount)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-slate-600">Paid</span><span className="font-semibold text-emerald-700">{money(invoice.paid)}</span></div>
            <div className="flex justify-between py-1.5 border-t border-slate-200 mt-2 pt-2"><span className="font-bold text-slate-900">Due</span><span className="font-bold text-rose-700">{money(invoice.due)}</span></div>
            {invoice.dueDate && <p className="text-xs text-slate-500 mt-3">Due date: {invoice.dueDate}</p>}
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-slate-400 border-t border-slate-100 pt-6">
            <p>This is a computer generated invoice. For queries, contact {school?.phone || school?.email}.</p>
          </div>

        </div>{/* end invoice card */}
      </div>{/* end max-w-5xl */}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { margin: 20mm; }
        }
      `}</style>
    </div>
  );
}
