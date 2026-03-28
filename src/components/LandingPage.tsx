import React from 'react';
import { motion } from 'framer-motion';
import { Play, Music, Zap, Smartphone, Globe } from 'lucide-react';

interface LandingPageProps {
  onLaunch: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLaunch }) => {
  return (
    <div className="relative min-h-screen bg-[#050505] overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-neon/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-neon rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(171,252,47,0.4)]">
            <Zap size={24} className="text-black fill-black" />
          </div>
          <span className="text-2xl font-black italic tracking-tighter">CADENCE<span className="text-neon">SYNC</span></span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
          <a href="#features" className="hover:text-neon transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-neon transition-colors">How it works</a>
          <a href="#" className="hover:text-neon transition-colors">Premium</a>
        </nav>
        <button 
          onClick={onLaunch}
          className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-full text-[11px] font-black uppercase tracking-widest hover:bg-white/10 hover:border-neon/50 transition-all"
        >
          Launch App
        </button>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-8 pt-20 pb-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-neon/10 border border-neon/20 rounded-full mb-6">
              <span className="w-2 h-2 bg-neon rounded-full animate-ping"></span>
              <span className="text-[10px] font-black text-neon uppercase tracking-widest">Version 2.0 Early Access</span>
            </div>
            <h1 className="text-6xl md:text-8xl font-black leading-[0.9] tracking-tighter mb-8">
              SYNC YOUR <br />
              <span className="text-neon drop-shadow-[0_0_30px_rgba(171,252,47,0.3)]">PERFORMANCE</span> <br />
              TO THE BEAT
            </h1>
            <p className="text-xl text-gray-400 max-w-xl mb-12 leading-relaxed">
              The ultimate AI-powered metronome for athletes. Synchronize your cycling, running, or rowing cadence with YouTube music in real-time.
            </p>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={onLaunch}
                className="px-10 py-5 bg-neon text-black rounded-2xl text-lg font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(171,252,47,0.3)] flex items-center gap-3"
              >
                <Play size={20} fill="black" /> Get Started Now
              </button>
              <button className="px-10 py-5 bg-white/5 border border-white/10 rounded-2xl text-lg font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                Learn More
              </button>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9, rotateY: 20 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="hidden lg:block relative"
          >
            <div className="relative aspect-[4/3] bg-gradient-to-br from-white/10 to-white/5 rounded-3xl border border-white/10 shadow-2xl p-4 backdrop-blur-3xl overflow-hidden group">
              {/* Mockup Placeholder */}
              <div className="absolute inset-0 bg-[#050505] m-2 rounded-2xl border border-white/5 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-neon/50"></div>
                <div className="p-8 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-12">
                     <div className="space-y-4">
                        <div className="w-32 h-2 bg-white/20 rounded"></div>
                        <div className="w-20 h-2 bg-white/10 rounded"></div>
                     </div>
                     <div className="w-12 h-12 bg-neon/20 border border-neon/40 rounded-xl"></div>
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-4">
                    <div className="h-24 bg-white/5 rounded-xl border border-white/5"></div>
                    <div className="h-24 bg-neon/10 rounded-xl border border-neon/20"></div>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent opacity-60"></div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Features Grid */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-8 py-24 border-t border-white/5">
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard 
            icon={<Music className="text-neon" />}
            title="AI Beat Analysis"
            description="Our advanced algorithms detect the BPM and the first beat of any track with 99.8% accuracy."
          />
          <FeatureCard 
            icon={<Globe className="text-blue-400" />}
            title="Any YouTube Source"
            description="Sync directly from YouTube playlists, singles, or shared links without any local storage."
          />
          <FeatureCard 
            icon={<Smartphone className="text-purple-400" />}
            title="Mobile Ready"
            description="Optimized for smartphones with PWA support. Take your cadence on the road or at the gym."
          />
        </div>
      </section>

      <footer className="relative z-10 py-12 text-center text-gray-600 text-[10px] font-black uppercase tracking-widest border-t border-white/5">
        &copy; 2026 CADENCESYNC V2.0 // DEVELOPED FOR THE FUTURE OF FITNESS
        <a href="https://getsongbpm.com" style={{ display: 'none' }}>GetSongBPM</a>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="p-8 bg-white/[0.02] border border-white/5 rounded-3xl hover:border-neon/30 transition-all hover:-translate-y-1">
    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mb-6">
      {icon}
    </div>
    <h3 className="text-xl font-black mb-4 tracking-tight">{title}</h3>
    <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
  </div>
);

export default LandingPage;
