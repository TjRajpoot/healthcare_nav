// scripts/ingest.ts
//
// Ingestion pipeline: reads ONE PDF at a time from data/raw/, extracts text,
// chunks it, embeds each chunk, creates a Document row, and bulk-inserts Chunk
// rows with their embeddings via raw SQL (required for pgvector columns).
//
// Usage:
//   npx tsx scripts/ingest.ts [path/to/file.pdf]
//
// If no path is given, it processes the FIRST PDF found in data/raw/.
//
// Document metadata is hardcoded below for this initial run — update the
// DOCUMENT_METADATA object to match the PDF you are ingesting.

import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { PrismaClient } from "@prisma/client";
import { embedBatch } from "../src/lib/embeddings";
import { chunkText } from "../src/lib/chunk";

// ---------------------------------------------------------------------------
// Hardcoded metadata for the document being ingested in this initial run.
// Update these fields to match the PDF you are dropping into data/raw/.
// ---------------------------------------------------------------------------
const DOCUMENT_METADATA = {
  title: "WHO Hypertension Guidelines",
  sourceBody: "WHO",
  year: 2023,
  evidenceTier: "review", // "RCT" | "cohort" | "review" | "expert_opinion"
};

// ---------------------------------------------------------------------------

const RAW_DIR = path.resolve(process.cwd(), "data/raw");

async function main() {
  // 1. Determine which PDF to ingest.
  const targetFile = process.argv[2]
    ? path.resolve(process.argv[2])
    : findFirstPdf(RAW_DIR);

  if (!targetFile) {
    console.error(`No PDF found in ${RAW_DIR}. Drop a PDF there and retry.`);
    process.exit(1);
  }

  console.log(`\n📄 Ingesting: ${targetFile}`);

  // 2. Extract text from the PDF.
  const pdfBuffer = fs.readFileSync(targetFile);
  const { text } = await pdfParse(pdfBuffer);

  if (!text || text.trim().length === 0) {
    console.error("PDF text extraction returned empty content. Aborting.");
    process.exit(1);
  }

  console.log(`   Extracted ${text.length.toLocaleString()} characters of text.`);

  // 3. Chunk the text.
  const chunks = chunkText(text);
  console.log(`   Split into ${chunks.length} chunks.`);

  // 4. Embed all chunks (batched API calls).
  console.log("   Embedding chunks via Gemini embedding model…");
  const embeddings = await embedBatch(chunks);
  console.log("   Embeddings received.");

  // 5. Persist to the database.
  const prisma = new PrismaClient();

  try {
    // 5a. Create the Document row.
    const document = await prisma.document.create({
      data: {
        title: DOCUMENT_METADATA.title,
        sourceBody: DOCUMENT_METADATA.sourceBody,
        year: DOCUMENT_METADATA.year,
        evidenceTier: DOCUMENT_METADATA.evidenceTier,
        filePath: targetFile,
      },
    });

    console.log(`   Created Document row: ${document.id}`);

    // 5b. Insert Chunk rows with embeddings via raw SQL.
    //     Prisma cannot write vector() columns through its normal client, so we
    //     use $executeRawUnsafe with a parameterised INSERT for each chunk.
    //     We do this one-at-a-time to keep the implementation simple and
    //     readable; a bulk INSERT would be faster for large documents.
    console.log(`   Inserting ${chunks.length} Chunk rows…`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];
      const embedding = embeddings[i];
      const embeddingLiteral = `[${embedding.join(",")}]`;

      // Generate a cuid-like unique id using crypto (available in Node 16+).
      const chunkId = crypto.randomUUID();

      await prisma.$executeRawUnsafe(
        `INSERT INTO "Chunk" (id, "documentId", content, "chunkIndex", embedding, "createdAt")
         VALUES ($1, $2, $3, $4, $5::vector, NOW())`,
        chunkId,
        document.id,
        chunkContent,
        i,
        embeddingLiteral
      );

      if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
        process.stdout.write(`\r   Inserted ${i + 1}/${chunks.length} chunks…`);
      }
    }

    console.log("\n\n✅ Ingestion complete!");
    console.log(`   Document ID : ${document.id}`);
    console.log(`   Chunks saved: ${chunks.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

function findFirstPdf(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const pdf = files.find((f) => f.toLowerCase().endsWith(".pdf"));
  return pdf ? path.join(dir, pdf) : null;
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
