import os
import io
import time
import math
import logging
import re
import json
import hashlib
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, Response, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import dotenv
from openai import OpenAI
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
import pdfplumber
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

# Load environment variables
dotenv.load_dotenv()

# Logger configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("legal-assistant-python")

# Global app state storage
state = {}

def normalize_vector(v):
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm

def extract_pdf_text(file_bytes):
    text = ""
    num_pages = 0
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            num_pages = len(pdf.pages)
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {e}")
        raise e
    return text, num_pages

def generate_doc_id(filename, content):
    hash_str = hashlib.md5(content[:1000].encode("utf-8")).hexdigest()[:8]
    return f"doc_{int(time.time() * 1000)}_{hash_str}"

def chunk_text(text, chunk_size=1000, chunk_overlap=200):
    chunks = []
    start_idx = 0
    chunk_num = 1
    min_chunk_size = 100
    
    while start_idx < len(text):
        end_idx = min(start_idx + chunk_size, len(text))
        
        # Try to find a good sentence or paragraph break point
        if end_idx < len(text):
            search_window = text[max(0, end_idx - 100):min(len(text), end_idx + 100)]
            paragraph_break = search_window.rfind("\n\n")
            if paragraph_break != -1 and paragraph_break > 50:
                end_idx = end_idx - 100 + paragraph_break + 2
            else:
                sentence_match = list(re.finditer(r'[.!?]\s', search_window))
                if sentence_match:
                    sentence_end = -1
                    for m in sentence_match:
                        if m.start() > 50:
                            sentence_end = m.start()
                    if sentence_end != -1:
                        end_idx = end_idx - 100 + sentence_end + 2
                        
        chunk_str = text[start_idx:end_idx].strip()
        if len(chunk_str) >= min_chunk_size:
            chunks.append({
                "text": chunk_str,
                "startChar": start_idx,
                "endChar": end_idx,
                "chunkIndex": chunk_num
            })
            chunk_num += 1
            
        if end_idx >= len(text):
            break
            
        next_start = end_idx - chunk_overlap
        if next_start <= start_idx:
            break
        start_idx = next_start
        if start_idx >= len(text) - min_chunk_size:
            break
            
    return chunks

def extract_legal_sections(text):
    sections = []
    patterns = [
        ("chapter", re.compile(r"chapter\s+(\d+|[ivxlcdm]+)[.:]\s*([^\n]+)", re.IGNORECASE)),
        ("section", re.compile(r"section\s+(\d+[a-z]?)[.:]\s*([^\n]+)", re.IGNORECASE)),
        ("article", re.compile(r"article\s+(\d+)[.:]\s*([^\n]+)", re.IGNORECASE)),
        ("clause", re.compile(r"clause\s+(\d+)[.:]\s*([^\n]+)", re.IGNORECASE)),
        ("rule", re.compile(r"rule\s+(\d+)[.:]\s*([^\n]+)", re.IGNORECASE))
    ]
    
    for type_name, regex in patterns:
        for match in regex.finditer(text):
            sections.append({
                "type": type_name,
                "number": match.group(1),
                "title": match.group(2).strip(),
                "position": match.start()
            })
            
    sections.sort(key=lambda s: s["position"])
    return sections

