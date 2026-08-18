import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createMap, ensureUserProfile } from "@/lib/db";
import { topicTreeToNodes } from "@/lib/mindmap";
import { generateTopicTree } from "@/lib/openai";
import { parseDocument } from "@/lib/parsers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await ensureUserProfile({ id: user.id, email: user.email });
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const parsed = await parseDocument(file);
    const topicTree = await generateTopicTree(parsed);
    const nodes = topicTreeToNodes(topicTree);

    let storagePath: string | undefined;
    try {
      const extension = file.name.split(".").pop() || "bin";
      storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabaseAdmin.storage.from("documents").upload(storagePath, file, {
        upsert: false,
        contentType: file.type
      });
      if (error) {
        storagePath = undefined;
      }
    } catch {
      storagePath = undefined;
    }

    const map = await createMap({
      userId: user.id,
      title: topicTree.title,
      sourceName: file.name,
      sourceType: parsed.sourceType,
      originalText: parsed.content,
      filePath: storagePath,
      nodes
    });

    return NextResponse.json({ mapId: map.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not process upload." },
      { status: 500 }
    );
  }
}
