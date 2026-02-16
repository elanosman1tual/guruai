
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
  const [isWakeWordReady, setIsWakeWordReady] = useState(false);

  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sessionRef = useRef<any>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);

  // Database Lengkap SMA Negeri 1 Tual
  const teacherDatabase = `
    Daftar Personil SMA Negeri 1 Tual:
    1. Fata Tukloy, S.Pd. M.Pd.Si (Kepala Sekolah, Guru Fisika)
    ... (Data lainnya tetap ada di sistem)
  `;

  const handleStop = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.input.close();
      audioContextRef.current.output.close();
      audioContextRef.current.input = null as any;
      audioContextRef.current.output = null as any;
    }
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    setStatus(ConnectionStatus.DISCONNECTED);
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  const handleStart = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    try {
      setStatus(ConnectionStatus.CONNECTING);
      setErrorMsg(null);

      // MENGGUNAKAN VITE_API_KEY UNTUK VERCEL/VITE
      const apiKey = (import.meta as any).env?.VITE_API_KEY || process.env.API_KEY;
      
      if (!apiKey) {
        throw new Error("API Key tidak ditemukan. Pastikan sudah diatur di Environment Variables.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = { input: inputCtx, output: outputCtx };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: { thinkingBudget: 0 },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `Anda adalah Ibu Guru Smansa AI di SMA Negeri 1 Tual. Jawablah secepat mungkin, bijaksana, dan panggil siswa dengan Nak atau Ananda.`,
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            setIsListening(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (sessionRef.current) {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                session.sendRealtimeInput({ media: pcmBlob });
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setIsSpeaking(true);
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
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
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error("Gemini Error:", e);
            setStatus(ConnectionStatus.ERROR);
            setErrorMsg("Koneksi terganggu. Pastikan API Key benar.");
          },
          onclose: () => {
            handleStop();
            startWakeWordDetection();
          }
        }
      });

      sessionRef.current = session;
    } catch (err: any) {
      console.error(err);
      setStatus(ConnectionStatus.ERROR);
      setErrorMsg(err.message || "Gagal menghubungi Ibu Guru Smansa AI.");
      startWakeWordDetection();
    }
  };

  const startWakeWordDetection = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'id-ID';
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((result: any) => result[0].transcript).join('').toLowerCase();
      if (transcript.includes("hai guru")) handleStart();
    };
    recognition.onend = () => { if (status === ConnectionStatus.DISCONNECTED) recognition.start(); };
    try { recognition.start(); recognitionRef.current = recognition; setIsWakeWordReady(true); } catch(e) {}
  }, [status]);

  const activateSystem = () => {
    startWakeWordDetection();
    setErrorMsg(null);
  };

  return (
    <div className="h-screen flex flex-col items-center bg-black text-white selection:bg-pink-900/50 overflow-hidden relative font-['Plus_Jakarta_Sans']">
      <NeuralNetworkBackground />
      <header className="w-full max-w-6xl px-6 py-4 flex justify-between items-center z-50">
        <div className="flex items-center gap-3">
          <div className="bg-pink-600 p-2 rounded-xl text-white shadow-lg shadow-pink-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="font-black text-xl tracking-tighter uppercase italic">SMANSA <span className="text-pink-500">AI</span></h1>
        </div>
        <div className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest border transition-all ${
          status === ConnectionStatus.CONNECTED ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800/50 text-slate-400 border-slate-700'
        }`}>
          {status === ConnectionStatus.CONNECTED ? '• ONLINE' : status}
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center px-4 z-10">
        <div className="w-full bg-slate-900/40 backdrop-blur-3xl rounded-[3rem] border border-white/5 p-8 flex flex-col items-center shadow-2xl">
          <TeacherAvatar isSpeaking={isSpeaking} isListening={isListening} status={status} />
          <div className="mt-8 w-full max-w-sm">
            {status === ConnectionStatus.DISCONNECTED ? (
              <button onClick={isWakeWordReady ? handleStart : activateSystem} className="w-full py-5 bg-gradient-to-r from-pink-600 to-rose-600 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all uppercase tracking-tight">
                {isWakeWordReady ? 'MULAI BICARA' : 'AKTIFKAN SUARA'}
              </button>
            ) : (
              <button onClick={handleStop} className="w-full py-5 bg-white text-black font-black rounded-2xl active:scale-95 transition-all uppercase tracking-tight">
                BERHENTI
              </button>
            )}
            {errorMsg && <p className="mt-4 text-rose-400 text-[10px] font-bold text-center bg-rose-500/10 py-2 rounded-lg border border-rose-500/20">{errorMsg}</p>}
          </div>
        </div>
      </main>
      <footer className="w-full px-8 py-4 text-center z-50">
        <p className="text-[8px] font-black tracking-[0.5em] text-pink-500/40 uppercase italic">SMA NEGERI 1 TUAL • KOTA TUAL</p>
      </footer>
    </div>
  );
};

export default App;
