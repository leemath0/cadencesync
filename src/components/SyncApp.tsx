import React, { useState, useEffect, useRef } from 'react';
import { 
  X as Close, Plus as Add, Minus as Remove 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Track = {
  id: string;
  url: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
  originalBpm?: number;
  firstBeatOffset?: number;
  status: 'idle' | 'analyzing' | 'optimized' | 'error';
  errorMessage?: string;
  harmonicOffset?: number;
  isOriginalSpeed?: boolean;
};

// --- Components ---

/**
 * TapBpm Component using Tailwind
 */
const TapBpm = ({ onBpmChange }: { onBpmChange: (bpm: number) => void }) => {
  const [taps, setTaps] = useState<number[]>([]);
  
  const handleTap = () => {
    const now = Date.now();
    const newTaps = [...taps, now].slice(-10); // Keep last 10 taps
    setTaps(newTaps);
    
    if (newTaps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < newTaps.length; i++) {
        intervals.push(newTaps[i] - newTaps[i-1]);
      }
      const avgInterval = intervals.reduce((a: number, b: number) => a + b) / intervals.length;
      const calculatedBpm = 60000 / avgInterval;
      onBpmChange(Number((Math.round(calculatedBpm * 10) / 10).toFixed(1)));
    }
  };

  const resetTaps = () => setTaps([]);

  return (
    <div className="mt-6 flex flex-col items-center">
      <button 
        onClick={handleTap}
        className="w-full h-16 rounded-2xl bg-neon text-black font-black text-lg active:scale-95 transition-all shadow-[0_0_20px_rgba(171,252,47,0.3)] hover:shadow-[0_0_30px_rgba(171,252,47,0.5)]"
      >
        TAP BEAT {taps.length > 0 && `(${taps.length})`}
      </button>
      <button 
        onClick={resetTaps} 
        className="mt-3 text-[11px] font-bold text-gray-500 hover:text-gray-300 uppercase tracking-widest"
      >
        Reset Taps
      </button>
    </div>
  );
};


