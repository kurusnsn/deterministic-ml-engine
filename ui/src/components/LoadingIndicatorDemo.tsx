"use client";

import { LoadingButton } from "@/components/ui/LoadingButton";
import { useGlobalLoader } from "@/hooks/useGlobalLoader";
import { Button } from "@/components/ui/button";

export function LoadingIndicatorDemo() {
  const { setLoading } = useGlobalLoader();

  // Example: LoadingButton with local loading state
  const handleLocalAction = async () => {
    // Simulate an async operation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log("Local action completed!");
  };

  // Example: Global loader for page-wide operations
  const handleGlobalAction = async () => {
    setLoading(true);
    try {
      // Simulate a long-running async operation
      await new Promise((resolve) => setTimeout(resolve, 3000));
      console.log("Global action completed!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-8">
      <h2 className="text-2xl font-bold">Loading Indicator Demo</h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Local Loading (LoadingButton)</h3>
        <p className="text-sm text-muted-foreground">
          Button shows its own spinner and is disabled during the operation
        </p>
        <LoadingButton onClick={handleLocalAction}>
          Click Me (Local Loading)
        </LoadingButton>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Global Loading (Overlay)</h3>
        <p className="text-sm text-muted-foreground">
          Full-screen overlay with animated spinner
        </p>
        <Button onClick={handleGlobalAction}>
          Click Me (Global Loading)
        </Button>
      </div>
    </div>
  );
}
