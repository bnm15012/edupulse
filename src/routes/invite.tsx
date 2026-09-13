import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { acceptInvite } from "@/lib/auth";
import { GraduationCap, Eye, EyeOff, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { roleHome } from "./__root";

export const Route = createFileRoute("/invite")({
  component: InvitePage,
});

function InvitePage() {
  const navigate = useNavigate();
  const acceptFn = useServerFn(acceptInvite);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Token comes from ?token= query param
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const token = search.get("token") ?? "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setError(""); setLoading(true);
    try {
      const res = (await acceptFn({ data: { token, password } })) as { ok: boolean; token: string; role: string };
      if (res.token) {
        const maxAge = 30 * 24 * 60 * 60;
        document.cookie = `bb_session=${res.token}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
      }
      setDone(true);
      setTimeout(() => navigate({ to: roleHome(res.role) as any }), 1800);
    } catch (err: any) {
      setError(err?.message ?? "Failed to accept invite. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left photo panel */}
      <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden shrink-0">
        <img
          src="https://images.unsplash.com/photo-1544776193-352d25ca82cd?w=1200&auto=format&fit=crop&q=80"
          alt="Preschool"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-900/60 to-blue-950/70" />
        <div className="relative z-10 flex flex-col h-full p-12">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-white">EduPulse</div>

            </div>
          </Link>

          <div className="flex-1 flex flex-col justify-center max-w-sm">
            <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center mb-7">
              <ShieldCheck className="w-8 h-8 text-sky-300" />
            </div>
            <h2 className="text-3xl font-extrabold text-white leading-tight mb-3">
              You've been<br /><span className="text-sky-300">invited!</span>
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed mb-8">
              Set a password to activate your EduPulse account. Your access level has already been configured by your school admin.
            </p>
            <div className="space-y-3">
              {["Your account is pre-configured", "Role-based access applied", "Secure 256-bit SSL"].map((t) => (
                <div key={t} className="flex items-center gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  {t}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-500">&copy; {new Date().getFullYear()} EduPulse Technologies</p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6 py-12 relative overflow-hidden">
        {/* Mobile gradient + decorative blobs — hidden on desktop */}
        <div className="lg:hidden absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#6366f1_0%,_#3b82f6_35%,_#0ea5e9_65%,_#06b6d4_100%)] pointer-events-none" />
        <div className="lg:hidden absolute -top-20 -right-20 w-72 h-72 rounded-full bg-violet-500/40 blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute top-1/3 -left-16 w-56 h-56 rounded-full bg-cyan-400/30 blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute -bottom-16 right-8 w-64 h-64 rounded-full bg-indigo-600/50 blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)" }} />
        {/* Desktop blob */}
        <div className="hidden lg:block absolute top-0 right-0 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative w-full max-w-md">
          {/* Mobile logo */}
          <Link to="/" className="lg:hidden inline-flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center ring-1 ring-white/30">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white drop-shadow">EduPulse</span>
          </Link>

          {!token ? (
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
              <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Invalid invite link</h2>
              <p className="text-slate-500 text-sm mb-5">This link is missing a token. Please use the original link sent to your email.</p>
              <Link to="/login" className="text-blue-600 text-sm font-semibold hover:underline">Go to sign in</Link>
            </div>
          ) : done ? (
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Account activated!</h2>
              <p className="text-slate-500 text-sm">Taking you to your dashboard…</p>
              <div className="mt-5 flex justify-center gap-1.5">
                {[0,1,2].map((i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 xl:p-10">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-5 shadow-md shadow-blue-200">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 mb-1.5">Set your password</h1>
              <p className="text-slate-500 text-sm mb-7">Choose a strong password to activate your account.</p>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">New password</label>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition"
                      required minLength={8}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition"
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-white text-[10px] font-bold">!</span>
                    </div>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-bold text-sm transition shadow-md shadow-blue-200"
                >
                  {loading ? (
                    <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg> Activating…</>
                  ) : <>Activate account <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
