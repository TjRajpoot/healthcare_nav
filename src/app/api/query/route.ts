// src/app/api/query/route.ts
//
// POST /api/query
//
// Accepts: { question: string }
// Returns: an LLM-synthesized answer (markdown) plus the top 5 source chunks.
//
// Pipeline:
//   1. Embed the question via Gemini embeddings
//   2. Run cosine-similarity search against pgvector
//   3. Feed retrieved chunks to Gemini to synthesize a formatted answer
//   4. Return the answer + sources to the frontend

// Force this route to be server-rendered on every request.
// Without this, Next.js tries to statically evaluate the route at build time
// which fails because GEMINI_API_KEY and DATABASE_URL are not available then.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { embedText } from "@/src/lib/embeddings";
import { synthesizeAnswer } from "@/src/lib/gemini";

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

    const sources = results.map((row) => ({
      chunkId: row.id,
      documentId: row.document_id,
      content: row.content,
      chunkIndex: row.chunk_index,
      distance: row.distance,
    }));

    // 4. Synthesize a formatted answer using Gemini.
    const answer = await synthesizeAnswer(
      question.trim(),
      sources.map((s) => ({ content: s.content, chunkIndex: s.chunkIndex }))
    );

    return NextResponse.json({
      question,
      answer,
      sources,
    });
  } catch (error) {
    console.error("[/api/query] Error:", error);
    return NextResponse.json(
      { error: "Internal server error. Check server logs." },
      { status: 500 }
    );
  }
}
