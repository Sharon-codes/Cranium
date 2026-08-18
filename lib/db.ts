import { supabaseAdmin } from "@/lib/supabase-admin";
import { applyFallbackImportanceWeights, getNodeDisplayContent } from "@/lib/mindmap";
import type { MindMapDocument, MindMapNode, RevisionSet } from "@/types";

export async function ensureUserProfile(user: { id: string; email?: string | null }) {
  await supabaseAdmin.from("users").upsert({
    id: user.id,
    email: user.email
  });
}

export async function getMapsByUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("maps")
    .select("id, user_id, title, source_name, source_type, summary_mode, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getMapWithNodes(mapId: string, userId: string): Promise<MindMapDocument | null> {
  const { data: map, error: mapError } = await supabaseAdmin
    .from("maps")
    .select("*")
    .eq("id", mapId)
    .eq("user_id", userId)
    .single();

  if (mapError) return null;

  const { data: nodes, error: nodeError } = await supabaseAdmin
    .from("nodes")
    .select("*")
    .eq("map_id", mapId)
    .order("depth")
    .order("order_index");

  if (nodeError) throw nodeError;

  const mappedNodes = (nodes || []).map((node) => {
    const parts = getNodeDisplayContent({ content: node.content });

    return {
      id: node.id,
      parentId: node.parent_id,
      mapId: node.map_id,
      title: node.title,
      content: node.content,
      summary: node.summary,
      sourceContent: parts.sourceContent,
      aiContent: parts.aiContent,
      color: node.color,
      depth: node.depth,
      orderIndex: node.order_index,
      aiGenerated: Boolean(parts.aiContent?.trim()) || node.ai_generated,
      importanceWeight: node.importance_weight ?? undefined,
      x: node.position_x,
      y: node.position_y
    };
  });

  return {
    id: map.id,
    userId: map.user_id,
    title: map.title,
    sourceName: map.source_name,
    sourceType: map.source_type,
    originalText: map.original_text,
    summaryMode: map.summary_mode,
    createdAt: map.created_at,
    updatedAt: map.updated_at,
    nodes: applyFallbackImportanceWeights(mappedNodes)
  };
}

export async function createMap(params: {
  userId: string;
  title: string;
  sourceName: string;
  sourceType: string;
  originalText: string;
  filePath?: string;
  nodes: MindMapNode[];
}) {
  const { data: map, error: mapError } = await supabaseAdmin
    .from("maps")
    .insert({
      user_id: params.userId,
      title: params.title,
      source_name: params.sourceName,
      source_type: params.sourceType,
      original_text: params.originalText,
      summary_mode: false
    })
    .select("*")
    .single();

  if (mapError) throw mapError;

  if (params.filePath) {
    await supabaseAdmin.from("files").insert({
      map_id: map.id,
      user_id: params.userId,
      file_name: params.sourceName,
      mime_type: params.sourceType,
      storage_path: params.filePath
    });
  }

  const nodeRows = params.nodes.map((node) => ({
    id: node.id,
    map_id: map.id,
    parent_id: node.parentId,
    title: node.title,
    content: node.content,
    summary: node.summary,
    color: node.color,
    depth: node.depth,
    order_index: node.orderIndex,
    ai_generated: node.aiGenerated,
    importance_weight: node.importanceWeight ?? 0.5,
    position_x: node.x,
    position_y: node.y
  }));

  let { error: nodesError } = await supabaseAdmin.from("nodes").insert(nodeRows);

  if (nodesError && nodesError.message.includes("importance_weight")) {
    ({ error: nodesError } = await supabaseAdmin.from("nodes").insert(
      nodeRows.map(({ importance_weight: _importanceWeight, ...row }) => row)
    ));
  }

  if (nodesError) throw nodesError;

  return map;
}

export async function updateMapSummaryMode(mapId: string, summaryMode: boolean) {
  const { error } = await supabaseAdmin.from("maps").update({ summary_mode: summaryMode }).eq("id", mapId);
  if (error) throw error;
}

export async function saveNodePositions(mapId: string, nodes: Array<Pick<MindMapNode, "id" | "x" | "y">>) {
  const updates = nodes.map((node) =>
    supabaseAdmin
      .from("nodes")
      .update({ position_x: node.x, position_y: node.y })
      .eq("map_id", mapId)
      .eq("id", node.id)
  );

  await Promise.all(updates);
}

export async function deleteMap(mapId: string, userId: string) {
  const { error } = await supabaseAdmin.from("maps").delete().eq("id", mapId).eq("user_id", userId);
  if (error) throw error;
}

export async function createRevisionSet(set: Omit<RevisionSet, "createdAt"> & { userId: string }) {
  const { data, error } = await supabaseAdmin
    .from("revision_sets")
    .insert({
      id: set.id,
      map_id: set.mapId,
      user_id: set.userId,
      type: set.type,
      scope: set.scope,
      title: set.title,
      items: set.items
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getRevisionSets(mapId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("revision_sets")
    .select("*")
    .eq("map_id", mapId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
