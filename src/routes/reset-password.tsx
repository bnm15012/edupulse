import { createFileRoute, Link } from "@tanstack/react-router";
import { EduPulseLogo } from "@/components/edupulse-logo";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
});

// Password reset is handled entirely in /forgot-password (3-step OTP flow).
// This page exists only as a fallback redirect.
function ResetPassword() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <EduPulseLogo size="lg" />
        </div>
        <p className="text-slate-600 text-sm">Please use the forgot password flow to reset your password.</p>
        <Link to="/forgot-password" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          Reset password
        </Link>
      </div>
    </div>
  );
}
