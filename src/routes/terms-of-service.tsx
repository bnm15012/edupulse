import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/terms-of-service")({
  component: TermsOfService,
});

function TermsOfService() {
  return (
    <PublicLayout>
      <article className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-bold text-slate-900 mb-8">Terms of Service</h1>

        <p className="text-slate-600 mb-6">
          By signing up or using EduPulse, you agree to these terms. Please read them carefully.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">Use of the platform</h2>
        <p className="text-slate-600 mb-6">
          EduPulse is provided for preschools and educational institutions to manage admissions, students, staff, fees, and operations. You agree to use the platform lawfully and responsibly.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">Accounts and access</h2>
        <p className="text-slate-600 mb-6">
          You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately of any unauthorised use.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">Payments and subscriptions</h2>
        <p className="text-slate-600 mb-6">
          Paid plans are billed according to the selected tier and number of locations. All fees are exclusive of taxes unless stated otherwise. Cancellations take effect at the end of the current billing cycle.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">Limitation of liability</h2>
        <p className="text-slate-600">
          EduPulse is provided &quot;as is&quot;. We are not liable for indirect, incidental, or consequential damages arising from the use or inability to use the platform.
        </p>
      </article>
    </PublicLayout>
  );
}
