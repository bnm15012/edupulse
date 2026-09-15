import { createContext, useContext, useEffect, useState } from "react";

export type Tenant = {
  schoolId: number;
  schoolName: string;
  locationId: number;
  locationName: string;
  facilityType?: string; // "school" | "daycare" | "both"
};

const defaultTenant: Tenant = {
  schoolId: 1,
  schoolName: "EduPulse Demo School",
  locationId: 1,
  locationName: "Main Branch",
  facilityType: "school",
};

const TenantContext = createContext<{
  tenant: Tenant;
  setTenant: (t: Tenant) => void;
} | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenantState] = useState<Tenant>(defaultTenant);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("edupulse-tenant") : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Tenant;
        setTenantState(parsed);
      } catch {
        // ignore
      }
    }
  }, []);

  const setTenant = (t: Tenant) => {
    setTenantState(t);
    if (typeof window !== "undefined") {
      localStorage.setItem("edupulse-tenant", JSON.stringify(t));
    }
  };

  return <TenantContext.Provider value={{ tenant, setTenant }}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}
