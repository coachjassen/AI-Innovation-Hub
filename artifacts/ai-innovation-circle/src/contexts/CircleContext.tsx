import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useListCircles } from "@workspace/api-client-react";

type Circle = { id: number; name: string; cadence: string; status: string; memberCount?: number };

type CircleContextValue = {
  circles: Circle[];
  activeCircleId: number | null;
  activeCircle: Circle | null;
  setActiveCircleId: (id: number) => void;
  isLoading: boolean;
};

const CircleContext = createContext<CircleContextValue | undefined>(undefined);

const STORAGE_KEY = "aic.activeCircleId";

export function CircleProvider({ children }: { children: React.ReactNode }) {
  const { data: circles = [], isLoading } = useListCircles();
  const [activeCircleId, setActiveCircleIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

  const setActiveCircleId = (id: number) => {
    setActiveCircleIdState(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  };

  // Once circles load, ensure the active id points at a real circle.
  useEffect(() => {
    if (circles.length === 0) return;
    const exists = activeCircleId !== null && circles.some((c) => c.id === activeCircleId);
    if (!exists) {
      const fallback = circles.find((c) => c.status === "active") ?? circles[0];
      setActiveCircleIdState(fallback.id);
      localStorage.setItem(STORAGE_KEY, String(fallback.id));
    }
  }, [circles, activeCircleId]);

  const value = useMemo<CircleContextValue>(() => {
    const activeCircle = circles.find((c) => c.id === activeCircleId) ?? null;
    return { circles, activeCircleId, activeCircle, setActiveCircleId, isLoading };
  }, [circles, activeCircleId, isLoading]);

  return <CircleContext.Provider value={value}>{children}</CircleContext.Provider>;
}

export function useActiveCircle(): CircleContextValue {
  const ctx = useContext(CircleContext);
  if (!ctx) throw new Error("useActiveCircle must be used within a CircleProvider");
  return ctx;
}
