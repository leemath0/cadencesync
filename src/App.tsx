import { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import SyncApp from './components/SyncApp';

function App() {
  const [isAppLaunched, setIsAppLaunched] = useState(false);

  // Resume state from localStorage to provide a seamless experience
  useEffect(() => {
    const launched = localStorage.getItem('cadence-sync-launched');
    if (launched === 'true') {
      setIsAppLaunched(true);
    }
  }, []);

  const handleLaunch = () => {
    setIsAppLaunched(true);
    localStorage.setItem('cadence-sync-launched', 'true');
    // Scroll to top when launching the app
    window.scrollTo(0, 0);
  };

  const handleBack = () => {
    setIsAppLaunched(false);
    localStorage.setItem('cadence-sync-launched', 'false');
    // Scroll to top when going back to landing
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-[#ABFC2F] selection:text-black font-sans">
      {/* Dynamic Routing between Landing and Main Tool */}
      {!isAppLaunched ? (
        <LandingPage onLaunch={handleLaunch} />
      ) : (
        <SyncApp onBack={handleBack} />
      )}
    </div>
  );
}

export default App;
