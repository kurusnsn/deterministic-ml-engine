"use client";

import { useRef, forwardRef, useImperativeHandle } from "react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";

export interface ConfettiRef {
  fire: (options?: confetti.Options) => void;
}

export const Confetti = forwardRef<ConfettiRef, { className?: string; onMouseEnter?: () => void }>(
  ({ className, onMouseEnter }, ref) => {
    const confettiRef = useRef<confetti.CreateTypes | null>(null);

    useImperativeHandle(ref, () => ({
      fire: (options = {}) => {
        if (!confettiRef.current) {
          confettiRef.current = confetti.create(undefined, {
            resize: true,
            useWorker: true,
          });
        }
        confettiRef.current({
          particleCount: 50,
          spread: 45,
          origin: { x: 0.5, y: 0.5 },
          ...options,
        });
      },
    }));

    return (
      <div
        className={className}
        onMouseEnter={onMouseEnter}
        ref={(el) => {
          if (el && !confettiRef.current) {
            confettiRef.current = confetti.create(el, {
              resize: true,
              useWorker: true,
            });
          }
        }}
      />
    );
  }
);

Confetti.displayName = "Confetti";

export const ConfettiButton = forwardRef<
  HTMLButtonElement & { fire: () => void },
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    options?: confetti.Options | (() => confetti.Options);
  }
>(({ children, options = {}, ...props }, ref) => {
  const confettiInstance = useRef<confetti.CreateTypes | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fireConfetti = () => {
    if (!confettiInstance.current && containerRef.current) {
      confettiInstance.current = confetti.create(containerRef.current, {
        resize: true,
        useWorker: true,
      });
    }

    if (confettiInstance.current) {
      const opts = typeof options === "function" ? options() : options;
      confettiInstance.current({
        particleCount: 50,
        spread: 45,
        origin: { x: 0.5, y: 0.5 },
        ...opts,
      });
    }
  };

  // Expose fire method via ref
  useImperativeHandle(ref, () => {
    return {
      ...(buttonRef.current || {}),
      fire: fireConfetti,
    } as HTMLButtonElement & { fire: () => void };
  });

  return (
    <div ref={containerRef} className="relative">
      <Button ref={buttonRef} onClick={fireConfetti} {...props}>
        {children}
      </Button>
    </div>
  );
});

ConfettiButton.displayName = "ConfettiButton";

