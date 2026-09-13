// EduPulse SaaS pricing model — per location, INR.
// Schools subscribe to a plan. The active `subscriptions` row stores the
// billed amount, billing cycle, Razorpay subscription ID, and status.

export const PLANS = {
  free: {
    label: "Free",
    monthlyPricePerLocation: 0,
    yearlyPricePerLocation: 0,
    maxLocations: 1,
    maxStudents: 50,
    features: ["1 location", "Up to 50 students", "Basic admissions", "Basic fee tracking"],
  },
  growth: {
    label: "Growth",
    monthlyPricePerLocation: 999,
    yearlyPricePerLocation: 9999,
    maxLocations: null,
    maxStudents: null,
    features: ["Unlimited locations", "Unlimited students", "Razorpay payments", "Document uploads", "Staff payroll"],
  },
  enterprise: {
    label: "Enterprise",
    monthlyPricePerLocation: null,
    yearlyPricePerLocation: null,
    maxLocations: null,
    maxStudents: null,
    features: ["Custom SLA", "Dedicated support", "Custom integrations", "Volume pricing"],
  },
} as const;

export type Plan = keyof typeof PLANS;

export const BILLING_CYCLE_DAYS = {
  monthly: 30,
  yearly: 365,
} as const;

export function getPlanPrice(plan: Plan, billingCycle: "monthly" | "yearly", locationCount: number) {
  const p = PLANS[plan];
  const unit = billingCycle === "monthly" ? p.monthlyPricePerLocation : p.yearlyPricePerLocation;
  if (unit === null) return null;
  return unit * locationCount;
}
