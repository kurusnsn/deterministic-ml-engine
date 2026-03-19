"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionContextValue {
  value: string[];
  onValueChange: (value: string[]) => void;
  type: "single" | "multiple";
}

const AccordionContext = React.createContext<AccordionContextValue | undefined>(undefined);

interface AccordionProps {
  type?: "single" | "multiple";
  defaultValue?: string[];
  value?: string[];
  onValueChange?: (value: string[]) => void;
  children: React.ReactNode;
  className?: string;
}

export function Accordion({
  type = "single",
  defaultValue = [],
  value: controlledValue,
  onValueChange,
  children,
  className
}: AccordionProps) {
  const [internalValue, setInternalValue] = React.useState<string[]>(defaultValue);
  const value = controlledValue ?? internalValue;
  const handleValueChange = onValueChange ?? setInternalValue;

  const toggleItem = (itemValue: string) => {
    if (type === "single") {
      handleValueChange(value.includes(itemValue) ? [] : [itemValue]);
    } else {
      handleValueChange(
        value.includes(itemValue)
          ? value.filter(v => v !== itemValue)
          : [...value, itemValue]
      );
    }
  };

  return (
    <AccordionContext.Provider value={{ value, onValueChange: toggleItem, type }}>
      <div className={cn("space-y-2", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function AccordionItem({ value, children, className }: AccordionItemProps) {
  return (
    <AccordionItemContext.Provider value={{ value }}>
      <div className={cn("border rounded-lg", className)}>
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
}

const AccordionItemContext = React.createContext<{ value: string } | undefined>(undefined);

export function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const context = React.useContext(AccordionContext);
  const itemContext = React.useContext(AccordionItemContext);
  if (!context || !itemContext) throw new Error("AccordionTrigger must be used within AccordionItem");

  const isOpen = context.value.includes(itemContext.value);

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between p-4 text-left font-medium transition-all hover:bg-gray-50",
        isOpen && "[&>svg]:rotate-180",
        className
      )}
      onClick={() => context.onValueChange(itemContext.value)}
      data-state={isOpen ? "open" : "closed"}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200" />
    </button>
  );
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
}

export function AccordionContent({ children, className }: AccordionContentProps) {
  const context = React.useContext(AccordionContext);
  const itemContext = React.useContext(AccordionItemContext);
  if (!context || !itemContext) throw new Error("AccordionContent must be used within AccordionItem");

  const isOpen = context.value.includes(itemContext.value);

  if (!isOpen) return null;

  return (
    <div className={cn("px-4 pb-4 pt-0", className)}>
      {children}
    </div>
  );
}

