
import React from 'react';

interface TeacherAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  status: string;
}

const TeacherAvatar: React.FC<TeacherAvatarProps> = ({ isSpeaking, isListening, status }) => {
  const teacherImageUrl = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1000&auto=format&fit=crop";

  return (
    <div className="relative flex flex-col items-center justify-center p-4 w-full">
      {/* Background Aura */}
      <div 
        className={`absolute w-full aspect-square rounded-full blur-[120px] transition-all duration-1000 opacity-20 ${
          isSpeaking ? 'bg-blue-500 scale-110' : 
          isListening ? 'bg-emerald-400 scale-100' : 
          'bg-slate-800 scale-90'
        }`}
      />

      <div className="relative z-10">
        {/* Foto Frame */}
        <div className={`relative w-64 h-80 md:w-80 md:h-[420px] rounded-[2rem] overflow-hidden transition-all duration-700 border ${
          isSpeaking ? 'border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.2)]' : 
          isListening ? 'border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.1)]' : 
          'border-white/5'
        } bg-[#0a0a0a]`}>
          
          <img 
            src={teacherImageUrl} 
            alt="AI Teacher" 
            className={`w-full h-full object-cover transition-all duration-1000 ${
              isSpeaking ? 'scale-105 brightness-110' : 'scale-100 brightness-[0.7]'
            }`}
            style={{ objectPosition: 'center 20%' }}
          />
          
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />

          {/* Mini Visualizer Overlay */}
          {isSpeaking && (
            <div className="absolute inset-x-0 bottom-0 h-32 flex items-end justify-center gap-1.5 px-10 pb-10">
              {[...Array(12)].map((_, i) => (
                <div 
                  key={i}
                  className="flex-1 bg-blue-400/80 rounded-full animate-wave shadow-[0_0_10px_rgba(96,165,250,0.5)]"
                  style={{ 
                    animationDelay: `${i * 0.05}s`,
                    height: `${20 + Math.random() * 80}%`
                  }}
                />
              ))}
            </div>
          )}

          {/* Mode Badge */}
          <div className="absolute top-6 left-6 px-3 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10">
            <span className="text-[8px] font-black text-white/40 tracking-widest uppercase">
              {isSpeaking ? 'Model Transmitting' : isListening ? 'Core Listening' : 'System Idle'}
            </span>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white mb-1 uppercase italic">
            Guru <span className="text-blue-500">Smansa</span>
          </h2>
          <div className="flex items-center justify-center gap-2">
            <span className="text-[9px] font-bold text-white/30 tracking-[0.4em] uppercase">Intelligence Node v4.1</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wave {
          0%, 100% { height: 10%; }
          50% { height: 90%; }
        }
        .animate-wave {
          animation: wave 0.4s ease-in-out infinite;
          transform-origin: bottom;
        }
      `}</style>
    </div>
  );
};

export default TeacherAvatar;
