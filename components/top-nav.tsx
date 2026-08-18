import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";

interface TopNavProps {
  authenticated?: boolean;
}

export function TopNav({ authenticated = false }: TopNavProps) {
  return (
    <header className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-4 py-6 md:px-6">
      <Link href="/" className="font-display text-2xl tracking-wide">
        Cranium
      </Link>
      <div className="flex items-center gap-3">
        {authenticated ? (
          <LogoutButton />
        ) : (
          <>
            <Link
              href="/signup"
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
            >
              Login
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
