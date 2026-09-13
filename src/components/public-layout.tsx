import { Link } from "@tanstack/react-router";
import { Facebook, Twitter, Linkedin, Mail, Phone, MapPin, Menu, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { InstallAppButton } from "@/components/install-app-button";

export function PublicLayout({
  children,
  showNav = true,
  showFooter = true,
}: {
  children: ReactNode;
  showNav?: boolean;
  showFooter?: boolean;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {showNav && (
        <nav className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
          <div className="w-full h-16 flex items-center px-5 md:px-8 xl:px-16">
            {/* Logo — left */}
            <Link to="/" className="flex items-center gap-2.5 text-xl font-bold text-slate-900 shrink-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-600 shrink-0">
                <svg viewBox="0 0 64 64" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <polygon points="32,13 52,23 32,33 12,23" fill="white" opacity="0.95"/>
                  <rect x="48" y="23" width="2.5" height="11" rx="1.25" fill="white" opacity="0.8"/>
                  <circle cx="49.25" cy="35.5" r="2.5" fill="white" opacity="0.8"/>
                  <polyline points="12,44 20,44 24,38 28,51 32,41 36,44 52,44" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span>EduPulse</span>
            </Link>

            {/* Nav links — centered, desktop only */}
            <div className="hidden md:flex items-center gap-8 flex-1 justify-center">
              <Link to="/" className="text-sm text-slate-600 hover:text-blue-600 transition font-medium [&.active]:text-blue-600 [&.active]:font-semibold">
                Home
              </Link>
              <Link to="/about" className="text-sm text-slate-600 hover:text-blue-600 transition font-medium [&.active]:text-blue-600 [&.active]:font-semibold">
                About
              </Link>
              <Link to="/pricing" className="text-sm text-slate-600 hover:text-blue-600 transition font-medium [&.active]:text-blue-600 [&.active]:font-semibold">
                Pricing
              </Link>
              <Link to="/contact" className="text-sm text-slate-600 hover:text-blue-600 transition font-medium [&.active]:text-blue-600 [&.active]:font-semibold">
                Contact Us
              </Link>
            </div>

            {/* CTA — right (desktop) */}
            <div className="hidden md:flex items-center gap-3 ml-auto">
              <a
                href="https://wa.me/917326027500?text=Hi%2C%20I%27d%20like%20to%20book%20a%20demo%20of%20EduPulse%20for%20my%20preschool."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 font-semibold px-4 py-2 rounded-lg transition"
              >
                <svg className="w-4 h-4 text-emerald-600 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Book a Demo
              </a>
              <Link
                to="/login"
                className="text-sm text-slate-700 hover:text-blue-600 font-medium px-4 py-2 rounded-lg hover:bg-slate-50 transition"
              >
                Sign in
              </Link>
            </div>

            {/* Mobile: Install icon + Sign in link + hamburger */}
            <div className="flex items-center gap-2 ml-auto md:hidden">
              <InstallAppButton
                iconOnly
                className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition"
              />
              <Link
                to="/login"
                className="text-sm text-slate-700 font-medium px-3 py-1.5 rounded-lg hover:bg-slate-50 transition"
              >
                Sign in
              </Link>
              <button
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile dropdown menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-slate-100 bg-white px-5 py-4 space-y-1">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition [&.active]:text-blue-600 [&.active]:bg-blue-50"
              >
                Home
              </Link>
              <Link
                to="/about"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition [&.active]:text-blue-600 [&.active]:bg-blue-50"
              >
                About
              </Link>
              <Link
                to="/pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition [&.active]:text-blue-600 [&.active]:bg-blue-50"
              >
                Pricing
              </Link>
              <Link
                to="/contact"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition [&.active]:text-blue-600 [&.active]:bg-blue-50"
              >
                Contact Us
              </Link>
              <div className="pt-3 border-t border-slate-100">
                <a
                  href="https://wa.me/917326027500?text=Hi%2C%20I%27d%20like%20to%20book%20a%20demo%20of%20EduPulse%20for%20my%20preschool."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 font-semibold px-4 py-2.5 rounded-xl transition"
                >
                  <svg className="w-4 h-4 text-emerald-600 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Book a Demo
                </a>
              </div>
            </div>
          )}
        </nav>
      )}

      <main className="flex-1">{children}</main>

      {showFooter && (
        <footer className="bg-slate-900 text-slate-300">
          <div className="w-full px-8 xl:px-16 pt-16 pb-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">
              <div className="lg:col-span-2">
                <div className="flex items-center gap-2.5 text-xl font-bold text-white mb-4">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-600 shrink-0">
                    <svg viewBox="0 0 64 64" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <polygon points="32,13 52,23 32,33 12,23" fill="white" opacity="0.95"/>
                      <rect x="48" y="23" width="2.5" height="11" rx="1.25" fill="white" opacity="0.8"/>
                      <circle cx="49.25" cy="35.5" r="2.5" fill="white" opacity="0.8"/>
                      <polyline points="12,44 20,44 24,38 28,51 32,41 36,44 52,44" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span>EduPulse</span>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
                  The complete ERP platform for preschools, daycares, and child development centres across India.
                </p>
                <div className="flex items-center gap-4 mt-5">
                  <a href="#" aria-label="Facebook" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition">
                    <Facebook className="w-4 h-4" />
                  </a>
                  <a href="#" aria-label="Twitter" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition">
                    <Twitter className="w-4 h-4" />
                  </a>
                  <a href="#" aria-label="LinkedIn" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition">
                    <Linkedin className="w-4 h-4" />
                  </a>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Product</h3>
                <ul className="space-y-3 text-sm">
                  <li><a href="#" className="hover:text-white transition">Features</a></li>
                  <li><Link to="/pricing" className="hover:text-white transition">Pricing</Link></li>
                  <li><Link to="/signup" className="hover:text-white transition">Free trial</Link></li>
                  <li><Link to="/about" className="hover:text-white transition">About us</Link></li>
                  <li><Link to="/contact" className="hover:text-white transition">Contact Us</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Legal</h3>
                <ul className="space-y-3 text-sm">
                  <li><Link to="/privacy-policy" className="hover:text-white transition">Privacy Policy</Link></li>
                  <li><Link to="/terms-of-service" className="hover:text-white transition">Terms of Service</Link></li>
                  <li><Link to="/refund-policy" className="hover:text-white transition">Refund Policy</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Contact</h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-2.5">
                    <Mail className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                    <a href="mailto:bookandmanage@gmail.com" className="hover:text-white transition">bookandmanage@gmail.com</a>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Phone className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                    <a href="tel:+917326027500" className="hover:text-white transition">+91 73260 27500</a>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                    <span>Bengaluru, India</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
              <p>&copy; {new Date().getFullYear()} EduPulse Technologies Pvt. Ltd. All rights reserved.</p>
              <p>Made with care for Indian educators</p>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
