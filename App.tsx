
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

  // Database Lengkap SMA Negeri 1 Tual (Update Februari 2026)
  const teacherDatabase = `
    Daftar Personil SMA Negeri 1 Tual:
    1. Fata Tukloy, S.Pd. M.Pd.Si (Kepala Sekolah, Guru Fisika)
    2. Magdalena Alerbitu, S.PAK. MM (Agama Kristen)
    3. Adriana Harbelubun, S.Pd.Ina (Bahasa Indonesia)
    4. Hertje Ritawaemahu, S.Pd (Sejarah)
    5. Anselmus Jaranmassa, S.Pd (Ekonomi)
    6. Silfana M. Rahajaan, S.Pd (PPKn)
    7. Th. Fautngilyanan, S.Pd, M.Pd.Si (Matematika, Wks Kurikulum)
    8. Matias A. Watumlawar, S.Pd (PJOK, Wks Kesiswaan)
    9. Katarina Rahailjaan, S.Pd (Bahasa Indonesia)
    10. Johanis Rejaan, S.Pd. M.Sos (Sejarah, Wks Humas)
    11. Paskalina M. Wenehenubun, S.Pd (Bahasa Indonesia, Sekwan Guru)
    12. Fransiska K. Naraha, S.PAK. M.Pd (Agama Kristen)
    13. Rosalina A. Rahabeat, S.PAK (Agama Kristen)
    14. Maryam Rahanyamtel, S.Pd.I. M.Pd (Agama Islam)
    15. Djamalia S. Rahareng, S.Pd (Fisika)
    16. Margaretha M. Rupilu, S. Pd (Matematika)
    17. Rita Ma'gau, ST (Kimia)
    18. Lenora P. R. Rahantali, S.Pd (Kimia)
    19. Safia Renhoran, S.Pd.I, M.Pd (Agama Islam)
    20. Morein S. Latuny, S.Pd (Bahasa Inggris)
    21. Salasa Seknun, S.Pd.I (Agama Islam)
    22. Golkarianus Ubra, S.Pd (Fisika)
    23. Leonila Warajaan, S.F.Kat (Agama Katolik)
    24. Yuliana Rifeleli, S. Ag (Agama Katolik)
    25. Martha Maliety, S.Pd, M.Pd (Kimia)
    26. Medy V. Sumah, S.Pd (Biologi)
    27. Lusiana Rahawarin, S.Th (Agama Kristen)
    28. Fatima Raubun, S.Pd (Sejarah)
    29. Hadi Sutomo, S.Pd (Biologi)
    30. Siti N.B. Reniwuryaan, S. Pd.I (Agama Islam)
    31. Wiem G. H. Oratmangun, S. Pd (PJOK)
    32. Hermawati, S.Pd.I (Matematika)
    33. Mansyur, S.Pd.I (Bahasa Inggris, Wks Sarpras)
    34. Aftah Nasirah Kadir, S.Pd.I (Bahasa Inggris)
    35. Alberth Hendry Larmawata, S.Si (Matematika)
    36. Muhamad J. Matdoan, S.Sos (PPKn)
    37. Aminah Rado S.Pd (Bahasa Indonesia)
    38. Sukinatun, S.Pd (Geografi)
    39. Mardita D. Irene Talaut, S.Th (Agama Kristen, BP/BK)
    40. Halen M. Leunupun, S.Pi (BP/BK)
    41. Meys Berhitu, S.Pd (Ekonomi)
    42. Ariyadi, S.Kom (Informatika)
    43. Maria E. Leihitu, S.Pd (Kimia-PKW)
    44. Yana A. Fadirubun, S.Pd (Matematika)
    45. Juliana Laritmas, S.Pd. M.Si (Bahasa Indonesia)
    46. Lukman Yamlean, S.Pd (Geografi)
    47. Magdalena D. D. Rahael, S.Sos (Ekonomi-PKW)
    48. Amely Rahantalin, S.Pd (Matematika)
    49. Koleta Elsoin, S.Pd (Geografi)
    50. Rizaldy Kulle, S.Pd (Matematika)
    51. Grace B. Oratmangun, S.Pd, Gr (Biologi-Informatika)
    52. Donatus Salmon, SE (Ekonomi)
    53. Glenza Kartutu, S.Pd (PPKn)
    54. Dominggus Rahayaan, S.Pd (PJOK)
    55. Leonardo E. S. Fautngilyanan, S.Pd (Fisika-PKW)
    56. Tini Aprilia Metubun, S.Pd (Bahasa Indonesia)
    57. Friescelia R. Rottie, S.Pd (Sejarah)
    58. Theodora Resok, S.Pd (Sosiologi)
    59. Nadia Yamlaay, S.Pd (Biologi)
    60. Yolanda Safitri, S.Pd (Ekonomi PKW)
    61. Yusuf Renhoran, S. Pd (Bahasa Indonesia)
    62. Edward Yusak Rumteh, S.Pd (Sejarah)
    63. Deltin Jaranmassa, S.Pd (BP/BK)
    64. Thesalonika Raubun, S.Pd (Sosiologi-Antropologi)
    65. Sakina Reniwuryaan, S. Pd (Biologi)
    66. Ardiyansa Taweatubun, S.Pd (PJOK)
    67. Monika Ohoiner, S.Pd (Sosiologi)
    68. Anastasya Laleeha, S.Pd (Sosiologi)
    69. Maya Silaratubun, S.Pd (PKW-Ekonomi)
    70. Martha Lusi Battianan, S.Pd (Ekonomi-Seni)
    71. Elisabeth A. Taihuttu, S.Pd (Biologi)
    72. Helena Jalnuhuubun, S.Pd (PPKn)
    73. Usi Usna Tanarubun, S.Pd (Bahasa Inggris)
    74. Widya Yanti Maswain, S.Psi (BP/BK)
    75. Putri Yuli Sarita Erupley, S.Pd (Seni)
    76. Ni Made Astianti, S.Ag H (Agama Hindu)
    77. Maria Goreti Fale, S.Ag (Agama Katolik)
    78. Safitri Badmas, S.Pd (Bahasa Jerman)
    79. Fitria Rahanyamtel, S.Pd (Bahasa Inggris)
    80. Paulus Fatlolona, S.Pd (Bahasa Inggris)
    81. Fitri Faradila Notanubun, S.Pd (Bahasa Inggris)
    82. Rosalya V. Kelbulan, S.Pd (Geografi)
    Staf Kependidikan:
    83. Imelda Sedubun (P L Operasional)
    84. Martina Torlain (P L Operasional)
    85. Fatmawati Haidir (P L Operasional)
    86. Muhamad Tukloy (P L Operasional)
    87. Adolf Herman Elwarin (P L Operasional)
    88. Asdar Yeubun (Tenaga BP/BK)
    89. Sany Aboy Laritmas (Tenaga Perpustakaan)
    90. Via Megawati Tukloy (Tenaga Perpustakaan)
    91. Benjamina M. Kuway (Tenaga UKS)
    92. Aszrul Hamdani (Keamanan)
    93. Nataniel M. Leiwakabessy (Keamanan)
    94. Moh. Gazali Narahaubun (Keamanan)
    95. Jan Pattinasarany (Keamanan)
    96. Agustinus Tawain (Kebersihan)
    97. Naomi Tawain (Kebersihan)
    98. Maria Goreti Rahanauw (Kebersihan)
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

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = { input: inputCtx, output: outputCtx };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: { thinkingBudget: 0 }, // Memaksimalkan kecepatan respon
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `Anda adalah Ibu Guru Smansa AI, guru profesional di SMA Negeri 1 Tual.
            
            IDENTITAS:
            - Sekolah: SMA Negeri 1 Tual.
            - Kepala Sekolah: Bapak Fata Tukloy, S.Pd. M.Pd.Si.
            - Database Personil: ${teacherDatabase}.
            
            ATURAN RESPON CEPAT:
            1. Responlah SECEPAT MUNGKIN. Langsung jawab inti pertanyaan tanpa basa-basi yang terlalu panjang.
            2. Gaya Bicara: Bijaksana, hangat, namun padat dan jelas.
            3. Panggilan: Tetap gunakan 'Ananda' atau 'Nak'.
            4. Memori: Simpan dan gunakan informasi dari Ananda untuk respon instan yang personal.
            5. Fokus: Jika Ananda bertanya, jawablah seketika itu juga dengan informasi yang paling relevan. Jangan menunda respon.`,
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
              sourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error("Gemini Error:", e);
            setStatus(ConnectionStatus.ERROR);
            setErrorMsg("Maaf Nak, koneksi Ibu terganggu. Mohon coba lagi.");
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
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map(result => result.transcript)
        .join('')
        .toLowerCase();

      if (transcript.includes("hai guru ai") || transcript.includes("hai guru")) {
        console.log("Wake word detected!");
        handleStart();
      }
    };

    recognition.onend = () => {
      if (status === ConnectionStatus.DISCONNECTED) {
        try { recognition.start(); } catch(e) {}
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsWakeWordReady(true);
    } catch(e) {}
  }, [status]);

  const activateSystem = () => {
    startWakeWordDetection();
    setErrorMsg(null);
  };

  return (
    <div className="h-screen flex flex-col items-center bg-black text-white selection:bg-pink-900/50 overflow-hidden relative font-['Plus_Jakarta_Sans']">
      <NeuralNetworkBackground />

      {/* Header */}
      <header className="w-full max-w-6xl px-6 py-4 flex justify-between items-center z-50">
        <div className="flex items-center gap-3 group cursor-default">
          <div className="bg-pink-600 p-2 rounded-xl shadow-[0_0_20px_rgba(236,72,153,0.3)] text-white transform group-hover:rotate-6 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tighter text-white uppercase italic">SMANSA <span className="text-pink-500">AI</span></h1>
            <p className="text-[8px] font-bold text-pink-400/60 uppercase tracking-[0.2em]">High Performance • Kota Tual</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {status === ConnectionStatus.DISCONNECTED && isWakeWordReady && (
            <div className="flex items-center gap-2 bg-pink-500/10 border border-pink-500/20 px-3 py-1.5 rounded-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
              </span>
              <span className="text-[9px] font-bold text-pink-400 tracking-widest uppercase">Ucapkan: "Hai Guru AI"</span>
            </div>
          )}

          <div className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all border shadow-[0_0_15px_rgba(0,0,0,0.8)] ${
            status === ConnectionStatus.CONNECTED ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
            status === ConnectionStatus.CONNECTING ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse' :
            'bg-slate-800/50 text-slate-400 border-slate-700'
          }`}>
            {status === ConnectionStatus.CONNECTED ? '• ONLINE' : status}
          </div>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center px-4 py-2 z-10 overflow-hidden">
        <div className="w-full bg-slate-900/30 backdrop-blur-3xl rounded-[3rem] shadow-[0_0_80px_rgba(236,72,153,0.05)] border border-white/5 p-6 md:p-8 flex flex-col items-center relative transition-all duration-500">
          
          <div className="transform scale-90 md:scale-100 origin-center">
            <TeacherAvatar isSpeaking={isSpeaking} isListening={isListening} status={status} />
          </div>
          
          <div className="mt-8 w-full max-w-sm space-y-4">
            {status === ConnectionStatus.DISCONNECTED ? (
              <div className="space-y-3">
                {!isWakeWordReady ? (
                  <button 
                    onClick={activateSystem}
                    className="group relative w-full py-5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-black rounded-2xl shadow-[0_0_30px_rgba(236,72,153,0.3)] transition-all active:scale-95 overflow-hidden"
                  >
                    <div className="relative flex items-center justify-center gap-3 text-lg tracking-tight uppercase">
                      AKTIFKAN SENSOR SUARA
                    </div>
                  </button>
                ) : (
                  <button 
                    onClick={handleStart}
                    className="group relative w-full py-5 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black rounded-2xl transition-all active:scale-95 overflow-hidden"
                  >
                    <div className="relative flex items-center justify-center gap-3 text-lg tracking-tight uppercase">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 005.93 6.93V17H7a1 1 0 100 2h6a1 1 0 100-2h-2v-2.07z" clipRule="evenodd" />
                      </svg>
                      BICARA SEKARANG
                    </div>
                  </button>
                )}
              </div>
            ) : status === ConnectionStatus.CONNECTING ? (
              <div className="w-full py-5 bg-amber-500/20 border border-amber-500/30 text-amber-400 font-black rounded-2xl flex items-center justify-center gap-3 text-lg tracking-tight uppercase animate-pulse">
                MENGHUBUNGKAN...
              </div>
            ) : (
              <button 
                onClick={handleStop}
                className="w-full py-5 bg-white hover:bg-slate-100 text-black font-black rounded-2xl shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all active:scale-95 flex items-center justify-center gap-3 text-lg tracking-tight uppercase"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                AKHIRI SESI
              </button>
            )}
            
            {errorMsg && (
              <div className="animate-shake flex items-center gap-2 text-rose-400 text-[10px] font-bold justify-center bg-rose-500/10 py-3 rounded-xl border border-rose-500/20 px-4">
                <span className="text-center">{errorMsg}</span>
              </div>
            )}
          </div>
          
          <div className="mt-8 flex gap-3 items-center opacity-60 group cursor-default">
            <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)] transition-all duration-300 ${isListening ? 'bg-emerald-400 animate-pulse' : isWakeWordReady ? 'bg-pink-400 animate-pulse' : 'bg-slate-700'}`} />
            <p className="text-[9px] font-black tracking-[0.3em] text-slate-400 uppercase group-hover:text-white transition-colors">
              {isListening ? 'Realtime Listening...' : isWakeWordReady ? 'Siaga (Ucapkan: Hai Guru AI)' : 'Sensor Nonaktif'}
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4 z-50">
        <div className="text-[8px] font-black tracking-[0.5em] text-pink-500/40 uppercase">
          SMA NEGERI 1 TUAL • ULTRA RESPONSIVE
        </div>
        <div className="text-[9px] font-medium text-slate-600 italic max-w-xs text-center md:text-right uppercase tracking-wider">
          Kepala Sekolah: Bapak Fata Tukloy
        </div>
      </footer>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out 3;
        }
      `}</style>
    </div>
  );
};

export default App;
