// src/app/api/query/route.ts
//
// POST /api/query
//
// Accepts: { question: string }
// Returns: top 5 Chunk rows ordered by cosine distance to the question embedding.
//
// Uses pgvector's <=> (cosine distance) operator via raw SQL because Prisma
// does not natively support vector operations.

// Force this route to be server-rendered on every request.
// Without this, Next.js tries to statically evaluate the route at build time
// which fails because GEMINI_API_KEY and DATABASE_URL are not available then.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { embedText } from "@/src/lib/embeddings";

const TOP_K = 5;

interface ChunkResult {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  distance: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question } = body as { question?: string };

    if (!question || typeof question !== "string" || question.trim() === "") {
      return NextResponse.json(
        { error: "A non-empty `question` string is required." },
        { status: 400 }
      );
    }

    // 1. Embed the question.
    const queryEmbedding = await embedText(question.trim());

    // 2. Format the embedding as a pgvector literal: '[0.1, 0.2, ...]'
    const embeddingLiteral = `[${queryEmbedding.join(",")}]`;

    // 3. Run cosine-similarity search using pgvector's <=> operator.
    //    <=> returns cosine *distance* (0 = identical, 1 = orthogonal, 2 = opposite).
    //    We ORDER BY distance ASC so the most similar chunks come first.
    const results = await db.$queryRaw<ChunkResult[]>`
      SELECT
        c.id,
        c."documentId" AS document_id,
        c.content,
        c."chunkIndex" AS chunk_index,
        (c.embedding <=> ${embeddingLiteral}::vector) AS distance
      FROM "Chunk" c
      ORDER BY distance ASC
      LIMIT ${TOP_K}
    `;

    return NextResponse.json({
      question,
      results: results.map((row) => ({
        chunkId: row.id,
        documentId: row.document_id,
        content: row.content,
        chunkIndex: row.chunk_index,
        distance: row.distance,
      })),
    });
  } catch (error) {
    console.error("[/api/query] Error:", error);
    return NextResponse.json(
      { error: "Internal server error. Check server logs." },
      { status: 500 }
    );
  }
}
