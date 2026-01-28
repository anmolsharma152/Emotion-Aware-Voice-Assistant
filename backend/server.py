import os
import logging
import io
import asyncio
import edge_tts
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from groq import Groq
from utils.emotion import analyze_emotion

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# --- 1. MEMORY MANAGER ---
class MemoryManager:
    def __init__(self, db):
        self.conversations = db.conversations
        self.profiles = db.user_profiles

    async def get_recent_context(self, session_id: str, limit: int = 5):
        cursor = self.conversations.find({"session_id": session_id}).sort("timestamp", -1).limit(limit)
        history = await cursor.to_list(length=limit)
        return history[::-1]

    async def get_user_profile(self, session_id: str):
        profile = await self.profiles.find_one({"session_id": session_id})
        return profile.get("facts", []) if profile else []

    async def save_fact(self, session_id: str, fact: str):
        await self.profiles.update_one(
            {"session_id": session_id},
            {"$addToSet": {"facts": fact}},
            upsert=True
        )

# --- 2. INTENT ROUTER ---
class IntentRouter:
    def __init__(self, client):
        self.client = client

    async def determine_intent(self, text: str) -> str:
        # Hard-coded safety check
        if any(w in text.lower() for w in ["suicide", "kill myself", "die", "end it"]):
            return "crisis"
        
        prompt = "Classify user input: 'venting' (emotional), 'coaching' (advice), or 'general'. Reply ONLY with the word."
        try:
            res = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "system", "content": prompt}, {"role": "user", "content": text}],
                max_tokens=5, temperature=0.1
            )
            return res.choices[0].message.content.strip().lower()
        except:
            return "general"

# --- 3. AUDIO ENGINE (MP3 STREAMING) ---
async def generate_emotional_audio(text: str, emotion: str):
    voice = "en-US-AriaNeural"
    pitch, rate = "+0Hz", "+0%"
    
    # Emotional Physics
    if emotion == "sad":      pitch, rate = "-5Hz", "-15%"
    elif emotion == "happy":  pitch, rate = "+5Hz", "+10%"
    elif emotion == "angry":  pitch, rate = "+5Hz", "+15%"
    elif emotion == "fearful": pitch, rate = "+10Hz", "+5%"

    # Punctuation Hacking for Pauses (No XML)
    clean_text = text.replace("<", "").replace(">", "").replace("&", "and")
    final_text = clean_text.replace(", ", "... ").replace(". ", "... ")

    # Generate Audio using Native Parameters
    communicate = edge_tts.Communicate(final_text, voice, pitch=pitch, rate=rate)
    
    audio_fp = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_fp.write(chunk["data"])
    audio_fp.seek(0)
    return audio_fp

# --- APP LIFECYCLE ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await db.command("ping")
        logger.info("🟢 MongoDB Connected")
    except Exception:
        logger.warning("🟡 MongoDB Offline (Running in Stateless Mode)")
    yield
    client.close()

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

client = AsyncIOMotorClient(MONGO_URL)
db = client.emotion_voice_assistant
groq_client = Groq(api_key=GROQ_API_KEY)
memory = MemoryManager(db)
router = IntentRouter(groq_client)

class ConversationRequest(BaseModel):
    session_id: str
    text: str

# --- ROUTES ---
@app.post("/api/conversation")
async def process_conversation(request: ConversationRequest):
    # 1. Parallel Intelligence (Emotion + Intent)
    emotion_task = asyncio.to_thread(analyze_emotion, request.text)
    intent_task = router.determine_intent(request.text)
    emotion_data, intent = await asyncio.gather(emotion_task, intent_task)

    # 2. Memory Retrieval
    history = await memory.get_recent_context(request.session_id)
    user_facts = await memory.get_user_profile(request.session_id)
    
    context_str = f"Facts: {', '.join(user_facts)}\n" + \
                  "\n".join([f"User: {h['user_text']}\nAI: {h['assistant_response']}" for h in history])

    # 3. Dynamic System Prompt
    if intent == "venting":
        instruction = "GOAL: Active Listening. Validate feelings. Do NOT give advice. Keep it short."
    elif intent == "coaching":
        instruction = "GOAL: Empowerment. Give ONE actionable step. Be encouraging. Keep it short."
    else:
        instruction = "Respond naturally and concisely."

    system_prompt = f"Wellness coach. Emotion: {emotion_data['emotion']}. Intent: {intent}.\n{instruction}\nContext:\n{context_str}"

    # 4. Generation
    res = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": request.text}],
        temperature=0.7, max_tokens=150
    )
    response_text = res.choices[0].message.content

    # 5. Persistence
    await db.conversations.insert_one({
        "session_id": request.session_id, "user_text": request.text,
        "assistant_response": response_text, "emotion": emotion_data['emotion'],
        "intent": intent, 
        "timestamp": datetime.utcnow()
    })

    return {"response": response_text, "detected_emotion": emotion_data['emotion'], "intent": intent}

@app.get("/api/history/{session_id}")
async def get_history(session_id: str):
    history = await memory.get_recent_context(session_id, limit=20)
    formatted_history = []
    for h in history:
        formatted_history.append({"role": "user", "text": h["user_text"]})
        formatted_history.append({
            "role": "ai", 
            "text": h["assistant_response"], 
            "emotion": h.get("emotion"),
            "intent": h.get("intent", "general")
        })
    return formatted_history

@app.get("/api/tts")
async def text_to_speech(text: str, emotion: str = "neutral"):
    audio = await generate_emotional_audio(text, emotion)
    return StreamingResponse(audio, media_type="audio/mpeg")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)