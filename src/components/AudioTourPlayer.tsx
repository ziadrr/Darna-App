import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { Listing } from '../types';

interface AudioTourPlayerProps {
  listing: Listing;
}

export const AudioTourPlayer: React.FC<AudioTourPlayerProps> = ({ listing }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<'Kore' | 'Puck' | 'Fenrir'>('Kore');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up audio URL on unmount or listing change
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [listing.id]);

  const handleGenerateAndPlay = async () => {
    // If audio is already loaded and paused, just play
    if (audioRef.current && audioUrl && !isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
      return;
    }

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Prepare text for the audio tour (max 500 chars for server validation)
    const rawScript = `Bienvenue chez Darna. Visite de l'annonce : ${listing.title}, située à ${listing.district}, ${listing.city}. Loyer proposé à ${listing.price} Dirhams marocains par ${listing.period}. ${listing.surface} mètres carrés, ${listing.bedrooms ? listing.bedrooms + ' chambres' : ''}. Description : ${listing.description.slice(0, 220)}. Contactez directement l'annonceur sur Darna pour organiser une visite.`;
    const audioScript = rawScript.slice(0, 500);

    try {
      const token = localStorage.getItem('darna_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: audioScript,
          voice: selectedVoice,
        }),
      });

      const data = await response.json();

      if (data.success && data.audioBase64) {
        const url = `data:audio/wav;base64,${data.audioBase64}`;
        setAudioUrl(url);

        if (audioRef.current) {
          audioRef.current.pause();
        }

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => {
          setIsPlaying(false);
          setErrorMessage("Erreur lors de la lecture du fichier audio.");
        };

        await audio.play();
        setIsPlaying(true);
      } else {
        throw new Error(data.message || 'Impossible de générer l\'audio.');
      }
    } catch (err: any) {
      console.warn('TTS API error, falling back to Web Speech API:', err);
      // Client-side fallback via Web Speech API if API key has no quota
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(audioScript);
        utterance.lang = 'fr-FR';
        utterance.rate = 0.95;
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        setIsPlaying(true);
      } else {
        setErrorMessage(err.message || 'Synthèse vocale indisponible.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  };

  return (
    <div className="bg-gradient-to-r from-stone-900 to-[#1E3D34] text-white p-4 sm:p-5 rounded-2xl shadow-lg border border-emerald-900/40 relative overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-[#C15C3D]/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 text-amber-300 border border-white/10">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm sm:text-base text-stone-100">Visite Audio IA de l'annonce</h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                gemini-3.8-flash-tts
              </span>
            </div>
            <p className="text-xs text-stone-300 mt-0.5">
              Écoutez la description immersive lue par l'intelligence artificielle vocale Gemini.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value as any)}
            className="text-xs bg-white/10 border border-white/20 text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400"
            title="Choix de la voix IA"
          >
            <option value="Kore" className="text-stone-900">Voix Kore (Féminine)</option>
            <option value="Fenrir" className="text-stone-900">Voix Fenrir (Masculine)</option>
            <option value="Puck" className="text-stone-900">Voix Puck (Dynamique)</option>
          </select>

          {isPlaying ? (
            <button
              onClick={handleStop}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md transition-all active:scale-95"
            >
              <VolumeX className="w-4 h-4" />
              <span>Arrêter</span>
            </button>
          ) : (
            <button
              onClick={handleGenerateAndPlay}
              disabled={isLoading}
              className="px-4 py-2 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Génération...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Écouter la visite</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Waveform indicator when playing */}
      {isPlaying && (
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-amber-300">
          <Volume2 className="w-4 h-4 animate-bounce shrink-0" />
          <span className="font-medium">Lecture en cours...</span>
          <div className="flex items-end gap-1 h-3 ml-2">
            <span className="w-1 bg-amber-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-full" />
            <span className="w-1 bg-amber-400 rounded-full animate-[pulse_0.4s_ease-in-out_infinite] h-2" />
            <span className="w-1 bg-amber-400 rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-3.5" />
            <span className="w-1 bg-amber-400 rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-1.5" />
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="mt-2 text-xs text-red-300 bg-red-950/40 px-3 py-1.5 rounded-lg border border-red-800/40">
          {errorMessage}
        </p>
      )}
    </div>
  );
};
