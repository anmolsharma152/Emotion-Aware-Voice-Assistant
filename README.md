# Wellness AI: Emotion-Aware Voice Assistant
### "Hands-Free, Low-Latency, Empathetic Agentic Interaction"

A sophisticated, real-time AI Voice Assistant designed for wellness coaching. Unlike standard chatbots, it detects user emotion and intent in parallel, handling hardware-level interruptions (**Barge-In**) via a custom Rust-based Voice Activity Detection (VAD) engine.

## 🧠 Why Rust VAD? (System Design)
In voice AI, latency breaks the "illusion of conversation." We utilize Rust compiled to WebAssembly (WASM) for three critical reasons:
1. **"Barge-In" Capability:** Analyzes audio frames every ~10ms. The moment human speech energy is detected, it kills the AI's audio player instantly, mimicking natural human conversation.
2. **Privacy & Edge Computing:** Speech detection happens entirely on-device. No audio leaves the client until speech is confirmed.
3. **Zero-Latency Triggering:** Rust avoids the garbage collection pauses found in JavaScript, ensuring smooth audio buffer processing even during heavy UI rendering.

## 🏗️ Robust Architecture (The Singleton Pattern)
To prevent "State Fragmentation" and memory leaks, the system uses a **Global Reference (Singleton)** pattern:
- **Resource Management:** Uses `useRef` to manage the Audio Player and Microphone Stream globally.
- **Interruption Logic:** Ensures the VAD engine (running in an effect scope) has direct access to the Audio Player to hit the "Stop" button the millisecond an interruption is detected.

## 🚀 The 5 Pillars
1. **The Brain (FastAPI + Groq Llama-3):** Uses **Async Parallelism** to process Emotion Analysis, Intent Detection, and Fact Extraction simultaneously.
2. **The Ears (Rust + WASM VAD):** High-performance module for <10ms voice detection.
3. **The Memory (MongoDB + Fact Profiler):** Distinguishes between short-term context and long-term "Fact Profiles" (e.g., recalling specific user life details across sessions).
4. **The Router (Semantic Intent Layer):** Classifies input into **Venting** (Validation), **Coaching** (Action), or **Crisis** (Safety) modes.
5. **The Voice (Edge-TTS + Emotional Physics):** Dynamically adjusts pitch and rate (e.g., -10Hz Pitch for sadness) for empathetic feedback.

## 🛠️ Tech Stack
- **Frontend:** React 18, Tailwind CSS, Web Audio API
- **Backend:** Python 3.11, FastAPI, Motor (Async MongoDB), Groq SDK
- **Core Logic:** Rust (VAD), Edge-TTS, Llama-3.3-70b (Reasoning)

## 🔮 Future Roadmap
- **Crisis Guardrails:** Integration of **Nvidia NeMo Guardrails** for semantic vector-based safety checks.
- **Dynamic Temperature:** Intent-based LLM temperature scaling (Venting: 0.9 for warmth | Coaching: 0.2 for precision).
- **Latency Profiling:** Implementing `time.perf_counter()` logging to benchmark asynchronous gain.
- **"Double-Talk" Handling:**
   - CURRENT STATUS: Sometimes VAD triggers on AI's own voice (Echo).
   - TASK: Fine-tune Web Audio API `echoCancellation: true` parameters.
   - EXP: Implement a "Debounce" timer in Rust to prevent micro-triggers.
- **Visual Feedback for "Thinking":**
   - TASK: Add a distinct UI state (e.g., Pulsing Brain) when the "Parallel Processing" (Emotion + Intent) is happening, so the user sees intelligence.