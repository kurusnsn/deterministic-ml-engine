"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { OpeningStats, GeneratedPuzzle, MoveAnalysis, WeakLine, RepertoireType } from "@/types/repertoire";
import OpeningPreviewRow from "./OpeningPreviewRow";
import OpeningDetailDrawer from "./OpeningDetailDrawer";

interface OpeningListDrawerProps {
  type: RepertoireType;
  openings: OpeningStats[];
  puzzles: GeneratedPuzzle[];
  engineMoves: MoveAnalysis[];
  weakLines?: WeakLine[] | null;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function OpeningListDrawer({
  type,
  openings,
  puzzles,
  engineMoves,
  weakLines,
  triggerLabel = "View all openings",
  open: controlledOpen,
  onOpenChange,
}: OpeningListDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<OpeningStats | null>(null);

  const open = controlledOpen ?? internalOpen;
  const setOpen = (val: boolean) => {
    setInternalOpen(val);
    onOpenChange?.(val);
  };

  const handleSelect = (opening: OpeningStats) => {
    setSelected(opening);
    setDetailOpen(true);
  };

  const label =
    type === "core" ? "Core Repertoire" : type === "secondary" ? "Secondary Repertoire" : "Experimental Repertoire";

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        {!controlledOpen && (
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">{triggerLabel}</Button>
          </SheetTrigger>
        )}
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription>
              {openings.length} openings • click a row for detailed analysis
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <ScrollArea className="h-[70vh] pr-3">
              <div className="space-y-2">
                {openings.map((op, idx) => (
                  <button
                    key={`${op.eco_code}-${op.color}-${idx}`}
                    className="w-full text-left"
                    onClick={() => handleSelect(op)}
                  >
                    <OpeningPreviewRow opening={op} />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <SheetClose asChild>
            <div className="mt-4 text-right">
              <Button variant="ghost" size="sm">Close</Button>
            </div>
          </SheetClose>
        </SheetContent>
      </Sheet>

      <OpeningDetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        opening={selected}
        puzzles={puzzles}
        engineMoves={engineMoves}
        weakLines={weakLines}
        bucketType={type}
      />
    </>
  );
}
