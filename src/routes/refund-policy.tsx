import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/refund-policy")({
  component: RefundPolicy,
});

function RefundPolicy() {
  return (
    <PublicLayout>
      <article className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-bold text-slate-900 mb-8">Refund Policy</h1>

        <p className="text-slate-600 mb-6">
          At EduPulse, we want every school to be happy with their subscription. If you are not satisfied, the following refund rules apply.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">Free plan</h2>
        <p className="text-slate-600 mb-6">
          Our Free plan is available at no cost. No payment or refund is required.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">Paid subscriptions</h2>
        <p className="text-slate-600 mb-6">
          If you upgrade to a paid Growth or Enterprise plan, you have <strong>7 days</strong> from the date of payment to request a full refund, no questions asked.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">After 7 days</h2>
        <p className="text-slate-600 mb-6">
          Refund requests made after 7 days are reviewed on a case-by-case basis. We may offer a prorated refund for the unused portion of the current billing period if there was a service issue on our side.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">How to request a refund</h2>
        <p className="text-slate-600">
          Email us at <a href="mailto:bookandmanage@gmail.com" className="text-blue-600 hover:underline">bookandmanage@gmail.com</a> with your registered school email, invoice number, and reason. We will respond within 5 business days.
        </p>
      </article>
    </PublicLayout>
  );
}
