import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { login } from "@/lib/auth";
import { roleHome } from "./__root";
import { useTenant } from "@/lib/tenant";
import { Eye, EyeOff, ArrowRight, ShieldCheck, Star } from "lucide-react";
import { EduPulseLogo } from "@/components/edupulse-logo";

export const Route = createFileRoute("/login")({
  component: Login,
});

const TESTIMONIAL = {
  quote: "EduPulse transformed how we manage admissions and fees. Our staff saves hours every week.",
  name: "Priya Sharma",
  role: "Director, Sunshine Preschool, Pune",
  initials: "PS",
};

function Login() {
  const navigate = useNavigate();
  const loginFn = useServerFn(login);
  const { setTenant } = useTenant();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = (await loginFn({ data: { email, password } })) as {
        token?: string;
        schoolId?: number; locationId?: number;
        schoolName?: string; locationName?: string;
        role?: string;
      };
      if (res.token) {
        const maxAge = 30 * 24 * 60 * 60;
        document.cookie = `bb_session=${res.token}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
      }
      // Hydrate tenant context from login response directly (no extra server call needed)
      if (res.schoolId && res.locationId) {
        setTenant({
          schoolId: res.schoolId,
          locationId: res.locationId,
          schoolName: res.schoolName ?? "School",
          locationName: res.locationName ?? "Main Branch",
        });
      }
      // Navigate to the correct page for this role
      navigate({ to: roleHome(res.role) as any });
    } catch (err: any) {
      setError(err?.message ?? "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left: Photo panel ── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative overflow-hidden">
        {/* Photo */}
        <img
          src="https://images.unsplash.com/photo-1544776193-352d25ca82cd?w=1200&auto=format&fit=crop&q=80"
          alt="Happy children in preschool"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        {/* Dark gradient overlay — heavier at bottom */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-blue-950/70" />
        {/* Subtle blue tint */}
        <div className="absolute inset-0 bg-blue-900/20" />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <EduPulseLogo size="md" />
            <div>
              <div className="text-lg font-bold text-white leading-tight">EduPulse</div>

            </div>
          </Link>

          {/* Main copy — centered vertically */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-medium text-blue-200 mb-6 w-fit">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-300" />
              Trusted by 500+ Indian preschools
            </div>
            <h2 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-4">
              Welcome back<br />
              <span className="text-sky-300">to your school hub</span>
            </h2>
            <p className="text-slate-300 text-base leading-relaxed mb-10">
              Everything you need — admissions, fees, attendance, staff — all in one place.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mb-10">
              {["Admissions pipeline", "Fee invoicing", "Attendance", "Staff management", "Analytics"].map((f) => (
                <span key={f} className="text-xs bg-white/10 border border-white/15 text-white/80 px-3 py-1.5 rounded-full backdrop-blur-sm">
                  {f}
                </span>
              ))}
            </div>

            {/* Testimonial card */}
            <div className="bg-white/10 border border-white/15 backdrop-blur-md rounded-2xl p-5">
              <div className="flex gap-0.5 mb-3">
                {[1,2,3,4,5].map((i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-white/90 text-sm leading-relaxed mb-4 italic">"{TESTIMONIAL.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {TESTIMONIAL.initials}
                </div>
                <div>
                  <div className="text-white text-xs font-semibold">{TESTIMONIAL.name}</div>
                  <div className="text-blue-300 text-[11px]">{TESTIMONIAL.role}</div>
                </div>
              </div>
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
        {/* Subtle grid pattern overlay — mobile only */}
        <div className="lg:hidden absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)" }} />

        {/* Desktop blobs */}
        <div className="hidden lg:block absolute top-0 right-0 w-64 h-64 bg-blue-100 rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="hidden lg:block absolute bottom-0 left-0 w-48 h-48 bg-indigo-100 rounded-full blur-3xl opacity-50 translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <div className="relative w-full max-w-md">
          {/* Mobile logo — top of card area */}
          <Link to="/" className="lg:hidden inline-flex items-center gap-2.5 mb-8">
            <EduPulseLogo size="md" />
            <span className="text-lg font-bold text-white drop-shadow">EduPulse</span>
          </Link>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 xl:p-10">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <EduPulseLogo size="lg" />
                <h1 className="text-2xl font-extrabold text-slate-900">Sign in</h1>
              </div>
              <p className="text-slate-500 text-sm">
                Don't have an account?{" "}
                <Link to="/signup" className="text-blue-600 font-semibold hover:underline">
                  Get started free
                </Link>
              </p>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Work email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition placeholder:text-slate-400"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Password</label>
                  <Link to="/forgot-password" className="text-xs text-blue-600 hover:underline font-medium">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition placeholder:text-slate-400"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
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
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-bold text-sm transition shadow-md shadow-blue-200 mt-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Signing in…
                  </>
                ) : (
                  <>Sign in <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <p className="text-xs text-center text-slate-400">
                By signing in you agree to our{" "}
                <Link to="/terms-of-service" className="underline hover:text-slate-600">Terms</Link>{" "}
                and{" "}
                <Link to="/privacy-policy" className="underline hover:text-slate-600">Privacy Policy</Link>.
              </p>
            </div>
          </div>

          {/* Trust badges below card */}
          <div className="flex items-center justify-center gap-5 mt-6">
            {[
              { icon: ShieldCheck, label: "256-bit SSL" },
              { icon: ShieldCheck, label: "DPDP Act ready" },
              { icon: ShieldCheck, label: "Indian data servers" },
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
