================================================================================
                        EMOTION-AWARE VOICE ASSISTANT
                      "Hands-Free, Low-Latency, Empathetic"
================================================================================

1. PROJECT OVERVIEW
--------------------------------------------------------------------------------
This is a sophisticated, real-time AI Voice Assistant designed for wellness and 
coaching. Unlike standard chatbots, it detects user emotion, intent, and handles
interruptions instantly ("Barge-In"). It features a custom Rust VAD engine and 
a fault-tolerant Python backend.

2. SYSTEM ARCHITECTURE (The 5 Pillars)
--------------------------------------------------------------------------------
[1] THE BRAIN (Python/FastAPI + Groq Llama-3)
    - Processes natural language with deep context awareness.
    - Uses "Async Parallelism" to run Emotion Analysis, Intent Detection, and 
      Fact Extraction simultaneously for <10ms overhead.

[2] THE EARS (Rust + WebAssembly VAD)
    - Custom-built Rust module running in the browser.
    - Latency: <10ms voice detection.
    - Feature: "Barge-In" (Instantly cuts off AI when user speaks).

[3] THE MEMORY (MongoDB + Custom MemoryManager)
    - Short-Term: Recalls the last 10 messages for conversational flow.
    - Long-Term: "Fact Profiler" extracts persistent facts (e.g., "User has a dog") 
      and saves them to a permanent User Profile.

[4] THE ROUTER (Semantic Intent Layer)
    - Classifies user input BEFORE generation:
      * VENTING:  Activates "Active Listening" protocols (Validate, don't solve).
      * COACHING: Activates "Solution Mode" (Actionable advice).
      * CRISIS:   Activates "Safety Protocols" (Helpline redirection).

[5] THE VOICE (Edge-TTS + SSML Physics)
    - Replaces robotic TTS with dynamic SSML injection.
    - Sadness:  -10Hz Pitch, -15% Speed, micro-pauses.
    - Happiness: +5Hz Pitch, +10% Speed.

3. TECH STACK
--------------------------------------------------------------------------------
- Frontend: React 18, Tailwind CSS, Web Audio API
- Backend:  Python 3.11, FastAPI, Motor (Async Mongo), Groq SDK
- Database: MongoDB (Dockerized)
- Voice:    Rust (VAD), Edge-TTS (Synthesis)
- AI Model: Llama-3.3-70b (Reasoning), Llama-3.1-8b (Routing)

4. SETUP & RUN
--------------------------------------------------------------------------------
1. START DATABASE:
   $ docker start my-mongo

2. START BACKEND:
   $ cd backend
   $ source .venv/bin/activate
   $ python server.py

3. START FRONTEND:
   $ cd frontend
   $ yarn start

5. KEY FEATURES TO DEMO
--------------------------------------------------------------------------------
- "Always-On" Mode: No need to click the mic. Just talk.
- Interruption:     Speak while the AI is talking; it stops instantly.
- Emotional Shift:  Say "I am sad" vs "I am happy" to hear voice changes.
- Memory:           Tell it your name, refresh the page, ask "Who am I?"
