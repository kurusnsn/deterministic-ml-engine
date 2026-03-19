"use client";

import { createContext, useContext, useState, ReactNode, useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface LoaderContextType {
  isLoading: boolean;
  setLoading: (value: boolean) => void;
}

const LoaderContext = createContext<LoaderContextType | undefined>(undefined);

// Separate component that uses useSearchParams - must be wrapped in Suspense
function RouteChangeListener({ setLoading }: { setLoading: (value: boolean) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Hide loading when route changes complete
    setLoading(false);
  }, [pathname, searchParams, setLoading]);

  return null;
}

export function LoaderProvider({ children }: { children: ReactNode }) {
  const [isLoading, setLoading] = useState(false);

  return (
    <LoaderContext.Provider value={{ isLoading, setLoading }}>
      <Suspense fallback={null}>
        <RouteChangeListener setLoading={setLoading} />
      </Suspense>
      {children}
    </LoaderContext.Provider>
  );
}

export function useGlobalLoader() {
  const ctx = useContext(LoaderContext);
  if (!ctx) throw new Error("useGlobalLoader must be used within LoaderProvider");
  return ctx;
}
