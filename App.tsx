
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
  const isSessionActive = useRef<boolean>(false); // Flag krusial untuk mencegah error WebSocket
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Fungsi pembersihan total
  const cleanupAll = useCallback(() => {
    console.log("Cleaning up all resources...");
    isSessionActive.current = false;

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

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
        if (audioContextRef.current.input.state !== 'closed') audioContextRef.current.input.close();
        if (audioContextRef.current.output.state !== 'closed') audioContextRef.current.output.close();
      } catch(e) {}
      audioContextRef.current = null;
    }

    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    
    setIsListening(false);
    setIsSpeaking(false);
    nextStartTimeRef.current = 0;
  }, []);

  const handleStop = useCallback(() => {
    cleanupAll();
    setStatus(ConnectionStatus.DISCONNECTED);
  }, [cleanupAll]);

  useEffect(() => {
    return () => cleanupAll();
  }, [cleanupAll]);

  const handleStart = async () => {
    try {
      console.log("Starting Smansa AI Voice Session...");
      setStatus(ConnectionStatus.CONNECTING);
      setErrorMsg(null);
      cleanupAll(); // Pastikan bersih sebelum mulai

      const apiKey = process.env.API_KEY;
      if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
        throw new Error("API_KEY_INVALID");
      }

      // Akses Mikrofon
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      audioContextRef.current = { input: inputCtx, output: outputCtx };

      // Hubungkan ke Live API
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: 'Anda adalah Ibu Guru Smansa AI. Anda berbicara dengan siswa SMAN 1 Tual. Jawablah dengan hangat, bijaksana, dan edukatif dalam bahasa Indonesia.',
        },
        callbacks: {
          onopen: () => {
            console.log("Live Session Connection Established");
            isSessionActive.current = true;
            setStatus(ConnectionStatus.CONNECTED);
            setIsListening(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            // Menggunakan buffer 4096 untuk stabilitas
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (e) => {
              // CEK FLAG: Jangan kirim jika sesi sudah tidak aktif
              if (isSessionActive.current && sessionRef.current) {
                try {
                  const inputData = e.inputBuffer.getChannelData(0);
                  const pcmBlob = createPcmBlob(inputData);
                  sessionRef.current.sendRealtimeInput({ media: pcmBlob });
                } catch (err) {
                  console.error("Stream Send Error:", err);
                  isSessionActive.current = false;
                }
              }
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              setIsSpeaking(true);
              try {
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
              } catch (e) {
                console.error("Audio Decode Error:", e);
              }
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = outputCtx.currentTime;
              setIsSpeaking(false);
            }
          },
          onerror: (e: any) => {
            console.error("Gemini API Error:", e);
            isSessionActive.current = false;
            setErrorMsg(`Koneksi Gagal: ${e.message || "Pastikan API Key Anda valid dan mendukung model Gemini 2.5."}`);
            setStatus(ConnectionStatus.ERROR);
            cleanupAll();
          },
          onclose: (e: any) => {
            console.warn("Connection Closed:", e);
            if (isSessionActive.current) {
              setErrorMsg("Sesi ditutup oleh server. Cek kuota API Anda di Google AI Studio.");
              setStatus(ConnectionStatus.ERROR);
            }
            cleanupAll();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Startup Error:", err);
      setStatus(ConnectionStatus.ERROR);
      if (err.message === "API_KEY_INVALID") {
        setErrorMsg("API Key tidak valid atau kosong. Mohon periksa Environment Variables di Vercel.");
      } else if (err.name === "NotAllowedError") {
        setErrorMsg("Akses mikrofon ditolak oleh browser.");
      } else {
        setErrorMsg(err.message || "Gagal menghubungkan ke server AI.");
      }
      cleanupAll();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-black text-white overflow-hidden relative font-['Plus_Jakarta_Sans']">
      <NeuralNetworkBackground />
      
      <header className="w-full max-w-6xl px-6 py-6 flex justify-between items-center z-50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-pink-600 to-rose-600 p-2 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h1 className="font-black text-xl tracking-tighter italic">SMANSA <span className="text-pink-500">AI</span></h1>
        </div>
        
        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest border transition-colors ${
          status === ConnectionStatus.CONNECTED ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
          status === ConnectionStatus.CONNECTING ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' :
          status === ConnectionStatus.ERROR ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
          'bg-white/5 text-white/40 border-white/10'
        }`}>
          {status === ConnectionStatus.CONNECTED ? 'ONLINE' : 
           status === ConnectionStatus.CONNECTING ? 'MENGHUBUNGKAN' : 
           status === ConnectionStatus.ERROR ? 'KONEKSI GAGAL' : 'OFFLINE'}
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center px-4 z-10 py-8">
        <div className="w-full bg-slate-900/40 backdrop-blur-2xl rounded-[3rem] border border-white/5 p-8 flex flex-col items-center shadow-2xl">
          <TeacherAvatar isSpeaking={isSpeaking} isListening={isListening} status={status} />
          
          <div className="mt-10 w-full max-w-xs space-y-4">
            {status !== ConnectionStatus.CONNECTED ? (
              <button 
                onClick={handleStart} 
                disabled={status === ConnectionStatus.CONNECTING}
                className="w-full py-4 bg-gradient-to-r from-pink-600 to-rose-600 text-white font-black rounded-xl shadow-lg shadow-pink-600/20 active:scale-95 transition-all uppercase tracking-widest text-xs"
              >
                {status === ConnectionStatus.CONNECTING ? 'Memproses...' : 'Bicara Sekarang'}
              </button>
            ) : (
              <button 
                onClick={handleStop} 
                className="w-full py-4 bg-white text-black font-black rounded-xl active:scale-95 transition-all uppercase tracking-widest text-xs"
              >
                Berhenti
              </button>
            )}
            
            {errorMsg && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                <p className="text-rose-400 text-[9px] font-bold uppercase leading-relaxed">{errorMsg}</p>
                <button onClick={() => window.location.reload()} className="mt-2 text-[8px] text-white/40 hover:text-white underline uppercase">Muat Ulang Halaman</button>
              </div>
            )}
            
            <p className="text-white/20 text-[8px] text-center font-bold uppercase tracking-[0.3em]">
              AI Guru SMAN 1 TUAL • V2.5 NATIVE AUDIO
            </p>
          </div>
        </div>
      </main>

      <footer className="w-full py-6 text-center opacity-20">
        <p className="text-[8px] font-black tracking-[0.5em] uppercase">Cyber Education Project</p>
      </footer>
    </div>
  );
};

export default App;
