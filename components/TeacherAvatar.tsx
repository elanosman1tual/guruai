
import React from 'react';

interface TeacherAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  status: string;
}

const TeacherAvatar: React.FC<TeacherAvatarProps> = ({ isSpeaking, isListening, status }) => {
  // Menggunakan foto profesional yang ramah dan berwibawa
  // Foto ini merepresentasikan sosok guru yang modern dan cerdas
  const teacherImageUrl = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1000&auto=format&fit=crop";

  return (
    <div className="relative flex flex-col items-center justify-center p-2 w-full max-w-sm">
      {/* Dynamic Glow Aura - Warna pink yang elegan */}
      <div 
        className={`absolute inset-0 rounded-full blur-[100px] transition-all duration-1000 opacity-40 ${
          isSpeaking ? 'bg-pink-500 scale-125 animate-pulse' : 
          isListening ? 'bg-emerald-400 scale-110' : 
          'bg-pink-900/20 scale-95'
        }`}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* Frame Foto Guru */}
        <div className={`relative w-64 h-80 md:w-72 md:h-96 rounded-[3rem] p-1.5 transition-all duration-700 bg-gradient-to-br shadow-[0_0_50px_rgba(0,0,0,0.6)] ${
          isSpeaking ? 'from-pink-500 via-rose-500 to-indigo-600 scale-105 shadow-pink-500/50' : 
          isListening ? 'from-emerald-400 to-teal-500 scale-102 shadow-emerald-500/40' : 
          'from-white/10 to-white/5 grayscale-[20%]'
        } border border-white/20`}>
          
          <div className="w-full h-full rounded-[2.8rem] overflow-hidden bg-slate-900 relative">
            <img 
              src={teacherImageUrl} 
              alt="Ibu Guru Smansa AI" 
              className={`w-full h-full object-cover transition-all duration-1000 ${
                isSpeaking ? 'scale-110 brightness-110' : 'scale-100 brightness-90'
              }`}
              style={{ objectPosition: 'center 20%' }}
            />
            
            {/* Overlay Gradient halus */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />

            {/* Animasi Gelombang Suara saat Berbicara */}
            {isSpeaking && (
              <div className="absolute inset-0 flex items-end justify-center pb-12 pointer-events-none">
                <div className="flex items-end gap-1.5 h-16 w-full justify-center px-8">
                  {[...Array(10)].map((_, i) => (
                    <div 
                      key={i}
                      className="w-1 bg-pink-400 rounded-full animate-wave shadow-[0_0_15px_rgba(236,72,153,0.8)]"
                      style={{ 
                        animationDelay: `${i * 0.1}s`,
                        height: `${30 + Math.random() * 70}%`
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Status Listening Indicator */}
            {isListening && !isSpeaking && (
              <div className="absolute top-6 right-6">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Label Identitas yang Elegan */}
        <div className="mt-8 text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <div className="h-[1px] w-6 bg-pink-500/30"></div>
            <div className="px-4 py-1 bg-white/5 backdrop-blur-md border border-white/10 text-pink-400 rounded-full text-[9px] font-black tracking-[0.4em] uppercase">
              Asisten Virtual Profesional
            </div>
            <div className="h-[1px] w-6 bg-pink-500/30"></div>
          </div>
          
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none">
            IBU GURU <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-400 drop-shadow-[0_0_15px_rgba(236,72,153,0.4)]">SMANSA</span>
          </h2>
          
          <div className="flex flex-col items-center">
             <p className="text-slate-400 text-[10px] font-bold tracking-[0.3em] uppercase opacity-60">
              CERDAS • BIJAKSANA • MENGINSPIRASI
            </p>
            <div className="mt-3 flex gap-1">
              <div className="w-8 h-1 bg-pink-600 rounded-full opacity-50" />
              <div className="w-2 h-1 bg-pink-600 rounded-full opacity-30" />
              <div className="w-1 h-1 bg-pink-600 rounded-full opacity-20" />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); opacity: 0.3; }
          50% { transform: scaleY(1.8); opacity: 1; }
        }
        .animate-wave {
          animation: wave 0.5s ease-in-out infinite;
          transform-origin: bottom;
        }
      `}</style>
    </div>
  );
};

export default TeacherAvatar;
