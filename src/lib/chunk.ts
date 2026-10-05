// src/lib/chunk.ts
//
// Splits a long text string into overlapping chunks suitable for embedding.
// Strategy:
//   1. Split on sentence boundaries (. ! ? followed by whitespace or end).
//   2. Accumulate sentences until the chunk reaches ~TARGET_CHARS characters.
//   3. When a chunk closes, carry the last ~OVERLAP_CHARS of text forward into
//      the next chunk so semantically adjacent content shares context.

const TARGET_CHARS = 1200;
const OVERLAP_CHARS = 200;

/**
 * Split `text` into overlapping sentence-boundary chunks.
 * Returns an array of chunk strings.
 */
export function chunkText(text: string): string[] {
  // Normalise whitespace: collapse multiple newlines / spaces
  const normalised = text.replace(/\s+/g, " ").trim();

  // Split into sentences. The regex keeps the delimiter attached to the preceding
  // token so we don't lose punctuation.
  const sentences = normalised.match(/[^.!?]+[.!?]+[\s]*/g) ?? [normalised];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    // If adding this sentence keeps us under the target, accumulate it.
    if (current.length + sentence.length <= TARGET_CHARS) {
      current += sentence;
    } else {
      // Save the current chunk (if non-empty).
      if (current.trim().length > 0) {
        chunks.push(current.trim());
      }

      // Build the overlap tail: take the last OVERLAP_CHARS of the chunk we
      // just closed so the next chunk shares a little context.
      const overlap =
        current.length > OVERLAP_CHARS
          ? current.slice(current.length - OVERLAP_CHARS)
          : current;

      current = overlap + sentence;
    }
  }

  // Push the final chunk.
  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}
