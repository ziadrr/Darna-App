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
} from 'lucide-react';
import { User, AdvertiserType } from '../types';

export interface AuthSuccessMeta {
  isNewRegistration?: boolean;
  verificationEmailSent?: boolean;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register' | 'reset';
  reasonMessage?: string;
  onAuthSuccess: (user: User, token: string, meta?: AuthSuccessMeta) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  reasonMessage,
  onAuthSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>(initialMode);
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

  // Two-step password reset states
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetToken, setResetToken] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialMode]);

  // Listen for OAuth popup callback messages (OAUTH_AUTH_SUCCESS)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
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
    setError(null);
    setSuccessMsg(null);
    if (newMode === 'reset') {
      setResetStep('request');
      setResetToken('');
      setNewResetPassword('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const url = '/api/auth/login';
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      console.error(0, url, err);
      setError('Impossible de joindre le serveur');
      setLoading(false);
      return;
    }

    try {
      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error(res.status, url, parseErr);
        setError(
          `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
        return;
      }
      if (!res.ok || !data.success) {
        console.error(res.status, url, data.message || data.code || 'Login failed');
        setError(
          data.message ||
            `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
      } else {
        onAuthSuccess(data.user, data.token, { isNewRegistration: false });
      }
    } catch (err) {
      console.error(res.status, url, err);
      setError(
        `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
      );
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
    const url = '/api/auth/register';
    let res: Response;
    try {
      res = await fetch(url, {
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
    } catch (err) {
      console.error(0, url, err);
      setError('Impossible de joindre le serveur');
      setLoading(false);
      return;
    }

    try {
      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error(res.status, url, parseErr);
        setError(
          `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
        return;
      }
      if (!res.ok || !data.success) {
        console.error(res.status, url, data.message || data.code || 'Registration failed');
        setError(
          data.message ||
            `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
      } else {
        onAuthSuccess(data.user, data.token, {
          isNewRegistration: true,
          verificationEmailSent: Boolean(data.verificationEmailSent),
        });
      }
    } catch (err) {
      console.error(res.status, url, err);
      setError(
        `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    const url = '/api/auth/request-password-reset';
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      console.error(0, url, err);
      setError('Impossible de joindre le serveur');
      setLoading(false);
      return;
    }

    try {
      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error(res.status, url, parseErr);
        setError(
          `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
        return;
      }
      if (!res.ok || !data.success || data.emailSent !== true) {
        console.error(res.status, url, data.message || data.code || 'Password reset request failed');
        setError(
          data.message ||
            `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
      } else {
        setResetStep('confirm');
        setSuccessMsg(
          data.message ||
            'Un e-mail contenant votre code de réinitialisation sécurisé a été envoyé.'
        );
      }
    } catch (err) {
      console.error(res.status, url, err);
      setError(
        `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    const url = '/api/auth/reset-password';
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          resetToken: resetToken.trim(),
          newPassword: newResetPassword,
        }),
      });
    } catch (err) {
      console.error(0, url, err);
      setError('Impossible de joindre le serveur');
      setLoading(false);
      return;
    }

    try {
      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error(res.status, url, parseErr);
        setError(
          `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
        return;
      }
      if (!res.ok || !data.success) {
        console.error(res.status, url, data.message || data.code || 'Password reset confirm failed');
        setError(
          data.message ||
            `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
      } else {
        setSuccessMsg(data.message);
        setPassword('');
        setTimeout(() => {
          switchMode('login');
        }, 1800);
      }
    } catch (err) {
      console.error(res.status, url, err);
      setError(
        `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[94vh] flex flex-col overflow-hidden border border-stone-200 cursor-default"
      >
        {/* Top-Right Close Cross */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white hover:bg-stone-200 border border-stone-200 flex items-center justify-center text-stone-600 hover:text-stone-900 shadow-xs transition-colors"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Banner */}
        <div className="px-6 py-5 pr-16 bg-[#FAF7F2] border-b border-stone-200">
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

        {/* Mode Buttons: Créer un compte / Se connecter (Only 2 tabs) */}
        <div className="px-6 pt-4 bg-white">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 rounded-2xl">
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
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
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${
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

          {/* SOCIAL BUTTONS: Strictly disabled until production OAuth tokens are configured */}
          {(mode === 'login' || mode === 'register') && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled
                  title="Connexion Google temporairement désactivée en attente de configuration OAuth"
                  className="py-2 px-3 rounded-xl border border-stone-200 bg-stone-100 text-stone-400 text-xs font-semibold flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
                >
                  <span>Google (Désactivé)</span>
                </button>
                <button
                  type="button"
                  disabled
                  title="Connexion Apple temporairement désactivée en attente de configuration Apple Developer"
                  className="py-2 px-3 rounded-xl border border-stone-200 bg-stone-100 text-stone-400 text-xs font-semibold flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
                >
                  <span>Apple (Désactivé)</span>
                </button>
              </div>
              <p className="text-[11px] text-stone-500 text-center">
                Connexions Google et Apple désactivées par sécurité. Utilisez votre e-mail et mot de passe ci-dessous.
              </p>
            </div>
          )}

          {/* MODE 1: LOGIN */}
          {mode === 'login' && (
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
          {mode === 'register' && (
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
          {mode === 'reset' && (
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
