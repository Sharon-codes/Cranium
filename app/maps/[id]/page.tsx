import { notFound } from "next/navigation";

import { MindMapCanvas } from "@/components/mind-map-canvas";
import { RevisionPanel } from "@/components/revision-panel";
import { requireUser } from "@/lib/auth";
import { getMapWithNodes, getRevisionSets } from "@/lib/db";
import type { RevisionSet } from "@/types";

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const map = await getMapWithNodes(id, user.id);

  if (!map) {
    notFound();
  }

  const revisionSets = await getRevisionSets(id, user.id);

  return (
    <main className="h-screen overflow-hidden bg-slate-50">
      <MindMapCanvas
        map={map}
        revisionPanel={<RevisionPanel map={map} existingSets={(revisionSets || []) as RevisionSet[]} />}
      />
    </main>
  );
}
