import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey,
  getListCirclesQueryKey,
  useGetMe,
  useListCircles,
  useSwitchActiveHub,
} from "@workspace/api-client-react";

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
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useGetMe({
    query: { retry: false, queryKey: getGetMeQueryKey() },
  });
  const { data: circles = [], isLoading: circlesLoading } = useListCircles({
    query: {
      enabled: !!user,
      queryKey: getListCirclesQueryKey(),
    },
  });
  const switchHub = useSwitchActiveHub();
  const [adminActiveCircleId, setAdminActiveCircleId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });
  const isAdmin = user?.role === "admin";
  const activeCircleId = isAdmin
    ? adminActiveCircleId
    : user?.circleId ?? null;

  const setActiveCircleId = (id: number) => {
    if (isAdmin) {
      setAdminActiveCircleId(id);
      localStorage.setItem(STORAGE_KEY, String(id));
      return;
    }
    if (!user || id === user.circleId || switchHub.isPending) return;

    switchHub.mutate(
      { data: { circleId: id } },
      {
        onSuccess: (membership) => {
          localStorage.setItem(STORAGE_KEY, String(id));
          queryClient.setQueryData(getGetMeQueryKey(), membership);
          void queryClient.invalidateQueries();
        },
      },
    );
  };

  // Admins may inspect any Hub. Attendee active Hub comes from their
  // server-side membership session and changes only after a successful switch.
  useEffect(() => {
    if (!isAdmin || circles.length === 0) return;
    const exists = adminActiveCircleId !== null && circles.some((c) => c.id === adminActiveCircleId);
    if (!exists) {
      const fallback = circles.find((c) => c.status === "active") ?? circles[0];
      setAdminActiveCircleId(fallback.id);
      localStorage.setItem(STORAGE_KEY, String(fallback.id));
    }
  }, [circles, adminActiveCircleId, isAdmin]);

  const value = useMemo<CircleContextValue>(() => {
    const activeCircle = circles.find((c) => c.id === activeCircleId) ?? null;
    return {
      circles,
      activeCircleId,
      activeCircle,
      setActiveCircleId,
      isLoading: circlesLoading || userLoading || switchHub.isPending,
    };
  }, [
    circles,
    activeCircleId,
    circlesLoading,
    userLoading,
    switchHub.isPending,
    isAdmin,
    user,
  ]);

  return <CircleContext.Provider value={value}>{children}</CircleContext.Provider>;
}

export function useActiveCircle(): CircleContextValue {
  const ctx = useContext(CircleContext);
  if (!ctx) throw new Error("useActiveCircle must be used within a CircleProvider");
  return ctx;
}
