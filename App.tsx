
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
  const [transcription, setTranscription] = useState<string>("");

  // Audio Context Refs
  const inputAudioCtx = useRef<AudioContext | null>(null);
  const outputAudioCtx = useRef<AudioContext | null>(null);
  const nextStartTime = useRef<number>(0);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Session & Stream Refs
  const sessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptionBuffer = useRef<string>("");

  const stopAllAudio = () => {
    activeSources.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSources.current.clear();
    nextStartTime.current = 0;
    setIsSpeaking(false);
  };

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
  }, []);

  const handleSelectKey = async () => {
    try {
      // Use the pre-configured window.aistudio to open the key selection dialog.
      // Cast to any because the global interface might be conflicting with environment types.
      await (window as any).aistudio.openSelectKey();
      // Assume selection successful and proceed as per guidelines
      connectToTeacher();
    } catch (err) {
      console.error("Key selection failed", err);
    }
  };

  const connectToTeacher = async () => {
    try {
      // Exclusively use process.env.API_KEY as per guidelines
      const apiKey = process.env.API_KEY || '';
      
      if (!apiKey) {
        setErrorMsg("API Key tidak ditemukan.");
        setStatus(ConnectionStatus.ERROR);
        return;
      }

      setErrorMsg(null);
      setStatus(ConnectionStatus.CONNECTING);
      setTranscription("Menghubungi Ibu Guru...");

      // Create a fresh instance right before making an API call to ensure it uses the most up-to-date API key
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
          systemInstruction: 'Anda adalah Ibu Guru Smansa yang bijaksana dan hangat. Berikan penjelasan singkat namun sangat mendalam. Gunakan bahasa Indonesia yang santun. Anda berbicara langsung secara audio.'
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            setIsListening(true);
            setTranscription("Halo! Saya sudah di sini. Apa yang bisa saya bantu hari ini?");
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
              // Ensure gapless playback by scheduling based on nextStartTime
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
              setTranscription("(Mendengarkan Anda...)");
            }
          },
          onerror: (e: any) => {
            console.error("Live API Error:", e);
            if (e?.message?.includes("entity was not found") || e?.message?.includes("401") || e?.message?.includes("403")) {
              setErrorMsg("API Key tidak valid atau tidak mendukung Live API. Gunakan API Key dari Project dengan Billing aktif.");
            } else {
              setErrorMsg("Gagal terhubung. Pastikan region Anda mendukung Gemini Live.");
            }
            disconnect();
          },
          onclose: () => {
            disconnect();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Connection failed:", err);
      setErrorMsg("Koneksi gagal. Silakan pilih API Key yang valid.");
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const startMicStreaming = async (sessionPromise: Promise<any>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const source = inputAudioCtx.current!.createMediaStreamSource(stream);
      const processor = inputAudioCtx.current!.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = createPcmBlob(inputData);
        
        // Wait for session to be ready before sending realtime input
        sessionPromise.then(session => {
          if (session) session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      source.connect(processor);
      processor.connect(inputAudioCtx.current!.destination);
    } catch (err) {
      setErrorMsg("Akses mikrofon ditolak.");
      disconnect();
    }
  };

  const handleToggle = () => {
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      disconnect();
    } else {
      connectToTeacher();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-black text-white overflow-hidden relative font-['Plus_Jakarta_Sans']">
      <NeuralNetworkBackground />
      
      <header className="w-full max-w-6xl px-6 py-6 flex justify-between items-center z-50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-pink-600 to-rose-600 p-2 rounded-xl shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0z" />
            </svg>
          </div>
          <h1 className="font-black text-xl tracking-tighter italic uppercase">SMANSA <span className="text-pink-500">LIVE</span></h1>
        </div>

        <button 
          onClick={handleSelectKey}
          className="px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest bg-white/5 border border-white/10 hover:bg-white/10 transition-all uppercase"
        >
          Konfigurasi API
        </button>
      </header>

      <main className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center px-4 z-10 py-4">
        <div className="w-full bg-slate-900/40 backdrop-blur-3xl rounded-[3rem] border border-white/5 p-8 flex flex-col items-center shadow-2xl relative">
          
          <TeacherAvatar 
            isSpeaking={isSpeaking} 
            isListening={isListening} 
            status={status} 
          />

          <div className="mt-8 w-full max-w-xl min-h-[100px] flex items-center justify-center text-center px-6 bg-black/20 rounded-3xl border border-white/5 shadow-inner">
            <p className={`text-sm md:text-lg font-medium leading-relaxed transition-all duration-300 ${isSpeaking ? 'text-white' : 'text-white/40 italic'}`}>
              {transcription || (status === ConnectionStatus.CONNECTED ? "Silakan sapa Ibu Guru..." : "Menunggu sambungan...")}
            </p>
          </div>
          
          <div className="mt-8 w-full max-w-xs space-y-4">
            <button 
              onClick={handleToggle} 
              disabled={status === ConnectionStatus.CONNECTING}
              className={`w-full py-4 font-black rounded-2xl shadow-xl active:scale-95 transition-all uppercase tracking-[0.2em] text-xs border ${
                status === ConnectionStatus.CONNECTED
                  ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/20'
                  : 'bg-gradient-to-r from-pink-600 to-rose-600 text-white border-pink-500/50'
              } disabled:opacity-50`}
            >
              {status === ConnectionStatus.CONNECTED ? 'Putuskan Panggilan' : 'Panggil Ibu Guru'}
            </button>
            
            {errorMsg && (
              <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center animate-shake">
                <p className="text-rose-400 text-[10px] font-black uppercase leading-tight mb-3">{errorMsg}</p>
                <button 
                  onClick={handleSelectKey}
                  className="px-4 py-2 bg-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 transition-colors"
                >
                  Pilih Project Berbayar (Paid)
                </button>
                <p className="mt-2 text-[8px] text-white/30 italic leading-tight">
                  Gemini Live membutuhkan API Key dari project Google Cloud dengan billing aktif. 
                  Kunjungi <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline hover:text-white">ai.google.dev/gemini-api/docs/billing</a>
                </p>
              </div>
            )}
            
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-1.5 h-6 items-center">
                {isListening && !isSpeaking && (
                  <div className="flex gap-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{animationDelay: `${i*0.1}s`}} />
                    ))}
                  </div>
                )}
                {isSpeaking && (
                   <div className="flex gap-1 items-end h-5">
                     {[...Array(8)].map((_, i) => (
                       <div key={i} className="w-1 bg-pink-500 rounded-full animate-wave" style={{animationDelay: `${i*0.06}s`, height: '100%'}} />
                     ))}
                   </div>
                )}
              </div>
              <p className="text-white/10 text-[7px] text-center font-black uppercase tracking-[0.6em]">
                {status === ConnectionStatus.CONNECTED ? 'Protocol: Live Native Audio v2.5' : 'Ready to Connect'}
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full py-6 text-center opacity-20 z-10">
        <p className="text-[8px] font-black tracking-[0.8em] uppercase italic">Powered by Google Gemini Multimodal Live API</p>
      </footer>

      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1.4); }
        }
        .animate-wave { animation: wave 0.6s ease-in-out infinite; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

export default App;
