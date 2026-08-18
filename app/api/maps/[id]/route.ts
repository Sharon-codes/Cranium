import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { deleteMap, getMapWithNodes, saveNodePositions, updateMapSummaryMode } from "@/lib/db";

const summarySchema = z.object({
  summaryMode: z.boolean()
});

const positionSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      x: z.number(),
      y: z.number()
    })
  )
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await params;
    const map = await getMapWithNodes(id, user.id);
    return NextResponse.json({ map });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch map." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await params;
    const map = await getMapWithNodes(id, user.id);
    if (!map) {
      return NextResponse.json({ error: "Map not found." }, { status: 404 });
    }
    const payload = summarySchema.parse(await request.json());
    await updateMapSummaryMode(id, payload.summaryMode);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update summary mode." },
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
    const map = await getMapWithNodes(id, user.id);
    if (!map) {
      return NextResponse.json({ error: "Map not found." }, { status: 404 });
    }
    const payload = positionSchema.parse(await request.json());
    await saveNodePositions(id, payload.nodes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save layout." },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await params;
    await deleteMap(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete map." },
      { status: 500 }
    );
  }
}
