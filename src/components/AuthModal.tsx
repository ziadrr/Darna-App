import React, { useState } from 'react';
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
  Info,
  Sparkles
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showGoogleConfigInfo, setShowGoogleConfigInfo] = useState(false);

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [advertiserType, setAdvertiserType] = useState<AdvertiserType>('particulier');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [newResetPassword, setNewResetPassword] = useState('');

  if (!isOpen) return null;

  const switchMode = (newMode: 'login' | 'register' | 'reset') => {
    setMode(newMode);
    setError(null);
    setSuccessMsg(null);
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

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword: newResetPassword || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Impossible de réinitialiser le mot de passe.');
      } else {
        setSuccessMsg(
          newResetPassword
            ? 'Votre mot de passe a été mis à jour avec succès. Vous pouvez maintenant vous connecter.'
            : data.message
        );
      }
    } catch {
      setError('Erreur lors de la demande de réinitialisation.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role: 'particulier' | 'professionnel' | 'admin') => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        onAuthSuccess(data.user, data.token);
      }
    } catch {
      setError('Erreur lors de la connexion de démonstration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[94vh] flex flex-col overflow-hidden border border-stone-200">
        {/* Top Banner with required prompt message */}
        <div className="px-6 py-5 bg-[#FAF7F2] border-b border-stone-200 flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#C15C3D] mb-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Espace Membre Darna
            </span>
            <h2 className="font-bold text-base sm:text-lg text-stone-900 leading-snug">
              Créez un compte ou connectez-vous pour continuer.
            </h2>
            {reasonMessage && (
              <p className="text-xs text-stone-600 mt-1">{reasonMessage}</p>
            )}
          </div>
          <button
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
                    placeholder="exemple@email.com"
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
                    placeholder="votre.email@domaine.ma"
                    className="w-full text-xs sm:text-sm pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Mot de passe sécurisé (6 caractères min.) *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 caractères"
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

          {/* MODE 3: PASSWORD RESET */}
          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-800">
                <KeyRound className="w-4 h-4 text-[#C15C3D]" />
                <span>Réinitialisation du mot de passe</span>
              </div>
              <p className="text-xs text-stone-600">
                Saisissez votre adresse e-mail et définissez un nouveau mot de passe pour votre compte.
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
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Nouveau mot de passe (optionnel pour test direct)
                </label>
                <input
                  type="password"
                  minLength={6}
                  value={newResetPassword}
                  onChange={(e) => setNewResetPassword(e.target.value)}
                  placeholder="Nouveau mot de passe (min. 6 caractères)"
                  className="w-full text-sm px-3.5 py-2.5 rounded-xl border border-stone-300"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-[#1E3D34] text-white rounded-xl font-bold text-xs"
              >
                {loading ? 'Envoi...' : 'Réinitialiser le mot de passe'}
              </button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-center text-xs text-stone-500 hover:text-stone-800"
              >
                Retour à la connexion
              </button>
            </form>
          )}

          {/* Honest Google OAuth status section */}
          <div className="pt-3 border-t border-stone-200 space-y-2">
            <button
              type="button"
              onClick={() => setShowGoogleConfigInfo((prev) => !prev)}
              className="w-full py-2.5 px-4 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600 text-xs font-semibold flex items-center justify-between transition-colors"
            >
              <span>Connexion avec Google (Non configurée)</span>
              <Info className="w-4 h-4 text-stone-400" />
            </button>
            {showGoogleConfigInfo && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                <strong>Information technique :</strong> La connexion OAuth Google nécessite un identifiant client Google Cloud (<code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code>) et l'autorisation du domaine. Tant qu'elle n'est pas configurée, utilisez l'inscription par e-mail ou les comptes de démonstration ci-dessous.
              </div>
            )}
          </div>

          {/* Quick Demo Accounts for instant testing */}
          <div className="pt-2 border-t border-stone-100 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-[#C15C3D]" />
              <span>Accès rapide comptes de démonstration :</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('particulier')}
                className="py-2 px-2 rounded-xl border border-stone-200 hover:border-[#C15C3D] bg-[#FAF7F2] text-stone-800 text-[11px] font-bold transition-colors"
              >
                Particulier Démo
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('professionnel')}
                className="py-2 px-2 rounded-xl border border-stone-200 hover:border-[#1E3D34] bg-[#FAF7F2] text-stone-800 text-[11px] font-bold transition-colors"
              >
                Agence Démo
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('admin')}
                className="py-2 px-2 rounded-xl border border-stone-200 hover:border-stone-800 bg-stone-100 text-stone-700 text-[11px] font-bold transition-colors"
              >
                Admin Démo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
