
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
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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
      try {
        audioContextRef.current.input.close();
        audioContextRef.current.output.close();
      } catch(e) {}
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

  useEffect(() => {
    return () => handleStop();
  }, [handleStop]);

  const handleStart = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      setErrorMsg(null);

      // Sesuai instruksi: Mengambil API_KEY langsung dari process.env.API_KEY
      const apiKey = process.env.API_KEY;

      if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
        throw new Error("API_KEY_MISSING");
      }

      // Minta izin mikrofon
      let stream: MediaStream;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("BROWSER_NOT_SUPPORTED");
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch (micErr: any) {
        if (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError') {
          throw new Error("MIC_PERMISSION_DENIED");
        }
        throw new Error("MIC_INACCESSIBLE");
      }
      
      // Inisialisasi sesuai panduan @google/genai
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();

      audioContextRef.current = { input: inputCtx, output: outputCtx };

      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: 'Anda adalah Ibu Guru Smansa AI di SMAN 1 Tual. Anda bijaksana, suportif, dan ramah. Panggil siswa dengan Nak. Jawab dengan bahasa Indonesia yang hangat.',
        },
        callbacks: {
          onopen: () => {
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
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setIsSpeaking(true);
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              
              const now = outputCtx.currentTime;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, now);
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              };
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = outputCtx.currentTime;
              setIsSpeaking(false);
            }
          },
          onerror: (e: any) => {
            setErrorMsg(`Error: ${e.message || "Gagal menghubungi server AI"}`);
            setStatus(ConnectionStatus.ERROR);
          },
          onclose: () => handleStop()
        }
      });

      sessionRef.current = session;
    } catch (err: any) {
      console.error("Startup Error:", err);
      setStatus(ConnectionStatus.ERROR);
      
      if (err.message === "API_KEY_MISSING") {
        setErrorMsg("API Key terdeteksi kosong. Anda WAJIB melakukan 'Redeploy' di dashboard Vercel agar perubahan Environment Variables terbaca.");
      } else if (err.message === "MIC_PERMISSION_DENIED") {
        setErrorMsg("Akses mikrofon ditolak.");
      } else {
        setErrorMsg(err.message || "Gagal menghubungkan ke Ibu Guru.");
      }
      
      setTimeout(() => { if(statusRef.current === ConnectionStatus.ERROR) setStatus(ConnectionStatus.DISCONNECTED); }, 8000);
    }
  };

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
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
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
          
          <div className="mt-12 w-full max-w-sm space-y-4">
            {status !== ConnectionStatus.CONNECTED ? (
              <button 
                onClick={handleStart} 
                disabled={status === ConnectionStatus.CONNECTING}
                className="w-full py-5 bg-gradient-to-r from-pink-600 to-rose-600 text-white font-black rounded-2xl shadow-xl shadow-pink-600/20 active:scale-95 hover:scale-[1.02] disabled:opacity-50 transition-all uppercase tracking-wider text-sm"
              >
                {status === ConnectionStatus.CONNECTING ? 'Menghubungkan...' : 'Mulai Konsultasi'}
              </button>
            ) : (
              <button 
                onClick={handleStop} 
                className="w-full py-5 bg-white text-black font-black rounded-2xl active:scale-95 hover:bg-slate-100 transition-all uppercase tracking-wider text-sm"
              >
                Selesaikan Sesi
              </button>
            )}
            
            {errorMsg && (
              <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                <p className="text-rose-400 text-[11px] font-bold uppercase tracking-tight leading-relaxed mb-3">
                  {errorMsg}
                </p>
                <div className="flex flex-col gap-2">
                  <a 
                    href="https://vercel.com/dashboard" 
                    target="_blank" 
                    className="text-[10px] bg-rose-500/20 py-2 rounded-lg font-black uppercase tracking-widest text-white hover:bg-rose-500/40 transition-all"
                  >
                    Buka Vercel Dashboard
                  </a>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="text-[9px] uppercase font-bold text-white/40 hover:text-white underline transition-all"
                  >
                    Segarkan Halaman
                  </button>
                </div>
              </div>
            )}
            
            <p className="text-slate-500 text-[9px] text-center font-medium uppercase tracking-[0.2em]">
              {status === ConnectionStatus.CONNECTED ? 'Ibu Guru siap membantu Anda...' : 'Interaksi Suara Langsung'}
            </p>
          </div>
        </div>
      </main>

      <footer className="w-full px-8 py-6 text-center z-50">
        <p className="text-[9px] font-bold tracking-[0.6em] text-white/20 uppercase">
          SMA NEGERI 1 TUAL • EDUCATION 4.0
        </p>
      </footer>
    </div>
  );
};

export default App;