async def bootstrap_dataset():
    db = state["db"]
    model = state["model"]
    index = state["index"]
    chunks_store = state["chunks"]
    
    # Dataset path relative to main.py
    dataset_dir = os.path.join(os.path.dirname(__file__), "data", "legal_dataset")
    if not os.path.exists(dataset_dir):
        logger.info(f"[Dataset Bootstrap] Path {dataset_dir} not found. Skipping bootstrap.")
        return
        
    files = [f for f in os.listdir(dataset_dir) if f.lower().endswith((".pdf", ".txt"))]
    if not files:
        logger.info(f"[Dataset Bootstrap] No .pdf/.txt files found in {dataset_dir}")
        return
        
    logger.info(f"[Dataset Bootstrap] Found {len(files)} files in dataset directory: {files}")
    
    for filename in files:
        filepath = os.path.join(dataset_dir, filename)
        try:
            with open(filepath, "rb") as f:
                content = f.read()
                
            ext = filename.split(".")[-1].lower()
            if ext == "pdf":
                text, num_pages = extract_pdf_text(content)
            else:
                text = content.decode("utf-8", errors="ignore")
                num_pages = 1
                
            document_id = generate_doc_id(filename, text)
            legal_sections = extract_legal_sections(text)
            chunks = chunk_text(text, 1000, 200)
            
            new_embeddings = []
            new_chunks = []
            for i, chunk in enumerate(chunks):
                relevant_section = None
                for s in reversed(legal_sections):
                    if s["position"] <= chunk["startChar"]:
                        relevant_section = f"{s['type']} {s['number']}: {s['title']}"
                        break
                        
                chunk_metadata = {
                    "documentId": document_id,
                    "source": filename,
                    "numPages": num_pages,
                    "chunkIndex": chunk["chunkIndex"],
                    "startChar": chunk["startChar"],
                    "endChar": chunk["endChar"],
                    "section": relevant_section
                }
                
                vector = model.encode(chunk["text"])
                vector = normalize_vector(vector)
                
                new_embeddings.append(vector)
                new_chunks.append({
                    "id": f"{document_id}_chunk_{i+1}",
                    "text": chunk["text"],
                    "metadata": chunk_metadata
                })
                
            if new_embeddings:
                embeddings_np = np.array(new_embeddings, dtype="float32")
                index.add(embeddings_np)
                chunks_store.extend(new_chunks)
                
            await db.legaldocuments.find_one_and_update(
                {"originalName": filename},
                {"$set": {
                    "documentId": document_id,
                    "filename": filename,
                    "originalName": filename,
                    "fileType": ext,
                    "fileSize": len(content),
                    "numPages": num_pages,
                    "numChunks": len(new_chunks),
                    "status": "indexed",
                    "indexedAt": datetime.utcnow(),
                    "extractedSections": [{"type": s["type"], "number": s["number"], "title": s["title"], "position": s["position"]} for s in legal_sections]
                }},
                upsert=True
            )
            logger.info(f"[Dataset Bootstrap] Indexed {filename} ({len(new_chunks)} chunks)")
        except Exception as e:
            logger.error(f"[Dataset Bootstrap] Failed to bootstrap {filename}: {e}")
            await db.legaldocuments.find_one_and_update(
                {"originalName": filename},
                {"$set": {
                    "filename": filename,
                    "originalName": filename,
                    "fileType": filename.split(".")[-1].lower() if "." in filename else "txt",
                    "status": "failed",
                    "processingError": str(e)
                }},
                upsert=True
            )

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load model and FAISS on startup
    logger.info("[Startup] Loading SentenceTransformer model ('all-MiniLM-L6-v2')...")
    state["model"] = SentenceTransformer("all-MiniLM-L6-v2")
    
    logger.info("[Startup] Initializing FAISS flat index...")
    state["index"] = faiss.IndexFlatIP(384)
    state["chunks"] = [] # In-memory list matching FAISS rows
    
    # Initialize MongoDB Client
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/eventdb")
    logger.info(f"[Startup] Connecting to MongoDB at: {mongo_uri}")
    state["mongo_client"] = AsyncIOMotorClient(mongo_uri)
    db_name = mongo_uri.split("/")[-1].split("?")[0] or "eventdb"
    state["db"] = state["mongo_client"][db_name]
    
    # Run dataset bootstrap
    await bootstrap_dataset()
    
    yield
    # Cleanup on shutdown
    logger.info("[Shutdown] Closing MongoDB connection...")
    state["mongo_client"].close()

# App initialization
app = FastAPI(lifespan=lifespan)

# CORS middleware config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def serialize_doc(doc):
    if not doc:
        return doc
    doc["_id"] = str(doc["_id"])
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc

def retrieve_context(query: str, top_k: int = 5) -> str:
    index = state["index"]
    chunks = state["chunks"]
    model = state["model"]
    
    if index.ntotal == 0:
        return ""
        
    query_vector = model.encode(query)
    query_vector = normalize_vector(query_vector)
    
    distances, indices = index.search(np.array([query_vector], dtype='float32'), top_k)
    
    retrieved_chunks = []
    for idx in indices[0]:
        if idx < 0 or idx >= len(chunks):
            continue
        retrieved_chunks.append(chunks[idx])
        
    context_str = ""
    for i, chunk in enumerate(retrieved_chunks):
        source = chunk["metadata"].get("source", "document")
        page = chunk["metadata"].get("page", "")
        page_info = f" (Page {page})" if page else ""
        context_str += f"--- [Source {i+1}] {source}{page_info} ---\n{chunk['text']}\n\n"
        
    return context_str

