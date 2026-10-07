// src/lib/gemini.ts
//
// Thin wrapper around Google Gemini's generative model.
// Used for LLM synthesis: turning retrieved RAG chunks into
// formatted, evidence-based answers.

import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!_ai) {
    if (
      !process.env.GEMINI_API_KEY &&
      typeof process.loadEnvFile === "function"
    ) {
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

const GENERATION_MODEL =
  process.env.GEMINI_GENERATION_MODEL || "gemini-2.5-flash";

/**
 * Given a user question and an array of relevant source passages,
 * synthesize a clear, well-formatted markdown answer grounded in the sources.
 */
export async function synthesizeAnswer(
  question: string,
  sources: { content: string; chunkIndex: number }[]
): Promise<string> {
  if (sources.length === 0) {
    return "I couldn't find any relevant passages in the knowledge base to answer your question. Please try rephrasing or ensure that relevant documents have been ingested.";
  }

  const sourcesBlock = sources
    .map(
      (s, i) =>
        `[Source ${i + 1} (chunk ${s.chunkIndex})]:\n${s.content}`
    )
    .join("\n\n---\n\n");

  const systemPrompt = `You are a medical knowledge assistant. Your role is to answer healthcare questions using ONLY the provided source passages from clinical guidelines and research papers.

Rules:
- Base your answer strictly on the provided sources. Do not add information not present in the sources.
- Use clear, professional medical language.
- Structure your answer with markdown: use headings (##), bullet points, bold for key terms, and numbered lists where appropriate.
- If the sources contain specific drug names, dosages, or classifications, include them.
- At the end, add a brief "Sources" section noting which source numbers you used.
- If the sources don't contain enough information to fully answer the question, say so explicitly.
- Keep answers concise but thorough — aim for 150-400 words.`;

  const userPrompt = `Question: ${question}

Retrieved Sources:
${sourcesBlock}

Please provide a well-structured, evidence-based answer using markdown formatting.`;

  const client = getClient();
  const response = await client.models.generateContent({
    model: GENERATION_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  return text;
}
