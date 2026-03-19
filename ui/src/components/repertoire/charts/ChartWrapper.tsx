"use client";

import { useState, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface ChartWrapperProps {
  title: string;
  insight?: string;
  children: (color: "white" | "black" | "all") => ReactNode;
  showColorToggle?: boolean;
  defaultColor?: "white" | "black" | "all";
  className?: string;
  height?: number;
}

export default function ChartWrapper({
  title,
  insight,
  children,
  showColorToggle = true,
  defaultColor = "all",
  className,
  height = 260,
}: ChartWrapperProps) {
  const [selectedColor, setSelectedColor] = useState<"white" | "black" | "all">(defaultColor);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            {insight && (
              <CardDescription className="text-xs text-muted-foreground">
                {insight}
              </CardDescription>
            )}
          </div>
          {showColorToggle && (
            <Tabs
              value={selectedColor}
              onValueChange={(v) => setSelectedColor(v as "white" | "black" | "all")}
              className="shrink-0"
            >
              <TabsList className="h-7">
                <TabsTrigger value="all" className="text-xs px-2 h-6">
                  All
                </TabsTrigger>
                <TabsTrigger value="white" className="text-xs px-2 h-6">
                  White
                </TabsTrigger>
                <TabsTrigger value="black" className="text-xs px-2 h-6">
                  Black
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0" style={{ height }}>
        {children(selectedColor)}
      </CardContent>
    </Card>
  );
}