# Prompts
LEGAL_SYSTEM_PROMPT = """
You are an expert LEGAL AI ASSISTANT specializing in law and legal solutions.

YOUR PRIMARY ROLE:
- Answer ONLY legal questions and provide legal solutions
- Focus on Indian legal framework (IPC, CPC, Constitution, etc.)
- Also handle general legal questions from any jurisdiction
- Be conversational, friendly, and clear like ChatGPT

CORE INSTRUCTIONS:
1. EVERY answer must be law-related or legal in nature
2. If asked non-legal questions, politely redirect: "I'm specialized in legal matters. Please ask me legal questions about laws, acts, sections, rights, procedures, etc."
3. For legal queries, provide:
   - Clear explanation of the law/section
   - Real-world application
   - Key points in simple language
   - Practical guidance

EXPERTISE AREAS:
- Indian Penal Code (IPC) - all sections
- Code of Civil Procedure (CPC)
- Indian Constitution & fundamental rights
- Criminal Procedure Code (CrPC)
- Contract law, agreements, disputes
- Family law (marriage, divorce, custody)
- Labor laws & employment
- Tax laws & GST
- Intellectual property & patents
- Consumer protection
- Environmental law
- Real estate & property law
- Corporate law
- Succession & inheritance

TONE:
- Professional but conversational (like ChatGPT)
- Use simple, everyday English
- Avoid legal jargon unless necessary; explain terms clearly
- Be friendly and helpful
- Short paragraphs for clarity

STRICT RULES:
- Do NOT answer non-legal questions
- Do NOT drift to unrelated topics
- Do NOT provide financial/investment advice (only legal aspects)
- Do NOT provide medical advice
- ALWAYS stay focused on law and legal solutions
- If uncertain about a legal answer, say "I'm not certain, but typically..." rather than making up answers
- When provided with REFERENCE DOCUMENTS, base your answer primarily on that information
- Always cite sources when using reference documents (e.g., "According to [Source 1]...")

IMPORTANT: Your only purpose is to be a legal expert. Focus exclusively on law.
"""

RAG_SYSTEM_PROMPT = """
You are an expert LEGAL AI ASSISTANT with access to a legal document database.

CRITICAL INSTRUCTIONS FOR DOCUMENT-GROUNDED RESPONSES:
1. You have been provided with REFERENCE DOCUMENTS below
2. BASE YOUR ANSWER PRIMARILY on these reference documents
3. ALWAYS CITE your sources using [Source X] notation
4. If the reference documents don't fully answer the question, say so and provide general legal guidance
5. DO NOT make up information - only use what's in the documents or your verified legal knowledge
6. If information conflicts between sources, mention the discrepancy

CITATION FORMAT:
- Use [Source 1], [Source 2], etc. to cite specific documents
- Include page numbers when available: [Source 1, Page 5]
- For direct quotes, use quotation marks

REFERENCE DOCUMENTS:
{context}

---

Now answer the user's question based on the above reference documents.
"""

DOCUMENT_ANALYSIS_PROMPT = """You are an expert LEGAL DOCUMENT ANALYST. Analyze the provided document thoroughly and:

1. **Document Type**: Identify what type of legal document this is (contract, agreement, notice, petition, etc.)

2. **Key Provisions**: Summarize the main legal provisions, clauses, or terms

3. **Legal Compliance**: Check for missing clauses, ambiguous language, potential issues, non-standard provisions

4. **Risk Assessment**: Identify high-risk clauses, obligations, liabilities, rights that may be waived

5. **Recommendations**: Provide specific guidance on corrections needed, missing elements, lawyer review items

Be thorough, clear, and practical. Focus on actionable insights."""

# --------------------------
# API Endpoints
# --------------------------

@app.get("/health")
@app.get("/api/health")
async def get_health():
    return {"status": "ok"}

