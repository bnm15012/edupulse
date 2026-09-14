import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users, DollarSign, Building2, Shield, Calendar,
  GraduationCap, ClipboardList, Bell, BarChart3,
  ArrowRight, Star, CheckCircle2, Zap, MessageCircle,
} from "lucide-react";
import { PublicLayout } from "@/components/public-layout";
import { InstallAppButton } from "@/components/install-app-button";
import { EduPulseLogo } from "@/components/edupulse-logo";

export const Route = createFileRoute("/")({
  component: Home,
});

const WA_LINK =
  "https://wa.me/917326027500?text=Hi%2C%20I%27d%20like%20to%20book%20a%20demo%20of%20EduPulse%20for%20my%20preschool.";

const WA_ICON = (
  <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const features = [
  {
    icon: ClipboardList,
    label: "Admissions & Enrollment",
    description: "Capture inquiries, schedule tours, and move children through your pipeline.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: DollarSign,
    label: "Fee Management",
    description: "Invoices, Razorpay payments, due tracking — all in one place.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: Users,
    label: "Student Profiles",
    description: "Complete records — medical, guardian contacts, and documents.",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: Calendar,
    label: "Attendance & Scheduling",
    description: "Daily attendance, leaves, and class timetables with ease.",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: Building2,
    label: "Multi-School Support",
    description: "Manage multiple schools and branches from a single account.",
    color: "bg-rose-50 text-rose-600",
  },
  {
    icon: Shield,
    label: "Role-Based Access",
    description: "Granular permissions for admins, teachers, accountants, and parents.",
    color: "bg-cyan-50 text-cyan-600",
  },
  {
    icon: Bell,
    label: "Parent Communication",
    description: "Automated fee reminders and enrollment status updates.",
    color: "bg-orange-50 text-orange-600",
  },
  {
    icon: BarChart3,
    label: "Reports & Analytics",
    description: "Real-time dashboard insights on enrollment, revenue, and attendance.",
    color: "bg-indigo-50 text-indigo-600",
  },
];

const steps = [
  {
    step: "01",
    title: "Sign up your school",
    description: "Create your account in minutes. Add school details, branches, and your first admin user.",
    img: "https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=600&q=80",
  },
  {
    step: "02",
    title: "Configure your setup",
    description: "Set up fee structures, class schedules, and invite your team with the right roles.",
    img: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=600&q=80",
  },
  {
    step: "03",
    title: "Start managing",
    description: "Track admissions, collect fees, mark attendance, and get real-time insights from day one.",
    img: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=600&q=80",
  },
];

const testimonials = [
  {
    quote: "EduPulse transformed how we manage our three branches. Fee collection alone saves us 20 hours a month.",
    name: "Priya Sharma",
    title: "Principal, Little Scholars Preschool, Pune",
    initials: "PS",
    color: "bg-blue-600",
  },
  {
    quote: "The admissions pipeline is exactly what we needed. We never lose track of a single inquiry now.",
    name: "Rahul Mehta",
    title: "Director, Sunflower Daycare, Mumbai",
    initials: "RM",
    color: "bg-emerald-600",
  },
  {
    quote: "Parent communication and fee tracking in one place — our staff loves it. Setup was incredibly simple.",
    name: "Anita Nair",
    title: "Admin Manager, Rainbow Kids, Bengaluru",
    initials: "AN",
    color: "bg-violet-600",
  },
];





function Home() {
  return (
    <PublicLayout>

      {/* ════════════════════════════════════════
          HERO  — full-bleed photo with dark overlay + gradient
          ════════════════════════════════════════ */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        {/* Background photo */}
        <img
          src="https://images.unsplash.com/photo-1576495199011-eb94736d05d6?auto=format&fit=crop&w=1800&q=85"
          alt="Preschool children learning together"
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="eager"
        />
        {/* Dark overlay — stronger so both columns are readable */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/70 to-slate-800/50" />
        {/* Subtle indigo brand wash */}
        <div className="absolute inset-0 bg-indigo-950/20" />

        <div className="relative z-10 w-full px-8 xl:px-16 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* ── Left: copy ── */}
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-medium text-white mb-8">
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                Built for Indian schools & daycares
              </div>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.08] tracking-tight text-white mb-6">
                Run your<br />
                school.<br />
                <span className="text-sky-300">Not your<br />spreadsheets.</span>
              </h1>
              <p className="text-xl text-slate-300 leading-relaxed mb-10 max-w-lg">
                EduPulse is the all-in-one ERP platform for admissions, fees, attendance, staff, and parent communication — so you can focus on the children.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={WA_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2.5 bg-emerald-500 hover:bg-emerald-400 text-white px-8 py-4 rounded-xl font-bold text-base transition shadow-xl"
                >
                  {WA_ICON}
                  Book a Demo on WhatsApp
                </a>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 border border-white/30 hover:border-white/60 hover:bg-white/10 text-white px-8 py-4 rounded-xl font-semibold text-base transition backdrop-blur-sm"
                >
                  Sign in
                </Link>
              </div>
              <p className="text-sm text-slate-400 mt-5">No credit card needed · Setup in under 5 minutes</p>
            </div>

            {/* ── Right: floating dashboard mockup ── */}
            <div className="hidden lg:flex justify-center xl:justify-end">
              <div className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
                {/* Fake browser chrome */}
                <div className="flex items-center gap-1.5 px-4 py-3 bg-white/10 border-b border-white/10">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                  <span className="ml-3 flex-1 bg-white/10 rounded-md h-5 text-xs text-white/40 flex items-center px-2">app.edupulse.in/dashboard</span>
                </div>
                {/* Mock dashboard content */}
                <div className="p-7 space-y-5">
                  {/* Stat cards row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Students", value: "142", color: "bg-blue-500/20 text-blue-200" },
                      { label: "Fee collected", value: "₹2.1L", color: "bg-emerald-500/20 text-emerald-200" },
                      { label: "Attendance", value: "94%", color: "bg-violet-500/20 text-violet-200" },
                    ].map((s) => (
                      <div key={s.label} className={`${s.color} rounded-xl p-4`}>
                        <p className="text-sm opacity-70 mb-1.5">{s.label}</p>
                        <p className="text-2xl font-extrabold">{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* Recent admissions list */}
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-4">Recent admissions</p>
                    <div className="space-y-3">
                      {[
                        { name: "Aarav Sharma", class: "Nursery A", status: "Enrolled", color: "bg-emerald-400" },
                        { name: "Priya Mehta", class: "Jr. KG", status: "Applied", color: "bg-amber-400" },
                        { name: "Rohan Nair", class: "Playgroup", status: "Waitlisted", color: "bg-slate-400" },
                      ].map((r) => (
                        <div key={r.name} className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl ${r.color} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                            {r.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{r.name}</p>
                            <p className="text-xs text-white/50">{r.class}</p>
                          </div>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/70">{r.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Fee bar */}
                  <div className="bg-white/10 rounded-xl p-4">
                    <div className="flex justify-between text-sm text-white/60 mb-2.5">
                      <span>Fee collection — September</span>
                      <span className="font-bold text-white">78%</span>
                    </div>
                    <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-2.5 bg-emerald-400 rounded-full" style={{ width: "78%" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full block">
            <path d="M0 70L80 58C160 46 320 22 480 16C640 10 800 22 960 32C1120 42 1280 50 1360 54L1440 58V70H0Z" fill="white" />
          </svg>
        </div>
      </section>


      {/* ════════════════════════════════════════
          SOCIAL PROOF STRIP
          ════════════════════════════════════════ */}
      <section className="bg-white border-b border-slate-100 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm text-slate-400 font-medium uppercase tracking-widest mb-6">
            Trusted by preschool leaders across India
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-60 grayscale">
            {/* Placeholder brand logos as text marks — replace with real logos when available */}
            {["Little Scholars", "Sunflower Daycare", "Rainbow Kids", "Bright Minds", "Tiny Tots Academy"].map((name) => (
              <span key={name} className="text-slate-600 font-bold text-sm tracking-tight">{name}</span>
            ))}
          </div>
        </div>
      </section>


      {/* ════════════════════════════════════════
          FEATURES GRID
          ════════════════════════════════════════ */}
      <section id="features" className="bg-slate-50 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              Everything in one place
            </span>
            <h2 className="text-4xl font-extrabold text-slate-900 mt-4 mb-4">
              Every tool your school needs
            </h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">
              From the first parent inquiry to fee collection and beyond — EduPulse covers every touchpoint.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f) => (
              <div
                key={f.label}
                className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5 transition-all duration-200 group cursor-default"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-2 group-hover:text-blue-700 transition">{f.label}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ════════════════════════════════════════
          HOW IT WORKS — photo cards per step
          ════════════════════════════════════════ */}
      <section className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Simple setup</span>
            <h2 className="text-4xl font-extrabold text-slate-900 mt-4 mb-4">Up and running in minutes</h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">
              No lengthy onboarding. No IT team required. EduPulse is designed to work from day one.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.step} className="group">
                {/* Photo card */}
                <div className="relative rounded-2xl overflow-hidden mb-6 shadow-md">
                  <img
                    src={s.img}
                    alt={s.title}
                    className="w-full h-52 object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <span className="text-4xl font-black text-white/30 leading-none">{s.step}</span>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>


        </div>
      </section>


      {/* ════════════════════════════════════════
          FEATURE DEEP-DIVE — alternating photo + text rows
          ════════════════════════════════════════ */}

      {/* Row 1 – Admissions */}
      <section className="bg-slate-50 py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Admissions</span>
              <h2 className="text-3xl font-extrabold text-slate-900 mt-4 mb-4">
                Never lose track of an inquiry again
              </h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                Every parent inquiry flows into a visual pipeline — from first contact to tour, application, and enrollment. Your team always knows what to do next.
              </p>
              <ul className="space-y-3">
                {["Online inquiry capture form", "Tour scheduling & reminders", "Status tracking across the pipeline", "Waitlist management", "Conversion analytics"].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-blue-100 rounded-[2.5rem] blur-3xl opacity-50" />
              <img
                src="https://images.unsplash.com/photo-1544776193-352d25ca82cd?auto=format&fit=crop&w=800&q=80"
                alt="Teacher welcoming a child"
                className="relative rounded-3xl shadow-2xl w-full h-[400px] object-cover"
                loading="lazy"
              />
              {/* Floating badge */}
              <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-xl px-5 py-4 flex items-center gap-3 border border-slate-100">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">3 new inquiries</div>
                  <div className="text-xs text-slate-500">today</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Row 2 – Fee Management */}
      <section className="bg-white py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div className="order-2 lg:order-1 relative">
              <div className="absolute -inset-4 bg-emerald-100 rounded-[2.5rem] blur-3xl opacity-50" />
              <img
                src="https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=80"
                alt="Fee management and payments"
                className="relative rounded-3xl shadow-2xl w-full h-[400px] object-cover"
                loading="lazy"
              />
              {/* Floating badge */}
              <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-xl px-5 py-4 flex items-center gap-3 border border-slate-100">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">₹1,20,000</div>
                  <div className="text-xs text-slate-500">collected this week</div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Fee Management</span>
              <h2 className="text-3xl font-extrabold text-slate-900 mt-4 mb-4">
                Get paid on time, every time
              </h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                Create flexible fee structures, generate invoices with one click, and collect payments online via Razorpay. Automated reminders handle the follow-up for you.
              </p>
              <ul className="space-y-3">
                {["Custom fee structures per class", "One-click invoice generation", "Razorpay online collection", "Automated overdue reminders", "Payment receipt & history"].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Row 3 – Attendance photo collage */}
      <section className="bg-slate-50 py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-3 py-1 rounded-full">Attendance & Classes</span>
              <h2 className="text-3xl font-extrabold text-slate-900 mt-4 mb-4">
                Attendance in seconds, not minutes
              </h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                Mark daily student and staff attendance from any device. Manage leave requests, class timetables, and room allocation — all connected to your student records.
              </p>
              <ul className="space-y-3">
                {["One-tap daily attendance marking", "Staff leave & absence tracking", "Class & room scheduling", "Academic year management", "Attendance reports by student or class"].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Photo collage grid */}
            <div className="grid grid-cols-2 gap-4">
              <img
                src="https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=500&q=80"
                alt="Children in class"
                className="rounded-2xl h-52 w-full object-cover shadow-md"
                loading="lazy"
              />
              <img
                src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=500&q=80"
                alt="Teacher with students"
                className="rounded-2xl h-52 w-full object-cover shadow-md mt-6"
                loading="lazy"
              />
              <img
                src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=500&q=80"
                alt="Kids learning"
                className="rounded-2xl h-44 w-full object-cover shadow-md -mt-6"
                loading="lazy"
              />
              <img
                src="https://images.unsplash.com/photo-1546410531-bb4caa6b424d?auto=format&fit=crop&w=500&q=80"
                alt="Preschool activity"
                className="rounded-2xl h-44 w-full object-cover shadow-md"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>


      {/* ════════════════════════════════════════
          TESTIMONIALS — photo background
          ════════════════════════════════════════ */}
      <section className="relative py-28 overflow-hidden">
        {/* Background image */}
        <img
          src="https://images.unsplash.com/photo-1571260899304-425eee4c7efc?auto=format&fit=crop&w=1800&q=80"
          alt="Preschool environment"
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="lazy"
        />
        {/* Dark slate overlay instead of heavy blue */}
        <div className="absolute inset-0 bg-slate-950/80" />

        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="flex items-center justify-center gap-1 mb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              ))}
            </div>
            <h2 className="text-3xl font-extrabold text-white mb-2">What school leaders are saying</h2>
            <p className="text-slate-400 text-base">Real feedback from real principals, directors, and admins.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-7 hover:bg-white/10 transition flex flex-col">
                <div className="flex items-center gap-1 mb-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-200 text-sm leading-relaxed mb-6 italic flex-1">"{t.quote}"</p>
                <div className="flex items-center gap-3 pt-4 border-t border-white/10">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white ${t.color}`}>
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className="text-xs text-slate-400">{t.title}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ════════════════════════════════════════
          GET A QUOTE
          ════════════════════════════════════════ */}
      <section className="bg-slate-50 py-24">
        <div className="max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-5">Pricing</span>
            <h2 className="text-4xl xl:text-5xl font-extrabold text-slate-900 leading-tight mb-4">
              Pricing that fits <span className="text-blue-600">your school size</span>
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto leading-relaxed">
              Every school is different. Talk to us and we'll put together a plan that makes sense for you — no generic tiers, no surprises.
            </p>
          </div>

          {/* 3 highlight cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
            {[
              {
                icon: Users,
                color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100",
                title: "Free forever plan",
                desc: "Start with 1 branch and up to 50 students — completely free, no card needed.",
              },
              {
                icon: Building2,
                color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100",
                title: "Multi-branch schools",
                desc: "Running 2+ branches? We'll tailor pricing to your exact setup.",
                featured: true,
              },
              {
                icon: MessageCircle,
                color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100",
                title: "Talk to us directly",
                desc: "No sales funnel. Chat with us on WhatsApp and get a quote in minutes.",
              },
            ].map(({ icon: Icon, color, bg, border, title, desc, featured }) => (
              <div
                key={title}
                className={`relative rounded-2xl border p-7 flex flex-col gap-4 transition bg-white ${
                  featured
                    ? "border-blue-200 shadow-md shadow-blue-100/50 ring-1 ring-blue-100"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                {featured && (
                  <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1">Popular</span>
                )}
                <div className={`w-11 h-11 rounded-xl ${bg} border ${border} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <div className="text-slate-900 font-bold text-base mb-1">{title}</div>
                  <div className="text-slate-500 text-sm leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Checklist + CTAs */}
          <div className="bg-white border border-slate-200 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-8">
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                "Free plan to get started",
                "Flexible pricing as you grow",
                "No hidden fees, no lock-in",
                "Custom quotes for chains & franchises",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold text-sm transition shadow-sm"
              >
                {WA_ICON}
                Chat on WhatsApp
              </a>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-semibold text-sm transition"
              >
                View plan details
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>


      {/* ════════════════════════════════════════
          MOBILE APP DOWNLOAD
          ════════════════════════════════════════ */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-700 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-4">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Take EduPulse with you
            </h2>
            <InstallAppButton className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-3 rounded-xl font-bold text-base transition shadow-lg" />
          </div>
          <p className="text-slate-300 text-lg mb-10 max-w-2xl mx-auto">
            Install the app on your phone and manage fees, attendance, and parent communication from anywhere.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            {[
              { icon: Bell, title: "Instant alerts", desc: "Get notified for fee dues, announcements, and attendance." },
              { icon: Calendar, title: "On-the-go access", desc: "View timetables, mark attendance, and check schedules." },
              { icon: Users, title: "Stay connected", desc: "Parents and teachers can communicate in real time." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/10 border border-white/20 rounded-2xl p-6">
                <Icon className="w-6 h-6 text-white mb-3" />
                <div className="text-white font-bold text-base mb-1">{title}</div>
                <div className="text-slate-300 text-sm">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ════════════════════════════════════════
          FINAL CTA — full-bleed photo
          ════════════════════════════════════════ */}
      <section className="relative py-28 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1800&q=80"
          alt="Bright preschool classroom"
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 to-slate-900/90" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          <div className="flex justify-center mb-6">
            <EduPulseLogo size="lg" />
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-5 leading-tight sm:whitespace-nowrap">
            Ready to transform your school?
          </h2>
          <p className="text-slate-300 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            See EduPulse in action — book a personalised demo and we'll walk you through everything your school needs.
          </p>
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2.5 bg-emerald-500 hover:bg-emerald-400 text-white px-10 py-4 rounded-xl font-bold text-base transition shadow-xl"
          >
            {WA_ICON}
            Book a Demo on WhatsApp
          </a>
          <p className="text-slate-400 text-sm mt-6">
            Chat with us directly · No forms · No waiting
          </p>
        </div>
      </section>

    </PublicLayout>
  );
}
