import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { signup } from "@/lib/auth";
import { GraduationCap, CheckCircle2, Eye, EyeOff, ArrowRight, Building2, User, Lock, ShieldCheck, Mail } from "lucide-react";

export const Route = createFileRoute("/signup")({
  component: Signup,
});

const STEPS = ["School details", "Admin account", "Done"];

const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Puducherry",
];

const FEATURES = [
  { icon: Building2, title: "School & location setup", desc: "One account for multiple branches" },
  { icon: User, title: "Role-based team access", desc: "Admins, teachers, accountants" },
  { icon: Lock, title: "Secure & compliant", desc: "256-bit SSL, DPDP Act ready" },
  { icon: ShieldCheck, title: "Free forever plan", desc: "No credit card needed to start" },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-5 sm:mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i < current
                  ? "bg-blue-600 text-white"
                  : i === current
                  ? "bg-blue-600 text-white ring-4 ring-blue-100"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {i < current ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <div className={`text-[10px] sm:text-xs mt-1.5 font-medium text-center sm:whitespace-nowrap ${i <= current ? "text-blue-700" : "text-slate-400"}`}>
              {label}
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-10 h-0.5 mx-1 mb-2 sm:w-16 sm:mb-4 transition-all ${i < current ? "bg-blue-600" : "bg-slate-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

const inputCls = "w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition placeholder:text-slate-400";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";

function Signup() {
  const navigate = useNavigate();
  const signupFn = useServerFn(signup);

  const [step, setStep] = useState(0);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [schoolPhone, setSchoolPhone] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [schoolCity, setSchoolCity] = useState("");
  const [schoolState, setSchoolState] = useState("");
  const [schoolPincode, setSchoolPincode] = useState("");
  const [schoolCountry] = useState("India");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const step1Valid =
    schoolName.trim().length >= 2 &&
    schoolEmail.trim().length > 0 &&
    schoolPhone.trim().length > 0 &&
    schoolAddress.trim().length > 0 &&
    schoolCity.trim().length > 0 &&
    schoolState.trim().length > 0 &&
    schoolPincode.trim().length > 0;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 0 && step1Valid) setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = (await signupFn({
        data: { schoolName, schoolEmail, schoolPhone, schoolAddress, schoolCity, schoolState, schoolPincode, schoolCountry, fullName, email, password },
      })) as { confirmed: boolean; token: string | null };
      if (res.confirmed && res.token) {
        // Dev: auto-login and redirect
        const maxAge = 30 * 24 * 60 * 60;
        document.cookie = `bb_session=${res.token}; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
        setStep(2);
        setTimeout(() => navigate({ to: "/dashboard" }), 1800);
      } else {
        // Production: show "check your email" screen
        setNeedsEmailConfirm(true);
        setStep(2);
      }
    } catch (err: any) {
      setError(err?.message ?? "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left: Photo panel ── */}
      <div className="hidden lg:flex lg:w-[42%] xl:w-[45%] relative overflow-hidden shrink-0">
        <img
          src="https://images.unsplash.com/photo-1485546246426-74dc88dec4d9?w=1200&auto=format&fit=crop&q=80"
          alt="Teacher with children"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-900/65 to-blue-950/75" />
        <div className="absolute inset-0 bg-blue-900/15" />

        <div className="relative z-10 flex flex-col h-full p-10 xl:p-12">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-white leading-tight">EduPulse</div>

            </div>
          </Link>

          {/* Copy */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-medium text-blue-200 mb-5 w-fit">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Free forever plan · No credit card
            </div>
            <h2 className="text-3xl xl:text-4xl font-extrabold text-white leading-tight mb-3">
              Start managing<br />
              <span className="text-sky-300">your school smarter</span>
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed mb-8">
              Join preschools across India already running on EduPulse. Setup takes under 5 minutes.
            </p>

            {/* Feature list */}
            <div className="space-y-4">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-600/30 border border-blue-500/30 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-blue-300" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white leading-tight">{title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-500">&copy; {new Date().getFullYear()} EduPulse Technologies</div>
        </div>
      </div>

      {/* ── Right: Form panel ── */}
      <div className={`flex-1 flex ${step === 2 && needsEmailConfirm ? "items-center" : "items-start"} justify-center bg-slate-50 px-4 py-6 sm:px-6 sm:py-10 overflow-y-auto relative`}>
        {/* Mobile gradient + decorative blobs — hidden on desktop */}
        <div className="lg:hidden absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#6366f1_0%,_#3b82f6_35%,_#0ea5e9_65%,_#06b6d4_100%)] pointer-events-none" />
        <div className="lg:hidden absolute -top-20 -right-20 w-72 h-72 rounded-full bg-violet-500/40 blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute top-1/3 -left-16 w-56 h-56 rounded-full bg-cyan-400/30 blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute bottom-0 right-8 w-64 h-64 rounded-full bg-indigo-600/50 blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)" }} />
        {/* Desktop blobs */}
        <div className="hidden lg:block absolute top-0 right-0 w-72 h-72 bg-blue-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="hidden lg:block absolute bottom-0 left-0 w-52 h-52 bg-indigo-100 rounded-full blur-3xl opacity-40 translate-y-1/2 -translate-x-1/2 pointer-events-none" />



        <div className="relative w-full max-w-xl py-2">
          {/* Mobile logo */}
          <Link to="/" className="lg:hidden inline-flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center ring-1 ring-white/30">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white drop-shadow">EduPulse</span>
          </Link>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 p-5 sm:p-8">

            {step < 2 && (
              <div className="mb-7">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200 shrink-0">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="text-2xl font-extrabold text-slate-900">Create your account</h1>
                </div>
                <p className="text-slate-500 text-sm">
                  Already have an account?{" "}
                  <Link to="/login" className="text-blue-600 font-semibold hover:underline">Sign in</Link>
                </p>
              </div>
            )}

            {step < 2 && <StepIndicator current={step} />}

            {/* ── Step 1: School details ── */}
            {step === 0 && (
              <form onSubmit={handleNext} className="space-y-5">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-100 mb-1">
                  <div className="w-6 h-6 bg-blue-100 rounded-md flex items-center justify-center">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">School information</span>
                </div>

                <div>
                  <label className={labelCls}>School name</label>
                  <input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Sunshine Preschool" className={inputCls} required />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>School contact email</label>
                    <input type="email" value={schoolEmail} onChange={(e) => setSchoolEmail(e.target.value)} placeholder="info@yourschool.com" className={inputCls} required />
                  </div>
                  <div>
                    <label className={labelCls}>Phone number</label>
                    <input type="tel" value={schoolPhone} onChange={(e) => setSchoolPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} required />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Address</label>
                  <textarea
                    value={schoolAddress}
                    onChange={(e) => setSchoolAddress(e.target.value)}
                    placeholder="Street address, area"
                    className={`${inputCls} resize-none`}
                    rows={2}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>City</label>
                    <input value={schoolCity} onChange={(e) => setSchoolCity(e.target.value)} placeholder="Mumbai" className={inputCls} required />
                  </div>
                  <div>
                    <label className={labelCls}>State</label>
                    <select value={schoolState} onChange={(e) => setSchoolState(e.target.value)} className={inputCls} required>
                      <option value="">Select state</option>
                      {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Pincode</label>
                    <input value={schoolPincode} onChange={(e) => setSchoolPincode(e.target.value)} placeholder="400001" className={inputCls} required />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!step1Valid}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:text-slate-400 text-white rounded-xl font-bold text-sm transition shadow-md shadow-blue-100"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* ── Step 2: Admin account ── */}
            {step === 1 && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="flex items-center gap-2 pb-1 border-b border-slate-100 mb-1">
                  <div className="w-6 h-6 bg-blue-100 rounded-md flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Admin account</span>
                </div>

                <div>
                  <label className={labelCls}>Full name</label>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Priya Sharma" className={inputCls} required />
                </div>

                <div>
                  <label className={labelCls}>Work email address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.com" className={inputCls} required />
                </div>

                <div>
                  <label className={labelCls}>Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className={`${inputCls} pr-12`}
                      required
                      minLength={8}
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
                  <p className="text-xs text-slate-400 mt-1.5">Use at least 8 characters with a mix of letters and numbers.</p>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-white text-[10px] font-bold">!</span>
                    </div>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="flex-1 py-3.5 border-2 border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl font-semibold text-sm transition"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-bold text-sm transition shadow-md shadow-blue-100"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Creating…
                      </>
                    ) : (
                      <>Create account <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>

                <p className="text-xs text-center text-slate-400 pt-1">
                  By creating an account you agree to our{" "}
                  <Link to="/terms-of-service" className="underline hover:text-slate-600">Terms</Link>{" "}
                  and{" "}
                  <Link to="/privacy-policy" className="underline hover:text-slate-600">Privacy Policy</Link>.
                </p>
              </form>
            )}

            {/* ── Step 3: Success ── */}
            {step === 2 && !needsEmailConfirm && (
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 mb-2">You're all set!</h2>
                <p className="text-slate-500 text-sm mb-1">Your school account has been created successfully.</p>
                <p className="text-slate-400 text-sm">Taking you to your dashboard…</p>
                <div className="mt-6 flex items-center justify-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 3: Email confirmation required (production) ── */}
            {step === 2 && needsEmailConfirm && (
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <Mail className="w-10 h-10 text-blue-600" />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Check your email</h2>
                <p className="text-slate-500 text-sm mb-1">
                  We've sent a confirmation link to <span className="font-semibold text-slate-700">{email}</span>.
                </p>
                <p className="text-slate-400 text-sm">Click the link in the email to activate your account. It expires in 24 hours.</p>
                <p className="text-slate-400 text-xs mt-4">Didn't receive it? Check your spam folder.</p>
              </div>
            )}
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center flex-wrap gap-3 sm:gap-5 mt-5">
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
