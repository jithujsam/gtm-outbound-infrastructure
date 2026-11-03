"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupabase } from "@/components/providers/supabase-provider";
import { logout } from "@/app/auth/actions";

const links = ["Dashboard", "Projects", "Integrations", "Logs"];

function formatIst(raw: string | undefined): string {
  if (!raw) return "";
  return new Date(raw).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

const gitTag = formatIst(process.env.NEXT_PUBLIC_GIT_RAW);

export function Header() {
  const pathname = usePathname();
  const { user } = useSupabase();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-xl">
      <div className="flex h-12 sm:h-14 items-center justify-between px-4 sm:px-6 max-w-6xl mx-auto">
        {/* Logo — left */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <div className="flex size-6 sm:size-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-500/20">
            <span className="text-[9px] sm:text-[10px] font-bold tracking-tight">GT</span>
          </div>
          <span className="font-semibold text-xs sm:text-sm tracking-tight text-neutral-900">
            GTM Validate
          </span>
        </Link>

        {/* Right side — nav + user */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1 bg-neutral-100/80 rounded-full p-0.5 backdrop-blur">
            {links.map((label) => {
              const href = label === "Dashboard" ? "/" : `/${label.toLowerCase()}`;
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={label}
                  href={href}
                  className={cn(
                    "relative px-3 py-1 text-[11px] font-medium rounded-full transition-colors duration-150",
                    active
                      ? "text-white"
                      : "text-neutral-500 hover:text-neutral-700"
                  )}
                >
                  {active && (
                    <span className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 shadow-sm shadow-violet-500/25" />
                  )}
                  <span className="relative z-10">{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Minitag — last updated */}
          {gitTag && (
            <span className="hidden sm:inline text-[10px] text-neutral-400 font-mono whitespace-nowrap">
              {gitTag}
            </span>
          )}

          {/* Desktop user */}
          {user ? (
            <form action={logout} className="hidden sm:block">
              <button
                type="submit"
                className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <LogOut className="size-3.5" />
              </button>
            </form>
          ) : (
            <Link
              href="/auth/login"
              className="hidden sm:block text-[11px] font-medium text-violet-600 hover:text-violet-700 transition-colors"
            >
              Sign in
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden p-1 rounded-md hover:bg-neutral-100 transition-colors"
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {menuOpen && (
        <div className="sm:hidden border-t bg-white px-4 py-3 space-y-1">
          {links.map((label) => {
            const href = label === "Dashboard" ? "/" : `/${label.toLowerCase()}`;
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={label}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "block px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-violet-50 text-violet-700"
                    : "text-neutral-600 hover:bg-neutral-50"
                )}
              >
                {label}
              </Link>
            );
          })}
          {user ? (
            <form action={logout}>
              <button
                type="submit"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors border-t mt-1"
              >
                <LogOut className="size-4" />
                Logout
              </button>
            </form>
          ) : (
            <Link
              href="/auth/login"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-sm font-medium text-violet-600 hover:bg-neutral-50 transition-colors border-t mt-1"
            >
              Sign in
            </Link>
          )}
          {gitTag && (
            <div className="px-3 pt-1 text-[10px] text-neutral-400 font-mono">
              {gitTag}
            </div>
          )}
        </div>
      )}
    </header>
  );
}