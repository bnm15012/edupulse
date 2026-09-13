import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/public-layout";
import { Mail, Phone, MapPin, MessageCircle, Clock, Send } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
});

const WA_NUMBER = "917326027500";
const WA_DEMO_MSG = encodeURIComponent("Hi, I'd like to know more about EduPulse for my preschool.");
const WA_SUPPORT_MSG = encodeURIComponent("Hi, I need support with EduPulse.");

function ContactPage() {
  const [form, setForm] = useState({ name: "", school: "", phone: "", email: "", message: "" });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Build WhatsApp message from the form
  const waFormMsg = encodeURIComponent(
    `Hi, I'm ${form.name || "interested in EduPulse"}${form.school ? ` from ${form.school}` : ""}.\n\n${form.message || "I'd like to learn more about EduPulse."}`
  );

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="bg-white border-b border-slate-100 py-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-3">Get in touch</h1>
          <p className="text-slate-500 text-lg">
            Have questions? We'd love to hear from you. Reach us on WhatsApp, email, or fill in the form below.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

          {/* ── Left: contact info ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* WhatsApp — primary CTA */}
            <a
              href={`https://wa.me/${WA_NUMBER}?text=${WA_DEMO_MSG}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-4 p-5 rounded-2xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition group"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                {/* WhatsApp SVG */}
                <svg className="w-6 h-6 text-white fill-current" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <div>
                <p className="font-bold text-emerald-800 text-sm">Chat on WhatsApp</p>
                <p className="text-emerald-700 font-semibold text-base">+91 73260 27500</p>
                <p className="text-emerald-600 text-xs mt-0.5">Fastest way to reach us — we reply within minutes</p>
              </div>
            </a>

            {/* Support WhatsApp */}
            <a
              href={`https://wa.me/${WA_NUMBER}?text=${WA_SUPPORT_MSG}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-4 p-5 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition group"
            >
              <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center shrink-0 transition">
                <MessageCircle className="w-5 h-5 text-slate-500 group-hover:text-emerald-600 transition" />
              </div>
              <div>
                <p className="font-bold text-slate-700 text-sm">Support</p>
                <p className="text-slate-600 text-sm">Existing customer? Get help on WhatsApp</p>
              </div>
            </a>

            {/* Email */}
            <a
              href="mailto:bookandmanage@gmail.com"
              className="flex items-start gap-4 p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition group"
            >
              <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition">
                <Mail className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition" />
              </div>
              <div>
                <p className="font-bold text-slate-700 text-sm">Email us</p>
                <p className="text-slate-600 text-sm break-all">bookandmanage@gmail.com</p>
              </div>
            </a>

            {/* Phone */}
            <a
              href="tel:+917326027500"
              className="flex items-start gap-4 p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition group"
            >
              <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition">
                <Phone className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition" />
              </div>
              <div>
                <p className="font-bold text-slate-700 text-sm">Call us</p>
                <p className="text-slate-600 text-sm">+91 73260 27500</p>
              </div>
            </a>

            {/* Location + hours */}
            <div className="flex items-start gap-4 p-5 rounded-2xl bg-white border border-slate-200">
              <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="font-bold text-slate-700 text-sm">Location</p>
                <p className="text-slate-600 text-sm">Bengaluru, Karnataka, India</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-5 rounded-2xl bg-white border border-slate-200">
              <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="font-bold text-slate-700 text-sm">Business hours</p>
                <p className="text-slate-600 text-sm">Mon – Sat, 9 AM – 7 PM IST</p>
                <p className="text-slate-400 text-xs mt-0.5">WhatsApp support outside hours too</p>
              </div>
            </div>
          </div>

          {/* ── Right: message form → sends via WhatsApp ── */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <h2 className="text-xl font-extrabold text-slate-900 mb-1">Send us a message</h2>
              <p className="text-sm text-slate-500 mb-6">
                Fill in the details below. Clicking "Send on WhatsApp" will open a pre-filled chat — no form submission needed.
              </p>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Your name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="Priya Sharma"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">School / Centre name</label>
                    <input
                      type="text"
                      value={form.school}
                      onChange={(e) => set("school", e.target.value)}
                      placeholder="Sunrise Sprouts Academy"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">WhatsApp / phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Email (optional)</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="priya@school.com"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Message</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    rows={4}
                    placeholder="I'd like a demo of EduPulse for my preschool of 40 students…"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm transition resize-none"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  {/* Primary: WhatsApp */}
                  <a
                    href={`https://wa.me/${WA_NUMBER}?text=${waFormMsg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm transition shadow-sm shadow-emerald-200"
                  >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Send on WhatsApp
                  </a>
                  {/* Secondary: Email */}
                  <a
                    href={`mailto:bookandmanage@gmail.com?subject=EduPulse Enquiry${form.name ? ` from ${form.name}` : ""}&body=${encodeURIComponent(`Name: ${form.name}\nSchool: ${form.school}\nPhone: ${form.phone}\nEmail: ${form.email}\n\n${form.message}`)}`}
                    className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm transition"
                  >
                    <Send className="w-4 h-4" />
                    Send by Email
                  </a>
                </div>

                <p className="text-xs text-slate-400 text-center">
                  We typically respond within 2 hours during business hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
