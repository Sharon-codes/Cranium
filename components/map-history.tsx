"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface MapHistoryProps {
  maps: Array<{
    id: string;
    title: string;
    source_name: string | null;
    updated_at: string;
  }>;
}

export function MapHistory({ maps }: MapHistoryProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function removeMap(id: string) {
    startTransition(async () => {
      await fetch(`/api/maps/${id}`, { method: "DELETE" });
      router.refresh();
    });
  }

  return (
    <div className="panel flex h-[620px] min-h-0 flex-col p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recent maps</h2>
          <p className="text-sm text-slate-500">Everything you’ve created is stored here.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{maps.length}</span>
      </div>

      <div className="mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {maps.length ? (
          maps.map((map) => (
            <div
              key={map.id}
              className="rounded-2xl border border-slate-200 bg-white/90 p-4 transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={`/maps/${map.id}`} className="flex-1">
                  <p className="font-medium text-slate-800">{map.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{map.source_name || "Untitled source"}</p>
                  <p className="mt-3 text-xs text-slate-400">
                    Updated {new Date(map.updated_at).toLocaleString()}
                  </p>
                </Link>
                <button
                  type="button"
                  className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => removeMap(map.id)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            Your generated mind maps will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
