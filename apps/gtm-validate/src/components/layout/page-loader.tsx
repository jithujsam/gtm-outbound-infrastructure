"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";

export function PageLoader() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current !== pathname) {
      setActive(false);
      lastPath.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      if (!link || !link.href) return;
      if (link.getAttribute("data-no-loader") != null) return;
      if (!link.href.startsWith(window.location.origin)) return;
      if (link.target === "_blank") return;

      setActive(true);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-0.5 pointer-events-none transition-opacity duration-200"
      style={{ opacity: active ? 1 : 0 }}
    >
      <div className="h-full w-full origin-left animate-loading-bar bg-gradient-to-r from-violet-500 via-indigo-500 to-violet-500" />
    </div>
  );
}
