import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPlans, updatePlan } from "@/lib/auth";
import { DollarSign, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/super-admin/plans")({
  component: PlansAdmin,
});

type Plan = {
  id: number;
  name: string;
  price: string;
  period: string;
  description: string | null;
  features: string[];
  featured: boolean;
  cta: string | null;
  ctaHref: string | null;
  status: string;
};

const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition";

function PlansAdmin() {
  const listFn = useServerFn(getPlans);
  const updateFn = useServerFn(updatePlan);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    listFn()
      .then((res: any) => setPlans(res as Plan[]))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const setField = (id: number, field: keyof Plan, value: any) => {
    setPlans((p) => p.map((plan) => (plan.id === id ? { ...plan, [field]: value } : plan)));
  };

  const save = async (plan: Plan) => {
    setSaving(plan.id);
    setError("");
    try {
      await updateFn({
        data: {
          planId: plan.id,
          price: plan.price,
          period: plan.period,
          description: plan.description ?? "",
          features: plan.features,
          cta: plan.cta ?? "",
          ctaHref: plan.ctaHref ?? "",
          featured: plan.featured,
          status: plan.status as "active" | "inactive",
        },
      });
      setSaved(plan.id);
      setTimeout(() => setSaved(null), 2000);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading plans…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Plans & Pricing</h1>
          <p className="text-sm text-slate-500 mt-0.5">Update public website pricing and plan details.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-200 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-white rounded-2xl border p-6 space-y-4 transition ${
              plan.featured ? "border-blue-600 shadow-lg" : "border-slate-200 shadow-sm"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">{plan.name}</h2>
              </div>
              {plan.featured && (
                <span className="text-xs font-bold bg-blue-600 text-white px-2 py-1 rounded-full">Featured</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Price</label>
                <input
                  value={plan.price}
                  onChange={(e) => setField(plan.id, "price", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Period</label>
                <input
                  value={plan.period}
                  onChange={(e) => setField(plan.id, "period", e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</label>
              <textarea
                value={plan.description ?? ""}
                onChange={(e) => setField(plan.id, "description", e.target.value)}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Features (one per line)
              </label>
              <textarea
                value={plan.features.join("\n")}
                onChange={(e) =>
                  setField(
                    plan.id,
                    "features",
                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                  )
                }
                rows={4}
                className={`${inputCls} resize-none`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">CTA text</label>
                <input
                  value={plan.cta ?? ""}
                  onChange={(e) => setField(plan.id, "cta", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">CTA link</label>
                <input
                  value={plan.ctaHref ?? ""}
                  onChange={(e) => setField(plan.id, "ctaHref", e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                <select
                  value={plan.status}
                  onChange={(e) => setField(plan.id, "status", e.target.value)}
                  className={`${inputCls} bg-white`}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex items-end pb-1.5">
                <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={plan.featured}
                    onChange={(e) => setField(plan.id, "featured", e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Featured
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">Public ID: {plan.id}</span>
              <button
                onClick={() => save(plan)}
                disabled={saving === plan.id}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold rounded-xl transition"
              >
                {saving === plan.id ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                ) : saved === plan.id ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</>
                ) : (
                  <><DollarSign className="w-3.5 h-3.5" /> Save plan</>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
