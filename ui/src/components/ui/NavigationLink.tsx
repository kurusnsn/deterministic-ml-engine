"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGlobalLoader } from "@/hooks/useGlobalLoader";
import { ComponentProps, MouseEvent } from "react";

type NavigationLinkProps = ComponentProps<typeof Link>;

export function NavigationLink({ href, onClick, ...props }: NavigationLinkProps) {
  const pathname = usePathname();
  const { setLoading } = useGlobalLoader();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Call the original onClick if provided
    onClick?.(e);

    // Don't show loader if default is prevented or it's a new tab/window
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) {
      return;
    }

    // Don't show loader for anchor links on the same page
    const hrefString = typeof href === "string" ? href : href.pathname || "";
    if (hrefString.startsWith("#")) {
      return;
    }

    // Don't show loader if we're already on the target page
    if (hrefString === pathname) {
      return;
    }

    // Show the loading indicator
    setLoading(true);
  };

  // prefetch={true} eagerly loads the page JavaScript when link is visible
  return <Link href={href} onClick={handleClick} prefetch={true} {...props} />;
}