# GET /api/chats
@app.get("/api/chats")
async def list_chats():
    db = state["db"]
    cursor = db.chats.find().sort("createdAt", -1)
    chats = []
    async for chat in cursor:
        chats.append(serialize_doc(chat))
    return {"data": chats}

# POST /api/chats
@app.post("/api/chats")
async def create_chat(payload: dict = None):
    db = state["db"]
    title = (payload or {}).get("title", "New chat").strip() or "New chat"
    chat_doc = {
        "title": title,
        "createdAt": datetime.utcnow()
    }
    result = await db.chats.insert_one(chat_doc)
    chat_doc["_id"] = str(result.inserted_id)
    chat_doc["createdAt"] = chat_doc["createdAt"].isoformat()
    return {"data": chat_doc}

# PATCH /api/chats/{chat_id}
@app.patch("/api/chats/{chat_id}")
async def rename_chat(chat_id: str, payload: dict):
    db = state["db"]
    title = payload.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    try:
        oid = ObjectId(chat_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid chat ID format")
    
    result = await db.chats.find_one_and_update(
        {"_id": oid},
        {"$set": {"title": title}},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"data": serialize_doc(result)}

# POST /api/chats/{chat_id} - fallback override for patch in frontend
@app.post("/api/chats/{chat_id}")
async def post_rename_chat(chat_id: str, payload: dict):
    if payload.get("_method") == "PATCH" or "title" in payload:
        return await rename_chat(chat_id, payload)
    raise HTTPException(status_code=405, detail="Method Not Allowed")

# DELETE /api/chats/{chat_id}
@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    db = state["db"]
    try:
        oid = ObjectId(chat_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid chat ID format")
    
    chat = await db.chats.find_one_and_delete({"_id": oid})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    await db.messages.delete_many({"chatId": chat_id})
    return {"data": {"deleted": True}}

# GET /api/chats/{chat_id}/messages
@app.get("/api/chats/{chat_id}/messages")
async def list_messages(chat_id: str, limit: int = 200):
    db = state["db"]
    limit = min(max(limit, 1), 500)
    cursor = db.messages.find({"chatId": chat_id}).sort("createdAt", 1).limit(limit)
    messages = []
    async for msg in cursor:
        messages.append(serialize_doc(msg))
    return {"data": messages}

# POST /api/chats/{chat_id}/messages
@app.post("/api/chats/{chat_id}/messages")
async def post_message(chat_id: str, payload: dict):
    db = state["db"]
    role = payload.get("role")
    text = payload.get("text")
    if not role or not text:
        raise HTTPException(status_code=400, detail="role and text are required")
    
    msg_doc = {
        "chatId": chat_id,
        "role": role,
        "text": text,
        "createdAt": datetime.utcnow()
    }
    result = await db.messages.insert_one(msg_doc)
    msg_doc["_id"] = str(result.inserted_id)
    msg_doc["createdAt"] = msg_doc["createdAt"].isoformat()
    return {"data": msg_doc}

# GET /api/messages
@app.get("/api/messages")
async def list_recent_messages(limit: int = 50):
    db = state["db"]
    limit = min(max(limit, 1), 200)
    cursor = db.messages.find().sort("createdAt", -1).limit(limit)
    messages = []
    async for msg in cursor:
        messages.append(serialize_doc(msg))
    return {"data": messages}

# POST /api/messages
@app.post("/api/messages")
async def post_root_message(payload: dict):
    db = state["db"]
    role = payload.get("role")
    text = payload.get("text")
    chat_id = payload.get("chatId")
    if not role or not text:
        raise HTTPException(status_code=400, detail="role and text are required")
    
    msg_doc = {
        "role": role,
        "text": text,
        "createdAt": datetime.utcnow()
    }
    if chat_id:
        msg_doc["chatId"] = chat_id
        
    result = await db.messages.insert_one(msg_doc)
    msg_doc["_id"] = str(result.inserted_id)
    msg_doc["createdAt"] = msg_doc["createdAt"].isoformat()
    return {"data": msg_doc}

# POST /api/chats/{chat_id}/stream
@app.post("/api/chats/{chat_id}/stream")
async def stream_ai_response(chat_id: str, payload: dict):
    db = state["db"]
    user_message = payload.get("message")
    lang = payload.get("lang", "en-IN")
    
    if not user_message:
        raise HTTPException(status_code=400, detail="message is required")
        
    # Save user message
    user_msg_doc = {
        "chatId": chat_id,
        "role": "user",
        "text": user_message,
        "createdAt": datetime.utcnow()
    }
    await db.messages.insert_one(user_msg_doc)
    
    # Get conversation history
    cursor = db.messages.find({"chatId": chat_id}).sort("createdAt", -1).limit(10)
    history = []
    async for msg in cursor:
        history.append(msg)
    history.reverse()
    
    # Retrieve RAG context if database has chunks
    has_documents = len(state["chunks"]) > 0
    retrieved_context = ""
    if has_documents:
        try:
            retrieved_context = retrieve_context(user_message, top_k=5)
        except Exception as e:
            logger.error(f"RAG retrieval failed: {e}")
            
    lang_name = "English (India)"
    if lang == "hi-IN":
        lang_name = "Hindi"
    elif lang == "ta-IN":
        lang_name = "Tamil"
        
    if retrieved_context:
        system_prompt = RAG_SYSTEM_PROMPT.format(context=retrieved_context)
        system_prompt += f"\nLANGUAGE: Reply in {lang_name}."
    else:
        system_prompt = f"{LEGAL_SYSTEM_PROMPT}\nLANGUAGE PREFERENCE: Reply in {lang_name}. If the user writes in another language, mirror their language."
        
    messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        messages.append({
            "role": "assistant" if m["role"] == "ai" else "user",
            "content": m["text"]
        })
        
    async def sse_generator():
        api_key = os.getenv("XAI_API_KEY")
        if not api_key:
            err_msg = "XAI_API_KEY is not configured in backend environment."
            yield f"data: {json.dumps({'error': err_msg})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return
            
        try:
            client = OpenAI(api_key=api_key, base_url="https://api.x.ai/v1")
            completion = client.chat.completions.create(
                model="grok-beta",
                messages=messages,
                stream=True,
                temperature=0.1 if retrieved_context else 0.2,
                max_tokens=1024
            )
            
            full_response = ""
            for chunk in completion:
                content = chunk.choices[0].delta.content
                if content:
                    full_response += content
                    yield f"data: {json.dumps({'chunk': content})}\n\n"
            
            # Save AI response
            if full_response.strip():
                ai_msg_doc = {
                    "chatId": chat_id,
                    "role": "ai",
                    "text": full_response.strip(),
                    "createdAt": datetime.utcnow()
                }
                await db.messages.insert_one(ai_msg_doc)
            else:
                fallback = "I apologize, but I encountered an error generating a response."
                ai_msg_doc = {
                    "chatId": chat_id,
                    "role": "ai",
                    "text": fallback,
                    "createdAt": datetime.utcnow()
                }
                await db.messages.insert_one(ai_msg_doc)
                yield f"data: {json.dumps({'chunk': fallback})}\n\n"
                
            yield f"data: {json.dumps({'done': True})}\n\n"
            
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")

# POST /api/documents/analyze
@app.post("/api/documents/analyze")
async def analyze_document(document: UploadFile = File(...)):
    content = await document.read()
    filename = document.filename
    mime_type = document.content_type
    
    is_txt = mime_type == "text/plain" or filename.endswith(".txt")
    is_img = mime_type.startswith("image/")
    is_pdf = mime_type == "application/pdf" or filename.endswith(".pdf")
    
    if not (is_txt or is_img or is_pdf):
        return {"error": "Please upload an image (.jpg, .png), text file (.txt), or paste text in chat.", "success": False}
        
    try:
        if is_pdf:
            doc_text, num_pages = extract_pdf_text(content)
            if len(doc_text.strip()) < 50:
                return {"error": "Document text is too short. Please upload a document with at least 50 characters.", "success": False}
            model_to_use = "grok-beta"
            messages = [
                {"role": "system", "content": DOCUMENT_ANALYSIS_PROMPT},
                {"role": "user", "content": f"Analyze this legal document:\n\n{doc_text}"}
            ]
        elif is_txt:
            doc_text = content.decode("utf-8", errors="ignore")
            if len(doc_text.strip()) < 50:
                return {"error": "Document text is too short. Please upload a document with at least 50 characters.", "success": False}
            model_to_use = "grok-beta"
            messages = [
                {"role": "system", "content": DOCUMENT_ANALYSIS_PROMPT},
                {"role": "user", "content": f"Analyze this legal document:\n\n{doc_text}"}
            ]
        elif is_img:
            import base64
            import requests
            img_b64 = base64.b64encode(content).decode("utf-8")
            gemini_key = os.getenv("GEMINI_API_KEY")
            if not gemini_key:
                return {"error": "GEMINI_API_KEY is not configured.", "success": False}
                
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
            gemini_payload = {
                "contents": [{
                    "parts": [
                        {"text": DOCUMENT_ANALYSIS_PROMPT},
                        {"inlineData": {"mimeType": mime_type, "data": img_b64}}
                    ]
                }]
            }
            res = requests.post(gemini_url, json=gemini_payload, timeout=120)
            if res.status_code != 200:
                return {"error": f"Gemini API error: {res.text}", "success": False}
                
            analysis = res.json()["candidates"][0]["content"]["parts"][0]["text"]
            return {
                "success": True,
                "analysis": analysis,
                "documentType": mime_type,
                "fileName": filename,
                "fileSize": len(content)
            }
            
        api_key = os.getenv("XAI_API_KEY")
        if not api_key:
            return {"error": "XAI_API_KEY not configured.", "success": False}
            
        client = OpenAI(api_key=api_key, base_url="https://api.x.ai/v1")
        completion = client.chat.completions.create(
            model=model_to_use,
            messages=messages,
            temperature=0.2,
            max_tokens=1500
        )
        analysis = completion.choices[0].message.content
        return {
            "success": True,
            "analysis": analysis,
            "documentType": mime_type,
            "fileName": filename,
            "fileSize": len(content)
        }
    except Exception as e:
        logger.error(f"Document analysis failed: {e}")
        return {"error": f"Analysis failed: {str(e)}", "success": False}

# GET /api/knowledge/stats
@app.get("/api/knowledge/stats")
async def get_knowledge_stats():
    db = state["db"]
    total_chunks = len(state["chunks"])
    total_docs = len(set(c["metadata"].get("documentId") for c in state["chunks"] if c["metadata"].get("documentId")))
    
    db_docs = await db.legaldocuments.count_documents({"status": "indexed"})
    pending_docs = await db.legaldocuments.count_documents({"status": "pending"})
    
    return {
        "success": True,
        "data": {
            "totalChunks": total_chunks,
            "totalDocuments": total_docs,
            "dbDocuments": db_docs,
            "pendingDocuments": pending_docs
        }
    }

# GET /api/knowledge/documents
@app.get("/api/knowledge/documents")
async def list_knowledge_documents(page: int = 1, limit: int = 20, status: Optional[str] = None):
    db = state["db"]
    query = {}
    if status:
        query["status"] = status
        
    skip = (page - 1) * limit
    cursor = db.legaldocuments.find(query).sort("createdAt", -1).skip(skip).limit(limit)
    documents = []
    async for doc in cursor:
        doc.pop("fullText", None)
        documents.append(serialize_doc(doc))
        
    total = await db.legaldocuments.count_documents(query)
    
    return {
        "success": True,
        "data": {
            "documents": documents,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": math.ceil(total / limit) if limit > 0 else 1
            }
        }
    }

# GET /api/knowledge/documents/{document_id}
@app.get("/api/knowledge/documents/{document_id}")
async def get_knowledge_document(document_id: str):
    db = state["db"]
    doc = await db.legaldocuments.find_one({"documentId": document_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True, "data": serialize_doc(doc)}

# POST /api/knowledge/upload
@app.post("/api/knowledge/upload")
async def upload_knowledge_document(
    document: UploadFile = File(...),
    documentType: str = Form("other"),
    jurisdiction: str = Form("india"),
    tags: Optional[str] = Form(None),
    chunkSize: int = Form(1000),
    chunkOverlap: int = Form(200)
):
    db = state["db"]
    model = state["model"]
    index = state["index"]
    chunks_store = state["chunks"]
    
    filename = document.filename
    content = await document.read()
    
    ext = filename.split(".")[-1].lower() if "." in filename else "txt"
    doc_record = {
        "filename": filename,
        "originalName": filename,
        "fileType": ext,
        "fileSize": len(content),
        "documentType": documentType,
        "jurisdiction": jurisdiction,
        "tags": [t.strip() for t in tags.split(",")] if tags else [],
        "status": "processing",
        "uploadedAt": datetime.utcnow()
    }
    
    inserted = await db.legaldocuments.insert_one(doc_record)
    doc_id_in_db = inserted.inserted_id
    
    try:
        if ext == "pdf":
            text, num_pages = extract_pdf_text(content)
        else:
            text = content.decode("utf-8", errors="ignore")
            num_pages = 1
            
        document_id = generate_doc_id(filename, text)
        legal_sections = extract_legal_sections(text)
        chunks = chunk_text(text, chunkSize, chunkOverlap)
        
        new_embeddings = []
        new_chunks = []
        for i, chunk in enumerate(chunks):
            relevant_section = None
            for s in reversed(legal_sections):
                if s["position"] <= chunk["startChar"]:
                    relevant_section = f"{s['type']} {s['number']}: {s['title']}"
                    break
                    
            chunk_metadata = {
                "documentId": document_id,
                "source": filename,
                "numPages": num_pages,
                "chunkIndex": chunk["chunkIndex"],
                "startChar": chunk["startChar"],
                "endChar": chunk["endChar"],
                "section": relevant_section
            }
            
            vector = model.encode(chunk["text"])
            vector = normalize_vector(vector)
            
            new_embeddings.append(vector)
            new_chunks.append({
                "id": f"{document_id}_chunk_{i+1}",
                "text": chunk["text"],
                "metadata": chunk_metadata
            })
            
        if new_embeddings:
            embeddings_np = np.array(new_embeddings, dtype="float32")
            index.add(embeddings_np)
            chunks_store.extend(new_chunks)
            
        await db.legaldocuments.update_one(
            {"_id": doc_id_in_db},
            {"$set": {
                "documentId": document_id,
                "numPages": num_pages,
                "numChunks": len(new_chunks),
                "status": "indexed",
                "indexedAt": datetime.utcnow(),
                "extractedSections": [{"type": s["type"], "number": s["number"], "title": s["title"], "position": s["position"]} for s in legal_sections]
            }}
        )
        
        return {
            "success": True,
            "data": {
                "documentId": document_id,
                "filename": filename,
                "numPages": num_pages,
                "numChunks": len(new_chunks),
                "legalSections": len(legal_sections)
            }
        }
        
    except Exception as e:
        logger.error(f"Knowledge ingestion failed: {e}")
        await db.legaldocuments.update_one(
            {"_id": doc_id_in_db},
            {"$set": {
                "status": "failed",
                "processingError": str(e)
            }}
        )
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

# DELETE /api/knowledge/documents/{documentId}
@app.delete("/api/knowledge/documents/{document_id}")
async def delete_knowledge_document(document_id: str):
    db = state["db"]
    index = state["index"]
    chunks_store = state["chunks"]
    model = state["model"]
    
    await db.legaldocuments.delete_one({"documentId": document_id})
    
    before = len(chunks_store)
    remaining_chunks = [c for c in chunks_store if c["metadata"].get("documentId") != document_id]
    chunks_deleted = before - len(remaining_chunks)
    
    index.reset()
    state["chunks"] = remaining_chunks
    
    if remaining_chunks:
        embeddings = []
        for chunk in remaining_chunks:
            vector = model.encode(chunk["text"])
            vector = normalize_vector(vector)
            embeddings.append(vector)
        embeddings_np = np.array(embeddings, dtype="float32")
        index.add(embeddings_np)
        
    return {
        "success": True,
        "data": {
            "documentId": document_id,
            "chunksDeleted": chunks_deleted
        }
    }

# POST /api/knowledge/clear
@app.post("/api/knowledge/clear")
async def clear_knowledge_base(payload: dict):
    confirm = payload.get("confirm")
    if confirm != "DELETE_ALL":
        raise HTTPException(status_code=400, detail="Confirmation required. Send { confirm: 'DELETE_ALL' }")
        
    db = state["db"]
    state["index"].reset()
    state["chunks"] = []
    
    await db.legaldocuments.delete_many({})
    return {"success": True, "message": "Knowledge base cleared"}
