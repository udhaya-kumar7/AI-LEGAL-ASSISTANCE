import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const DATASET_DIR = fileURLToPath(new URL('../data/legal_dataset', import.meta.url));

const CORE_LAWS = [
  {
    name: 'Constitution_of_India_Summary.txt',
    query: 'Constitution_of_India'
  },
  {
    name: 'Indian_Penal_Code_Summary.txt',
    query: 'Indian_Penal_Code'
  },
  {
    name: 'Code_of_Civil_Procedure_Summary.txt',
    query: 'Code_of_Civil_Procedure_(India)'
  }
];

async function fetchWikipediaExtract(title) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${title}&format=json`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'AntigravityLegalBot/1.0 (contact@example.com)' } });
    const pages = res.data.query.pages;
    const pageId = Object.keys(pages)[0];
    return pages[pageId].extract;
  } catch (err) {
    console.error(`Failed to fetch ${title}:`, err.message);
    return null;
  }
}

async function main() {
  console.log('[Downloader] Ensuring dataset directory exists...');
  await fs.mkdir(DATASET_DIR, { recursive: true });

  for (const law of CORE_LAWS) {
    console.log(`[Downloader] Fetching ${law.name}...`);
    const content = await fetchWikipediaExtract(law.query);
    
    if (content) {
      const filePath = path.join(DATASET_DIR, law.name);
      
      // Append a note that for detailed sections, Google Search Grounding will be used
      const finalContent = content + "\n\nNote for Legal AI: For specific sections, articles, and detailed provisions of this law, use your Google Search Grounding capability to fetch the exact text from the internet.";
      
      await fs.writeFile(filePath, finalContent, 'utf-8');
      console.log(`[Downloader] Saved ${law.name} to ${filePath}`);
    }
  }
  
  console.log('[Downloader] Finished downloading core laws. Restart the backend to begin throttled ingestion.');
}

main().catch(console.error);
