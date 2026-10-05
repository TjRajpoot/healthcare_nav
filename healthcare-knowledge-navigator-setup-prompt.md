Build the initial scaffold for a project called **Healthcare Knowledge Navigator** — a medical RAG (retrieval-augmented generation) assistant that lets healthcare professionals ask questions and get evidence-based answers with citations, drawn from clinical guidelines and research papers.

## Tech stack
- Next.js 14 (App Router, TypeScript)
- PostgreSQL with the `pgvector` extension for vector similarity search
- Prisma as the ORM
- Google Gemini `gemini-embedding-001` for embeddings (1536 dimensions)
- `pdf-parse` for extracting text from PDF source documents

## What "initial setup" means here — scope this build to just these pieces, nothing more yet:
1. A Next.js + TypeScript project initialized with the App Router
2. Prisma configured with a PostgreSQL datasource
3. A Prisma schema with two models:
   - `Document`: id, title, sourceBody (e.g. "WHO", "NICE", "PubMed"), year, evidenceTier (e.g. "RCT", "cohort", "review", "expert_opinion"), filePath, createdAt, and a relation to Chunk
   - `Chunk`: id, documentId (FK), content (text), chunkIndex (int), embedding (pgvector column, 1536 dims — use Prisma's `Unsupported("vector(1536)")` type since Prisma doesn't natively support pgvector), createdAt
4. A `data/raw/` folder for source PDFs to be dropped into, and a `data/processed/` folder (can be empty with a `.gitkeep`)
5. A chunking utility (`src/lib/chunk.ts`): splits text on sentence boundaries and groups sentences into chunks of ~1200 characters with ~200 characters of overlap between consecutive chunks
6. An embeddings utility (`src/lib/embeddings.ts`): wraps Gemini's embeddings endpoint, exposing both a single-text and a batch-embed function
7. A Prisma client singleton (`src/lib/db.ts`) that avoids creating multiple clients during Next.js dev hot-reload
8. An ingestion script (`scripts/ingest.ts`): reads one PDF at a time from `data/raw/`, extracts text, chunks it, embeds each chunk, creates a `Document` row, then creates `Chunk` rows — writing the embedding via a raw parameterized SQL query (since Prisma can't write vector columns through its normal client) rather than the standard Prisma insert
9. One API route (`src/app/api/query/route.ts`): accepts a POST with a `question` string, embeds it, and runs a raw SQL cosine-similarity query against the `Chunk` table using pgvector's `<=>` operator, returning the top 5 closest chunks with their distance scores — retrieval only, no LLM synthesis yet
10. A `.env.example` with `DATABASE_URL` and `GEMINI_API_KEY` placeholders
11. A root `README.md` explaining: how to install Postgres + enable the pgvector extension (`CREATE EXTENSION vector;`), how to run `prisma db push`, how to drop a PDF in `data/raw/` and run the ingestion script, and how to hit the `/api/query` route to test retrieval

## Explicitly out of scope for this initial setup (do not build yet)
- LLM synthesis / answer generation (comes after retrieval is verified working)
- Confidence scoring
- Conflict/contradiction detection between sources
- Any frontend UI beyond a default Next.js page
- Authentication
- Multi-document manifest/config system (hardcode one document's metadata in the ingest script for now)

## Goal / definition of done
Running the ingestion script against a single downloaded PDF (e.g. a hypertension guideline) successfully populates the database with a `Document` and its `Chunk` rows with embeddings, and a test POST to `/api/query` with a relevant question returns the most semantically similar chunks from that document, ordered by cosine distance.
