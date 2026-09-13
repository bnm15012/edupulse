/**
 * EduPulse brand logo mark — indigo rounded square with graduation cap + pulse line.
 * Used everywhere the app logo appears (auth pages, sidebar, public nav, etc.)
 */
export function EduPulseLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "w-8 h-8" : size === "lg" ? "w-12 h-12" : "w-9 h-9";
  const svg = size === "sm" ? "w-7 h-7" : size === "lg" ? "w-11 h-11" : "w-8 h-8";
  return (
    <div className={`${dim} rounded-xl flex items-center justify-center bg-indigo-600 shrink-0`}>
      <svg viewBox="0 0 64 64" className={svg} fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="32,13 52,23 32,33 12,23" fill="white" opacity="0.95"/>
        <rect x="48" y="23" width="2.5" height="11" rx="1.25" fill="white" opacity="0.8"/>
        <circle cx="49.25" cy="35.5" r="2.5" fill="white" opacity="0.8"/>
        <polyline points="12,44 20,44 24,38 28,51 32,41 36,44 52,44"
          stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}
