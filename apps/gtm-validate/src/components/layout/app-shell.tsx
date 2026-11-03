"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { PageLoader } from "@/components/layout/page-loader";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith("/auth");

  if (isAuthPage) {
    return (
      <>
        <main>{children}</main>
      </>
    );
  }

  return (
    <>
      <PageLoader />
      <Header />
      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8">{children}</main>
    </>
  );
}
