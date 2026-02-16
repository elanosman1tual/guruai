
import React from 'react';

interface TeacherAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  status: string;
}

const TeacherAvatar: React.FC<TeacherAvatarProps> = ({ isSpeaking, isListening, status }) => {
  // Menggunakan link langsung dari file Google Drive yang diberikan user
  const imageUrl = "https://lh3.googleusercontent.com/d/1-l-jtr010e-3dCFC6wFA2alP2Thx2GXt"; 

  return (
    <div className="relative flex flex-col items-center justify-center p-2 w-full max-w-sm">
      {/* Glow Aura dinamis di belakang avatar */}
      <div 
        className={`absolute inset-0 rounded-full blur-[100px] transition-all duration-1000 opacity-50 ${
          isSpeaking ? 'bg-pink-600 scale-125 animate-pulse' : 
          isListening ? 'bg-emerald-500 scale-110' : 
          'bg-indigo-900/40 scale-95'
        }`}
      />

      {/* Frame Utama Avatar - Slightly Smaller to fit viewport */}
      <div className="relative z-10 flex flex-col items-center">
        <div className={`relative w-56 h-64 md:w-64 md:h-72 rounded-[3rem] p-1 transition-all duration-700 bg-gradient-to-br shadow-[0_0_80px_rgba(0,0,0,0.9)] ${
          isSpeaking ? 'from-pink-500 via-rose-500 to-indigo-600 scale-105 shadow-pink-500/40' : 
          isListening ? 'from-emerald-400 to-teal-500 scale-102 shadow-emerald-500/40' : 
          'from-slate-700 to-slate-900 grayscale-[10%]'
        }`}>
          <div className="w-full h-full rounded-[2.9rem] overflow-hidden bg-slate-900 relative ring-1 ring-white/10">
            <img 
              src={imageUrl} 
              alt="Guru Smansa Ai" 
              className={`w-full h-full object-cover transition-all duration-1000 ${isSpeaking ? 'scale-110 brightness-110' : 'scale-100 brightness-90'}`}
              style={{ objectPosition: 'center 15%' }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = "https://api.dicebear.com/7.x/avataaars/svg?seed=teacher&top=hijabTurquoise";
              }}
            />
            
            {isSpeaking && (
              <div className="absolute inset-0 bg-gradient-to-t from-pink-600/90 via-transparent to-transparent flex items-end justify-center pb-8 pointer-events-none">
                <div className="flex items-end gap-1.5 h-16 px-4 w-full justify-center">
                  {[...Array(10)].map((_, i) => (
                    <div 
                      key={i}
                      className="w-1 bg-white rounded-full animate-wave shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                      style={{ 
                        animationDelay: `${i * 0.08}s`,
                        height: `${15 + Math.random() * 85}%`
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {isListening && !isSpeaking && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 backdrop-blur-2xl border border-emerald-500/40 text-[8px] px-4 py-1.5 rounded-full font-black uppercase tracking-[0.3em] shadow-xl text-emerald-400">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                SIAP
              </div>
            )}
          </div>
        </div>

        {/* Branding & Identitas - More Compact */}
        <div className="mt-6 text-center space-y-2">
          <div className="inline-block px-4 py-1 bg-pink-900/40 border border-pink-500/40 text-pink-400 rounded-full text-[9px] font-black tracking-[0.4em] uppercase shadow-lg backdrop-blur-md">
            ASISTEN VIRTUAL
          </div>
          <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            Guru Smansa <span className="text-pink-500 underline decoration-pink-500/20 underline-offset-4">Ai</span>
          </h2>
          <div className="flex items-center justify-center gap-3 py-1">
            <span className="h-[1px] w-8 bg-gradient-to-r from-transparent to-slate-700"></span>
            <p className="text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase opacity-90">
              Cerdas • Cantik • Berwibawa
            </p>
            <span className="h-[1px] w-8 bg-gradient-to-l from-transparent to-slate-700"></span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); opacity: 0.6; }
          50% { transform: scaleY(1.4); opacity: 1; }
        }
        .animate-wave {
          animation: wave 0.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
          transform-origin: bottom;
        }
      `}</style>
    </div>
  );
};

export default TeacherAvatar;
