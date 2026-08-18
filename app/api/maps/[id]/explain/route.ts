import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getMapWithNodes } from "@/lib/db";
import { buildMapContext, normalizeImportanceWeight } from "@/lib/mindmap";
import { explainNode } from "@/lib/openai";

const explainSchema = z.object({
  nodeId: z.string()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await params;
    const { nodeId } = explainSchema.parse(await request.json());
    const map = await getMapWithNodes(id, user.id);

    if (!map) {
      return NextResponse.json({ error: "Map not found." }, { status: 404 });
    }

    const node = map.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return NextResponse.json({ error: "Node not found." }, { status: 404 });
    }

    const explanation = await explainNode({
      title: node.title,
      content: node.content,
      context: buildMapContext(map.nodes),
      importanceWeight: normalizeImportanceWeight(node.importanceWeight)
    });

    return NextResponse.json({ explanation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate explanation." },
      { status: 500 }
    );
  }
}
