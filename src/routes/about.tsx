import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, Heart, Users, Globe, Check } from "lucide-react";
import { PublicLayout } from "@/components/public-layout";

const values = [
  { icon: Heart, title: "Child-first", text: "Every feature is designed around what is best for children and their families." },
  { icon: Users, title: "Team-friendly", text: "Admins, teachers, and staff can collaborate without stepping on each other." },
  { icon: Globe, title: "Built for India", text: "GST-aligned fee structures, Razorpay, and multi-branch support out of the box." },
];

const highlights = [
  "Admissions to graduation, all in one place",
  "Fee collection with Razorpay integration",
  "Role-based access for every team member",
  "Multi-school and multi-location ready",
];

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <PublicLayout>
      <section className="bg-white max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <GraduationCap className="w-4 h-4" /> About EduPulse
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6 max-w-3xl mx-auto">
            We build tools for the people shaping young minds
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            EduPulse is a modern ERP designed for preschools, nurseries, and early learning centres. We believe school administration should be simple, secure, and focused on children.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <img
              src="https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=80"
              alt="Preschool classroom with books and an apple"
              className="rounded-3xl w-full h-96 object-cover shadow-lg"
              loading="lazy"
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Our mission</h2>
            <p className="text-slate-600 leading-relaxed mb-6">
              Early education is one of the most important stages in a child&apos;s life. Yet too many preschools are still running on spreadsheets, paper records and disconnected tools. EduPulse brings admissions, fees, attendance, staff, classes, and parent communication into one platform.
            </p>
            <ul className="space-y-3 mb-8">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-700">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/signup" className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-medium transition">
              Get started
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20">
          {values.map((value) => (
            <div key={value.title} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <value.icon className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">{value.title}</h3>
              <p className="text-sm text-slate-600">{value.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <img
            src="https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80"
            alt="Children learning together"
            className="rounded-2xl w-full h-64 object-cover"
            loading="lazy"
          />
          <img
            src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80"
            alt="Students in a classroom"
            className="rounded-2xl w-full h-64 object-cover"
            loading="lazy"
          />
        </div>
      </section>
    </PublicLayout>
  );
}
