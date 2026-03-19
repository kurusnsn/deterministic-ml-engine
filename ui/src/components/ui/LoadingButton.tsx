"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { useTransition } from "react";
import { type VariantProps } from "class-variance-authority";

interface LoadingButtonProps extends VariantProps<typeof buttonVariants> {
  onClick: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function LoadingButton({
  onClick,
  children,
  className,
  disabled,
  variant,
  size,
}: LoadingButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      await onClick();
    });
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isPending || disabled}
      variant={variant}
      size={size}
      className={className}
    >
      {isPending && <LogoSpinner size="sm" />}
      {isPending ? "Loading..." : children}
    </Button>
  );
}
