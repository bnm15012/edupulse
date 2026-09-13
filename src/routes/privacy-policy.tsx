import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public-layout";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <PublicLayout>
      <article className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-bold text-slate-900 mb-8">Privacy Policy</h1>

        <p className="text-slate-600 mb-6">
          EduPulse is committed to protecting the personal information of schools, parents, students, and staff. This policy explains what we collect and how we use it.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">Information we collect</h2>
        <p className="text-slate-600 mb-6">
          We collect school registration details, user account information, student and staff records, fee and payment data, and usage information needed to operate the platform.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">How we use information</h2>
        <p className="text-slate-600 mb-6">
          Data is used to provide and improve EduPulse, process payments, generate reports, communicate with users, and ensure the security of the platform.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">Data sharing</h2>
        <p className="text-slate-600 mb-6">
          We do not sell personal data. We only share data with service providers required to run the platform (such as payment processors) or when required by law.
        </p>

        <h2 className="text-2xl font-semibold text-slate-900 mt-8 mb-4">Security</h2>
        <p className="text-slate-600">
          We use industry-standard measures to protect data, including encryption, secure access controls, and regular backups. Only authorised users can access school data.
        </p>
      </article>
    </PublicLayout>
  );
}
