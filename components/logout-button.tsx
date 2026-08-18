"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase-browser";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
      onClick={() =>
        startTransition(async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push("/");
          router.refresh();
        })
      }
      type="button"
    >
      {isPending ? "Signing out..." : "Logout"}
    </button>
  );
}