const SyncApp = ({ onBack }: { onBack: () => void }) => {
  const [targetBpm, setTargetBpm] = useState(168);
  const [url, setUrl] = useState('');
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [metronomeVolume, setMetronomeVolume] = useState(0.5);
  const [isAddingUrl, setIsAddingUrl] = useState(true);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [globalStatus, setGlobalStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [isHudDismissed, setIsHudDismissed] = useState(false);
  const [isAutoPlayEnabled, setIsAutoPlayEnabled] = useState(() => {
    return localStorage.getItem('isAutoPlayEnabled') === 'true';
  });
  
  // Persist Auto-Play setting
  useEffect(() => {
    localStorage.setItem('isAutoPlayEnabled', String(isAutoPlayEnabled));
  }, [isAutoPlayEnabled]);
  
  // Scrolled state for sticky minimal header
  const [isScrolled, setIsScrolled] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const LOCAL_IP = "192.168.88.12"; // Found via system check
  const [playbackMode, setPlaybackMode] = useState<'target' | 'original' | 'half' | 'double'>('target');
  const [favoriteCadences, setFavoriteCadences] = useState<number[]>(() => {
    const saved = localStorage.getItem('cs-favorite-cadences');
    return saved ? JSON.parse(saved) : [160, 170, 180];
  });

  // --- New OAuth & YouTube States ---
  const [sessionId, setSessionId] = useState<string | null>(() => {
    const saved = localStorage.getItem('cs-session-id');
    return (saved && saved !== 'null') ? saved : null;
  });
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('cs-user');
    return (saved && saved !== 'null') ? JSON.parse(saved) : null;
  });
  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [authCodeProcessed, setAuthCodeProcessed] = useState(false);
  const [isLoadingFull, setIsLoadingFull] = useState(false);
  const [activeTab, setActiveTab] = useState<'session' | 'statistics'>('session');
  
  // YouTube IFrame Player Refs
  const playerRef = useRef<any>(null);
  const playerReady = useRef(false);

  // State for BPM edit modal
  const [openBpmEditModal, setOpenBpmEditModal] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [newBpm, setNewBpm] = useState<number>(0);
  const [lastSyncError, setLastSyncError] = useState<number>(0);
  const [currentMeasure, setCurrentMeasure] = useState<string>('---');

  useEffect(() => {
    // Load YouTube IFrame API
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      (window as any).onYouTubeIframeAPIReady = () => {
        playerRef.current = new (window as any).YT.Player('yt-player', {
          height: '0',
          width: '0',
          playerVars: {
            'autoplay': 0,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'modestbranding': 1,
            'rel': 0,
            'showinfo': 0
          },
          events: {
            'onReady': () => { playerReady.current = true; },
            'onStateChange': (event: any) => {
              // Playing: 1, Paused: 2, Ended: 0
              if (event.data === 1) setIsPlaying(true);
              else if (event.data === 2) setIsPlaying(false);
              else if (event.data === 0) handleEnded();
            }
          }
        });
      };
    }
  }, []);

  useEffect(() => {
    // Persistent Session Check & Initial Fetch
    const savedSession = localStorage.getItem('cs-session-id');
    const savedUser = localStorage.getItem('cs-user');
    
    if (savedSession && savedSession !== 'null' && !sessionId) {
      setSessionId(savedSession);
      if (savedUser) setUser(JSON.parse(savedUser));
    }
    
    if (sessionId) {
      localStorage.setItem('cs-session-id', sessionId);
      fetchPlaylists();
      
      // Auto-load last URL if available
      const lastUrl = localStorage.getItem('cs-last-url');
      if (lastUrl && !url) setUrl(lastUrl);
    }
  }, [sessionId]);

  // Save last URL for persistence
  useEffect(() => {
    if (url && url.includes('youtube.com')) {
      localStorage.setItem('cs-last-url', url);
    }
  }, [url]);

  const fetchPlaylists = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/youtube/playlists`, {
        headers: { 'session-id': sessionId }
      });
      if (res.ok) {
        const data = await res.json();
        setUserPlaylists(data.items || []);
      } else if (res.status === 401) {
        console.warn("Session expired or invalid. Logging out.");
        handleLogout();
      }
    } catch (e) {
      console.error("Failed to fetch playlists", e);
    }
  };

  const loginWithGoogle = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      window.location.href = data.url;
    } catch (e) {
      setToast({ message: "Login failed to initialize", type: 'error' });
    }
  };

  const handleLogout = () => {
    setSessionId(null);
    setUser(null);
    localStorage.removeItem('cs-session-id');
    localStorage.removeItem('cs-user');
    setUserPlaylists([]);
    setToast({ message: "Logged out", type: 'success' });
  };

  const loadPlaylistTracks = (playlistId: string) => {
    const fullUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
    setUrl(fullUrl);
    // Don't auto-process, let user click SYNC & ANALYZE
  };

  useEffect(() => {
    // Check for auth callback in URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    if (error) {
      setToast({ message: "Login aborted: " + error, type: 'error' });
      window.history.replaceState({}, document.title, "/");
      return;
    }

    if (code && !authCodeProcessed) {
      console.log("🚨 Found OAuth code, calling callback...");
      setAuthCodeProcessed(true);
      handleAuthCallback(code, state || undefined);
    }
  }, [authCodeProcessed]);

  const handleAuthCallback = async (code: string, state?: string) => {
    // 1. Immediately clean up URL to avoid double-triggering
    if (window.location.search.includes('code=')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    console.log("Entering handleAuthCallback with code:", code);
    setLoading(true);
    setIsLoadingFull(true);
    setGlobalStatus("AUTHENTICATING YOUR YOUTUBE ACCOUNT...");
    
    try {
      const res = await fetch('/api/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state })
      });
      
      const data = await res.json();
      if (res.ok) {
        console.log("Auth successful, session:", data.session_id);
        setSessionId(data.session_id);
        setUser(data.user_info);
        localStorage.setItem('cs-session-id', data.session_id);
        localStorage.setItem('cs-user', JSON.stringify(data.user_info));
        
        setToast({ message: "Welcome, " + (data.user_info?.name || "User"), type: 'success' });
        
        // Wait for state to settle then fetch
        setTimeout(() => fetchPlaylists(), 100);
      } else {
        throw new Error(data.detail || "Authentication Failed");
      }
    } catch (e: any) {
      console.error("Auth Callback Error:", e);
      setToast({ message: "Authentication failed: " + e.message, type: 'error' });
    } finally {
      setLoading(false);
      setIsLoadingFull(false);
      setGlobalStatus("");
    }
  };

  const syncToYouTube = async () => {
    if (!sessionId || !selectedPlaylistId || !url) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/youtube/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          playlist_id: selectedPlaylistId,
          video_url: url
        })
      });
      if (res.ok) {
        setToast({ message: "Synced to YouTube!", type: 'success' });
        setShowSyncModal(false);
      } else {
        throw new Error("Sync failed");
      }
    } catch (e) {
      setToast({ message: "Failed to sync", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('cs-favorite-cadences', JSON.stringify(favoriteCadences));
  }, [favoriteCadences]);

  const toggleFavoriteCadence = (bpm: number) => {
    setFavoriteCadences(prev => 
      prev.includes(bpm) ? prev.filter(b => b !== bpm) : [...prev, bpm].sort((a, b) => a - b)
    );
  };

  const [toast, setToast] = useState<{message: string, type: 'error' | 'success'} | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  
  const currentTrack = currentTrackIndex >= 0 ? tracks[currentTrackIndex] : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('text') || params.get('url');
    if (sharedUrl && (sharedUrl.includes('youtube.com') || sharedUrl.includes('youtu.be'))) {
      setUrl(sharedUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setIsScrolled(scrollTop > 120);
  };

  const processPlaylist = async () => {
    if (!url) return;
    setLoading(true);
    setTracks([]);
    setCurrentTrackIndex(-1);
    setIsPlaying(false);
    setGlobalStatus('FETCHING PLAYLIST INFO...');
    
    // Helper to extract playlist ID
    const getPlaylistId = (u: string) => {
      const reg = /[?&]list=([^#&?]+)/;
      const match = u.match(reg);
      return match ? match[1] : null;
    };

    const playlistId = getPlaylistId(url);
    const sessionId = localStorage.getItem('cs-session-id');
    
    try {
      let res;
      if (playlistId) {
        // Use Official API for playlists
        res = await fetch(`/api/youtube/playlists/${playlistId}/tracks`, {
          method: 'GET',
          headers: { 
            'Content-Type': 'application/json',
            'session-id': sessionId || ''
          }
        });
      } else {
        // Fallback to yt-dlp for single videos or non-standard URLs
        res = await fetch('/api/playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
      }
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to fetch playlist");
      }
      
      const data = await res.json();
      if (data.title) setPlaylistTitle(data.title);
      setIsAddingUrl(false); 
      
      const initialTracks = data.tracks.map((t: any) => ({
        ...t,
        status: 'idle'
      }));
      setTracks(initialTracks);

      for (let i = 0; i < initialTracks.length; i++) {
        const track = initialTracks[i];
        setTracks(current => current.map(t => t.id === track.id ? { ...t, status: 'analyzing' } : t));
        
        try {
          const detailRes = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              url: track.url,
              title: track.title,
              artist: track.artist
            })
          });
          
          const bpmData = await detailRes.json();
          
          if (!detailRes.ok) {
            const errorNote = bpmData.note?.startsWith('Error:') ? bpmData.note.replace('Error: ', '') : 'Analysis failed';
            throw new Error(errorNote);
          }
          
          setTracks(current => current.map(t => t.id === track.id ? { 
            ...t, 
            status: 'optimized', 
            originalBpm: bpmData.bpm,
            firstBeatOffset: bpmData.firstBeatOffset || 0
          } : t));
        } catch (err: any) {
          setTracks(current => current.map(t => t.id === track.id ? { 
            ...t, 
            status: 'error',
            errorMessage: err.message
          } : t));
        }
      }
      setGlobalStatus('');
    } catch (error: any) {
      alert("Error: " + error.message);
      setGlobalStatus('');
    } finally {
      setLoading(false);
      setUrl('');
    }
  };

  const removeTrack = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const idxToRemove = tracks.findIndex(t => t.id === id);
    if (idxToRemove === -1) return;

    if (currentTrackIndex === idxToRemove) {
      if (isPlaying) playerRef.current?.pauseVideo();
      setCurrentTrackIndex(-1);
      setIsPlaying(false);
    } else if (currentTrackIndex > idxToRemove) {
      setCurrentTrackIndex(prev => prev - 1);
    }
    setTracks(current => current.filter(t => t.id !== id));
  };

  const cleanupFailedTracks = () => {
    const failedOnes = tracks.filter(t => t.status === 'error');
    if (failedOnes.length === 0) return;
    
    setTracks(current => current.filter(t => t.status !== 'error'));
    setToast({ message: `${failedOnes.length} failed tracks removed`, type: 'success' });
    
    // Adjust current index if needed
    if (currentTrackIndex >= 0 && tracks[currentTrackIndex]?.status === 'error') {
      setCurrentTrackIndex(-1);
      setIsPlaying(false);
    }
  };

  const editTrackBpm = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    
    setEditingTrackId(id);
    setNewBpm(track.originalBpm || 120);
    setOpenBpmEditModal(true);
  };

  const handleSaveBpm = () => {
    if (!editingTrackId) return;
    setTracks(current => current.map(t => t.id === editingTrackId ? { 
      ...t, 
      originalBpm: newBpm,
      status: 'optimized' // Force to optimized if it was error but user fixed BPM
    } : t));
    setToast({ message: "BPM Updated!", type: 'success' });
    setOpenBpmEditModal(false);
    setEditingTrackId(null);
  };

  const togglePlayTrack = (track: Track) => {
    if (track.status !== 'optimized') return;
    const idx = tracks.findIndex(t => t.id === track.id);
    
    if (currentTrackIndex === idx) {
      if (isPlaying) {
        playerRef.current?.pauseVideo();
        setIsPlaying(false);
      } else {
        // If metronome is on, request sync-start
        if (metronomeOn) {
          syncStartRequestedRef.current = true;
          setToast({ message: "Waiting for next beat to start...", type: 'success' });
        } else {
          playerRef.current?.playVideo();
          setIsPlaying(true);
        }
      }
      return;
    }
    
    setCurrentTrackIndex(idx);
  };

  // Autoplay handler - Modified to respect the isAutoPlayEnabled toggle
  useEffect(() => {
    if (currentTrackIndex >= 0 && currentTrack && playerRef.current) {
        // --- BUG FIX: Only cue/load if the track actually changed ---
        // Prevents music from stopping when toggling metronome or auto-play settings
        if (lastProcessedTrackIdRef.current === currentTrack.id) {
            return;
        }
        lastProcessedTrackIdRef.current = currentTrack.id;
        // ----------------------------------------------------------

        if (currentTrack.status === 'error') {
            // Skip error track
            const nextIdx = (currentTrackIndex + 1) % tracks.length;
            if (nextIdx !== currentTrackIndex) {
                setCurrentTrackIndex(nextIdx);
            }
            return;
        }

        // Handle change based on Auto-Play setting
        if (isAutoPlayEnabled) {
            // If metronome is on, request sync-start for the new track automatically
            if (metronomeOn) {
                syncStartRequestedRef.current = true;
                playerRef.current.cueVideoById(currentTrack.id);
                setToast({ message: "Auto-Play: Waiting for next beat to start...", type: 'success' });
            } else {
                playerRef.current.loadVideoById(currentTrack.id);
                setIsPlaying(true);
            }
        } else {
            // Manual mode: just cue, don't play
            playerRef.current.cueVideoById(currentTrack.id);
            setIsPlaying(false);
        }

        lastScheduledBeatIndexRef.current = -1;
        lastSteadyTickTimeRef.current = 0;
        nextTickTimeRef.current = 0;
    } else if (!currentTrack) {
        lastProcessedTrackIdRef.current = null;
    }
  }, [currentTrackIndex, isAutoPlayEnabled, metronomeOn, currentTrack]);

  // DJ-style: When user hits Play, we wait for the NEXT beat to actually start the audio
  const handleEnded = () => {
    if (currentTrackIndex < tracks.length - 1) {
      setCurrentTrackIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextTickTimeRef = useRef<number>(0);
  const lastScheduledBeatIndexRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const syncStartRequestedRef = useRef<boolean>(false);
  const upcomingBeatTimeRef = useRef<number>(0);
  const lastProcessedTrackIdRef = useRef<string | null>(null);
  const lastSyncCheckTimeRef = useRef<number>(0);
  const lastSteadyTickTimeRef = useRef<number>(0);

  const playNext = () => {
    if (tracks.length > 0) {
      setCurrentTrackIndex((prev) => (prev + 1) % tracks.length);
    }
  };

  const playPrevious = () => {
    if (tracks.length > 0) {
      setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    }
  };

  // --- Silent Audio Trick ---
  const startSilentAudio = () => {
    if (!silentAudioRef.current) {
      // 1-second silent MP3 base64
      const silentSrc = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
      const audio = new Audio(silentSrc);
      audio.loop = true;
      silentAudioRef.current = audio;
    }
    silentAudioRef.current.play().catch(e => console.log("Silent audio failed", e));
  };

  const stopSilentAudio = () => {
    if (silentAudioRef.current) {
      silentAudioRef.current.pause();
    }
  };

  // --- Wake Lock Logic ---
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('[Sync] Wake Lock is active');
      } catch (err: any) {
        console.error(`[Sync] Wake Lock failed: ${err.name}, ${err.message}`);
      }
    }
  };

  useEffect(() => {
    // Start Background Stability
    requestWakeLock();
    startSilentAudio();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
        startSilentAudio();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopSilentAudio();
    };
  }, []);

  // --- Media Session API ---
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: 'CadenceSync',
        artwork: [
          { src: currentTrack.thumbnail, sizes: '96x96', type: 'image/png' },
          { src: currentTrack.thumbnail, sizes: '128x128', type: 'image/png' },
          { src: currentTrack.thumbnail, sizes: '192x192', type: 'image/png' },
          { src: currentTrack.thumbnail, sizes: '256x256', type: 'image/png' },
          { src: currentTrack.thumbnail, sizes: '384x384', type: 'image/png' },
          { src: currentTrack.thumbnail, sizes: '512x512', type: 'image/png' },
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        console.log('[MediaSession] Play button pressed on lock screen');
        startSilentAudio();
        
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }

        if (playerRef.current) {
          playerRef.current.playVideo();
          setIsPlaying(true);
          navigator.mediaSession.playbackState = 'playing';
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (playerRef.current) {
          playerRef.current.pauseVideo();
          setIsPlaying(false);
        }
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    }
  }, [currentTrack]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  // Unified calculation helper
  const getPlaybackCalc = (tgt: number, orig: number, mode: string) => {
    if (mode === 'original' || !orig) return { displayBpm: orig || tgt, rate: 1.0, base: orig || tgt };

    // Find the harmonic multiple of orig that is closest to tgt
    // We want a rate between 0.5 and 2.0 whenever possible
    let displayBpm = orig;
    
    // If target is much faster, check if we should double the perceived BPM
    if (tgt / orig > 2.0) {
        // e.g. target 180, orig 80. 180/80 = 2.25.
        // If we double orig to 160, rate is 1.125. Much better.
        displayBpm = orig * 2;
    } else if (tgt / orig < 0.6) {
        // e.g. target 80, orig 175. 80/175 = 0.45.
        // If we halve orig to 87.5, rate is 0.91.
        displayBpm = orig / 2;
    }

    const baseRate = tgt / displayBpm;
    
    let finalRate = baseRate;
    let finalBase = tgt;
    
    if (mode === 'half') {
      finalRate = baseRate * 0.5;
      finalBase = tgt * 0.5;
    } else if (mode === 'double') {
      finalRate = baseRate * 2.0;
      finalBase = tgt * 2.0;
    }

    return { displayBpm, rate: finalRate, base: finalBase };
  };

  // Metronome Engine
  useEffect(() => {
    if (!metronomeOn) {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().then(() => { audioCtxRef.current = null; });
      }
      return;
    }

    // Ensure AudioContext is created on interaction
    const initCtx = () => {
      if (!audioCtxRef.current) {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext) as typeof window.AudioContext;
        audioCtxRef.current = new AudioContextClass();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    };
    
    // Add interaction listener only once
    const handleInteraction = () => {
        initCtx();
        window.removeEventListener('click', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);

    const playClick = (time: number, volume: number = 0.5) => {
      if (!audioCtxRef.current || audioCtxRef.current.state !== 'running') return;
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const envelope = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2000, time);
      envelope.gain.setValueAtTime(volume * 0.4, time);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.02);
      osc.connect(envelope);
      envelope.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.02);
    };

    let timer: any;

    const tick = () => {
      if (!audioCtxRef.current) return;
      
      const ctx = audioCtxRef.current;
      const ctxTime = ctx.currentTime;
      const player = playerRef.current;
      const beatDuration = 60.0 / targetBpm;

      // --- 1. WEB AUDIO SCHEDULER (Metronome Beats) ---
      // Increased scheduleAhead to 2.0s for better background stability
      const scheduleAhead = 2.0; 
      while (nextTickTimeRef.current < ctxTime + scheduleAhead) {
          // If initializing or lagging, reset baseline
          if (nextTickTimeRef.current < ctxTime - 1.0) {
              nextTickTimeRef.current = ctxTime + 0.05;
          }

          if (metronomeOn) {
              playClick(nextTickTimeRef.current, metronomeVolume);
          }
          
          upcomingBeatTimeRef.current = nextTickTimeRef.current;
          lastScheduledBeatIndexRef.current++;
          nextTickTimeRef.current += beatDuration;
      }

      // --- 2. ACTIVE SYNC & DRIFT CORRECTION ---
      const isActuallySynced = isPlaying && player && currentTrack && currentTrack.status === 'optimized' && currentTrack.firstBeatOffset !== undefined;
      
      if (isActuallySynced && player.getCurrentTime) {
          const songTime = player.getCurrentTime();
          const origBpm = currentTrack.originalBpm || targetBpm;
          const firstBeatOffset = currentTrack.firstBeatOffset || 0;
          
          const songElapsed = songTime - firstBeatOffset;
          const songBeatDuration = 60.0 / origBpm;
          const songBeatPos = songElapsed / songBeatDuration;
          const nearestBeat = Math.round(songBeatPos);
          const errorInSeconds = songElapsed - (nearestBeat * songBeatDuration);
          const errorMs = errorInSeconds * 1000;
          
          setLastSyncError(Math.round(errorMs));

          const now = Date.now();
          if (now - lastSyncCheckTimeRef.current > 5000) {
              if (Math.abs(errorMs) > 300) {
                  const correctedSongTime = nearestBeat * songBeatDuration + firstBeatOffset;
                  player.seekTo(correctedSongTime, true);
                  console.log(`[Sync] Drift correction: ${errorMs.toFixed(0)}ms. Seeking to ${correctedSongTime.toFixed(2)}s`);
              }
              lastSyncCheckTimeRef.current = now;
          }

          const measure = Math.floor(songBeatPos / 4) + 1;
          const beatInMeasure = Math.floor(Math.abs(songBeatPos) % 4) + 1;
          if (songBeatPos < 0) {
            setCurrentMeasure(`INTRO (${Math.abs(songBeatPos).toFixed(1)}b)`);
          } else {
            setCurrentMeasure(`${measure}M-${beatInMeasure}`);
          }
      } else if (isPlaying && player && player.getPlaybackRate) {
          setCurrentMeasure('---');
      }

      if (syncStartRequestedRef.current && player) {
          if (ctxTime >= upcomingBeatTimeRef.current - 0.05) {
              player.playVideo();
              setIsPlaying(true);
              syncStartRequestedRef.current = false;
          }
      }
    };
    
    // Interval based loop (50ms) for better background reliability than requestAnimationFrame
    timer = setInterval(tick, 50) as any;

    return () => {
      clearInterval(timer);
      window.removeEventListener('click', handleInteraction);
    };
  }, [isPlaying, targetBpm, metronomeOn, currentTrackIndex, metronomeVolume, playbackMode]);

  useEffect(() => {
    if (playerRef.current && currentTrack && currentTrack.originalBpm) {
      const { rate } = getPlaybackCalc(targetBpm, currentTrack.originalBpm, playbackMode);
      playerRef.current.setPlaybackRate(Math.max(0.25, Math.min(rate, 2.0)));
    }
  }, [targetBpm, currentTrack, playbackMode]);

  const calculateSpeedup = (orig: number, target: number, harmonicOffset: number = 0) => {
    let internalTarget = target;
    // Auto-harmonic Step 1
    while (internalTarget > orig * 2.0) internalTarget /= 2;
    while (internalTarget < orig * 0.5) internalTarget *= 2;
    
    // Manual-harmonic Step 2
    if (harmonicOffset) internalTarget *= Math.pow(2, harmonicOffset);
    
    const diff = internalTarget - orig;
    const pct = Math.round((diff / orig) * 100);
    if (pct === 0) return { text: "PERFECT", color: "text-gray-400 font-bold" };
    if (pct > 0) return { text: `+${pct}%`, color: "text-neon font-bold drop-shadow-[0_0_8px_rgba(171,252,47,0.3)]" };
    return { text: `${pct}%`, color: "text-red-400 font-bold" };
  };



  return (
    <div className="flex flex-col h-screen bg-[#050505] text-white font-sans overflow-x-hidden select-none">
      {/* Global Full-Screen Loader for Authentication */}
      {isLoadingFull && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center">
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 border-4 border-neon/10 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-neon rounded-full animate-rotate shadow-[0_0_15px_rgba(171,252,47,0.3)]"></div>
            <div className="absolute inset-4 border-2 border-white/5 rounded-full animate-reverse-rotate"></div>
          </div>
          <h2 className="text-xl font-black tracking-widest text-white mb-2 animate-pulse">CADENCE SYNCING</h2>
          <p className="text-neon/70 text-[10px] font-black uppercase tracking-[0.3em]">{globalStatus}</p>
        </div>
      )}

      {/* YT Player (Hidden but active for sync logic) */}
      <div className="fixed -z-50 opacity-0 pointer-events-none">
        <div id="yt-player"></div>
      </div>

      {/* Global Toast Notification */}
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[110] px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-neon/10 border-neon/20 text-neon'}`}>
          {toast.type === 'error' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
          )}
          <span className="text-[14px] font-bold tracking-tight">{toast.message}</span>
        </div>
      )}
      {isPlaying && currentTrack && !isHudDismissed && (
        <motion.div 
          drag
          dragMomentum={false}
          whileDrag={{ scale: 1.02, cursor: 'grabbing' }}
          style={{
            position: 'fixed',
            top: '210px',
            right: '24px', 
            padding: '16px',
            background: 'rgba(5,5,5,0.9)',
            border: '1px solid #ABFC2F',
            borderRadius: '16px',
            color: '#ABFC2F',
            fontFamily: 'monospace',
            zIndex: 1000,
            boxShadow: '0 0 20px rgba(171,252,47,0.3)',
            fontSize: '11px',
            width: '200px',
            backdropFilter: 'blur(10px)',
            cursor: 'grab'
          }} className="animate-in fade-in slide-in-from-right-4 duration-500 group">
          <button 
            onClick={() => setIsHudDismissed(true)}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 text-[#ABFC2F]/50 hover:text-[#ABFC2F] transition-colors z-10"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          
          <div className="font-black border-b border-[#ABFC2F]/20 pb-2 mb-3 text-[10px] uppercase tracking-tighter">Sync Engine v2.0</div>
          
          <div className="space-y-1.5 opacity-90">
            <div className="flex justify-between"><span>Wall Clock</span> <span>{(playerRef.current?.getCurrentTime?.() || 0).toFixed(2)}s</span></div>
            <div className="flex justify-between"><span>Detected BPM</span> <span>{(currentTrack?.originalBpm != null) ? Number(currentTrack.originalBpm).toFixed(1) : '---'}</span></div>
            <div className="flex justify-between"><span>Beat Offset</span> <span>{(currentTrack?.firstBeatOffset != null) ? Number(currentTrack.firstBeatOffset).toFixed(3) : '---'}s</span></div>
            <div className="flex justify-between text-[#88ff88] font-bold"><span>1M-2M Count</span> <span className="tabular-nums">{currentMeasure}</span></div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#ABFC2F]/10">
            <div className="flex justify-between font-black text-[13px]" style={{ color: Math.abs(lastSyncError) < 40 ? '#ABFC2F' : '#ff4444' }}>
              <span>SYNC ERROR</span>
              <span>{lastSyncError > 0 ? '+' : ''}{lastSyncError}ms</span>
            </div>
            
            <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
               <div 
                 className="h-full transition-all duration-300" 
                 style={{ 
                   width: `${Math.max(5, 100 - Math.abs(lastSyncError) / 2)}%`,
                   backgroundColor: Math.abs(lastSyncError) < 40 ? '#ABFC2F' : (Math.abs(lastSyncError) < 100 ? '#ffcc00' : '#ff4444')
                 }}
               />
            </div>
            <div className="text-[9px] text-gray-500 mt-2 text-center">
              {Math.abs(lastSyncError) < 40 ? "PERFECTLY LOCKED" : "ALIGNING..."}
            </div>
          </div>
        </motion.div>
      )}

      {/* Top Navbar */}
      <header className="h-[64px] border-b border-white/[0.04] bg-[#080808]/90 backdrop-blur-xl flex items-center px-6 flex-shrink-0 z-50 sticky top-0">
        <div className="flex items-center gap-2 md:gap-3">
          <button 
            onClick={onBack}
            className="p-1.5 md:p-2 -ml-1 md:-ml-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white transition-colors mr-0.5 md:mr-1"
            title="Back to Landing Page"
          >
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <svg className="w-5 h-5 md:w-7 md:h-7 text-neon drop-shadow-[0_0_10px_rgba(171,252,47,0.4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span className="text-sm md:text-xl font-black tracking-widest text-white mt-0.5 whitespace-nowrap">CADENCE<span className="text-neon">SYNC</span></span>
        </div>
        
        <div className="ml-auto flex items-center gap-2 md:gap-4 font-bold">
          <div className="hidden sm:flex items-center bg-white/[0.03] rounded-2xl p-1.5 border border-white/[0.05]">
            <div className="px-3 py-1 flex items-center gap-3">
              <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider">Auto-Play</span>
              <button 
                onClick={() => setIsAutoPlayEnabled(!isAutoPlayEnabled)}
                className={`w-10 h-5 rounded-full relative transition-all duration-300 ${isAutoPlayEnabled ? 'bg-neon' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${isAutoPlayEnabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>

          {sessionId ? (
            <div className="flex items-center gap-2 md:gap-3 bg-white/5 pl-2 md:pl-3 pr-1 py-1 rounded-full border border-white/10 overflow-hidden">
              <div className="flex flex-col items-end">
                <span className="text-[8px] md:text-[10px] uppercase font-black text-neon tracking-wider">ON</span>
                {user?.name && <span className="text-[9px] md:text-[11px] font-bold text-gray-400 truncate max-w-[50px] md:max-w-[80px]">{user.name}</span>}
              </div>
              <button 
                onClick={handleLogout}
                className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                title="Logout"
              >
                <svg className="w-3 h-3 md:w-4 md:h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          ) : (
            <button 
              onClick={loginWithGoogle}
              className="px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-white/10 hover:bg-white/5 text-[11px] md:text-[12px] font-black transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.27.81-.57z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Login
            </button>
          )}
          <button 
            onClick={() => setShowQr(!showQr)}
            className={`p-1.5 md:p-2 rounded-full transition-all duration-300 ${showQr ? 'bg-neon text-black' : 'text-gray-400 hover:text-white'}`}
            title="Scan QR to open on phone"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h2M18 14h3M14 18h3M18 18h3M14 21h7M21 14v7" />
            </svg>
          </button>
        </div>
      </header>

      {/* QR Code Modal Overlay */}
      {showQr && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300"
          onClick={() => setShowQr(false)}
        >
          <div 
            className="bg-[#0f0f0f] border border-white/10 rounded-[32px] p-8 max-w-sm w-full flex flex-col items-center shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-neon font-black tracking-widest uppercase text-[12px] mb-6 z-10 pt-2">SCAN THIS ON YOUR PHONE</h3>
            
            {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl mb-6 text-center">
                <p className="text-amber-400 text-[11px] font-bold uppercase tracking-tight">⚠️ IP Connection Required</p>
                <p className="text-gray-400 text-[10px] mt-1 px-2">Access this site via your Network IP (e.g. 192.168.x.x) for the phone scan to work!</p>
              </div>
            )}

            <div className="bg-white p-4 rounded-3xl mb-8 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                    ? window.location.href.replace(window.location.hostname, LOCAL_IP)
                    : window.location.href
                )}&bgcolor=ffffff&color=000000`} 
                alt="QR Code" 
                className="w-[200px] h-[200px]"
              />
            </div>
            
            <p className="text-gray-400 text-center text-[13px] leading-relaxed mb-6 font-medium">
              Open this app on your phone to use it as a standalone workout controller! 🏃💨
            </p>
            
            <button 
              onClick={() => setShowQr(false)}
              className="w-full bg-[#181818] border border-white/10 hover:bg-[#222] text-white py-4 rounded-2xl font-bold transition-all active:scale-[0.98]"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Mobile Sticky Compact Header */}
      <div 
        className={`md:hidden fixed top-[64px] left-0 w-full z-40 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] transform ${isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}
      >
        <div className="bg-[#0a0a0a]/80 backdrop-blur-2xl border-b border-white/10 p-4 flex items-center shadow-2xl">
           <div className="flex flex-col flex-1">
             <span className="text-[10px] uppercase font-black text-neon tracking-[0.2em] leading-tight mb-0.5">Cadence</span>
             <span className="text-[14px] font-bold text-gray-300 truncate pr-2 leading-tight">{playlistTitle || "Target Playlist"}</span>
           </div>
           
           <div className="flex items-center gap-1.5 bg-[#141414] rounded-full px-1.5 py-1 border border-white/5 shadow-inner">
              <button onClick={() => setTargetBpm(t => Math.max(80, t - 1))} className="w-10 h-10 rounded-full hover:bg-neon hover:text-black flex items-center justify-center font-bold text-gray-400 transition-colors active:scale-90">
                 <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
              </button>
              <span className="text-[22px] font-black text-white w-12 text-center tabular-nums">{targetBpm}</span>
              <button onClick={() => setTargetBpm(t => Math.min(250, t + 1))} className="w-10 h-10 rounded-full hover:bg-neon hover:text-black flex items-center justify-center font-bold text-gray-400 transition-colors active:scale-90">
                 <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              </button>
           </div>
        </div>
      </div>

      {/* Main App Area: Flows naturally, scrollable globally so left panel naturally scrolls up and vanishes */}
      <main 
         className="flex-1 overflow-y-auto overflow-x-hidden md:flex md:flex-row relative scroll-smooth"
         onScroll={handleScroll}
      >
        
        {/* Left Control Panel */}
        <aside className="w-full md:w-[450px] flex-shrink-0 bg-[#080808] md:bg-[#0c0c0c] md:border-r border-white/5 flex flex-col p-6 md:p-8 relative z-10 md:h-full md:overflow-y-auto">
          
          <div className="mb-6 md:mb-8 mt-2">
             <h1 className="text-2xl md:text-3xl font-black text-white leading-tight mb-3">SYNC YOUR RUN</h1>
             <p className="text-gray-400 text-sm md:text-[15px] leading-relaxed font-medium">
               Paste any YouTube playlist. We analyze the drum beats and auto-shift track speeds to match your SPM exactly.
             </p>
          </div>

          {/* Prominent Login Card for Mobile/Unauthenticated Users */}
          {!sessionId && (
            <div className="mb-8 p-6 rounded-[28px] bg-gradient-to-br from-neon/20 to-neon/5 border border-neon/30 flex flex-col items-center gap-4 animate-in slide-in-from-top-4 duration-500">
               <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-1">
                 <svg className="w-6 h-6 text-neon" viewBox="0 0 24 24">
                   <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                 </svg>
               </div>
               <div className="text-center">
                 <h2 className="text-white font-black text-[13px] uppercase tracking-widest mb-1">Unlock YouTube Library</h2>
                 <p className="text-gray-400 text-[11px] leading-snug">Connect your account to sync playlists directly and save your progress.</p>
               </div>
               <button 
                 onClick={loginWithGoogle}
                 className="w-full py-4 bg-neon text-black rounded-2xl font-black text-[14px] shadow-[0_0_20px_rgba(171,252,47,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
               >
                 LOGIN WITH GOOGLE
               </button>
            </div>
          )}

          <div className="bg-gradient-to-br from-[#121212] to-[#0a0a0a] border border-white/10 rounded-[28px] p-8 mb-8 flex flex-col items-center shadow-2xl relative overflow-hidden">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 bg-neon opacity-[0.03] blur-[50px] rounded-full pointer-events-none"></div>

             <h3 className="text-[11px] font-black uppercase tracking-[0.25em] text-neon mb-6 z-10 pt-2">TARGET CADENCE</h3>
             
              <div className="flex flex-col items-center justify-between w-full z-10 px-0">
                <div className="flex items-center justify-between w-full mb-6">
                  <button 
                    onClick={() => setTargetBpm(t => Math.max(40, t - 1))} 
                    className="w-16 h-16 rounded-full bg-[#181818] border border-white/10 hover:bg-neon hover:text-black hover:border-neon flex items-center justify-center transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.3)] active:scale-90 hover:scale-110"
                  >
                    <svg className="w-6 h-6 fill-current text-white/70 hover:text-black transition-colors" viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
                  </button>
                  
                  <div className="flex flex-col items-center justify-center min-w-[130px] active:scale-[0.98] transition-transform">
                    <div className="flex items-center gap-2">
                        <button 
                          onClick={() => toggleFavoriteCadence(targetBpm)}
                          className={`transition-all ${favoriteCadences.includes(targetBpm) ? 'text-neon drop-shadow-[0_0_8px_rgba(171,252,47,0.5)]' : 'text-gray-600 hover:text-white'}`}
                          title="Add to favorites"
                        >
                          <svg className="w-8 h-8" fill={favoriteCadences.includes(targetBpm) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                        </button>
                        <span className="text-7xl md:text-[5.5rem] leading-none font-black text-white tracking-tighter tabular-nums drop-shadow-2xl">{targetBpm}</span>
                    </div>
                    <span className="text-[11px] md:text-[13px] font-bold text-gray-500 tracking-[0.1em] mt-2 md:mt-3">SPM (BPM)</span>
                  </div>
                  
                  <button 
                    onClick={() => setTargetBpm(t => Math.min(250, t + 1))} 
                    className="w-16 h-16 rounded-full bg-[#181818] border border-white/10 hover:bg-neon hover:text-black hover:border-neon flex items-center justify-center transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.3)] active:scale-90 hover:scale-110"
                  >
                    <svg className="w-6 h-6 fill-current text-white/70 hover:text-black transition-colors" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                  </button>
                </div>
                
                <div className="w-full px-4 mb-4">
                  <input 
                    type="range"
                    min="40"
                    max="200"
                    step="1"
                    value={targetBpm}
                    onChange={(e) => setTargetBpm(Number(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-neon hover:accent-neon/80 transition-all"
                  />
                  <div className="flex justify-between mt-2 px-1">
                    <span className="text-[9px] font-black text-gray-600">40</span>
                    <span className="text-[9px] font-black text-gray-600">120</span>
                    <span className="text-[9px] font-black text-gray-600">200</span>
                  </div>
                </div>
              </div>
             
             {/* Metronome Toggle - Always Visible */}
             <div className="flex flex-col items-center gap-4 w-full mt-6 mb-4 px-2">
                <button 
                  onClick={() => setMetronomeOn(!metronomeOn)} 
                  className={`w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl transition-all duration-300 border font-black tracking-widest text-[13px] ${metronomeOn ? 'text-neon bg-neon/10 border-neon/30 shadow-[0_0_25px_rgba(171,252,47,0.15)]' : 'text-gray-500 bg-white/5 border-white/5 hover:bg-white/10'}`}
                >
                  <div className={`w-2 h-2 rounded-full ${metronomeOn ? 'bg-neon animate-pulse shadow-[0_0_8px_rgba(171,252,47,1)]' : 'bg-gray-600'}`}></div>
                  METRONOME {metronomeOn ? 'ON' : 'OFF'}
                </button>
                
                {metronomeOn && (
                  <div className="flex items-center gap-3 w-full px-2 animate-in fade-in slide-in-from-top-2 duration-400">
                    <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                    <input 
                      type="range" 
                      min="0" max="1" step="0.05"
                      value={metronomeVolume}
                      onChange={(e) => setMetronomeVolume(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-neon"
                    />
                  </div>
                )}
             </div>

             {/* Global Playback Mode Toggle */}
              <div className="flex items-center gap-1 bg-[#181818] p-1 rounded-2xl mt-4 border border-white/5 w-full">
                <div className="grid grid-cols-4 gap-1 w-full">
                    {[
                      { id: 'original', label: 'ORIG', bpm: 'N/A' },
                      { id: 'target', label: 'TARGET', bpm: targetBpm },
                      { id: 'half', label: 'x1/2', bpm: targetBpm / 2 },
                      { id: 'double', label: 'x2', bpm: targetBpm * 2 }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setPlaybackMode(mode.id as any)}
                        className={`group flex flex-col items-center justify-center p-2 rounded-xl text-[9px] font-black transition-all ${playbackMode === mode.id ? 'bg-neon text-black shadow-lg' : 'bg-white/5 text-gray-500 hover:text-white border border-white/5 hover:border-white/20'}`}
                      >
                        <span className="leading-none mb-0.5">{mode.label}</span>
                        <span className={`text-[8px] opacity-70 ${playbackMode === mode.id ? 'text-black/80' : 'text-gray-600'}`}>
                          {mode.bpm}
                        </span>
                      </button>
                    ))}
                  </div>
              </div>
          </div>

          <div className="flex flex-col gap-4 mt-auto mb-6 md:mb-0">
              {tracks.length === 0 || isAddingUrl ? (
                <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-[#0f0f0f] border border-white/[0.05] p-5 rounded-3xl shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-neon/20 to-transparent"></div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-1 mb-3 block px-1">Source URL</label>
                    <div className="relative group mb-4">
                      <input 
                        type="text" 
                        placeholder="youtube.com/playlist"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={loading}
                        className="w-full bg-[#050505] border border-white/10 focus:border-neon/50 focus:bg-[#000] focus:ring-1 focus:ring-neon/30 transition-all rounded-xl p-4 text-white placeholder-gray-700 text-[15px] outline-none shadow-inner"
                      />
                    </div>

                    {sessionId && userPlaylists.length > 0 && (
                      <div className="flex flex-col gap-3 mb-4">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">Your Library</label>
                        <div className="grid grid-cols-3 gap-2 max-h-[160px] overflow-y-auto pr-1 cs-scrollbar">
                          {userPlaylists.map((pl: any) => (
                            <button
                              key={pl.id}
                              onClick={() => {
                                setSelectedPlaylistId(pl.id);
                                loadPlaylistTracks(pl.id);
                              }}
                              className={`group relative aspect-square rounded-xl overflow-hidden border transition-all ${selectedPlaylistId === pl.id ? 'border-neon ring-1 ring-neon' : 'border-white/5 hover:border-white/20'}`}
                            >
                              <img 
                                src={pl.snippet.thumbnails.default?.url} 
                                alt={pl.snippet.title}
                                className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500 opacity-60" 
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-2">
                                <span className="text-[8px] font-bold text-white line-clamp-1">{pl.snippet.title}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {tracks.length > 0 && (
                        <button 
                          onClick={() => setIsAddingUrl(false)} 
                          className="bg-white/5 text-gray-400 px-4 rounded-xl font-bold hover:bg-white/10 transition-colors text-[13px]"
                        >
                          Cancel
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          if (url) {
                            processPlaylist();
                          } else if (selectedPlaylistId) {
                            const fullUrl = `https://www.youtube.com/playlist?list=${selectedPlaylistId}`;
                            setUrl(fullUrl);
                            setTimeout(() => processPlaylist(), 100);
                          } else {
                            alert('Input a YouTube Playlist URL or select from Library.');
                          }
                        }}
                        disabled={loading}
                        className="flex-1 bg-neon hover:bg-[#85e219] hover:shadow-[0_0_20px_rgba(171,252,47,0.4)] disabled:bg-[#1f1f1f] disabled:text-gray-600 text-black py-4 rounded-xl font-black text-[13px] tracking-widest flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98]"
                      >
                        {loading ? (
                          <>
                            <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                            SYNCING
                          </>
                        ) : 'SYNC MUSIC'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col gap-3">
                  <button 
                    onClick={() => setIsAddingUrl(true)}
                    className="w-full bg-[#161616] border border-white/5 hover:bg-[#1a1a1a] hover:border-white/10 text-white rounded-2xl py-4 flex items-center justify-center gap-3 transition-all duration-300 group"
                  >
                    <svg className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                    <span className="font-bold text-[14px] tracking-wide text-gray-300 group-hover:text-white transition-colors">Load New Playlist</span>
                  </button>
                  
                  {sessionId && (
                    <button 
                      onClick={() => setShowSyncModal(true)}
                      className="w-full bg-red-600/10 border border-red-600/20 hover:bg-red-600/20 text-red-500 rounded-2xl py-4 flex items-center justify-center gap-3 transition-all duration-300 group"
                    >
                      <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 4-8 4z"/>
                      </svg>
                      <span className="font-bold text-[14px] tracking-wide">Sync to YouTube</span>
                    </button>
                  )}
                </div>
              )}

              {globalStatus && (
                <div className="mt-4 text-center pb-2">
                  <span className="text-[10px] uppercase font-black tracking-widest text-neon bg-neon/10 px-4 py-2 rounded-full inline-flex border border-neon/20 shadow-[0_0_15px_rgba(171,252,47,0.1)]">
                    {globalStatus}
                  </span>
                </div>
              )}
          </div>
        </aside>

        {/* Right Content Panel: Playlist View */}
        <section className="flex-1 relative pb-32 md:pb-36 bg-[#050505] md:h-full md:overflow-y-auto">
           {/* Subtle background glow top right */}
           <div className="hidden md:block absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-radial from-neon/5 to-transparent blur-[100px] pointer-events-none opacity-50"></div>
           
           <div className="relative z-10 px-4 py-6 md:p-10 h-full flex flex-col">
              {tracks.length === 0 ? (
                 <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 mt-16 md:mt-0">
                    <svg className="w-20 h-20 text-white mb-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18V5l12-2v13"></path>
                      <circle cx="6" cy="18" r="3"></circle>
                      <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                    <h2 className="text-xl font-black tracking-widest text-white mb-3">READY TO SYNC</h2>
                    <p className="text-gray-400 text-[14px] max-w-[280px] leading-relaxed">System awaiting playlist data. Flow will appear here.</p>
                 </div>
              ) : (
                 <>
                    <div className="mb-8 md:mb-10 px-2 mt-2">
                        <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-2 pr-4 leading-tight">
                        {playlistTitle || "Target Playlist"}
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="bg-white/10 text-white text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">{tracks.length} Tracks</span>
                            <span className="text-neon text-[12px] font-medium tracking-wide">Optimized</span>
                            {tracks.some(t => t.status === 'error') && (
                              <button 
                                onClick={cleanupFailedTracks}
                                className="ml-2 text-[10px] font-black text-red-500/80 hover:text-red-500 px-2.5 py-1 rounded bg-red-500/10 border border-red-500/20 transition-all uppercase tracking-widest"
                              >
                                Cleanup Failed
                              </button>
                            )}
                        </div>
                    </div>

                    <div className="hidden md:flex px-6 pb-4 border-b border-white/[0.08] text-[11px] font-black text-gray-500 uppercase tracking-widest sticky top-0 bg-[#050505]/95 backdrop-blur z-20">
                       <div className="w-12 text-center">#</div>
                       <div className="flex-1 min-w-0">Track Info</div>
                       <div className="w-24 text-right">Cadence Fit</div>
                    </div>

                    <div className="mt-4 flex flex-col space-y-2 md:space-y-1">
                       {tracks.map((track, i) => {
                          const active = currentTrackIndex === i;
                          const speedStat = track.originalBpm ? calculateSpeedup(track.originalBpm, targetBpm) : null;
                          
                          return (
                             <div 
                                key={`${track.id}-${i}`} 
                                onClick={() => togglePlayTrack(track)}
                                className={`group flex items-center px-3 md:px-6 py-3 md:py-3.5 rounded-2xl hover:bg-white/[0.03] transition-all duration-300 cursor-pointer border border-transparent ${active ? 'bg-white/[0.06] hover:bg-white/[0.08] border-white/5 shadow-lg' : ''}`}
                             >
                                <div className="w-8 md:w-12 flex justify-center items-center flex-shrink-0 text-[14px] font-medium text-gray-500">
                                   <div className="group-hover:hidden flex items-center justify-center">
                                      {track.status === 'analyzing' ? (
                                         <div className="w-4 h-4 border-[2px] border-gray-600 border-t-neon rounded-full animate-spin"></div>
                                      ) : track.status === 'error' ? (
                                         <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></div>
                                      ) : active && isPlaying ? (
                                         <div className="flex items-end justify-center gap-[2px] h-[16px]">
                                            <div className="w-1 rounded-t-sm bg-neon h-full animate-pulse"></div>
                                            <div className="w-1 rounded-t-sm bg-neon h-[60%] animate-pulse" style={{animationDelay:'150ms'}}></div>
                                            <div className="w-1 rounded-t-sm bg-neon h-[80%] animate-pulse" style={{animationDelay:'300ms'}}></div>
                                         </div>
                                      ) : (
                                         <span className={active ? 'text-neon font-bold' : ''}>{i + 1}</span>
                                      )}
                                   </div>
                                   <div className="hidden group-hover:flex items-center justify-center">
                                      {track.status === 'analyzing' ? (
                                          <div className="w-4 h-4 border-[2px] border-gray-600 border-t-neon rounded-full animate-spin"></div>
                                      ) : (
                                        <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center pt-0.5 pl-0.5 hover:bg-white/20 hover:scale-110 transition-all text-white">
                                           <svg className={`w-4 h-4 ${active ? 'text-neon' : ''}`} fill="currentColor" viewBox="0 0 24 24">
                                              {active && isPlaying ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/> : <path d="M8 5v14l11-7z"/>}
                                           </svg>
                                        </button>
                                      )}
                                   </div>
                                </div>
                                
                                <div className="w-14 h-14 md:w-12 md:h-12 rounded-xl overflow-hidden flex-shrink-0 mr-4 bg-[#111] border border-white/5 relative group-hover:shadow-[0_4px_15px_rgba(0,0,0,0.5)] transition-shadow">
                                   {track.thumbnail ? (
                                     <img src={track.thumbnail} className={`w-full h-full object-cover transition-transform duration-700 ${active ? 'scale-105' : 'group-hover:scale-110'}`} alt="" />
                                   ) : (
                                     <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                                       <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 18V5l12-2v13 M6 18a3 3 0 100-6 3 3 0 000 6z M18 16a3 3 0 100-6 3 3 0 000 6z"/></svg>
                                     </div>
                                   )}
                                   {active && !isPlaying && (
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
                                         <svg className="w-5 h-5 text-white pl-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                      </div>
                                   )}
                                </div>
                                
                                <div className="flex-1 min-w-0 pr-1 md:pr-0">
                                  <h4 className="font-black text-[13px] md:text-[15px] text-white leading-tight mb-1 truncate group-hover:text-neon transition-colors">
                                    {track.title}
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] md:text-[12px] text-gray-500 font-bold truncate max-w-[120px] md:max-w-none">{track.artist}</p>
                                    <span className="w-1 h-1 rounded-full bg-white/10 hidden md:block" />
                                    <span className="text-[10px] text-gray-600 font-black hidden md:block">320kbps</span>
                                  </div>
                                </div>
                                
                                <div className="w-20 md:w-32 text-right flex flex-col items-end gap-1">
                                    {track.status === 'optimized' && speedStat && (
                                       <>
                                          <div className="flex items-center gap-2">
                                             <span className={`text-[12px] md:text-[14px] font-black tracking-wider ${speedStat.color}`}>
                                                {speedStat.text}
                                             </span>
                                             <button 
                                                onClick={(e) => editTrackBpm(track.id, e)}
                                                className="px-2 py-1 rounded-md bg-white/5 hover:bg-neon hover:text-black flex items-center gap-1.5 transition-all group/edit border border-white/5 hover:border-neon shadow-lg active:scale-95"
                                                title="Edit BPM"
                                             >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                <span className="text-[10px] font-black uppercase tracking-tight">Edit</span>
                                             </button>
                                          </div>
                                          <span className="text-[10px] md:text-[11px] font-bold text-gray-500 tracking-tighter uppercase whitespace-nowrap">
                                             Orig: {Math.round(track.originalBpm || 0)} BPM
                                          </span>
                                       </>
                                    )}
                                    {track.status === 'error' && (
                                       <button 
                                          onClick={(e) => removeTrack(track.id, e)}
                                          className="text-gray-600 hover:text-red-400 transition-colors"
                                          title="Remove from queue"
                                       >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                       </button>
                                    )}
                                    {track.status === 'analyzing' && (
                                      <span className="text-[10px] text-gray-600 font-black animate-pulse uppercase">Syncing...</span>
                                   )}
                                 </div>

                                <div className="w-8 flex flex-shrink-0 justify-end md:justify-center items-center opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={(e) => removeTrack(track.id, e)} className="text-[#444] hover:text-[#ef4444] transition-all p-1.5 rounded-full hover:bg-red-500/10 active:scale-90" title="Remove track">
                                    <svg className="w-[18px] h-[18px] md:w-[18px] md:h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                             </div>
                          )
                       })}
                    </div>
                 </>
              )}
           </div>
        </section>

      </main>

      {/* Modern Player Footer */}
      <footer className="h-[96px] md:h-[90px] bg-[#080808]/95 backdrop-blur-3xl border-t border-white/5 flex-shrink-0 flex items-center px-4 md:px-8 relative z-50">
        {currentTrack ? (
           <>
              <div className="flex items-center gap-3 md:gap-4 w-[45%] md:w-1/3 min-w-0 pr-2">
                 <div className="w-12 h-12 md:w-14 md:h-14 bg-black rounded-lg overflow-hidden flex-shrink-0 shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                    {currentTrack.thumbnail && <img src={currentTrack.thumbnail} className="w-full h-full object-cover" />}
                 </div>
                 <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-white text-[13px] md:text-[15px] font-bold truncate leading-tight mb-1 tracking-tight">{currentTrack.title}</span>
                    <span className="text-gray-500 text-[11px] md:text-[13px] font-medium truncate">{currentTrack.artist}</span>
                 </div>
               </div>

              <div className="flex-1 flex justify-center items-center gap-4 md:gap-8">
                 <button onClick={() => { if(currentTrackIndex > 0) setCurrentTrackIndex(i => i-1); }} className="text-gray-500 hover:text-white transition-colors active:scale-90 hidden sm:block p-2">
                    <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"></path></svg>
                 </button>
                 <button onClick={() => setIsPlaying(!isPlaying)} className={`w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 ${isPlaying ? 'bg-white text-black hover:bg-gray-200' : 'bg-neon text-black shadow-[0_0_20px_rgba(171,252,47,0.4)] hover:shadow-[0_0_30px_rgba(171,252,47,0.6)]'} active:scale-90`}>
                   {isPlaying ? (
                     <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>
                   ) : (
                     <svg className="w-7 h-7 fill-current pl-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                   )}
                 </button>
                 <button onClick={() => { if(currentTrackIndex < tracks.length - 1) setCurrentTrackIndex(i => i+1); }} className="text-gray-500 hover:text-white transition-colors active:scale-90 p-2">
                    <svg className="w-7 h-7 md:w-6 md:h-6 fill-current" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"></path></svg>
                 </button>
              </div>

              <div className="w-[30%] md:w-1/3 min-w-0 flex justify-end items-center gap-4">
                 <div className="hidden sm:flex bg-[#111] border border-white/5 rounded-xl px-4 py-2 flex-col items-center whitespace-nowrap">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-0.5">TARGET</span>
                    <span className="text-[16px] font-black text-white leading-tight tabular-nums">{targetBpm}</span>
                 </div>
              </div>
           </>
        ) : (
           <div className="w-full h-full flex items-center justify-center text-[12px] font-black text-gray-700 tracking-[0.2em] uppercase">
              Ready to Play
           </div>
        )}
        <a href="https://getsongbpm.com" style={{ display: 'none' }}>GetSongBPM</a>
      </footer>
      {/* Sync to YouTube Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="bg-[#0f0f0f] border border-white/10 rounded-[32px] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-3 mb-6">
               <svg className="w-8 h-8 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 4-8 4z"/>
               </svg>
               <h3 className="text-xl font-black text-white">YouTube Sync</h3>
            </div>

            <p className="text-gray-400 text-sm mb-6">
              Select which playlist to add the current source video to. We'll automatically match the BPM for you.
            </p>

            <div className="space-y-3 mb-8 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {userPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className={`w-full text-left px-5 py-4 rounded-2xl border transition-all flex items-center justify-between ${selectedPlaylistId === pl.id ? 'bg-red-600/10 border-red-600/40 text-red-500' : 'bg-white/5 border-white/5 hover:border-white/10 text-gray-300'}`}
                >
                  <span className="font-bold text-sm truncate pr-4">{pl.title}</span>
                  {selectedPlaylistId === pl.id && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                </button>
              ))}
              {userPlaylists.length === 0 && (
                <div className="text-center py-10 text-gray-600 italic text-sm">No playlists found.</div>
              )}
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setShowSyncModal(false)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-bold transition-all"
              >
                CANCEL
              </button>
              <button 
                onClick={syncToYouTube}
                disabled={isSyncing || !selectedPlaylistId}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-800 disabled:text-gray-500 text-white py-4 rounded-2xl font-black tracking-widest transition-all flex items-center justify-center gap-2"
              >
                {isSyncing ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'SYNC NOW'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* BPM Edit Modal */}
      <AnimatePresence>
        {openBpmEditModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 sm:p-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenBpmEditModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[#111] border border-white/10 rounded-[32px] p-8 max-w-sm w-full shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute top-0 right-0 p-4">
                <button 
                  onClick={() => setOpenBpmEditModal(false)}
                  className="p-2 rounded-full hover:bg-white/10 text-gray-400 transition-colors"
                >
                  <Close size={20} />
                </button>
              </div>

              <h3 className="text-xl font-black text-white mb-2">Edit BPM</h3>
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                Manually adjust the BPM or use the Tap button to match the tempo.
              </p>

              <div className="flex items-center gap-4 mb-6">
                <button 
                  onClick={() => setNewBpm(prev => Number(Math.max(1, prev - 0.1).toFixed(1)))}
                  className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <Remove size={20} />
                </button>
                <div className="flex-1 relative">
                  <input 
                    type="number"
                    step="0.1"
                    value={newBpm}
                    onChange={(e) => setNewBpm(Number(parseFloat(e.target.value || "0").toFixed(1)))}
                    className="w-full bg-[#181818] border border-white/10 rounded-2xl py-3 px-4 text-center text-2xl font-black text-neon focus:border-neon focus:outline-none transition-colors"
                  />
                  <div className="absolute top-0 left-0 w-full text-center -mt-5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Value</span>
                  </div>
                </div>
                <button 
                  onClick={() => setNewBpm(prev => Number((prev + 0.1).toFixed(1)))}
                  className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <Add size={20} />
                </button>
              </div>

              <TapBpm onBpmChange={setNewBpm} />

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button 
                  onClick={() => setOpenBpmEditModal(false)}
                  className="py-4 bg-white/5 border border-white/10 rounded-2xl font-bold text-gray-400 hover:bg-white/10 transition-colors"
                >
                  CANCEL
                </button>
                <button 
                  onClick={handleSaveBpm}
                  className="py-4 bg-neon rounded-2xl font-black text-black shadow-[0_4px_20px_rgba(171,252,47,0.3)] active:scale-95 transition-all"
                >
                  SAVE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default SyncApp;
