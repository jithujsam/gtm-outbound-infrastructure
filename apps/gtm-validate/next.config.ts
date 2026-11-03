import type { NextConfig } from "next";
import { execSync } from "child_process";

const toIso = (raw: string): string => {
  // git log --format=%ci gives "2026-08-11 09:39:00 +0530"
  // Normalize to ISO 8601: "2026-08-11T09:39:00+05:30"
  const m = raw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  if (!m) return raw;
  return `${m[1]}T${m[2]}${m[3]}:${m[4]}`;
};

const gitInfo = (() => {
  // Vercel provides VERCEL_GIT_COMMIT_SHA but no timestamp — use build time
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) {
    return { hash: vercelSha.slice(0, 7), time: new Date().toISOString() };
  }
  try {
    const hash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const time = toIso(execSync("git log -1 --format=%ci", { encoding: "utf-8" }).trim());
    return { hash, time };
  } catch {
    return { hash: "dev", time: new Date().toISOString() };
  }
})();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GIT_HASH: gitInfo.hash,
    NEXT_PUBLIC_GIT_RAW: gitInfo.time,
  },
};

export default nextConfig;
