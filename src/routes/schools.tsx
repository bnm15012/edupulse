import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, X, Building2, MapPin, Users, Briefcase,
  AlertCircle, Pencil, Phone, Mail, CreditCard, CheckCircle2, Eye, EyeOff,
} from "lucide-react";
import { getSchoolWithLocations, addBranch, updateSchool, updateBranch, updateSchoolLogo, saveRazorpayKeys, getSchoolPaymentSettings, getSchoolSubscriptionBilling, createPlatformRazorpayOrder, verifyPlatformRazorpayPayment } from "@/lib/auth";
import { useTenant } from "@/lib/tenant";
import { fmtDate } from "@/lib/utils";
import { PlanLimitDialog, parsePlanLimitError } from "@/components/plan-limit-dialog";

export const Route = createFileRoute("/schools")({
  component: SchoolsPage,
});

// ── Types ──────────────────────────────────────────────────────────────────

type Location = {
  id: number; name: string; address: string | null; city: string | null;
  state: string | null; pincode: string | null; phone: string | null;
  capacity: number | null; status: string; studentCount: number; staffCount: number;
};
type School = {
  id: number; name: string; email: string | null; phone: string | null;
  address: string | null; city: string | null; state: string | null;
  pincode: string | null; plan: string | null; status: string | null; logoUrl: string | null;
};
type PageData = { school: School; locations: Location[]; role: string | null };

const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

// ── Add Branch Modal ───────────────────────────────────────────────────────

