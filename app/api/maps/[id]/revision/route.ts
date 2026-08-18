import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { createRevisionSet, getMapWithNodes } from "@/lib/db";
import { buildMapContext, getNodeDisplayContent, normalizeImportanceWeight } from "@/lib/mindmap";
import { evaluateSubjectiveAnswer, generateRevisionSet } from "@/lib/openai";

const createSchema = z.object({
  scope: z.enum(["all", "branch", "node"]),
  type: z.enum(["flashcards", "objective", "subjective"]),
  count: z.number().min(1).max(20),
  includeAiGenerated: z.boolean(),
  nodeId: z.string().optional(),
  selectedBranchIds: z.array(z.string()).optional(),
  selectedNodeIds: z.array(z.string()).optional()
});

const evaluateSchema = z.object({
  prompt: z.string(),
  answer: z.string(),
  allowGeneralKnowledge: z.boolean(),
  nodeId: z.string().optional()
});

function distributeMaterialsByWeight<T extends { importanceWeight?: number }>(materials: T[], count: number) {
  if (materials.length === 0) return [];
  if (count <= materials.length) {
    return [...materials]
      .sort((a, b) => normalizeImportanceWeight(b.importanceWeight) - normalizeImportanceWeight(a.importanceWeight))
      .slice(0, count);
  }

  const weighted = materials.map((material) => ({
    material,
    weight: normalizeImportanceWeight(material.importanceWeight)
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0) || weighted.length;
  const targets = weighted.map((item) => ({
    ...item,
    quota: (item.weight / totalWeight) * count,
    picks: 0
  }));

  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    targets.sort((a, b) => (b.quota - b.picks) - (a.quota - a.picks));
    const pick = targets[0];
    pick.picks += 1;
    result.push(pick.material);
  }
  return result;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await params;
    const payload = createSchema.parse(await request.json());
    const map = await getMapWithNodes(id, user.id);

    if (!map) {
      return NextResponse.json({ error: "Map not found." }, { status: 404 });
    }

    const nodeById = new Map(map.nodes.map((node) => [node.id, node]));
    const childrenById = new Map<string, string[]>();
    for (const node of map.nodes) {
      if (!node.parentId) continue;
      const children = childrenById.get(node.parentId) ?? [];
      children.push(node.id);
      childrenById.set(node.parentId, children);
    }

    function collectDescendants(startIds: string[]) {
      const visited = new Set<string>();
      const stack = [...startIds];
      while (stack.length) {
        const nodeId = stack.pop();
        if (!nodeId || visited.has(nodeId)) continue;
        visited.add(nodeId);
        const children = childrenById.get(nodeId) ?? [];
        stack.push(...children);
      }
      return visited;
    }

    let scopedNodes = map.nodes;

    if (payload.scope === "branch") {
      const branchIds = (payload.selectedBranchIds ?? []).filter((id) => {
        const node = nodeById.get(id);
        return Boolean(node && node.depth === 1);
      });

      if (branchIds.length === 0) {
        return NextResponse.json({ error: "Select at least one branch." }, { status: 400 });
      }

      const allowed = collectDescendants(branchIds);
      scopedNodes = map.nodes.filter((node) => allowed.has(node.id));
    }

    if (payload.scope === "node") {
      const branchIds = (payload.selectedBranchIds ?? []).filter((id) => {
        const node = nodeById.get(id);
        return Boolean(node && node.depth === 1);
      });
      const selectedNodeIds = (payload.selectedNodeIds ?? []).filter((id) => {
        const node = nodeById.get(id);
        return Boolean(node && node.depth > 1);
      });

      if (branchIds.length === 0) {
        return NextResponse.json({ error: "Select at least one branch." }, { status: 400 });
      }
      if (selectedNodeIds.length === 0) {
        return NextResponse.json({ error: "Select at least one node." }, { status: 400 });
      }

      const branchDescendants = collectDescendants(branchIds);
      const validNodeIds = selectedNodeIds.filter((id) => branchDescendants.has(id));
      if (validNodeIds.length === 0) {
        return NextResponse.json({ error: "Selected nodes must belong to selected branches." }, { status: 400 });
      }

      const allowed = collectDescendants(validNodeIds);
      scopedNodes = map.nodes.filter((node) => allowed.has(node.id));
    }

    if (payload.scope !== "all" && scopedNodes.length === 0) {
      return NextResponse.json({ error: "No matching topics were found for the selected scope." }, { status: 400 });
    }

    scopedNodes = scopedNodes.filter((node) => node.depth > 0);

    const candidateMaterials = scopedNodes.flatMap((node) => {
      const { sourceContent, aiContent } = getNodeDisplayContent(node);
      const materials: Array<{
        nodeId: string;
        nodeTitle: string;
        sourceLabel: "Uploaded files" | "AI content";
        importanceWeight: number;
        content: string;
      }> = [];

      if (sourceContent.trim()) {
        materials.push({
          nodeId: node.id,
          nodeTitle: node.title,
          sourceLabel: "Uploaded files",
          importanceWeight: normalizeImportanceWeight(node.importanceWeight),
          content: sourceContent
        });
      }

      if (payload.includeAiGenerated && aiContent.trim()) {
        materials.push({
          nodeId: node.id,
          nodeTitle: node.title,
          sourceLabel: "AI content",
          importanceWeight: normalizeImportanceWeight(node.importanceWeight),
          content: aiContent
        });
      }

      return materials;
    });

    if (candidateMaterials.length === 0) {
      return NextResponse.json({ error: "No suitable content was found for revision generation." }, { status: 400 });
    }

    const materials = distributeMaterialsByWeight(candidateMaterials, payload.count);
    const generated = await generateRevisionSet({
      type: payload.type,
      title: `${payload.type} revision set`,
      materials
    });

    const set = {
      id: crypto.randomUUID(),
      mapId: map.id,
      userId: user.id,
      type: payload.type,
      scope: payload.scope,
      title: generated.title,
      items: generated.items.map((item) => ({
        id: crypto.randomUUID(),
        prompt: item.prompt,
        answer: item.answer,
        options: item.options,
        explanation: item.explanation,
        aiGenerated: item.aiGenerated,
        sourceLabel: item.sourceLabel,
        sourceNodeId: item.sourceNodeId,
        sourceNodeTitle: item.sourceNodeTitle
      }))
    };

    await createRevisionSet(set);

    return NextResponse.json({
      set: {
        ...set,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create revision set." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await params;
    const payload = evaluateSchema.parse(await request.json());
    const map = await getMapWithNodes(id, user.id);

    if (!map) {
      return NextResponse.json({ error: "Map not found." }, { status: 404 });
    }

    const feedback = await evaluateSubjectiveAnswer({
      prompt: payload.prompt,
      answer: payload.answer,
      sourceContext: payload.nodeId ? buildMapContext(map.nodes, payload.nodeId) : buildMapContext(map.nodes),
      allowGeneralKnowledge: payload.allowGeneralKnowledge
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not evaluate answer." },
      { status: 500 }
    );
  }
}
