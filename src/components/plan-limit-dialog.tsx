import { X, ArrowRight, Zap } from "lucide-react";

const WA_LINK =
  "https://wa.me/917326027500?text=Hi%2C%20I%27d%20like%20to%20upgrade%20my%20EduPulse%20plan.";

const RESOURCE_LABELS: Record<string, string> = {
  students:  "students",
  staff:     "staff members",
  locations: "branches",
};

/**
 * Parse a PlanLimitError message like:
 *   "PLAN_LIMIT_EXCEEDED:students:50:50:free"
 * Returns null if the message is not a plan limit error.
 */
export function parsePlanLimitError(message: string | undefined) {
  if (!message?.startsWith("PLAN_LIMIT_EXCEEDED:")) return null;
  const [, resource, current, limit, plan] = message.split(":");
  return {
    resource,
    current: Number(current),
    limit:   Number(limit),
    plan:    plan ?? "free",
  };
}

type Props = {
  error: string;            // raw error message
  onClose: () => void;
};

/**
 * Drop this anywhere you catch an error from addStudent / addStaffMember / addBranch.
 * If the error is a plan limit error it shows the upgrade dialog; otherwise returns null
 * so the caller can fall back to its normal error handling.
 */
export function PlanLimitDialog({ error, onClose }: Props) {
  const info = parsePlanLimitError(error);
  if (!info) return null;

  const label = RESOURCE_LABELS[info.resource] ?? info.resource;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center mb-3">
            <Zap className="w-5 h-5 text-yellow-300" />
          </div>
          <h2 className="text-lg font-extrabold text-white">Plan limit reached</h2>
          <p className="text-blue-200 text-sm mt-1">
            You've reached the maximum {label} for your <span className="capitalize font-semibold text-white">{info.plan}</span> plan.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Usage bar */}
          <div className="mb-5">
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>{label} used</span>
              <span className="font-semibold text-slate-700">{info.current} / {info.limit}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-2 bg-red-500 rounded-full"
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed mb-5">
            Upgrade your plan to add more {label}. Chat with us on WhatsApp and we'll get you set up in minutes — no forms, no waiting.
          </p>

          <div className="flex flex-col gap-2.5">
            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm transition"
            >
              Upgrade plan
              <ArrowRight className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 transition"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