function AddBranchModal({ schoolId, onClose, onSaved }: { schoolId: number; onClose: () => void; onSaved: () => void }) {
  const addFn = useServerFn(addBranch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ name: "", address: "", city: "", state: "", pincode: "", phone: "", capacity: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await addFn({
        data: {
          schoolId,
          name: f.name,
          address: f.address || undefined,
          city: f.city || undefined,
          state: f.state || undefined,
          pincode: f.pincode || undefined,
          phone: f.phone || undefined,
          capacity: f.capacity ? parseInt(f.capacity) : undefined,
        },
      });
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? "Failed to add branch");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && parsePlanLimitError(error) && (
        <PlanLimitDialog error={error} onClose={() => setError("")} />
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
            <h2 className="text-lg font-bold text-slate-900">Add New Branch</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={submit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Branch name *</label>
              <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. South Branch" className={inputCls} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
                <input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Capacity</label>
                <input type="number" value={f.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="100" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Address</label>
              <input value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Street address" className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">City</label>
                <input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Mumbai" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">State</label>
                <input value={f.state} onChange={(e) => set("state", e.target.value)} placeholder="Maharashtra" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pincode</label>
                <input value={f.pincode} onChange={(e) => set("pincode", e.target.value)} placeholder="400001" className={inputCls} />
              </div>
            </div>

            {error && !parsePlanLimitError(error) && (
              <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold transition">
                {saving ? "Adding…" : "Add Branch"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Edit School Info Modal ─────────────────────────────────────────────────

function EditSchoolModal({ school, onClose, onSaved }: { school: School; onClose: () => void; onSaved: () => void }) {
  const updateFn = useServerFn(updateSchool);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    name: school.name ?? "",
    email: school.email ?? "",
    phone: school.phone ?? "",
    address: school.address ?? "",
    city: school.city ?? "",
    state: school.state ?? "",
    pincode: school.pincode ?? "",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await updateFn({ data: { schoolId: school.id, name: f.name, email: f.email || "", phone: f.phone || undefined, address: f.address || undefined, city: f.city || undefined, state: f.state || undefined, pincode: f.pincode || undefined } });
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? "Failed to update school");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-900">Edit School Info</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">School name *</label>
            <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
              <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
              <input value={f.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Address</label>
            <input value={f.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">City</label>
              <input value={f.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">State</label>
              <input value={f.state} onChange={(e) => set("state", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pincode</label>
              <input value={f.pincode} onChange={(e) => set("pincode", e.target.value)} className={inputCls} />
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold transition">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

function EditBranchModal({ schoolId, branch, onClose, onSaved }: { schoolId: number; branch: Location; onClose: () => void; onSaved: () => void }) {
  const updateFn = useServerFn(updateBranch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    name: branch.name ?? "", address: branch.address ?? "", city: branch.city ?? "",
    state: branch.state ?? "", pincode: branch.pincode ?? "", phone: branch.phone ?? "",
    capacity: branch.capacity ? String(branch.capacity) : "",
    status: (branch.status ?? "active") as "active" | "inactive",
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await updateFn({ data: { schoolId, locationId: branch.id, name: f.name, address: f.address || undefined, city: f.city || undefined, state: f.state || undefined, pincode: f.pincode || undefined, phone: f.phone || undefined, capacity: f.capacity ? parseInt(f.capacity) : undefined, status: f.status } });
      onSaved();
    } catch (err: any) { setError(err?.message ?? "Failed"); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-900">Edit Branch</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Branch name *</label>
            <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Phone</label>
              <input value={f.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Capacity</label>
              <input type="number" value={f.capacity} onChange={(e) => set("capacity", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Address</label>
            <input value={f.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">City</label>
              <input value={f.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">State</label>
              <input value={f.state} onChange={(e) => set("state", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Pincode</label>
              <input value={f.pincode} onChange={(e) => set("pincode", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
            <select value={f.status} onChange={(e) => set("status", e.target.value)} className={`${inputCls} bg-white`}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {error && <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold transition">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Razorpay Settings Card ─────────────────────────────────────────────────

function RazorpaySettings({ schoolId }: { schoolId: number }) {
  const saveFn = useServerFn(saveRazorpayKeys);
  const getFn = useServerFn(getSchoolPaymentSettings);
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<{ razorpayKeyId: string | null; hasSecret: boolean } | null>(null);

  useEffect(() => {
    getFn({ data: { schoolId } })
      .then((d) => setCurrent(d as { razorpayKeyId: string | null; hasSecret: boolean }))
      .catch(() => {});
  }, [schoolId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(""); setSaved(false);
    try {
      await saveFn({ data: { schoolId, razorpayKeyId: keyId, razorpayKeySecret: secret } });
      setSaved(true);
      setCurrent({ razorpayKeyId: keyId, hasSecret: true });
      setKeyId(""); setSecret("");
    } catch (err: any) { setError(err?.message ?? "Failed to save"); }
    finally { setSaving(false); }
  };

  const isConfigured = current?.razorpayKeyId && current?.hasSecret;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-1 h-5 bg-emerald-500 rounded-full" />
        <CreditCard className="w-4 h-4 text-emerald-600" />
        <h2 className="text-sm font-bold text-slate-800">Razorpay Payment Settings</h2>
        {isConfigured && (
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" /> Configured
          </span>
        )}
      </div>
      <div className="p-6">
        <p className="text-sm text-slate-500 mb-4">
          Enter your Razorpay API keys so parents can pay invoices online. Payments go directly to your linked bank account.
          {" "}<a href="https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">How to get keys →</a>
        </p>
        {isConfigured && (
          <div className="mb-4 flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Razorpay is active. Key ID: <strong className="font-mono">{current!.razorpayKeyId}</strong>. Enter new keys below to update.</span>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Key ID *</label>
            <input
              value={keyId} onChange={(e) => setKeyId(e.target.value)}
              placeholder={isConfigured ? "Enter new Key ID to update" : "rzp_live_xxxxxxxxxxxx"}
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Key Secret *</label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={secret} onChange={(e) => setSecret(e.target.value)}
                placeholder={isConfigured ? "Enter new Key Secret to update" : "••••••••••••••••"}
                className={`${inputCls} pr-10`}
                required
              />
              <button type="button" onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Never share your Key Secret. It is stored securely and never shown again.</p>
          </div>
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
          {saved && <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm"><CheckCircle2 className="w-4 h-4 shrink-0" />Razorpay keys saved successfully!</div>}
          <button type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-bold transition">
            {saving ? "Saving…" : isConfigured ? "Update Keys" : "Save Keys"}
          </button>
        </form>
      </div>
    </div>
  );
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

type BillingData = any;

function SubscriptionBilling({ schoolId }: { schoolId: number }) {
  const getBillingFn = useServerFn(getSchoolSubscriptionBilling);
  const createOrderFn = useServerFn(createPlatformRazorpayOrder);
  const verifyFn = useServerFn(verifyPlatformRazorpayPayment);
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    getBillingFn()
      .then((d) => setData(d as BillingData))
      .catch((e) => setError(e?.message ?? "Failed to load billing"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [schoolId]);

  const handlePayNow = async () => {
    if (!data?.subscription || Number(data.subscription.amount ?? 0) <= 0) return;
    setPaying(true); setError("");
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Failed to load Razorpay. Check your internet.");

      const order = await createOrderFn({ data: { subscriptionId: data.subscription.id } }) as {
        orderId: string; amount: number; keyId: string; subscriptionPaymentId: number;
      };

      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: data.subscription.currency ?? "INR",
          order_id: order.orderId,
          name: "EduPulse",
          description: `${data.subscription.plan ?? data.school.plan} subscription - ${data.subscription.billingCycle ?? "monthly"}`,
          prefill: { email: data.school.email ?? "" },
          theme: { color: "#2563eb" },
          handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
            try {
              await verifyFn({
                data: {
                  subscriptionPaymentId: order.subscriptionPaymentId,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                },
              });
              await load();
              resolve();
            } catch (err: any) { reject(err); }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
        });
        rzp.open();
      });
    } catch (err: any) {
      if (err?.message !== "Payment cancelled") setError(err?.message ?? "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  if (loading) return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 h-40 animate-pulse" />
  );

  if (error) return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-2 text-red-600 text-sm"><AlertCircle className="w-4 h-4" /> {error}</div>
    </div>
  );

  const sub = data?.subscription;
  const amount = Number(sub?.amount ?? 0);
  if (!sub || amount <= 0) return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500" />
      <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800 mb-1">Subscription</h2>
          <p className="text-sm text-slate-500">
            You are currently on the <span className="font-semibold text-slate-700 capitalize">{data?.school?.plan ?? "Free"}</span> plan.
            Contact us to upgrade to Growth or Enterprise.
          </p>
        </div>
        <a
          href={`https://wa.me/917326027500?text=${encodeURIComponent(`Hi, I'm the admin of ${data?.school?.name ?? "my school"} on EduPulse. I'd like to upgrade to the Growth plan. Please share the payment details.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition shrink-0"
        >
          <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Upgrade Plan
        </a>
      </div>
    </div>
  );

  const currency = sub.currency ?? "INR";
  const symbol = currency === "INR" ? "₹" : currency;
  const isExpired = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) < new Date() : true;
  const periodLabel = sub.billingCycle === "monthly" ? "/ month" : sub.billingCycle === "yearly" ? "/ year" : "";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500" />
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-violet-600" /> Subscription Billing
            </h2>
            <p className="text-sm text-slate-500">Manage your EduPulse plan payment</p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border capitalize ${sub.status === "active" && !isExpired ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
            {sub.status === "active" && !isExpired ? "Active" : isExpired ? "Expired" : "Pending"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="text-xs text-slate-500 mb-1">Plan</div>
            <div className="text-base font-bold text-slate-800 capitalize">{sub.plan ?? data.school.plan ?? "—"}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="text-xs text-slate-500 mb-1">Amount</div>
            <div className="text-base font-bold text-slate-800">{symbol}{amount.toLocaleString("en-IN")}{periodLabel}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="text-xs text-slate-500 mb-1">Current period ends</div>
            <div className="text-base font-bold text-slate-800">{sub.currentPeriodEnd ? fmtDate(new Date(sub.currentPeriodEnd)) : "—"}</div>
          </div>
        </div>

        {isExpired ? (
          <button
            onClick={handlePayNow}
            disabled={paying}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white text-sm font-bold rounded-xl transition"
          >
            {paying ? <>Processing…</> : <><CreditCard className="w-4 h-4" /> Pay {symbol}{amount.toLocaleString("en-IN")} now</>}
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-4 h-4" /> Paid — next renewal on {fmtDate(new Date(sub.currentPeriodEnd!))}
          </div>
        )}

        <p className="text-xs text-slate-400">
          Payments are processed securely by Razorpay in the platform account. You will receive a receipt after successful payment.
        </p>
      </div>
    </div>
  );
}

function SchoolsPage() {
  const { tenant } = useTenant();
  const getFn = useServerFn(getSchoolWithLocations);
  const uploadLogoFn = useServerFn(updateSchoolLogo);
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Location | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    getFn({ data: { schoolId: tenant.schoolId } })
      .then((d) => setData(d as PageData))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tenant.schoolId]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data?.school) return;
    setUploading(true); setError("");
    try {
      const logo = await toBase64(file);
      await uploadLogoFn({ data: { schoolId: data.school.id, logo } });
      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to upload logo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const school = data?.school;
  const locs = data?.locations ?? [];

  const STATUS = { active: "bg-emerald-50 text-emerald-700 border border-emerald-200", inactive: "bg-slate-100 text-slate-500 border border-slate-200" };

  return (
    <div className="space-y-7">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">School & Branches</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your school profile and branch locations</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Branch
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      {/* School profile card */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 h-40 animate-pulse" />
      ) : school && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-blue-500 to-violet-600" />
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden">
                  {school.logoUrl ? (
                    <img src={school.logoUrl} alt={`${school.name} logo`} className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-7 h-7 text-blue-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl font-extrabold text-slate-900">{school.name}</h2>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border capitalize ${STATUS[school.status as keyof typeof STATUS] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {school.status}
                    </span>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100 capitalize">
                      {school.plan ?? "free"} plan
                    </span>
                  </div>
                  <div className="flex gap-5 mt-2 text-sm text-slate-500 flex-wrap">
                    {school.email && (
                      <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{school.email}</span>
                    )}
                    {school.phone && (
                      <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{school.phone}</span>
                    )}
                    {school.city && (
                      <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{[school.city, school.state].filter(Boolean).join(", ")}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-700 rounded-xl transition"
                  disabled={uploading}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-blue-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50 rounded-xl transition"
                >
                  {uploading ? "Uploading…" : "Upload logo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Branches table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-blue-600 rounded-full" />
            <h2 className="text-sm font-bold text-slate-800">Branches / Locations</h2>
            <span className="text-xs text-slate-400 font-medium">({locs.length})</span>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : !locs.length ? (
          <div className="py-14 text-center">
            <MapPin className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-400">No branches yet. Add your first branch!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-5 py-3.5">Branch name</th>
                <th className="px-5 py-3.5">City / State</th>
                <th className="px-5 py-3.5">Phone</th>
                <th className="px-5 py-3.5">Capacity</th>
                <th className="px-5 py-3.5">Students</th>
                <th className="px-5 py-3.5">Staff</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 transition">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{l.name}</p>
                        {l.address && <p className="text-xs text-slate-400 truncate max-w-[180px]">{l.address}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {[l.city, l.state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-5 py-4 text-slate-500">{l.phone ?? "—"}</td>
                  <td className="px-5 py-4 text-slate-500">{l.capacity ?? "—"}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                      <Users className="w-3.5 h-3.5 text-blue-400" /> {l.studentCount}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                      <Briefcase className="w-3.5 h-3.5 text-violet-400" /> {l.staffCount}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full capitalize border ${STATUS[l.status as keyof typeof STATUS] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setEditBranch(l)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-700 rounded-lg transition"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Platform Subscription Billing */}
      {school && <SubscriptionBilling schoolId={school.id} />}

      {/* Razorpay Payment Settings */}
      {school && <RazorpaySettings schoolId={school.id} />}

      {addOpen && school && <AddBranchModal schoolId={school.id} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />}
      {editOpen && school && <EditSchoolModal school={school} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />}
      {editBranch && school && <EditBranchModal schoolId={school.id} branch={editBranch} onClose={() => setEditBranch(null)} onSaved={() => { setEditBranch(null); load(); }} />}
    </div>
  );
}
