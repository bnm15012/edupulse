import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { forgotPassword, verifyOtp, resetPassword } from "@/lib/auth";
import { ArrowLeft, Mail, CheckCircle2, ArrowRight, ShieldCheck, KeyRound, Eye, EyeOff } from "lucide-react";
import { EduPulseLogo } from "@/components/edupulse-logo";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
});

type Step = "email" | "otp" | "newPassword" | "done";

function ForgotPassword() {
  const navigate = useNavigate();
  const forgotFn     = useServerFn(forgotPassword);
  const verifyOtpFn  = useServerFn(verifyOtp);
  const resetFn      = useServerFn(resetPassword);

  const [step, setStep]           = useState<Step>("email");
  const [email, setEmail]         = useState("");
  const [otp, setOtp]             = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  // Step 1 — send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotFn({ data: { email } });
      setStep("otp");
    } catch (err: any) {
      setError(err?.message ?? "Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = (await verifyOtpFn({ data: { email, code: otp } })) as { resetToken: string };
      setResetToken(result.resetToken);
      setStep("newPassword");
    } catch (err: any) {
      setError(err?.message ?? "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3 — set new password
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await resetFn({ data: { email, resetToken, newPassword } });
      setStep("done");
      setTimeout(() => navigate({ to: "/login" }), 2500);
    } catch (err: any) {
      setError(err?.message ?? "Reset failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition placeholder:text-slate-400";
  const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[50%] xl:w-[52%] relative overflow-hidden shrink-0">
        <img
          src="https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&auto=format&fit=crop&q=80"
          alt="Children learning"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-900/60 to-blue-950/70" />
        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          <Link to="/" className="flex items-center gap-3">
            <EduPulseLogo size="md" />
            <div>
              <div className="text-lg font-bold text-white leading-tight">EduPulse</div>

            </div>
          </Link>

          <div className="flex-1 flex flex-col justify-center max-w-sm">
            <div className="w-20 h-20 bg-white/10 border border-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center mb-8">
              <KeyRound className="w-10 h-10 text-sky-300" />
            </div>
            <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-4">
              Account<br /><span className="text-sky-300">recovery</span>
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed mb-10">
              We'll send a 6-digit OTP to your registered email. It expires in 15 minutes.
            </p>
            <div className="space-y-4">
              {[
                { step: "1", text: "Enter your work email" },
                { step: "2", text: "Enter the 6-digit OTP from your email" },
                { step: "3", text: "Set a new strong password" },
              ].map(({ step: s, text }) => (
                <div key={s} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                    (step === "otp" && s === "1") || (step === "newPassword" && ["1","2"].includes(s)) || step === "done"
                      ? "bg-blue-600 border-blue-500"
                      : "bg-blue-600/40 border-blue-500/40"
                  }`}>
                    <span className="text-xs font-bold text-blue-200">{s}</span>
                  </div>
                  <span className="text-sm text-slate-300">{text}</span>
                </div>
              ))}
            </div>
            <div className="mt-10 flex items-center gap-2.5 bg-white/8 border border-white/15 backdrop-blur-sm rounded-xl px-4 py-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-xs text-slate-300 leading-snug">
                Industry-standard security. Your identity is verified before access is restored.
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-500">&copy; {new Date().getFullYear()} EduPulse Technologies</div>
        </div>
      </div>

      {/* ── Right: Form panel ── */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-12 relative overflow-hidden">
        {/* Mobile gradient + decorative blobs — hidden on desktop */}
        <div className="lg:hidden absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#6366f1_0%,_#3b82f6_35%,_#0ea5e9_65%,_#06b6d4_100%)] pointer-events-none" />
        <div className="lg:hidden absolute -top-20 -right-20 w-72 h-72 rounded-full bg-violet-500/40 blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute top-1/3 -left-16 w-56 h-56 rounded-full bg-cyan-400/30 blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute -bottom-16 right-8 w-64 h-64 rounded-full bg-indigo-600/50 blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)" }} />
        {/* Desktop blobs */}
        <div className="hidden lg:block absolute top-0 right-0 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="hidden lg:block absolute bottom-0 left-0 w-48 h-48 bg-indigo-100 rounded-full blur-3xl opacity-50 translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <div className="relative w-full max-w-md">
          {/* Mobile logo */}
          <Link to="/" className="lg:hidden inline-flex items-center gap-2.5 mb-8">
            <EduPulseLogo size="md" />
            <span className="text-lg font-bold text-white drop-shadow">EduPulse</span>
          </Link>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 xl:p-10">

            {/* ── Step 1: Enter email ── */}
            {step === "email" && (
              <>
                <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-7 transition group">
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  Back to sign in
                </Link>
                <div className="mb-7">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-md shadow-blue-200 shrink-0">
                      <Mail className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-extrabold text-slate-900">Forgot your password?</h1>
                  </div>
                  <p className="text-slate-500 text-sm">Enter your work email and we'll send a 6-digit OTP.</p>
                </div>
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className={labelCls}>Work email address</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.com" className={inputCls} required autoComplete="email" />
                  </div>
                  {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
                  <button type="submit" disabled={loading || !email} className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition shadow-md shadow-blue-200">
                    {loading ? "Sending OTP…" : <>Send OTP <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              </>
            )}

            {/* ── Step 2: Enter OTP ── */}
            {step === "otp" && (
              <>
                <button onClick={() => setStep("email")} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-7 transition group">
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  Back
                </button>
                <div className="mb-7">
                  <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mb-5 shadow-md shadow-indigo-200">
                    <KeyRound className="w-7 h-7 text-white" />
                  </div>
                  <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Enter OTP</h1>
                  <p className="text-slate-500 text-sm">
                    We sent a 6-digit code to <span className="font-semibold text-slate-700">{email}</span>. It expires in 15 minutes.
                  </p>
                </div>
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className={labelCls}>6-digit OTP</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className={`${inputCls} text-center text-2xl font-bold tracking-[0.5em]`}
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
                  <button type="submit" disabled={loading || otp.length !== 6} className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition shadow-md shadow-blue-200">
                    {loading ? "Verifying…" : <>Verify OTP <ArrowRight className="w-4 h-4" /></>}
                  </button>
                  <button type="button" onClick={() => { setOtp(""); forgotFn({ data: { email } }); }} className="w-full text-sm text-slate-500 hover:text-blue-600 transition">
                    Resend OTP
                  </button>
                </form>
              </>
            )}

            {/* ── Step 3: New password ── */}
            {step === "newPassword" && (
              <>
                <div className="mb-7">
                  <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center mb-5 shadow-md shadow-emerald-200">
                    <ShieldCheck className="w-7 h-7 text-white" />
                  </div>
                  <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Set new password</h1>
                  <p className="text-slate-500 text-sm">Choose a strong password for your account.</p>
                </div>
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="relative">
                    <label className={labelCls}>New password</label>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className={inputCls}
                      minLength={8}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-9 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
                  <button type="submit" disabled={loading || newPassword.length < 8} className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition shadow-md shadow-emerald-200">
                    {loading ? "Updating…" : <>Update password <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </form>
              </>
            )}

            {/* ── Step 4: Done ── */}
            {step === "done" && (
              <div className="text-center py-6">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Password updated!</h2>
                <p className="text-slate-500 text-sm">Redirecting you to sign in…</p>
              </div>
            )}

          </div>

          <div className="flex items-center justify-center gap-5 mt-6">
            {[
              { icon: ShieldCheck, label: "256-bit SSL" },
              { icon: ShieldCheck, label: "OTP expires in 15 min" },
              { icon: ShieldCheck, label: "Secure delivery" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Icon className="w-3.5 h-3.5 text-emerald-500" />
                {label}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
