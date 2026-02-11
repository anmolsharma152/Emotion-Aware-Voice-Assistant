import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import init, { VadEngine } from "./vad/vad_processor.js";

// --- ICONS ---
const TrashIcon = () => (
  <svg className="w-5 h-5 text-gray-400 hover:text-red-400 transition-colors cursor-pointer" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const BrainIcon = ({ active, thinking }) => (
  <svg className={`w-10 h-10 transition-all duration-300 ${thinking ? "animate-thinking" : active ? "text-purple-300 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" : "text-purple-500/50"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const PulseIcon = ({ active }) => (
  <svg className={`w-10 h-10 transition-colors duration-300 ${active ? "text-blue-300 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" : "text-blue-500/50"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const SpeakerIcon = ({ active }) => (
  <svg className={`w-10 h-10 transition-colors duration-300 ${active ? "text-green-300 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "text-green-500/50"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
  </svg>
);

const App = () => {
  // --- STATE ---
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [emotion, setEmotion] = useState(null);
  const [intent, setIntent] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userInterrupted, setUserInterrupted] = useState(false);
  const [sessionId] = useState(() => "user_session_anmol_01");
  const [conversationHistory, setConversationHistory] = useState([]);

  // --- GLOBAL REFS (Singleton Controllers) ---
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);
  const vadEngineRef = useRef(null);
  const audioContextRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const audioPlayerRef = useRef(null);
  const vadStreamRef = useRef(null);

  const backendUrl = "http://localhost:8001";

  // --- EFFECTS ---
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [conversationHistory, response]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  // 1. Initialize VAD Engine (WASM)
  useEffect(() => {
    async function setupVad() {
      try {
        await init();
        vadEngineRef.current = new VadEngine(0.02); // Sensitivity Threshold [cite: 17, 18]
      } catch (e) { console.error("VAD Load Failed", e); }
    }
    setupVad();

    return () => {
      if (vadStreamRef.current) vadStreamRef.current.getTracks().forEach(track => track.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  // 2. Load History Hydration 
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/history/${sessionId}`);
        const data = await res.json();
        if (data.length > 0) {
          setConversationHistory(data.map(msg => ({
            role: msg.role,
            text: msg.text || msg.ai_response,
            emotion: msg.emotion,
            intent: msg.intent || "general"
          })));
        }
      } catch (err) { console.warn("History unavailable:", err); }
    };
    loadHistory();
  }, [sessionId]);

  // 3. VAD Audio Stream (The "Always-On" Ear) [cite: 25]
  const startVadAudio = async () => {
    if (!vadEngineRef.current || vadStreamRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
      vadStreamRef.current = stream;

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(2048, 1, 1);

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);

      processor.onaudioprocess = (e) => {
        const isUserSpeaking = vadEngineRef.current.process(e.inputBuffer.getChannelData(0));

        // INTERRUPTION LOGIC (Barge-In) [cite: 13, 18, 26]
        if (isUserSpeaking && isSpeakingRef.current) {
          console.log("🛑 BARGE-IN: User interrupted AI.");

          if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current.currentTime = 0;
          }

          setIsSpeaking(false);
          setUserInterrupted(true);
          setTimeout(() => setUserInterrupted(false), 2000);

          try { recognitionRef.current.start(); } catch (e) { }
        }
      };
    } catch (e) { console.error("Mic Error:", e); }
  };

  // 4. Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        startVadAudio();
      };

      recognitionRef.current.onresult = (e) => {
        const text = e.results[0][0].transcript;
        setTranscript(text);
        handleConversation(text);
      };

      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  // 5. Server Audio Player (The "Mouth") [cite: 23, 24]
  const speakResponse = async (text, detectedEmotion) => {
    try {
      const response = await fetch(`${backendUrl}/api/tts?text=${encodeURIComponent(text)}&emotion=${detectedEmotion}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      audioPlayerRef.current = new Audio(url);

      setIsSpeaking(true);
      audioPlayerRef.current.play();

      audioPlayerRef.current.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        setTimeout(() => { try { recognitionRef.current.start(); } catch (e) { } }, 100);
      };

    } catch (e) {
      console.error("Audio Playback Error:", e);
      setIsSpeaking(false);
      setTimeout(() => { try { recognitionRef.current.start(); } catch (e) { } }, 100);
    }
  };

  const handleConversation = async (text) => {
    if (!text.trim()) return;
    setIsProcessing(true);
    setConversationHistory(prev => [...prev, { role: "user", text }]);

    try {
      const res = await fetch(`${backendUrl}/api/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, text }),
      });
      const data = await res.json();

      setResponse(data.response);
      setEmotion(data.detected_emotion);
      setIntent(data.intent);

      setConversationHistory(prev => [...prev, {
        role: "ai",
        text: data.response,
        emotion: data.detected_emotion,
        intent: data.intent
      }]);

      speakResponse(data.response, data.detected_emotion);
    } catch (error) { console.error(error); }
    finally { setIsProcessing(false); }
  };

  const toggleListening = () => {
    if (isListening) recognitionRef.current?.stop();
    else recognitionRef.current?.start();
  };

  const clearScreen = () => {
    setConversationHistory([]);
  };

  const getIntentBadge = (intent) => {
    const styles = {
      venting: "bg-purple-500/20 text-purple-300 border-purple-500/50",
      coaching: "bg-blue-500/20 text-blue-300 border-blue-500/50",
      crisis: "bg-red-500/20 text-red-300 border-red-500/50",
      general: "bg-gray-500/20 text-gray-400 border-gray-500/50"
    };
    return styles[intent] || styles.general;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-black text-white flex flex-col font-sans">
      <div className="flex-none pt-12 pb-6 text-center z-10 relative">
        <h1 className="text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 tracking-tighter drop-shadow-2xl">
          Wellness AI
        </h1>
        <p className="text-gray-400 text-sm mt-3 uppercase tracking-[0.3em] font-medium opacity-80">
          Neural Voice • Low Latency [cite: 12]
        </p>

        {conversationHistory.length > 0 && (
          <button onClick={clearScreen} className="absolute top-1/2 right-10 -translate-y-1/2 p-3 bg-white/5 hover:bg-red-500/10 rounded-full border border-white/10 transition-all group">
            <TrashIcon />
          </button>
        )}
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto px-4 flex flex-col min-h-0 z-10">
        <div className="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col relative mb-6">
          <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
            {conversationHistory.length === 0 && <div className="text-center text-gray-500 mt-20">Tap mic to start [cite: 25]</div>}
            {conversationHistory.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} animate-fade-in`}>
                <div className={`max-w-[85%] p-5 rounded-2xl shadow-lg backdrop-blur-sm ${msg.role === "user" ? "bg-blue-600" : "bg-gray-800 border border-white/5"}`}>
                  <p className="text-lg leading-relaxed">{msg.text}</p>
                </div>
                {msg.role === "ai" && (
                  <div className="flex items-center gap-3 mt-2 ml-1">
                    {msg.intent && <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-bold ${getIntentBadge(msg.intent)}`}>{msg.intent} MODE [cite: 21, 22]</span>}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="bg-black/40 p-6 border-t border-white/5 flex items-center justify-center relative backdrop-blur-md">
            {(isListening || isSpeaking) && (
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-40 pointer-events-none">
                <div className="w-1 h-8 bg-blue-400 animate-pulse rounded-full"></div>
                <div className="w-1 h-12 bg-purple-400 animate-pulse rounded-full"></div>
                <div className="w-1 h-8 bg-blue-400 animate-pulse rounded-full"></div>
              </div>
            )}
            <button onClick={toggleListening} className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-2xl transition-all ${isListening ? "bg-red-500" : "bg-blue-600"}`}>
              {isProcessing ? "⏳" : isListening ? "🛑" : isSpeaking ? "🗣️" : "🎤"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-12">
          <div className={`bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl flex items-center gap-4 transition-all duration-300 ${isProcessing ? "bg-purple-500/10 border-purple-500/50" : "hover:bg-white/10"}`}>
            <div className={`p-4 rounded-xl transition-colors ${isProcessing ? "bg-purple-500/20" : "bg-purple-500/10"}`}>
              <BrainIcon active={!!intent} thinking={isProcessing} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-100">{isProcessing ? "Thinking..." : "Smart Logic [cite: 15]"}</h3>
              <p className="text-sm text-gray-400">{isProcessing ? "Analyzing Intent[cite: 21]..." : intent ? `Active: ${intent.toUpperCase()}` : "Ready"}</p>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl flex items-center gap-4 hover:bg-white/10">
            <div className="p-4 bg-blue-500/20 rounded-xl"><PulseIcon active={!!emotion} /></div>
            <div><h3 className="text-lg font-bold text-gray-100">Deep Empathy [cite: 16]</h3><p className="text-sm text-gray-400">{emotion ? `Detected: ${emotion.toUpperCase()}` : "Sentiment Analysis"}</p></div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-2xl flex items-center gap-4 hover:bg-white/10">
            <div className="p-4 bg-green-500/20 rounded-xl"><SpeakerIcon active={userInterrupted} /></div>
            <div><h3 className="text-lg font-bold text-gray-100">Rust VAD [cite: 17]</h3><p className="text-sm text-gray-400">{userInterrupted ? "Barge-In Active [cite: 18]" : "Low-Latency [cite: 18]"}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
