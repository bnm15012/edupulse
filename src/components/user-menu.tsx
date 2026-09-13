import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { User, Lock, LogOut, Bell, BellOff } from "lucide-react";
import { getSession, logout } from "@/lib/auth";
import { requestPushPermission } from "@/lib/usePush";
import { ProfileDialog } from "@/components/profile-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function UserMenu() {
  const [user, setUser] = useState<{
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<"profile" | "security">("profile");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pushState, setPushState] = useState<"default" | "granted" | "denied" | "unsupported">("default");
  const getSessionFn = useServerFn(getSession);
  const logoutFn = useServerFn(logout);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushState("unsupported");
      return;
    }
    setPushState(Notification.permission as any);
  }, []);

  const handleEnablePush = async () => {
    const ok = await requestPushPermission();
    if (ok) {
      window.location.reload();
    } else {
      setPushState("denied");
    }
  };

  const openDialog = (tab: "profile" | "security") => {
    setDialogTab(tab);
    setDialogOpen(true);
    setOpen(false);
  };

  useEffect(() => {
    getSessionFn().then((u) => setUser(u as any));
  }, [getSessionFn]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await logoutFn();
    document.cookie = "bb_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT";
    navigate({ to: "/" });
  };

  if (!user) {
    return <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse" />;
  }

  const initials = user.firstName
    ? user.firstName[0].toUpperCase()
    : user.email[0].toUpperCase();
  const displayName = user.firstName
    ? `${user.firstName} ${user.lastName ?? ""}`.trim()
    : user.email;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
      >
        <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-bold">
          {initials}
        </div>
        <span className="hidden sm:inline">{displayName}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50">
            {/* User info header */}
            <div className="px-4 py-3 bg-gradient-to-br from-blue-600 to-indigo-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white text-sm font-extrabold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{displayName}</p>
                  <p className="text-xs text-blue-200 truncate">{user.email}</p>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="p-1.5">
              <button
                onClick={() => openDialog("profile")}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition"
              >
                <User className="w-4 h-4 text-slate-400" />
                Profile
              </button>
              <button
                onClick={() => openDialog("security")}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition"
              >
                <Lock className="w-4 h-4 text-slate-400" />
                Change password
              </button>

              {pushState === "default" && (
                <button
                  onClick={handleEnablePush}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition"
                >
                  <Bell className="w-4 h-4 text-slate-400" />
                  Enable notifications
                </button>
              )}

              {pushState === "granted" && (
                <div className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-green-700">
                  <Bell className="w-4 h-4" />
                  Notifications enabled
                </div>
              )}

              {pushState === "denied" && (
                <div className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-500">
                  <BellOff className="w-4 h-4" />
                  Notifications blocked
                </div>
              )}

              <div className="h-px bg-slate-100 my-1" />
              <button
                onClick={() => { setOpen(false); setConfirmSignOut(true); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}

      <ProfileDialog open={dialogOpen} onClose={() => setDialogOpen(false)} defaultTab={dialogTab} />

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out"
        message="Are you sure you want to sign out of EduPulse?"
        confirmLabel={signingOut ? "Signing out…" : "Yes, sign out"}
        variant="danger"
        onConfirm={handleSignOut}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
  );
}
