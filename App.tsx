
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { ConnectionStatus } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audioService';
import TeacherAvatar from './components/TeacherAvatar';
import NeuralNetworkBackground from './components/NeuralNetworkBackground';

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Bersihkan resource saat unmount
  useEffect(() => {
    return () => {
      handleStop();
    };
  }, []);

  const handleStop = useCallback(() => {
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
      sessionRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.input.close().catch(() => {});
      audioContextRef.current.output.close().catch(() => {});
      audioContextRef.current = null;
    }

    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    
    setStatus(ConnectionStatus.DISCONNECTED);
    setIsListening(false);
    setIsSpeaking(false);
    nextStartTimeRef.current = 0;
  }, []);

  const handleStart = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      setErrorMsg(null);

      // 1. Validasi API Key
      const apiKey = process.env.API_KEY;
      if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
        throw new Error("API_KEY_INVALID");
      }

      // 2. Validasi Protokol (Mic butuh HTTPS)
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        throw new Error("NOT_HTTPS");
      }

      // 3. Akses Mikrofon
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch (micErr) {
        console.error("Mic access denied:", micErr);
        throw new Error("MIC_PERMISSION_DENIED");
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      // 4. Inisialisasi Audio Context
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      audioContextRef.current = { input: inputCtx, output: outputCtx };

      // 5. Koneksi ke Live API
      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: 'Anda adalah Ibu Guru Smansa AI. Berikan jawaban yang mendidik, sopan, dan panggil siswa dengan Nak. Gunakan bahasa Indonesia yang baik.',
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Session Opened");
            setStatus(ConnectionStatus.CONNECTED);
            setIsListening(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (sessionRef.current && statusRef.current === ConnectionStatus.CONNECTED) {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                sessionRef.current.sendRealtimeInput({ media: pcmBlob });
              }
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message) => {
            // Tangani Audio Output
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setIsSpeaking(true);
              try {
                const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
                const source = outputCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(outputCtx.destination);
                
                const now = outputCtx.currentTime;
                if (nextStartTimeRef.current < now) {
                  nextStartTimeRef.current = now;
                }
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                sourcesRef.current.add(source);
                
                source.onended = () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) setIsSpeaking(false);
                };
              } catch (decodeErr) {
                console.error("Audio decoding failed:", decodeErr);
              }
            }

            // Tangani Interupsi
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = outputCtx.currentTime;
              setIsSpeaking(false);
            }
          },
          onerror: (e: any) => {
            console.error("Gemini WebSocket Error:", e);
            const msg = e?.message || "Koneksi terputus tiba-tiba.";
            setErrorMsg(`Server Error: ${msg}`);
            setStatus(ConnectionStatus.ERROR);
          },
          onclose: (e) => {
            console.log("Gemini Session Closed", e);
            handleStop();
          }
        }
      });

      sessionRef.current = session;
    } catch (err: any) {
      console.error("App Initialization Failed:", err);
      setStatus(ConnectionStatus.ERROR);
      
      if (err.message === "MIC_PERMISSION_DENIED") {
        setErrorMsg("Akses mikrofon ditolak oleh browser.");
      } else if (err.message === "API_KEY_INVALID") {
        setErrorMsg("API Key tidak valid atau belum diset di Vercel.");
      } else if (err.message === "NOT_HTTPS") {
        setErrorMsg("Aplikasi ini memerlukan koneksi aman (HTTPS).");
      } else if (err.message?.includes("Requested entity was not found")) {
        setErrorMsg("Model AI tidak tersedia untuk API Key ini.");
      } else {
        setErrorMsg(`Gagal: ${err.message || "Masalah jaringan"}`);
      }
      
      // Auto-stop untuk membersihkan resource
      setTimeout(handleStop, 3000);
    }
  };

  // Ref untuk status agar callback bisa baca nilai terbaru
  const statusRef = useRef(status);
  statusRef.current = status;

  return (
    <div className="min-h-screen flex flex-col items-center bg-black text-white selection:bg-pink-900/50 overflow-hidden relative font-['Plus_Jakarta_Sans']">
      <NeuralNetworkBackground />
      
      <header className="w-full max-w-6xl px-6 py-6 flex justify-between items-center z-50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-pink-600 to-rose-600 p-2.5 rounded-xl text-white shadow-lg shadow-pink-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="font-extrabold text-2xl tracking-tighter uppercase italic">
            SMANSA <span className="text-pink-500">AI</span>
          </h1>
        </div>
        
        <div className={`px-4 py-2 rounded-full text-[10px] font-black tracking-widest border backdrop-blur-md transition-all duration-500 ${
          status === ConnectionStatus.CONNECTED 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
            : status === ConnectionStatus.CONNECTING 
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
            : 'bg-slate-800/50 text-slate-400 border-slate-700'
        }`}>
          {status === ConnectionStatus.CONNECTED ? '● SISTEM AKTIF' : 
           status === ConnectionStatus.CONNECTING ? 'MENGHUBUNGKAN...' : 
           status === ConnectionStatus.ERROR ? 'ERROR SISTEM' : 'STANDBY'}
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center px-4 z-10 py-8">
        <div className="w-full bg-slate-900/30 backdrop-blur-3xl rounded-[4rem] border border-white/5 p-10 flex flex-col items-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-pink-500/50 to-transparent"></div>
          
          <TeacherAvatar isSpeaking={isSpeaking} isListening={isListening} status={status} />
          
          <div className="mt-12 w-full max-w-xs space-y-4">
            {status !== ConnectionStatus.CONNECTED ? (
              <button 
                onClick={handleStart} 
                disabled={status === ConnectionStatus.CONNECTING}
                className="w-full py-5 bg-gradient-to-r from-pink-600 to-rose-600 text-white font-black rounded-2xl shadow-xl shadow-pink-600/20 active:scale-95 hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 transition-all uppercase tracking-wider text-sm"
              >
                {status === ConnectionStatus.CONNECTING ? 'Menyiapkan...' : 'Mulai Konsultasi'}
              </button>
            ) : (
              <button 
                onClick={handleStop} 
                className="w-full py-5 bg-white text-black font-black rounded-2xl active:scale-95 hover:bg-slate-100 transition-all uppercase tracking-wider text-sm shadow-[0_0_30px_rgba(255,255,255,0.2)]"
              >
                Selesaikan Sesi
              </button>
            )}
            
            {errorMsg && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center animate-shake">
                <p className="text-rose-400 text-[10px] font-bold uppercase tracking-tight leading-relaxed">{errorMsg}</p>
                <button onClick={() => window.location.reload()} className="mt-2 text-[9px] underline opacity-50 hover:opacity-100">Refresh Halaman</button>
              </div>
            )}
            
            <p className="text-slate-500 text-[9px] text-center font-medium uppercase tracking-[0.2em]">
              {status === ConnectionStatus.CONNECTED ? 'Ibu Guru sedang mendengarkan...' : 'Klik tombol di atas untuk bicara'}
            </p>
          </div>
        </div>
      </main>

      <footer className="w-full px-8 py-6 text-center z-50">
        <p className="text-[9px] font-bold tracking-[0.6em] text-white/20 uppercase">
          SMA NEGERI 1 TUAL • EDUCATION 4.0
        </p>
      </footer>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default App;
