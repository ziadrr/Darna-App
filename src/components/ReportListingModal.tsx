import React, { useState } from 'react';
import { X, ShieldAlert, Check, Loader2 } from 'lucide-react';
import { Listing } from '../types';

interface ReportListingModalProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmitReport: (listingId: string, reason: string, comment: string, email: string) => Promise<void>;
}

export const ReportListingModal: React.FC<ReportListingModalProps> = ({
  listing,
  isOpen,
  onClose,
  onSubmitReport,
}) => {
  const [reason, setReason] = useState<string>('arnaque');
  const [comment, setComment] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen || !listing) return null;

  const reasons = [
    { id: 'arnaque', label: 'Suspicion d\'arnaque ou demande d\'argent à l\'avance' },
    { id: 'faux_prix', label: 'Prix mensongeur ou incohérent avec le marché' },
    { id: 'photos_trompeuses', label: 'Photos volées ou ne correspondant pas au bien' },
    { id: 'deja_loue', label: 'Ce bien n\'est plus disponible (déjà loué)' },
    { id: 'inapproprié', label: 'Contenu inapproprié ou coordonnées frauduleuses' },
    { id: 'autre', label: 'Autre motif' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmitReport(listing.id, reason, comment, reporterEmail);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-stone-200">
        <div className="px-5 py-4 bg-red-50/60 border-b border-red-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-red-700">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="font-bold text-sm">Signaler cette annonce</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isSuccess ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-base text-stone-900">Signalement enregistré</h4>
            <p className="text-xs text-stone-500">
              Notre équipe de modération Darna va examiner cette annonce dans les plus brefs délais. Merci pour votre vigilance.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-200">
              Annonce concernée : <span className="font-bold text-stone-900">{listing.title}</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Motif du signalement :
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Précisions supplémentaires (facultatif) :
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Expliquez ce qui vous semble anormal..."
                className="w-full text-xs p-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                Votre email (pour vous tenir informé) :
              </label>
              <input
                type="email"
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                placeholder="votre.email@exemple.com"
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Envoi...</span>
                  </>
                ) : (
                  <span>Envoyer le signalement</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
