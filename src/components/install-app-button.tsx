import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppButton({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    (window as any).addEventListener("beforeinstallprompt", handler);

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (("standalone" in navigator) && (navigator as any).standalone === true);
    setIsStandalone(standalone);

    return () => {
      (window as any).removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (isStandalone) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        setDeferred(null);
      }
      return;
    }

    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);

    if (isIOS) {
      Swal.fire({
        title: "Install EduPulse",
        html: `<p class="text-left text-sm text-slate-600">1. Tap the <strong>Share</strong> icon in Safari.<br/>2. Scroll down and tap <strong>Add to Home Screen</strong>.<br/>3. Tap <strong>Add</strong>.</p>`,
        icon: "info",
        confirmButtonText: "Got it",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    if (isAndroid) {
      Swal.fire({
        title: "Install EduPulse",
        html: `<p class="text-left text-sm text-slate-600">1. Open Chrome's menu (three dots).<br/>2. Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.<br/>3. Tap <strong>Add</strong>.</p>`,
        icon: "info",
        confirmButtonText: "Got it",
        confirmButtonColor: "#2563eb",
      });
      return;
    }

    Swal.fire({
      title: "Install EduPulse",
      html: `<p class="text-left text-sm text-slate-600">Open this page on your phone's browser and tap <strong>Add to Home Screen</strong> or <strong>Install app</strong>.</p>`,
      icon: "info",
      confirmButtonText: "Got it",
      confirmButtonColor: "#2563eb",
    });
  };

  return (
    <button onClick={handleClick} className={className} aria-label="Install app">
      <Download className="w-5 h-5" />
      {!iconOnly && <span>Install app</span>}
    </button>
  );
}
