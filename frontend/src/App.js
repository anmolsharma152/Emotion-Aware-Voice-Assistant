import React, { useState, useEffect, useRef } from "react";
import "./App.css";

// --- IMPORT RUST VAD ---
import init, { VadEngine } from "./vad/vad_processor.js";

// --- ICONS ---
const BrainIcon = () => (
  <svg
    className="w-10 h-10 text-purple-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
);
const PulseIcon = () => (
  <svg
    className="w-10 h-10 text-blue-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M13 10V3L4 14h7v7l9-11h-7z"
    />
  </svg>
);
const SpeakerIcon = () => (
  <svg
    className="w-10 h-10 text-green-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
    />
  </svg>
);

const App = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [emotion, setEmotion] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userInterrupted, setUserInterrupted] = useState(false);

  const [sessionId] = useState(() => `session_${Date.now()}`);
  const [conversationHistory, setConversationHistory] = useState([]);

  // Refs
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);
  const vadEngineRef = useRef(null);
  const audioContextRef = useRef(null);

  const backendUrl = "http://localhost:8001";

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationHistory, response]);

  // --- 1. INITIALIZE RUST VAD ---
  useEffect(() => {
    async function setupVad() {
      try {
        await init(); // Initialize WASM
        vadEngineRef.current = new VadEngine(0.02); // Threshold 0.02
        console.log("🦀 Rust VAD Engine Loaded!");
      } catch (e) {
        console.error("Failed to load Rust VAD:", e);
      }
    }
    setupVad();
  }, []);

  // --- 2. START AUDIO PROCESSING FOR VAD (THE INTERRUPTER) ---
  const startVadAudio = async () => {
    if (!vadEngineRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(
        2048,
        1,
        1,
      );

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // 🦀 CALL RUST: Is the user speaking?
        const isUserSpeaking = vadEngineRef.current.process(inputData);

        if (isUserSpeaking) {
          // INTERRUPTION LOGIC:
          // If the AI is currently speaking, SHUT IT UP immediately.
          if (window.speechSynthesis.speaking) {
            console.log("🛑 Interrupting AI!");
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            setUserInterrupted(true);
            setTimeout(() => setUserInterrupted(false), 2000); // Reset flag
          }
        }
      };
    } catch (e) {
      console.error("VAD Audio Error:", e);
    }
  };

  // --- 3. SPEECH RECOGNITION (GOOGLE) ---
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        startVadAudio(); // Start Rust VAD when mic opens
      };

      recognitionRef.current.onresult = (event) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        handleConversation(text);
      };

      recognitionRef.current.onerror = (event) => {
        console.error("Speech error:", event.error);
        setIsListening(false);
        // Clean up audio context
        audioContextRef.current?.close();
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        // Clean up audio context
        audioContextRef.current?.close();
      };
    }
  }, []);

  // --- BROWSER TTS ---
  const speakResponse = (text, detectedEmotion) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);

      switch (detectedEmotion) {
        case "happy":
          utterance.pitch = 1.2;
          utterance.rate = 1.1;
          break;
        case "sad":
          utterance.pitch = 0.9;
          utterance.rate = 0.9;
          break;
        case "angry":
          utterance.pitch = 0.8;
          utterance.rate = 1.2;
          break;
        case "fearful":
          utterance.pitch = 1.3;
          utterance.rate = 1.2;
          break;
        default:
          utterance.pitch = 1.0;
          utterance.rate = 1.0;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleConversation = async (text) => {
    if (!text.trim()) return;
    setIsProcessing(true);

    setConversationHistory((prev) => [...prev, { role: "user", text: text }]);
    setTranscript("");

    try {
      const res = await fetch(`${backendUrl}/api/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, text: text }),
      });

      const data = await res.json();

      setResponse(data.response);
      setEmotion({
        emotion: data.detected_emotion,
        confidence: data.confidence,
      });

      setConversationHistory((prev) => [
        ...prev,
        {
          role: "ai",
          text: data.response,
          emotion: data.detected_emotion,
          confidence: data.confidence,
        },
      ]);

      speakResponse(data.response, data.detected_emotion);
    } catch (error) {
      console.error("API Error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      recognitionRef.current?.start();
    }
  };

  const getEmotionColor = (e) => {
    const map = {
      happy: "bg-yellow-500",
      sad: "bg-blue-500",
      angry: "bg-red-500",
      fearful: "bg-purple-500",
      surprised: "bg-green-500",
      neutral: "bg-gray-500",
    };
    return map[e] || "bg-gray-500";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-900 to-black text-white flex flex-col font-sans">
      <div className="flex-none pt-10 pb-6 text-center">
        <h1 className="text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 tracking-tight drop-shadow-2xl">
          Wellness Coach AI
        </h1>
        <p className="text-gray-400 text-sm mt-2 uppercase tracking-[0.2em]">
          Empathetic Voice Companion
        </p>
      </div>

      <div className="flex-1 w-full max-w-3xl mx-auto px-6 flex flex-col min-h-0">
        <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col relative mb-6">
          <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-gray-600">
            {conversationHistory.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                <div className="text-6xl mb-4">👋</div>
                <p className="text-xl font-light">
                  Tap the microphone to begin
                </p>
              </div>
            )}
            {conversationHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} animate-fade-in`}
              >
                <div
                  className={`max-w-[85%] p-5 rounded-2xl shadow-md ${msg.role === "user" ? "bg-blue-600 text-white rounded-tr-none" : "bg-gray-800 text-gray-100 rounded-tl-none border border-gray-700"}`}
                >
                  <p className="text-lg leading-relaxed">{msg.text}</p>
                </div>
                {msg.role === "ai" && msg.emotion && (
                  <div className="flex items-center gap-2 mt-2 ml-1">
                    <div
                      className={`w-2 h-2 rounded-full ${getEmotionColor(msg.emotion)}`}
                    ></div>
                    <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">
                      {msg.emotion}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-start">
                <div className="bg-gray-800 p-4 rounded-2xl rounded-tl-none border border-gray-700 flex gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="bg-black/20 p-6 border-t border-white/5 flex items-center justify-center relative">
            {/* Visualizer Background */}
            {(isListening || isSpeaking) && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-30 pointer-events-none">
                {[...Array(15)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 rounded-full animate-bounce ${userInterrupted ? "bg-red-500" : "bg-white"}`}
                    style={{
                      height: Math.random() * 50 + 20 + "px",
                      animationDuration: Math.random() * 0.5 + 0.3 + "s",
                    }}
                  />
                ))}
              </div>
            )}

            <button
              onClick={toggleListening}
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-xl transition-all duration-300 border-4 border-transparent ${isListening ? "bg-red-500 hover:bg-red-600 scale-110 shadow-red-500/50" : isProcessing ? "bg-yellow-500 cursor-wait" : isSpeaking ? "bg-green-500 hover:bg-green-600 shadow-green-500/50 ring-4 ring-green-500/20" : "bg-blue-600 hover:bg-blue-500 shadow-blue-500/50"}`}
            >
              {isProcessing
                ? "⏳"
                : isListening
                  ? "🛑"
                  : isSpeaking
                    ? "🗣️"
                    : "🎤"}
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-6 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-5 rounded-2xl flex items-center gap-4 hover:bg-white/10 transition-colors cursor-default">
            <div className="p-3 bg-purple-500/20 rounded-xl">
              <BrainIcon />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-100">Smart Logic</h3>
              <p className="text-sm text-gray-400">
                Fuzzy matching & negation detection.
              </p>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-5 rounded-2xl flex items-center gap-4 hover:bg-white/10 transition-colors cursor-default">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <PulseIcon />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-100">Deep Empathy</h3>
              <p className="text-sm text-gray-400">
                Real-time emotion analysis.
              </p>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-5 rounded-2xl flex items-center gap-4 hover:bg-white/10 transition-colors cursor-default">
            <div className="p-3 bg-green-500/20 rounded-xl">
              <SpeakerIcon />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-100">Rust VAD</h3>
              <p className="text-sm text-gray-400">
                Low-latency interruption engine.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
