"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({
  trigger,
  children,
  align = "start",
  open: controlledOpen,
  onOpenChange,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, setOpen]);

  return (
    <div className="relative inline-block" ref={triggerRef}>
      <div onClick={() => setOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          ref={ref}
          className={`fixed inset-x-3 top-16 z-50 rounded-md border bg-popover p-1 shadow-md sm:absolute sm:inset-auto sm:top-auto sm:mt-1 sm:min-w-[180px] sm:max-w-none sm:p-1 ${
            align === "end"
              ? "sm:right-0"
              : align === "center"
                ? "sm:left-1/2 sm:-translate-x-1/2"
                : "sm:left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function PopoverItem({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${
        variant === "destructive"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick?.();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
