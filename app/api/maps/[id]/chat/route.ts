import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getMapWithNodes } from "@/lib/db";
import { buildMapContext, buildWeightedMapContext, getImportanceCriteriaText, getNodeCombinedContent, normalizeImportanceWeight } from "@/lib/mindmap";
import { chatAboutMap } from "@/lib/openai";

const chatSchema = z.object({
  question: z.string().min(1),
  nodeId: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string()
      })
    )
    .max(12)
    .default([])
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await params;
    const payload = chatSchema.parse(await request.json());
    const map = await getMapWithNodes(id, user.id);

    if (!map) {
      return NextResponse.json({ error: "Map not found." }, { status: 404 });
    }

    const selectedNode = payload.nodeId ? map.nodes.find((node) => node.id === payload.nodeId) : null;
    const answer = await chatAboutMap({
      question: payload.question,
      selectedNodeTitle: selectedNode?.title,
      selectedNodeContent: selectedNode ? getNodeCombinedContent(selectedNode) : undefined,
      selectedNodeWeight: selectedNode ? normalizeImportanceWeight(selectedNode.importanceWeight) : 0.5,
      mapContext: buildMapContext(map.nodes),
      weightedContext: buildWeightedMapContext(map.nodes),
      originalText: map.originalText,
      messages: payload.messages
    });

    const criteria = getImportanceCriteriaText();
    return NextResponse.json({
      answer: `${answer}\n\nImportance criteria used:\n${criteria}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate chat response." },
      { status: 500 }
    );
  }
}
