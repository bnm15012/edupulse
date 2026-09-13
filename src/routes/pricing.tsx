import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ArrowRight, Zap, Building2, Users, MessageCircle } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";
import { EduPulseLogo } from "@/components/edupulse-logo";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

const WA_LINK =
  "https://wa.me/917326027500?text=Hi%2C%20I%27d%20like%20to%20get%20a%20quote%20for%20EduPulse%20for%20my%20preschool.";

const WA_ICON = (
  <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const plans = [
  {
    name: "Free",
    tagline: "Perfect for getting started",
    price: "₹0",
    period: "forever",
    cta: "Get started free",
    ctaHref: "/signup" as const,
    ctaVariant: "outline" as const,
    featured: false,
    features: [
      "1 school, 1 branch",
      "Up to 50 students",
      "Admissions & enrollment",
      "Basic fee management",
      "3 staff accounts",
      "Parent portal access",
      "Email support",
    ],
  },
  {
    name: "Growth",
    tagline: "For schools ready to scale",
    price: "Contact us",
    period: "for a quote",
    cta: "Get a quote",
    ctaHref: WA_LINK,
    ctaVariant: "primary" as const,
    featured: true,
    features: [
      "1 school, up to 5 branches",
      "Unlimited students",
      "Full admissions pipeline",
      "Razorpay fee collection",
      "Unlimited staff accounts",
      "Attendance & scheduling",
      "Curriculum activity feed",
      "Reports & analytics",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    tagline: "For chains & franchise networks",
    price: "Contact us",
    period: "for a quote",
    cta: "Talk to us",
    ctaHref: WA_LINK,
    ctaVariant: "outline" as const,
    featured: false,
    features: [
      "Unlimited schools & branches",
      "Unlimited students & staff",
      "All Growth features",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantee",
      "Custom reporting",
      "On-premise option",
    ],
  },
];

const faqs = [
  {
    q: "Is the free plan really free forever?",
    a: "Yes. No credit card required, no trial period. The free plan is yours to keep as long as you need it. It's perfect for a single-branch school just getting started.",
  },
  {
    q: "Why don't you show fixed prices for paid plans?",
    a: "Pricing depends on your school's size — number of students, branches, and staff. A quote takes 2 minutes on WhatsApp and ensures you never pay for capacity you don't need.",
  },
  {
    q: "Can I upgrade or downgrade later?",
    a: "Absolutely. Your plan can flex as your school grows. There's no annual lock-in on paid plans unless you specifically opt for an annual discount.",
  },
  {
    q: "Do you charge per student or per school?",
    a: "It depends on your setup — which is why we prefer to give you a custom quote. Most schools find it cheaper than a flat per-student fee.",
  },
  {
    q: "Is there a setup fee?",
    a: "No setup fees. We'll help you onboard at no extra cost.",
  },
];

function PricingPage() {
  return (
    <PublicLayout>

      {/* Hero */}
      <section className="bg-slate-50 py-20 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
            Pricing
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mt-5 mb-4 leading-tight">
            Start free.<br />Scale when you're ready.
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
            The free plan covers a single school with no time limit. For bigger schools, we put together a custom quote — usually in under 5 minutes on WhatsApp.
          </p>
        </div>
      </section>

      {/* Plan cards */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border-2 flex flex-col overflow-hidden ${
                  plan.featured
                    ? "border-blue-600 shadow-2xl"
                    : "border-slate-200"
                }`}
              >
                {plan.featured && (
                  <div className="bg-blue-600 text-white text-xs font-bold uppercase tracking-widest text-center py-2">
                    Most popular
                  </div>
                )}
                <div className={`p-8 flex flex-col flex-1 ${plan.featured ? "bg-blue-600 text-white" : "bg-white text-slate-900"}`}>
                  <div className="mb-6">
                    <div className="text-lg font-bold mb-0.5">{plan.name}</div>
                    <div className={`text-sm mb-4 ${plan.featured ? "text-blue-200" : "text-slate-500"}`}>{plan.tagline}</div>
                    <div className="flex items-end gap-1.5">
                      <span className="text-4xl font-extrabold">{plan.price}</span>
                      <span className={`text-sm mb-1.5 ${plan.featured ? "text-blue-200" : "text-slate-400"}`}>/{plan.period}</span>
                    </div>
                  </div>

                  <ul className="space-y-3 flex-1 mb-8">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${plan.featured ? "text-blue-200" : "text-blue-600"}`} />
                        <span className={plan.featured ? "text-blue-50" : "text-slate-700"}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {plan.ctaVariant === "primary" ? (
                    <a
                      href={plan.ctaHref}
                      target={plan.ctaHref.startsWith("http") ? "_blank" : undefined}
                      rel={plan.ctaHref.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="w-full text-center py-3 rounded-xl font-bold text-sm transition block bg-white text-blue-700 hover:bg-blue-50"
                    >
                      {plan.cta}
                    </a>
                  ) : plan.ctaHref.startsWith("http") ? (
                    <a
                      href={plan.ctaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full text-center py-3 rounded-xl font-bold text-sm transition block border-2 border-blue-600 text-blue-600 hover:bg-blue-50"
                    >
                      {plan.cta}
                    </a>
                  ) : (
                    <Link
                      to={plan.ctaHref as "/signup"}
                      className="w-full text-center py-3 rounded-xl font-bold text-sm transition block border-2 border-blue-600 text-blue-600 hover:bg-blue-50"
                    >
                      {plan.cta}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-slate-400 mt-8">
            All paid plans include a free onboarding session. No setup fees. Cancel anytime.
          </p>
        </div>
      </section>

      {/* Why contact us */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-extrabold text-slate-900 mb-3">Why we don't list a fixed price</h2>
          <p className="text-slate-500 text-base max-w-2xl mx-auto mb-12 leading-relaxed">
            A school with 30 students and 1 branch has very different needs from one with 300 students and 4 branches. Showing one price for both isn't fair to either. A quick chat means you pay exactly for what you use.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: Users, title: "Sized to your school", desc: "Pricing scales with your student count and branch size — not arbitrary tiers." },
              { icon: Zap, title: "Quote in 5 minutes", desc: "Chat with us on WhatsApp. No forms, no waiting for a sales rep to call back." },
              { icon: Building2, title: "Fair for every size", desc: "Small schools don't overpay. Large chains get volume pricing. Everyone wins." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl border border-slate-200 p-6 text-left">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-1.5">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-20">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl font-extrabold text-slate-900 mb-10 text-center">Common questions</h2>
          <div className="space-y-6">
            {faqs.map(({ q, a }) => (
              <div key={q} className="border-b border-slate-100 pb-6">
                <h3 className="font-semibold text-slate-900 text-sm mb-2">{q}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-slate-50 border-t border-slate-200 py-16 text-center">
        <div className="max-w-xl mx-auto px-6">
          <div className="flex justify-center mb-5">
            <EduPulseLogo size="lg" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-3">Ready to get started?</h2>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">
            Start free today — or chat with us for a custom quote. We'll get back to you in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-7 py-3.5 rounded-xl font-bold text-sm transition shadow-sm"
            >
              {WA_ICON}
              Get a quote on WhatsApp
            </a>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-7 py-3.5 rounded-xl font-semibold text-sm transition"
            >
              Start free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

    </PublicLayout>
  );
}
