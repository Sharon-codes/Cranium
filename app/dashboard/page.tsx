import { MapHistory } from "@/components/map-history";
import { TopNav } from "@/components/top-nav";
import { UploadPanel } from "@/components/upload-panel";
import { requireUser } from "@/lib/auth";
import { ensureUserProfile, getMapsByUser } from "@/lib/db";

export default async function DashboardPage() {
  const user = await requireUser();
  await ensureUserProfile({ id: user.id, email: user.email });
  const maps = await getMapsByUser(user.id);

  return (
    <main className="min-h-screen pb-12">
      <TopNav authenticated />
      <div className="mx-auto w-full max-w-[1500px] px-4 md:px-6">
        <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Workspace</p>
        <h1 className="mt-3 max-w-4xl font-display text-5xl">Build from source material, not blank pages.</h1>
      </div>

      <div className="mx-auto mt-8 grid w-full max-w-[1500px] gap-6 px-4 md:px-6 xl:grid-cols-[1.65fr_1fr]">
        <UploadPanel />
        <MapHistory maps={maps as Array<{ id: string; title: string; source_name: string | null; updated_at: string }>} />
      </div>
    </main>
  );
}
