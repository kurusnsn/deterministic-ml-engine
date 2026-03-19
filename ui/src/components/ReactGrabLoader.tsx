"use client";

import { useEffect } from "react";

export default function ReactGrabLoader() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (process.env.NEXT_PUBLIC_ENABLE_REACT_GRAB !== "true") return;

    import("react-grab").catch(() => {
      // Ignore load failures in development instrumentation.
    });
  }, []);

  return null;
}
