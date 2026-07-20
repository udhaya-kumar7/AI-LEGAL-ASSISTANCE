import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestDocument } from './ingestion.js';
import { LegalDocument } from '../models/LegalDocument.js';

const DATASET_DIR = fileURLToPath(new URL('../../data/legal_dataset', import.meta.url));
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt']);

function isAllowedFile(fileName) {
  return ALLOWED_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export async function ensureDatasetDirectory() {
  await fs.mkdir(DATASET_DIR, { recursive: true });
}

export async function bootstrapDatasetIngestion() {
  await ensureDatasetDirectory();

  const allEntries = await fs.readdir(DATASET_DIR, { withFileTypes: true });
  const files = allEntries
    .filter(entry => entry.isFile() && isAllowedFile(entry.name))
    .map(entry => entry.name);

  if (files.length === 0) {
    console.log(`[Dataset Bootstrap] No .pdf/.txt files found in ${DATASET_DIR}`);
    return { total: 0, ingested: 0, failed: 0 };
  }

  console.log(`[Dataset Bootstrap] Found ${files.length} file(s) in ${DATASET_DIR}`);

  let ingested = 0;
  let failed = 0;

  for (const fileName of files) {
    const filePath = path.join(DATASET_DIR, fileName);

    try {
      const buffer = await fs.readFile(filePath);
      const stat = await fs.stat(filePath);

      const result = await ingestDocument(buffer, fileName, {
        chunkSize: 1000,
        chunkOverlap: 200
      });

      const ext = path.extname(fileName).toLowerCase().slice(1);
      await LegalDocument.findOneAndUpdate(
        { originalName: fileName },
        {
          documentId: result.documentId,
          filename: fileName,
          originalName: fileName,
          fileType: ext,
          fileSize: stat.size,
          numPages: result.numPages,
          numChunks: result.numChunks,
          status: 'indexed',
          indexedAt: new Date(),
          jurisdiction: 'india',
          documentType: 'other',
          processingError: undefined
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true
        }
      );

      ingested += 1;
      console.log(`[Dataset Bootstrap] Indexed ${fileName} (${result.numChunks} chunks)`);
    } catch (err) {
      failed += 1;
      console.error(`[Dataset Bootstrap] Failed ${fileName}:`, err.message);

      await LegalDocument.findOneAndUpdate(
        { originalName: fileName },
        {
          filename: fileName,
          originalName: fileName,
          fileType: path.extname(fileName).toLowerCase().slice(1),
          status: 'failed',
          processingError: err.message
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
    }
  }

  console.log(`[Dataset Bootstrap] Completed: ${ingested} ingested, ${failed} failed`);
  return { total: files.length, ingested, failed };
}

export { DATASET_DIR };
