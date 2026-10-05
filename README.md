# Healthcare Knowledge Navigator

A medical RAG (retrieval-augmented generation) assistant that lets healthcare professionals ask questions and receive evidence-based answers with citations, drawn from clinical guidelines and research papers.

> **Current status:** Initial scaffold — retrieval pipeline only. LLM synthesis, confidence scoring, and UI are out of scope for this phase.

---

## Tech Stack

| Layer | Technology |
|---|---|
| App framework | Next.js 14 (App Router, TypeScript) |
| Database | PostgreSQL + `pgvector` extension |
| ORM | Prisma 5 |
| Embeddings | Google Gemini `gemini-embedding-001` (1536 dims) |
| PDF extraction | `pdf-parse` |

---

## Prerequisites

### 1. PostgreSQL with pgvector

Install PostgreSQL (≥14) and the `pgvector` extension.

**macOS (Homebrew):**
```bash
brew install postgresql pgvector
brew services start postgresql
```

**Create the database and enable the extension:**
```sql
CREATE DATABASE healthcare_navigator;
\c healthcare_navigator
CREATE EXTENSION vector;
```

Verify:
```sql
SELECT extname FROM pg_extension WHERE extname = 'vector';
-- should return: vector
```

### 2. Node.js

Node.js ≥ 18 is required (uses `crypto.randomUUID()` built-in).

---

## Setup

### 1. Clone & install dependencies

```bash
git clone <repo-url>
cd "Medical RAG Project"
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/healthcare_navigator"
GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Apply the database schema

```bash
npx prisma db push
```

This creates the `Document` and `Chunk` tables in PostgreSQL.

> **Note:** `prisma db push` skips migration history — it's appropriate for prototyping. Switch to `prisma migrate dev` when you need migration tracking.

---

## Ingesting a Document

1. **Drop a PDF** into `data/raw/`:
   ```bash
   cp ~/Downloads/hypertension-guideline.pdf data/raw/
   ```

2. **Update document metadata** in `scripts/ingest.ts` — find the `DOCUMENT_METADATA` object near the top of the file and set the `title`, `sourceBody`, `year`, and `evidenceTier` to match your PDF:
   ```ts
   const DOCUMENT_METADATA = {
     title: "WHO Hypertension Guidelines 2023",
     sourceBody: "WHO",
     year: 2023,
     evidenceTier: "review",
   };
   ```
   Valid `evidenceTier` values: `"RCT"` | `"cohort"` | `"review"` | `"expert_opinion"`

3. **Run the ingestion script:**
   ```bash
   npm run ingest
   # or, to specify a file explicitly:
   npx tsx scripts/ingest.ts data/raw/my-file.pdf
   ```

   Expected output:
   ```
   📄 Ingesting: /path/to/data/raw/hypertension-guideline.pdf
      Extracted 142,803 characters of text.
      Split into 118 chunks.
      Embedding chunks via Gemini embedding model…
      Embeddings received.
      Created Document row: clxxxxxxxxxxxxxx
      Inserting 118 Chunk rows…
      Inserted 118/118 chunks…

   ✅ Ingestion complete!
      Document ID : clxxxxxxxxxxxxxx
      Chunks saved: 118
   ```

---

## Testing Retrieval

Start the dev server:
```bash
npm run dev
```

POST a question to the query endpoint:

```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the first-line treatment for stage 2 hypertension?"}'
```

**Expected response shape:**
```json
{
  "question": "What is the first-line treatment for stage 2 hypertension?",
  "results": [
    {
      "chunkId": "clxxx...",
      "documentId": "clxxx...",
      "content": "For adults with stage 2 hypertension ...",
      "chunkIndex": 42,
      "distance": 0.1234
    },
    ...
  ]
}
```

Results are ordered by **cosine distance ascending** — `distance: 0` is a perfect match, `distance: 1` is orthogonal.

---

## Project Structure

```
.
├── data/
│   ├── raw/            ← Drop source PDFs here
│   └── processed/      ← Reserved for future processed output
├── prisma/
│   └── schema.prisma   ← Document + Chunk models
├── scripts/
│   └── ingest.ts       ← PDF → chunks → embeddings → DB
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── api/
│   │       └── query/
│   │           └── route.ts   ← POST /api/query
│   └── lib/
│       ├── db.ts           ← Prisma singleton
│       ├── chunk.ts        ← Sentence-boundary chunker
│       └── embeddings.ts   ← Gemini embeddings wrapper
├── .env.example
├── next.config.js
├── package.json
└── tsconfig.json
```

---

## Out of Scope (Next Phases)

- LLM synthesis / answer generation
- Confidence scoring
- Conflict/contradiction detection between sources
- Frontend UI
- Authentication
- Multi-document manifest / config system
