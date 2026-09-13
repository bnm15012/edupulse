/**
 * /confirm?token=<hex>
 * Handles email confirmation links sent on signup.
 * Validates the token, marks the user confirmed, auto-logs them in,
 * then redirects to the dashboard.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { confirmEmail } from "@/lib/auth";
import { Loader2, GraduationCap, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/confirm")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({
    meta: [{ title: "Confirm email — EduPulse" }],
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const confirmFn = useServerFn(confirmEmail);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No confirmation token found in the link.");
      return;
    }
    confirmFn({ data: { token } })
      .then((res: any) => {
        if (res?.token) {
          const maxAge = 30 * 24 * 60 * 60;
          document.cookie = `bb_session=${res.token}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
        }
        setStatus("success");
        setTimeout(() => navigate({ to: "/dashboard" }), 2000);
      })
      .catch((err: any) => {
        setStatus("error");
        setErrorMsg(err?.message ?? "Confirmation failed. Please try again.");
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <GraduationCap className="h-6 w-6 text-white" />
          </span>
        </div>
        <p className="text-sm font-bold text-slate-800">EduPulse</p>

        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
            <p className="text-slate-500">Confirming your email…</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-500" />
            <h1 className="text-xl font-semibold text-slate-800">Email confirmed!</h1>
            <p className="text-slate-500 text-sm">Redirecting you to your dashboard…</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto h-8 w-8 text-red-500" />
            <h1 className="text-xl font-semibold text-slate-800">Confirmation failed</h1>
            <p className="text-slate-500 text-sm">{errorMsg}</p>
            <button
              onClick={() => navigate({ to: "/login" })}
              className="mt-2 inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              Go to login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
