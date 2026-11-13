import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  MailCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { User } from '../types';

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  authToken?: string | null;
  alreadySentOnRegister?: boolean;
  reasonMessage?: string;
  onVerified: (updatedUser?: User) => void;
}

export const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  authToken,
  alreadySentOnRegister = false,
  reasonMessage,
  onVerified,
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const autoRequestedRef = useRef<string | null>(null);

  const sendVerificationEmail = useCallback(
    async (isManualResend = false) => {
      if (!userEmail) return;
      setSending(true);
      setError(null);
      if (isManualResend) {
        setInfoMessage(null);
      }

      const url = '/api/auth/request-email-verification';
      let res: Response;
      try {
        const token = authToken || localStorage.getItem('darna_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: userEmail.trim().toLowerCase() }),
        });
      } catch (err) {
        console.error(0, url, err);
        setError('Impossible de joindre le serveur');
        setSending(false);
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
          console.error(res.status, url, data.message || data.code || 'Email send failed');
          setError(
            data.message ||
              `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
          );
        } else {
          setInfoMessage(
            isManualResend
              ? `Un nouveau code à 6 chiffres et un lien magique ont été envoyés à ${userEmail}.`
              : `Code à 6 chiffres et lien magique envoyés automatiquement à ${userEmail}.`
          );
        }
      } catch (err) {
        console.error(res.status, url, err);
        setError(
          `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
      } finally {
        setSending(false);
      }
    },
    [userEmail, authToken]
  );

  const submitCode = useCallback(
    async (codeToVerify: string) => {
      const cleanCode = codeToVerify.replace(/\D/g, '');
      if (cleanCode.length !== 6) {
        setError('Veuillez saisir les 6 chiffres du code reçu par e-mail.');
        return;
      }

      setVerifying(true);
      setError(null);
      setInfoMessage(null);

      const url = '/api/auth/verify-email';
      let res: Response;
      try {
        const token = authToken || localStorage.getItem('darna_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            email: userEmail.trim().toLowerCase(),
            verificationToken: cleanCode,
          }),
        });
      } catch (err) {
        console.error(0, url, err);
        setError('Impossible de joindre le serveur');
        setVerifying(false);
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
          console.error(res.status, url, data.message || data.code || 'Verification failed');
          setError(
            data.code === 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN'
              ? 'Code à 6 chiffres invalide ou expiré. Vérifiez votre e-mail ou demandez un nouveau code.'
              : data.message ||
                  `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
          );
        } else {
          setSuccessMessage('Votre adresse e-mail est maintenant vérifiée !');
          setTimeout(() => {
            onVerified(data.user);
          }, 500);
        }
      } catch (err) {
        console.error(res.status, url, err);
        setError(
          `Le serveur a répondu avec une erreur (code HTTP ${res.status}). Réessaie dans quelques secondes.`
        );
      } finally {
        setVerifying(false);
      }
    },
    [authToken, userEmail, onVerified]
  );

  // Reset state and automatically send the 6-digit code when modal opens
  useEffect(() => {
    if (!isOpen) {
      autoRequestedRef.current = null;
      return;
    }

    setDigits(['', '', '', '', '', '']);
    setError(null);
    setSuccessMessage(null);

    const focusTimer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 60);

    if (alreadySentOnRegister) {
      setInfoMessage(
        `Un code à 6 chiffres et un lien magique ont été envoyés automatiquement à ${userEmail}.`
      );
    } else if (userEmail && autoRequestedRef.current !== userEmail) {
      autoRequestedRef.current = userEmail;
      sendVerificationEmail(false);
    }

    return () => clearTimeout(focusTimer);
  }, [isOpen, userEmail, alreadySentOnRegister, sendVerificationEmail]);

  if (!isOpen) return null;

  const handleDigitChange = (index: number, rawValue: string) => {
    setError(null);
    const numericOnly = rawValue.replace(/\D/g, '');

    // Handle multi-digit input or autofill
    if (numericOnly.length > 1) {
      const chars = numericOnly.slice(0, 6).split('');
      const nextDigits = ['', '', '', '', '', ''];
      for (let i = 0; i < 6; i++) {
        nextDigits[i] = chars[i] || '';
      }
      setDigits(nextDigits);
      const nextFocusIndex = Math.min(chars.length, 5);
      inputRefs.current[nextFocusIndex]?.focus();
      if (chars.length === 6) {
        submitCode(chars.join(''));
      }
      return;
    }

    const digit = numericOnly.slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = digit;
    setDigits(nextDigits);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    const joined = nextDigits.join('');
    if (digit && joined.length === 6 && nextDigits.every((d) => d.length === 1)) {
      submitCode(joined);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const nextDigits = [...digits];
        nextDigits[index] = '';
        setDigits(nextDigits);
      } else if (index > 0) {
        const nextDigits = [...digits];
        nextDigits[index - 1] = '';
        setDigits(nextDigits);
        inputRefs.current[index - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const nextDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < 6; i++) {
      nextDigits[i] = pasted[i] || '';
    }
    setDigits(nextDigits);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();

    if (pasted.length === 6) {
      submitCode(pasted);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCode(digits.join(''));
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-email-modal-title"
        className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200 cursor-default"
      >
        {/* Top-Right Close Cross */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la vérification"
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white hover:bg-stone-200 border border-stone-200 flex items-center justify-center text-stone-600 hover:text-stone-900 shadow-xs transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 py-5 pr-16 bg-[#FAF7F2] border-b border-stone-200">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#C15C3D] mb-1">
            <MailCheck className="w-3.5 h-3.5" />
            <span>Vérification rapide par e-mail</span>
          </div>
          <h2
            id="verify-email-modal-title"
            className="font-bold text-base sm:text-lg text-stone-900 leading-snug"
          >
            Entrez votre code à 6 chiffres
          </h2>
          <p className="text-xs text-stone-600 mt-1">
            Envoyé automatiquement à{' '}
            <strong className="text-stone-900 font-bold">{userEmail}</strong>
          </p>
          {reasonMessage && (
            <p className="text-xs text-[#C15C3D] font-semibold mt-1.5">{reasonMessage}</p>
          )}
        </div>

        {/* Body */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && !error && !successMessage && (
            <div
              role="status"
              className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="p-3 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-bold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* 6 OTP Digit Boxes */}
          <div>
            <label className="block text-xs font-bold text-stone-700 text-center mb-3">
              Saisissez ou collez le code à 6 chiffres :
            </label>
            <div
              className="grid grid-cols-6 gap-2 sm:gap-2.5 max-w-xs mx-auto"
              dir="ltr"
            >
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                  maxLength={6}
                  value={digit}
                  aria-label={`Chiffre ${idx + 1} du code de vérification`}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  disabled={verifying || Boolean(successMessage)}
                  className="w-full h-12 sm:h-14 text-center text-lg sm:text-xl font-extrabold font-mono text-stone-900 bg-[#FAF7F2] border-2 border-stone-300 rounded-2xl focus:outline-none focus:border-[#C15C3D] focus:bg-white focus:ring-2 focus:ring-[#C15C3D]/20 transition-all"
                />
              ))}
            </div>
          </div>

          {/* Magic Link Hint */}
          <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 text-[11px] text-stone-600 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C15C3D] shrink-0" />
            <span>
              Astuce : vous pouvez aussi cliquer directement sur le{' '}
              <strong className="text-stone-800">lien magique</strong> contenu dans l'e-mail reçu.
            </span>
          </div>

          {/* Primary Verify Button */}
          <button
            type="submit"
            disabled={verifying || digits.join('').length !== 6 || Boolean(successMessage)}
            className="w-full py-3 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all disabled:opacity-50"
          >
            {verifying ? 'Vérification en cours...' : 'Valider le code à 6 chiffres'}
          </button>

          {/* Resend & Skip Controls */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <button
              type="button"
              onClick={() => sendVerificationEmail(true)}
              disabled={sending || verifying}
              className="inline-flex items-center gap-1.5 font-bold text-[#C15C3D] hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sending ? 'animate-spin' : ''}`} />
              <span>{sending ? 'Envoi en cours...' : 'Renvoyer un nouveau code'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-stone-500 hover:text-stone-800 font-semibold"
            >
              Plus tard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
