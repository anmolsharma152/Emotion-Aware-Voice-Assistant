import os
import uuid
import asyncio
import numpy as np
import io
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from groq import Groq
from gtts import gTTS

# Custom Module Imports
from utils.emotion import analyze_emotion

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- GROQ ADAPTER CLASS ---
class LlmChat:
    def __init__(self, model="llama-3.3-70b-versatile", system_message=None):
        self.client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        self.model = model
        self.system_message = system_message

    async def chat(self, messages: list):
        """Sends formatted messages to Groq and returns content string."""
        formatted_messages = []
        if self.system_message:
             formatted_messages.append({"role": "system", "content": self.system_message})

        for msg in messages:
            if isinstance(msg, dict):
                formatted_messages.append(msg)
            else:
                formatted_messages.append({"role": "user", "content": str(msg)})

        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=formatted_messages,
                temperature=0.7,
                max_tokens=1024
            )
            return completion.choices[0].message.content
        except Exception as e:
            logger.error(f"Groq Error: {e}")
            return "I'm having trouble connecting to my brain right now."

# --- LIFECYCLE & APP SETUP ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to DB
    try:
        await db.command("ping")
        logger.info("MongoDB connected!")
    except Exception as e:
        logger.warning(f"MongoDB connection failed: {e}")
    yield
    # Shutdown: Close DB
    client.close()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB Setup
MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.emotion_voice_assistant
conversations_collection = db.conversations

# --- Pydantic Models ---
class ConversationRequest(BaseModel):
    session_id: str
    text: str

class ConversationResponse(BaseModel):
    response: str
    detected_emotion: str
    confidence: float

# --- API ROUTES ---

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "Emotion Voice Assistant"}

@app.post("/api/conversation", response_model=ConversationResponse)
async def process_conversation(request: ConversationRequest):
    """
    Main chat endpoint: Analyzes emotion, calls Groq, logs to DB.
    """
    # 1. Analyze Emotion (using your new utility)
    emotion_data = analyze_emotion(request.text)

    # 2. Generate System Prompt based on Emotion
    system_prompt = (
            f"You are a supportive wellness coach. The user sounds {emotion_data['emotion']}. "
            "Keep your response concise, under 2 sentences. Be empathetic but brief."
        )

    # 3. Get LLM Response
    chat = LlmChat(system_message=system_prompt)
    response_text = await chat.chat([{"role": "user", "content": request.text}])

    # 4. Log to MongoDB (Fire and Forget)
    conversation_log = {
        "session_id": request.session_id,
        "user_text": request.text,
        "assistant_response": response_text,
        "emotion": emotion_data["emotion"],
        "timestamp": datetime.utcnow()
    }
    try:
        await conversations_collection.insert_one(conversation_log)
    except Exception as e:
        # Just log the warning, don't fail the request!
        logger.warning(f"Database logging failed: {e}")

    return {
        "response": response_text,
        "detected_emotion": emotion_data["emotion"],
        "confidence": emotion_data["confidence"]
    }

@app.get("/api/tts")
async def text_to_speech(text: str):
    """
    Streams audio for the frontend 3D avatar to lip-sync to.
    """
    try:
        tts = gTTS(text=text, lang='en')
        audio_fp = io.BytesIO()
        tts.write_to_fp(audio_fp)
        audio_fp.seek(0)
        return StreamingResponse(audio_fp, media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"TTS Error: {e}")
        raise HTTPException(status_code=500, detail="Audio generation failed")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
