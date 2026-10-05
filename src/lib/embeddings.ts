// src/lib/embeddings.ts
//
// Thin wrapper around Google Gemini's embedding model.
// Exposes:
//   embedText(text)      — embed a single string
//   embedBatch(texts)    — embed an array of strings
//

import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!_ai) {
    if (!process.env.GEMINI_API_KEY && typeof process.loadEnvFile === "function") {
      try {
        process.loadEnvFile();
      } catch {
        // .env might not exist or already loaded
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Please add GEMINI_API_KEY to your .env file."
      );
    }

    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Embed a single text string.
 * Returns a number array of EMBEDDING_DIMENSIONS values.
 */
export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });

  const embedding = response.embeddings?.[0]?.values;
  if (!embedding) {
    throw new Error("Failed to generate embedding: no embedding values returned from Gemini API");
  }

  return embedding;
}

/**
 * Embed an array of strings.
 * Batches requests in chunks of 50 to avoid request size limits.
 * Returns a 2-D array: one embedding per input text, in the same order.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH_SIZE = 50;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    const client = getClient();
  const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: chunk,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });

    if (!response.embeddings || response.embeddings.length !== chunk.length) {
      throw new Error(
        `Failed to generate embeddings batch: expected ${chunk.length} embeddings, received ${response.embeddings?.length ?? 0}`
      );
    }

    for (const item of response.embeddings) {
      if (!item.values) {
        throw new Error("Missing values in embedding response");
      }
      allEmbeddings.push(item.values);
    }
  }

  return allEmbeddings;
}

