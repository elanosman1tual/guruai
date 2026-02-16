
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ConnectionStatus } from './types';
import TeacherAvatar from './components/TeacherAvatar';
import NeuralNetworkBackground from './components/NeuralNetworkBackground';

const BASE_URL = "https://litellm.koboi2026.biz.id/v1";

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-3.5-turbo");
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch Available Models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch(`${BASE_URL}/models`, {
          headers: { 'Authorization': `Bearer ${process.env.API_KEY}` }
        });
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          const modelList = data.data.map((m: any) => m.id);
          setModels(modelList);
          if (modelList.length > 0 && !modelList.includes(selectedModel)) {
            setSelectedModel(modelList[0]);
          }
        }
      } catch (err) {
        console.error("Gagal mengambil daftar model:", err);
        setModels(["gpt-3.5-turbo", "gemini-pro", "claude-3-haiku"]);
      }
    };
    fetchModels();
  }, []);

  const stopConversation = useCallback(() => {
    if (recognitionRef.current) recognitionRef.current.stop();
    if (synthRef.current) synthRef.current.cancel();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    
    setIsListening(false);
    setIsSpeaking(false);
    setStatus(ConnectionStatus.DISCONNECTED);
  }, []);

  const speakText = (text: string) => {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 1.0;
      utterance.pitch = 1.1; // Suara sedikit lebih tinggi agar terdengar ramah seperti guru perempuan

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve(true);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve(false);
      };

      synthRef.current.speak(utterance);
    });
  };

  const processChat = async (userInput: string) => {
    setStatus(ConnectionStatus.CONNECTING);
    setIsListening(false);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_KEY}`
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { 
              role: "system", 
              content: "Anda adalah Ibu Guru Smansa AI yang bijaksana. Gunakan bahasa Indonesia yang santun, hangat, dan edukatif. Berikan jawaban yang singkat dan padat agar enak didengar." 
            },
            { role: "user", content: userInput }
          ]
        }),
        signal: abortControllerRef.current.signal
      });

      const data = await response.json();
      const aiText = data.choices?.[0]?.message?.content || "Maaf, Ibu tidak mengerti. Bisa diulang?";
      
      setStatus(ConnectionStatus.CONNECTED);
      await speakText(aiText);
      
      // Auto-restart listening after speaking
      if (status !== ConnectionStatus.DISCONNECTED) {
        startListening();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMsg("Gagal menghubungi server AI.");
        setStatus(ConnectionStatus.ERROR);
      }
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg("Browser Anda tidak mendukung Speech Recognition.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus(ConnectionStatus.CONNECTED);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log("Siswa:", transcript);
      processChat(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech error:", event.error);
      if (event.error !== 'no-speech') {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Don't auto-toggle false here to avoid flickering if we are processing
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleStartToggle = () => {
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      stopConversation();
    } else {
      setErrorMsg(null);
      startListening();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-black text-white overflow-hidden relative font-['Plus_Jakarta_Sans']">
      <NeuralNetworkBackground />
      
      <header className="w-full max-w-6xl px-6 py-6 flex flex-col md:flex-row justify-between items-center z-50 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-pink-600 to-rose-600 p-2 rounded-xl shadow-lg shadow-pink-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0z" />
            </svg>
          </div>
          <h1 className="font-black text-xl tracking-tighter italic">SMANSA <span className="text-pink-500">AI</span></h1>
        </div>

        {/* Model Selector */}
        <div className="flex items-center gap-3 bg-white/5 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl">
          <label className="text-[10px] font-black text-white/40 ml-3 uppercase tracking-widest">Model:</label>
          <select 
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-transparent text-xs font-bold py-1.5 px-3 outline-none cursor-pointer hover:text-pink-400 transition-colors"
          >
            {models.map(m => (
              <option key={m} value={m} className="bg-slate-900 text-white">{m}</option>
            ))}
          </select>
        </div>
        
        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest border transition-all ${
          status === ConnectionStatus.CONNECTED ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.15)]' : 
          status === ConnectionStatus.CONNECTING ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' :
          status === ConnectionStatus.ERROR ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
          'bg-white/5 text-white/40 border-white/10'
        }`}>
          {status === ConnectionStatus.CONNECTED ? 'READY' : 
           status === ConnectionStatus.CONNECTING ? 'THINKING' : 
           status === ConnectionStatus.ERROR ? 'ERROR' : 'STANDBY'}
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center px-4 z-10 py-8">
        <div className="w-full bg-slate-900/40 backdrop-blur-3xl rounded-[3rem] border border-white/5 p-8 flex flex-col items-center shadow-2xl relative">
          <TeacherAvatar 
            isSpeaking={isSpeaking} 
            isListening={isListening} 
            status={status} 
          />
          
          <div className="mt-10 w-full max-w-xs space-y-4">
            <button 
              onClick={handleStartToggle} 
              className={`w-full py-4 font-black rounded-xl shadow-lg active:scale-95 transition-all uppercase tracking-widest text-xs border ${
                status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING
                  ? 'bg-white text-black border-transparent'
                  : 'bg-gradient-to-r from-pink-600 to-rose-600 text-white border-pink-500/50 shadow-pink-600/20'
              }`}
            >
              {status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING 
                ? 'Akhiri Sesi' 
                : 'Mulai Bimbingan'}
            </button>
            
            {errorMsg && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center animate-bounce">
                <p className="text-rose-400 text-[9px] font-bold uppercase">{errorMsg}</p>
              </div>
            )}
            
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1.5 h-4 items-center">
                {isListening && [...Array(3)].map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" style={{animationDelay: `${i*0.2}s`}} />
                ))}
              </div>
              <p className="text-white/20 text-[8px] text-center font-black uppercase tracking-[0.4em]">
                {isListening ? 'Mendengarkan Siswa...' : isSpeaking ? 'Ibu Guru Sedang Bicara' : 'Tekan Tombol Untuk Mulai'}
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full py-6 text-center opacity-30">
        <p className="text-[7px] font-black tracking-[0.8em] uppercase italic">LiteLLM Proxy • Smansa Cyber Education</p>
      </footer>
    </div>
  );
};

export default App;
