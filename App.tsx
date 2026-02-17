
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

  const stopAllAudio = useCallback(() => {
    activeSources.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSources.current.clear();
    nextStartTime.current = 0;
    setIsSpeaking(false);
  }, []);

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
        sessionPromise.then(session => {
          if (session) session.sendRealtimeInput({ media: pcmBlob });
        });
      };
      
      source.connect(processor);
      processor.connect(inputAudioCtx.current.destination);
    } catch (err) {
      setErrorMsg("Gagal mengakses mikrofon. Pastikan izin diberikan.");
      disconnect();
    }
  }, [disconnect]);

  const connectToTeacher = useCallback(async () => {
    try {
      setErrorMsg(null);
      setTechError(null);
      setStatus(ConnectionStatus.CONNECTING);
      setTranscription("Menghubungkan ke Pusat Inteligensi...");

      // Inisialisasi langsung menggunakan API_KEY dari environment
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
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
          systemInstruction: 'Anda adalah Asisten Guru yang sangat cerdas, cepat, dan empatik. Nama Anda adalah Guru Smansa. Berikan jawaban yang mendalam namun ringkas. Gunakan Bahasa Indonesia yang sopan.'
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            setIsListening(true);
            setTranscription("Koneksi berhasil. Silakan bicara dengan Ibu Guru.");
            startMicStreaming(sessionPromise);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              transcriptionBuffer.current += text;
              setTranscription(transcriptionBuffer.current);
            }

            if (message.serverContent?.turnComplete) {
              transcriptionBuffer.current = ""; 
            }

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

            if (message.serverContent?.interrupted) {
              stopAllAudio();
              setTranscription("(Mendengarkan instruksi baru...)");
            }
          },
          onerror: (e: any) => {
            console.error("API Error:", e);
            setStatus(ConnectionStatus.ERROR);
            const msg = e?.message || "Terjadi kesalahan pada server AI.";
            setTechError(msg);
            setErrorMsg("Koneksi gagal. Pastikan API Key Anda valid dan memiliki kuota.");
            disconnect();
          },
          onclose: () => disconnect()
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Setup error:", err);
      setStatus(ConnectionStatus.ERROR);
      setErrorMsg("Gagal memanggil modul AI.");
    }
  }, [disconnect, stopAllAudio, startMicStreaming]);

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
      
      <header className="w-full max-w-6xl px-8 py-8 flex justify-between items-center z-50">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_#3b82f6]"></div>
            <h1 className="font-bold text-lg tracking-widest uppercase">SMANSA <span className="text-blue-500">CYBER</span></h1>
          </div>
          <span className="text-[9px] text-white/30 tracking-[0.3em] font-medium ml-4">INTELLIGENCE NODE 4.1</span>
        </div>
        
        <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10">
          <span className="text-[9px] font-bold text-white/40 tracking-widest uppercase">
            {status === ConnectionStatus.CONNECTED ? 'System: Online' : 'System: Ready'}
          </span>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl flex flex-col items-center justify-center px-6 z-10">
        <div className="w-full grid md:grid-cols-2 gap-12 items-center">
          
          <div className="flex justify-center order-2 md:order-1">
            <TeacherAvatar isSpeaking={isSpeaking} isListening={isListening} status={status} />
          </div>

          <div className="flex flex-col space-y-8 order-1 md:order-2">
            <div className="space-y-4">
              <div className="inline-block px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Voice-First Experience</span>
              </div>
              <h2 className="text-4xl font-light text-white leading-tight">
                Belajar Interaktif <br/> <span className="font-bold">Masa Depan.</span>
              </h2>
            </div>

            <div className={`p-6 rounded-3xl bg-white/[0.03] border border-white/5 shadow-2xl transition-all duration-500 ${isSpeaking ? 'border-blue-500/30' : ''}`}>
              <p className={`text-sm md:text-base leading-relaxed min-h-[80px] ${isSpeaking ? 'text-white' : 'text-white/40'}`}>
                {transcription || "Klik tombol di bawah untuk mulai berdiskusi..."}
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
                    Selesaikan Sesi
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                    </svg>
                    Mulai Bicara
                  </>
                )}
              </button>

              {errorMsg && (
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 text-center animate-shake">
                  <p className="text-red-400 text-[10px] font-bold uppercase mb-1">{errorMsg}</p>
                  {techError && <p className="text-white/20 text-[7px] font-mono truncate">{techError}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full py-8 px-10 flex justify-center opacity-20 z-10">
        <p className="text-[8px] font-black uppercase tracking-[0.5em] italic">Smansa AI System &copy; 2024</p>
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
