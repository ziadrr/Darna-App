import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Phone,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Smartphone,
  ArrowLeft,
} from 'lucide-react';
import { User, AdvertiserType } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register' | 'reset';
  reasonMessage?: string;
  onAuthSuccess: (user: User, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  reasonMessage,
  onAuthSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);
  const [socialStepProvider, setSocialStepProvider] = useState<'google' | 'apple' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [advertiserType, setAdvertiserType] = useState<AdvertiserType>('particulier');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Social quick-connect form states (Google/Gmail & Apple iOS)
  const [socialEmail, setSocialEmail] = useState('');
  const [socialFirstName, setSocialFirstName] = useState('');
  const [socialLastName, setSocialLastName] = useState('');
  const [socialAdvertiserType, setSocialAdvertiserType] = useState<AdvertiserType>('particulier');

  // Two-step password reset states
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetToken, setResetToken] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');

  // Listen for OAuth popup callback messages (OAUTH_AUTH_SUCCESS)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      if (
        origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        origin !== window.location.origin
      ) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.user && event.data?.token) {
        onAuthSuccess(event.data.user, event.data.token);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthSuccess]);

  if (!isOpen) return null;

  const switchMode = (newMode: 'login' | 'register' | 'reset') => {
    setMode(newMode);
    setSocialStepProvider(null);
    setError(null);
    setSuccessMsg(null);
    if (newMode === 'reset') {
      setResetStep('request');
      setResetToken('');
      setNewResetPassword('');
    }
  };

  /**
   * Initiates Google / Gmail or Apple (iOS/Web) authentication:
   * 1. Attempts Firebase Auth popup (signInWithPopup) for Google/Gmail or Apple and verifies the ID token on the server.
   * 2. If the popup is closed/blocked in the preview iframe, opens the integrated Gmail / Apple ID quick sign-in screen.
   */
  const handleInitiateSocialAuth = async (provider: 'google' | 'apple') => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const { signInWithGooglePopup, signInWithApplePopup } = await import('../lib/firebase');
      const popupResult =
        provider === 'google'
          ? await signInWithGooglePopup()
          : await signInWithApplePopup();

      if (popupResult?.idToken && popupResult.firebaseUser?.email) {
        const displayParts = (popupResult.firebaseUser.displayName || '').split(' ');
        const res = await fetch('/api/auth/social-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            email: popupResult.firebaseUser.email,
            firstName: displayParts[0] || '',
            lastName: displayParts.slice(1).join(' '),
            idToken: popupResult.idToken,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          onAuthSuccess(data.user, data.token);
          return;
        }
      }
      setSocialStepProvider(provider);
    } catch {
      // Fallback smoothly to the inline Gmail / Apple ID quick sign-in view if popup was closed or blocked
      setSocialStepProvider(provider);
      if (email) {
        setSocialEmail(email);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSocialAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socialStepProvider) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/social-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: socialStepProvider,
          email: socialEmail.trim(),
          firstName: socialFirstName.trim(),
          lastName: socialLastName.trim(),
          advertiserType: socialAdvertiserType,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Impossible de finaliser la connexion.');
      } else {
        onAuthSuccess(data.user, data.token);
      }
    } catch {
      setError('Erreur réseau lors de la connexion. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Identifiants incorrects.');
      } else {
        onAuthSuccess(data.user, data.token);
      }
    } catch {
      setError('Erreur réseau lors de la connexion. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!termsAccepted) {
      setError("Veuillez accepter les conditions d'utilisation et la politique de confidentialité.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          phone,
          advertiserType,
          termsAccepted,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Impossible de créer le compte.');
      } else {
        onAuthSuccess(data.user, data.token);
      }
    } catch {
      setError("Erreur réseau lors de l'inscription. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Impossible de générer le code de réinitialisation.');
      } else {
        setResetStep('confirm');
        if (data.devResetToken) {
          setResetToken(data.devResetToken);
        }
        setSuccessMsg(
          data.message ||
            'Si un compte existe avec cette adresse e-mail, un code de réinitialisation sécurisé a été émis.'
        );
      }
    } catch {
      setError('Erreur lors de la demande de réinitialisation.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          resetToken: resetToken.trim(),
          newPassword: newResetPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Code de réinitialisation invalide ou expiré.');
      } else {
        setSuccessMsg(data.message);
        setPassword('');
        setTimeout(() => {
          switchMode('login');
        }, 1800);
      }
    } catch {
      setError('Erreur lors de la validation du nouveau mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[94vh] flex flex-col overflow-hidden border border-stone-200">
        {/* Top Banner */}
        <div className="px-6 py-5 bg-[#FAF7F2] border-b border-stone-200 flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#C15C3D] mb-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Espace Membre Sécurisé Darna
            </span>
            <h2 className="font-bold text-base sm:text-lg text-stone-900 leading-snug">
              Créez un compte ou connectez-vous pour continuer.
            </h2>
            {reasonMessage && (
              <p className="text-xs text-stone-600 mt-1">{reasonMessage}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500 transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Two Prominent Mode Buttons: Créer un compte / Se connecter */}
        <div className="px-6 pt-4 bg-white">
          <div className="grid grid-cols-2 gap-2.5 p-1 bg-stone-100 rounded-2xl">
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                mode === 'register'
                  ? 'bg-[#C15C3D] text-white shadow-xs'
                  : 'text-stone-700 hover:text-stone-900'
              }`}
            >
              Créer un compte
            </button>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                mode === 'login'
                  ? 'bg-[#1E3D34] text-white shadow-xs'
                  : 'text-stone-700 hover:text-stone-900'
              }`}
            >
              Se connecter
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* SOCIAL QUICK-CONNECT SUBVIEW (Google/Gmail or Apple iOS) */}
          {socialStepProvider && (
            <form onSubmit={handleCompleteSocialAuth} className="space-y-3.5 animate-fade-in">
              <button
                type="button"
                onClick={() => {
                  setSocialStepProvider(null);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Retour aux options de connexion
              </button>

              {socialStepProvider === 'google' ? (
                <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-xs border border-stone-200 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5" viewBox="0 0 48 48">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-extrabold text-stone-900">
                      Connexion avec Google / Gmail
                    </div>
                    <div className="text-[11px] text-stone-600">
                      Compatible ordinateur, mobile Android et iOS (application Gmail)
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-stone-900 text-white flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-extrabold">
                      Connexion avec Apple (iOS • iPhone • iPad)
                    </div>
                    <div className="text-[11px] text-stone-300">
                      Identifiant Apple / iCloud sécurisé
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  {socialStepProvider === 'google'
                    ? 'Votre adresse Gmail / Google *'
                    : 'Votre identifiant Apple (iCloud / e-mail) *'}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={socialEmail}
                    onChange={(e) => setSocialEmail(e.target.value)}
                    placeholder={
                      socialStepProvider === 'google'
                        ? 'votre.nom@gmail.com'
                        : 'votre.nom@icloud.com'
                    }
                    className="w-full text-sm pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#1E3D34]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Prénom (optionnel)
                  </label>
                  <input
                    type="text"
                    value={socialFirstName}
                    onChange={(e) => setSocialFirstName(e.target.value)}
                    placeholder="Ex: Youssef"
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-stone-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Nom (optionnel)
                  </label>
                  <input
                    type="text"
                    value={socialLastName}
                    onChange={(e) => setSocialLastName(e.target.value)}
                    placeholder="Ex: Alami"
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-stone-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Type de profil
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSocialAdvertiserType('particulier')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      socialAdvertiserType === 'particulier'
                        ? 'bg-[#FAF7F2] border-[#C15C3D] text-[#C15C3D]'
                        : 'border-stone-200 text-stone-600'
                    }`}
                  >
                    Particulier
                  </button>
                  <button
                    type="button"
                    onClick={() => setSocialAdvertiserType('professionnel')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      socialAdvertiserType === 'professionnel'
                        ? 'bg-[#FAF7F2] border-[#C15C3D] text-[#C15C3D]'
                        : 'border-stone-200 text-stone-600'
                    }`}
                  >
                    Agence / Pro
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                  socialStepProvider === 'apple'
                    ? 'bg-black hover:bg-stone-900 text-white'
                    : 'bg-[#1a73e8] hover:bg-[#1557b0] text-white'
                }`}
              >
                {loading
                  ? 'Connexion en cours...'
                  : socialStepProvider === 'google'
                  ? 'Continuer avec mon compte Gmail'
                  : 'Continuer avec mon compte Apple'}
              </button>
            </form>
          )}

          {/* PROMINENT SOCIAL BUTTONS (Google/Gmail + Apple iOS) IN LOGIN & REGISTER MODES */}
          {!socialStepProvider && (mode === 'login' || mode === 'register') && (
            <div className="space-y-2.5">
              {/* Google / Gmail Button (Web + Mobile Android/iOS) */}
              <button
                type="button"
                disabled={loading}
                onClick={() => handleInitiateSocialAuth('google')}
                className="w-full py-2.5 px-4 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-3 shadow-2xs transition-colors"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>Continuer avec Google / Gmail</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 ml-auto">
                  Gmail
                </span>
              </button>

              {/* Apple Sign-In Button (iOS / iPhone / iPad & Web) */}
              <button
                type="button"
                disabled={loading}
                onClick={() => handleInitiateSocialAuth('apple')}
                className="w-full py-2.5 px-4 rounded-xl bg-black hover:bg-stone-900 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-3 shadow-2xs transition-colors"
              >
                <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                <span>Continuer avec Apple</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/15 text-stone-200 ml-auto">
                  iOS / iPhone
                </span>
              </button>

              <div className="flex items-center gap-2 text-[11px] text-stone-500 justify-center pt-0.5">
                <Smartphone className="w-3.5 h-3.5 text-[#C15C3D]" />
                <span>Disponible sur ordinateur, mobile Android (Gmail) et iOS (Apple / Gmail)</span>
              </div>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-stone-200" />
                <span className="flex-shrink mx-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  ou avec e-mail
                </span>
                <div className="flex-grow border-t border-stone-200" />
              </div>
            </div>
          )}

          {/* MODE 1: LOGIN */}
          {!socialStepProvider && mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Adresse e-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemple@gmail.com"
                    className="w-full text-sm pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#1E3D34]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-stone-700">
                    Mot de passe
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-[11px] font-semibold text-[#C15C3D] hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-sm pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#1E3D34]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50"
              >
                {loading ? 'Connexion en cours...' : 'Se connecter'}
              </button>
            </form>
          )}

          {/* MODE 2: REGISTER */}
          {!socialStepProvider && mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Prénom *
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Karim"
                      className="w-full text-xs sm:text-sm pl-9 pr-3 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Nom *
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Bennani"
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Adresse e-mail *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre.email@gmail.com"
                    className="w-full text-xs sm:text-sm pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Mot de passe sécurisé (8 caractères min., lettres + chiffres) *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 caractères (lettres + chiffres)"
                    className="w-full text-xs sm:text-sm pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Numéro de téléphone (recommandé pour les annonceurs)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="06 61 23 45 67"
                    className="w-full text-xs sm:text-sm pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  Votre numéro ne sera jamais affiché aux visiteurs non connectés et ne sera visible que si vous l'autorisez sur votre annonce.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Profil d'utilisateur
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdvertiserType('particulier')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      advertiserType === 'particulier'
                        ? 'bg-[#FAF7F2] border-[#C15C3D] text-[#C15C3D]'
                        : 'border-stone-200 text-stone-600'
                    }`}
                  >
                    Particulier
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvertiserType('professionnel')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      advertiserType === 'professionnel'
                        ? 'bg-[#FAF7F2] border-[#C15C3D] text-[#C15C3D]'
                        : 'border-stone-200 text-stone-600'
                    }`}
                  >
                    Professionnel
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-stone-700 bg-stone-50 p-3 rounded-xl border border-stone-200">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 rounded text-[#C15C3D] focus:ring-[#C15C3D]"
                />
                <span>
                  J'accepte les Conditions Générales d'Utilisation et la Politique de Confidentialité (conformité CNDP Loi 09-08). *
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50"
              >
                {loading ? 'Création du compte...' : 'Créer mon compte'}
              </button>
            </form>
          )}

          {/* MODE 3: SECURE TWO-STEP PASSWORD RESET */}
          {!socialStepProvider && mode === 'reset' && (
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
                <KeyRound className="w-4 h-4 text-[#C15C3D]" />
                <span>Réinitialisation sécurisée du mot de passe</span>
              </div>

              {resetStep === 'request' ? (
                <form onSubmit={handleRequestPasswordReset} className="space-y-3.5">
                  <p className="text-xs text-stone-600">
                    Étape 1 : saisissez l’adresse e-mail de votre compte pour recevoir un jeton de réinitialisation à usage unique (valable 15 minutes).
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Adresse e-mail du compte *
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="exemple@email.com"
                      className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-stone-300"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-[#1E3D34] text-white rounded-xl font-bold text-xs"
                  >
                    {loading ? 'Génération...' : 'Recevoir mon code de réinitialisation'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmPasswordReset} className="space-y-3.5">
                  <p className="text-xs text-stone-600">
                    Étape 2 : saisissez le jeton de sécurité reçu et choisissez votre nouveau mot de passe (min. 8 caractères, lettres et chiffres).
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Jeton de réinitialisation *
                    </label>
                    <input
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Collez le jeton de sécurité reçu"
                      className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-stone-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Nouveau mot de passe (min. 8 caractères) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newResetPassword}
                      onChange={(e) => setNewResetPassword(e.target.value)}
                      placeholder="Nouveau mot de passe fort"
                      className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-stone-300"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl font-bold text-xs"
                  >
                    {loading ? 'Validation...' : 'Confirmer le nouveau mot de passe'}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-800"
              >
                Retour à la connexion
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
