import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getMapsByUser } from "@/lib/db";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const maps = await getMapsByUser(user.id);
    return NextResponse.json({ maps });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not fetch maps." },
      { status: 500 }
    );
  }
}
