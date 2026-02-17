
import React, { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { ConnectionStatus } from './types';
import TeacherAvatar from './components/TeacherAvatar';
import NeuralNetworkBackground from './components/NeuralNetworkBackground';
import { decode, decodeAudioData, createPcmBlob } from './services/audioService';

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [techError, setTechError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>("");

  const inputAudioCtx = useRef<AudioContext | null>(null);
  const outputAudioCtx = useRef<AudioContext | null>(null);
  const nextStartTime = useRef<number>(0);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const sessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptionBuffer = useRef<string>("");

  // Fix: Added stopAllAudio to stop any playing audio buffers when session ends or is interrupted.
  const stopAllAudio = useCallback(() => {
    activeSources.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSources.current.clear();
    nextStartTime.current = 0;
    setIsSpeaking(false);
  }, []);

  // Fix: Implemented disconnect to cleanup media streams, processors, and reset state.
  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    stopAllAudio();
    setStatus(ConnectionStatus.DISCONNECTED);
    setIsListening(false);
    setTranscription("");
    transcriptionBuffer.current = "";
  }, [stopAllAudio]);

  const handleSelectKey = async () => {
    try {
      if ((window as any).aistudio?.openSelectKey) {
        await (window as any).aistudio.openSelectKey();
        // Guideline: Assume key selection was successful and proceed.
        connectToTeacher();
      } else {
        setErrorMsg("Sistem konfigurasi tidak tersedia.");
      }
    } catch (err) {
      console.error("Key selection failed", err);
    }
  };

  // Fix: Implemented startMicStreaming to handle microphone input and stream to Live API.
  const startMicStreaming = useCallback(async (sessionPromise: Promise<any>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      
      if (!inputAudioCtx.current) {
        inputAudioCtx.current = new AudioContext({ sampleRate: 16000 });
      }
      
      const source = inputAudioCtx.current.createMediaStreamSource(stream);
      const processor = inputAudioCtx.current.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = createPcmBlob(inputData);
        // Guideline: Solely rely on sessionPromise resolves and then call `session.sendRealtimeInput`.
        sessionPromise.then(session => {
          if (session) session.sendRealtimeInput({ media: pcmBlob });
        });
      };
      
      source.connect(processor);
      processor.connect(inputAudioCtx.current.destination);
    } catch (err) {
      setErrorMsg("Mikrofon tidak dapat diakses.");
      disconnect();
    }
  }, [disconnect]);

  // Fix: Implemented connectToTeacher to initialize GoogleGenAI and connect to the Live API session.
  const connectToTeacher = useCallback(async () => {
    try {
      // Guideline: The API key must be obtained exclusively from process.env.API_KEY.
      const apiKey = process.env.API_KEY || '';
      
      if (!apiKey) {
        setErrorMsg("API Key diperlukan untuk memulai.");
        setStatus(ConnectionStatus.ERROR);
        return;
      }

      setErrorMsg(null);
      setTechError(null);
      setStatus(ConnectionStatus.CONNECTING);
      setTranscription("Inisialisasi modul...");

      // Guideline: Create a new GoogleGenAI instance right before making an API call.
      const ai = new GoogleGenAI({ apiKey: apiKey });
      
      if (!inputAudioCtx.current) inputAudioCtx.current = new AudioContext({ sampleRate: 16000 });
      if (!outputAudioCtx.current) outputAudioCtx.current = new AudioContext({ sampleRate: 24000 });

      if (inputAudioCtx.current.state === 'suspended') await inputAudioCtx.current.resume();
      if (outputAudioCtx.current.state === 'suspended') await outputAudioCtx.current.resume();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {}, 
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          systemInstruction: 'Anda adalah Asisten Guru Mini yang sangat cepat dan efisien. Berikan jawaban yang padat, akurat, dan ramah. Gunakan Bahasa Indonesia.'
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            setIsListening(true);
            setTranscription("Sistem Aktif. Silakan bicara...");
            startMicStreaming(sessionPromise);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle output transcription
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              transcriptionBuffer.current += text;
              setTranscription(transcriptionBuffer.current);
            }

            if (message.serverContent?.turnComplete) {
              transcriptionBuffer.current = ""; 
            }

            // Guideline: Handle audio bytes by scheduling them for playback in a queue.
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioCtx.current) {
              const ctx = outputAudioCtx.current;
              nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => {
                activeSources.current.delete(source);
                if (activeSources.current.size === 0) setIsSpeaking(false);
              });
              setIsSpeaking(true);
              source.start(nextStartTime.current);
              nextStartTime.current += audioBuffer.duration;
              activeSources.current.add(source);
            }

            // Handle session interruptions
            if (message.serverContent?.interrupted) {
              stopAllAudio();
              setTranscription("(Interupsi terdeteksi...)");
            }
          },
          onerror: (e: any) => {
            console.error("API Error:", e);
            setStatus(ConnectionStatus.ERROR);
            const msg = e?.message || "Koneksi gagal.";
            setTechError(msg);
            
            // Guideline: Reset key selection if error indicates requested entity not found.
            if (msg.includes("Requested entity was not found")) {
                setErrorMsg("API Key tidak valid atau projek tidak memiliki billing.");
            } else {
                setErrorMsg(msg.includes("403") ? "Akses Ditolak (Perlu Billing Aktif)." : "Masalah koneksi server.");
            }
            disconnect();
          },
          onclose: () => disconnect()
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Connection error:", err);
      setStatus(ConnectionStatus.ERROR);
      setErrorMsg("Gagal memuat modul AI.");
    }
  }, [disconnect, stopAllAudio, startMicStreaming]);

  // Fix: Added handleToggle to switch between connected and disconnected states.
  const handleToggle = useCallback(() => {
    if (status === ConnectionStatus.CONNECTED) {
      disconnect();
    } else {
      connectToTeacher();
    }
  }, [status, disconnect, connectToTeacher]);

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#050505] text-white overflow-hidden relative font-['Plus_Jakarta_Sans']">
      <NeuralNetworkBackground />
      
      {/* Header Minimalis */}
      <header className="w-full max-w-6xl px-8 py-8 flex justify-between items-center z-50">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_#3b82f6]"></div>
            <h1 className="font-bold text-lg tracking-widest uppercase">SMANSA <span className="text-blue-500">MINI</span></h1>
          </div>
          <span className="text-[9px] text-white/30 tracking-[0.3em] font-medium ml-4">VERSION 4.1-CORE</span>
        </div>

        <button 
          onClick={handleSelectKey}
          className="group flex items-center gap-2 px-5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white/20 group-hover:bg-blue-400"></div>
          <span className="text-[10px] font-bold tracking-widest uppercase text-white/60 group-hover:text-white">API Config</span>
        </button>
      </header>

      <main className="flex-1 w-full max-w-5xl flex flex-col items-center justify-center px-6 z-10">
        <div className="w-full grid md:grid-cols-2 gap-12 items-center">
          
          {/* Sisi Kiri: Avatar */}
          <div className="flex justify-center">
            <TeacherAvatar isSpeaking={isSpeaking} isListening={isListening} status={status} />
          </div>

          {/* Sisi Kanan: Kontrol & Teks */}
          <div className="flex flex-col space-y-8">
            <div className="space-y-4">
              <div className="inline-block px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Real-time Interface</span>
              </div>
              <h2 className="text-4xl font-light text-white leading-tight">
                Diskusi Belajar <br/> <span className="font-bold">Tanpa Jeda.</span>
              </h2>
              <div className="h-1 w-12 bg-blue-500/50 rounded-full"></div>
            </div>

            <div className={`p-6 rounded-3xl bg-white/[0.03] border border-white/5 shadow-2xl transition-all duration-500 ${isSpeaking ? 'border-blue-500/30' : ''}`}>
              <p className={`text-sm md:text-base leading-relaxed min-h-[80px] ${isSpeaking ? 'text-white' : 'text-white/40'}`}>
                {transcription || "Sistem dalam keadaan standby..."}
              </p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={handleToggle} 
                disabled={status === ConnectionStatus.CONNECTING}
                className={`w-full py-5 font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest text-[11px] ${
                  status === ConnectionStatus.CONNECTED
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-xl shadow-blue-600/20'
                }`}
              >
                {status === ConnectionStatus.CONNECTED ? (
                  <>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    Hentikan Sesi
                  </>
                ) : 'Mulai Percakapan'}
              </button>

              {errorMsg && (
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 text-center animate-shake">
                  <p className="text-red-400 text-[10px] font-bold uppercase mb-2">{errorMsg}</p>
                  <p className="text-white/20 text-[8px] font-mono truncate">{techError}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full py-10 px-10 flex justify-between items-end opacity-20 z-10">
        <div className="space-y-1">
          <p className="text-[8px] font-bold uppercase tracking-widest">Minimalist Engine</p>
          <p className="text-[7px] font-medium opacity-50 uppercase tracking-[0.3em]">Latency-Optimized Architecture</p>
        </div>
        <p className="text-[8px] font-black uppercase tracking-widest italic">Smansa Cyber v4.1</p>
      </footer>

      <style>{`
        @keyframes wave {
          0%, 100% { height: 20%; }
          50% { height: 100%; }
        }
        .animate-wave { animation: wave 0.8s ease-in-out infinite; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        .animate-shake { animation: shake 0.3s ease-in-out; }
      `}</style>
    </div>
  );
};

export default App;
