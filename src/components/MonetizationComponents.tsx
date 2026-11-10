import React, { useState } from 'react';
import {
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Building2,
  AlertTriangle,
  X,
  Lock,
  ArrowRight,
  Award,
  TrendingUp,
  Info,
  RefreshCw,
  CheckCircle
} from 'lucide-react';
import {
  SubscriptionPlan,
  BoostOption,
  Listing,
  User,
  PaymentTransaction
} from '../types';
import { isListingBoostActive } from '../utils/rentalLogic';

interface SubscriptionPlansViewProps {
  plans: SubscriptionPlan[];
  boostOptions: BoostOption[];
  currentUser: User | null;
  myListings: Listing[];
  onSelectPlan: (plan: SubscriptionPlan) => void;
  onOpenBoostForListing: (listing: Listing, preselectedOption?: BoostOption) => void;
  onOpenAuth: () => void;
}

export const SubscriptionPlansView: React.FC<SubscriptionPlansViewProps> = ({
  plans,
  boostOptions,
  currentUser,
  myListings,
  onSelectPlan,
  onOpenBoostForListing,
  onOpenAuth,
}) => {
  const [quoteRequested, setQuoteRequested] = useState(false);
  const [selectedListingIdForBoost, setSelectedListingIdForBoost] = useState<string>(
    myListings[0]?.id || ''
  );

  const currentPlanId =
    currentUser?.subscription?.status === 'active'
      ? currentUser.subscription.planId
      : 'particulier';

  return (
    <div className="space-y-10 animate-fade-in pb-8">
      {/* Test Mode Notice Banner */}
      <div className="bg-amber-50 border border-amber-300/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-900 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5 text-amber-800" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-400 text-stone-950">
                Mode Test (Bac à sable)
              </span>
              <h3 className="font-bold text-sm text-stone-900">
                Système de paiement en Dirhams (MAD) — Passerelle CMI / Payzone Maroc
              </h3>
            </div>
            <p className="text-xs text-stone-700 mt-1 leading-relaxed">
              Les paiements fonctionnent actuellement en <strong>mode test clairement indiqué</strong>. Aucun débit bancaire réel n’est effectué tant que le contrat marchand de production n’est pas activé. Aucune donnée complète de carte bancaire n’est stockée, et toute option payante n’est activée qu’après confirmation effective du paiement.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 1: ABONNEMENTS PROFESSIONNELS */}
      <div className="space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#1E3D34]/10 text-[#1E3D34]">
            <Building2 className="w-3.5 h-3.5" /> Offres Particuliers & Agences Immobilières
          </span>
          <h1 className="text-2xl sm:text-4xl font-serif-title font-bold text-stone-900">
            Abonnements professionnels Darna
          </h1>
          <p className="text-xs sm:text-sm text-stone-600">
            Choisissez l’offre adaptée à votre portefeuille de biens à louer au Maroc. Tarifs transparents en dirhams marocains (DH / mois), modifiables depuis l’administration.
          </p>
        </div>

        {quoteRequested && (
          <div className="max-w-xl mx-auto p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Votre demande de devis « Offre Entreprise » a été enregistrée. Notre équipe grands comptes au Maroc vous contactera sous 24h.
              </span>
            </div>
            <button
              onClick={() => setQuoteRequested(false)}
              className="text-emerald-700 hover:text-emerald-950 font-bold"
            >
              Fermer
            </button>
          </div>
        )}

        {/* Pricing Table Summary (as requested in prompt) */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {plans.map((plan) => {
            const isCurrent = Boolean(currentUser && currentPlanId === plan.id);
            const isPopular = Boolean(plan.popular);

            return (
              <div
                key={plan.id}
                className={`rounded-3xl p-5 flex flex-col justify-between transition-all border ${
                  isPopular
                    ? 'bg-[#1E3D34] text-white border-[#1E3D34] shadow-xl ring-2 ring-amber-400/70'
                    : 'bg-white text-stone-800 border-stone-200/90 shadow-xs hover:border-[#C15C3D]/50'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        isPopular
                          ? 'bg-amber-400 text-stone-950'
                          : 'bg-stone-100 text-[#1E3D34]'
                      }`}
                    >
                      {plan.name}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                        Offre actuelle
                      </span>
                    )}
                  </div>

                  {/* Price display */}
                  <div className="pt-1">
                    {plan.isCustomQuote || plan.price === null ? (
                      <div className="text-2xl font-extrabold text-[#C15C3D]">
                        Sur devis
                      </div>
                    ) : plan.price === 0 ? (
                      <div className="text-2xl font-extrabold">Gratuit</div>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span
                          className={`text-2xl sm:text-3xl font-extrabold ${
                            isPopular ? 'text-amber-300' : 'text-stone-900'
                          }`}
                        >
                          {plan.price} DH
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            isPopular ? 'text-stone-300' : 'text-stone-500'
                          }`}
                        >
                          / {plan.period}
                        </span>
                      </div>
                    )}
                    <p
                      className={`text-[11px] mt-1 font-semibold ${
                        isPopular ? 'text-emerald-200' : 'text-[#C15C3D]'
                      }`}
                    >
                      Plafond : jusqu’à {plan.maxListings} annonces actives
                    </p>
                  </div>

                  {/* Features list */}
                  <ul className="space-y-2 pt-3 border-t border-current/10 text-xs">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isPopular ? 'text-amber-300' : 'text-emerald-600'
                          }`}
                        />
                        <span className={isPopular ? 'text-stone-100' : 'text-stone-600'}>
                          {feat}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6 mt-4">
                  {plan.isCustomQuote || plan.price === null ? (
                    <button
                      type="button"
                      onClick={() => setQuoteRequested(true)}
                      className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-stone-900 hover:bg-stone-800 text-white transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>Demander un devis</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs cursor-default ${
                        isPopular
                          ? 'bg-white/15 text-white border border-white/20'
                          : 'bg-stone-100 text-stone-500 border border-stone-200'
                      }`}
                    >
                      Offre active sur votre compte
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectPlan(plan)}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                        isPopular
                          ? 'bg-amber-400 hover:bg-amber-300 text-stone-950'
                          : 'bg-[#C15C3D] hover:bg-[#a94f33] text-white'
                      }`}
                    >
                      <span>
                        {plan.price === 0 ? 'Activer Gratuitement' : `Choisir (${plan.price} DH)`}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: MISE EN AVANT DES ANNONCES */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/90 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-100 pb-5">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-amber-100 text-amber-900">
              <Sparkles className="w-3.5 h-3.5 text-[#C15C3D]" /> Visibilité Accélérée
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
              Options de mise en avant des annonces
            </h2>
            <p className="text-xs text-stone-600 max-w-2xl">
              Boostez ponctuellement une annonce pour attirer plus de locataires. Les annonces mises en avant affichent la mention claire <strong>« Sponsorisé »</strong> et continuent à respecter strictement les filtres de recherche et les règles de modération.
            </p>
          </div>

          {/* Listing selector if user has listings */}
          {currentUser && myListings.length > 0 && (
            <div className="bg-[#FAF7F2] p-3.5 rounded-2xl border border-stone-200 min-w-[260px]">
              <label className="block text-[11px] font-bold text-stone-700 mb-1">
                Sélectionner votre annonce à sponsoriser :
              </label>
              <select
                value={selectedListingIdForBoost || myListings[0]?.id || ''}
                onChange={(e) => setSelectedListingIdForBoost(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 bg-white font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C15C3D]"
              >
                {myListings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title} ({l.city}) {isListingBoostActive(l) ? '— Déjà Sponsorisé' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {boostOptions.map((opt) => {
            const targetListing =
              myListings.find((l) => l.id === selectedListingIdForBoost) || myListings[0];

            return (
              <div
                key={opt.id}
                className="p-5 rounded-2xl border border-stone-200 hover:border-amber-400 bg-[#FAF7F2]/60 flex flex-col justify-between transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-amber-400 text-stone-950 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 fill-current" /> {opt.badgeLabel}
                    </span>
                    <span className="text-xs font-bold text-stone-500">
                      Durée : {opt.durationDays} jours
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-stone-900">{opt.name}</h3>
                  <div className="text-2xl font-extrabold text-[#C15C3D]">
                    {opt.price} DH
                    <span className="text-xs font-normal text-stone-500">
                      {' '}
                      / {opt.durationDays} jours
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">{opt.description}</p>
                </div>

                <div className="pt-5 mt-4 border-t border-stone-200/70">
                  {!currentUser ? (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="w-full py-2.5 px-4 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-xl text-xs font-bold transition-all"
                    >
                      Se connecter pour sponsoriser
                    </button>
                  ) : targetListing ? (
                    <button
                      type="button"
                      onClick={() => onOpenBoostForListing(targetListing, opt)}
                      className="w-full py-2.5 px-4 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>
                        Choisir « {opt.name} » ({opt.price} DH)
                      </span>
                    </button>
                  ) : (
                    <p className="text-[11px] text-stone-500 text-center">
                      Publiez d’abord une annonce pour pouvoir la mettre en avant.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface BoostListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing | null;
  boostOptions: BoostOption[];
  initialOption?: BoostOption | null;
  onProceedToCheckout: (listing: Listing, option: BoostOption) => void;
}

export const BoostListingModal: React.FC<BoostListingModalProps> = ({
  isOpen,
  onClose,
  listing,
  boostOptions,
  initialOption,
  onProceedToCheckout,
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    initialOption?.id || boostOptions[0]?.id || 'premium'
  );

  if (!isOpen || !listing) return null;

  const currentOpt =
    boostOptions.find((b) => b.id === selectedId) || initialOption || boostOptions[0];

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-stone-200 flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 bg-[#FAF7F2] border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#C15C3D]" />
            <h3 className="font-bold text-base text-stone-900">
              Mettre en avant votre annonce
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center text-stone-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Selected listing summary */}
          <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 flex items-center gap-3">
            <img
              src={listing.images?.[0]}
              alt={listing.title}
              className="w-14 h-14 rounded-xl object-cover shrink-0"
            />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase text-[#1E3D34]">
                {listing.city} • {listing.district}
              </span>
              <h4 className="font-bold text-xs sm:text-sm text-stone-900 truncate">
                {listing.title}
              </h4>
              {isListingBoostActive(listing) && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full mt-1">
                  Actuellement : {listing.boost?.optionName}
                </span>
              )}
            </div>
          </div>

          {/* Options radio cards */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold text-stone-700">
              Choisissez votre formule de mise en avant :
            </label>
            {boostOptions.map((opt) => {
              const isSelected = currentOpt?.id === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setSelectedId(opt.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'border-[#C15C3D] bg-amber-50/50 ring-2 ring-[#C15C3D]/20'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-stone-900">{opt.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-stone-950">
                        {opt.durationDays} jours
                      </span>
                    </div>
                    <p className="text-xs text-stone-600">{opt.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-base font-extrabold text-[#C15C3D]">
                      {opt.price} DH
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-2xl bg-stone-100 text-[11px] text-stone-600 space-y-1">
            <p className="font-bold text-stone-800 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#1E3D34]" /> Règles de transparence Darna :
            </p>
            <p>
              Votre annonce affichera le badge « Sponsorisé » et sera priorisée tout en continuant à respecter les filtres de recherche et la modération.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-100"
            >
              Annuler
            </button>
            {currentOpt && (
              <button
                type="button"
                onClick={() => onProceedToCheckout(listing, currentOpt)}
                className="px-5 py-2.5 rounded-xl bg-[#C15C3D] hover:bg-[#a94f33] text-white text-xs font-bold flex items-center gap-2 shadow-md"
              >
                <CreditCard className="w-4 h-4" />
                <span>Passer au paiement ({currentOpt.price} DH)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export interface CheckoutTarget {
  type: 'subscription' | 'boost';
  optionId: string;
  targetId: string;
  title: string;
  subtitle: string;
  amount: number;
}

interface PaymentCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: CheckoutTarget | null;
  authToken: string | null;
  onPaymentConfirmed: (data: {
    transaction: PaymentTransaction;
    user?: User;
    listing?: Listing;
    message: string;
  }) => void;
}

export const PaymentCheckoutModal: React.FC<PaymentCheckoutModalProps> = ({
  isOpen,
  onClose,
  target,
  authToken,
  onPaymentConfirmed,
}) => {
  const [paymentMethodType, setPaymentMethodType] = useState<'cmi_card' | 'payzone'>('cmi_card');
  const [testScenario, setTestScenario] = useState<'success' | 'failed'>('success');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(
    () => `idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultFeedback, setResultFeedback] = useState<{
    type: 'success' | 'error' | 'duplicate';
    message: string;
    tx?: PaymentTransaction;
  } | null>(null);

  React.useEffect(() => {
    if (isOpen && target) {
      setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      setResultFeedback(null);
      setTestScenario('success');
    }
  }, [isOpen, target]);

  if (!isOpen || !target) return null;

  const executeCheckout = async (customKey?: string) => {
    if (!authToken) return;
    setIsSubmitting(true);
    setResultFeedback(null);

    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          type: target.type,
          optionId: target.optionId,
          targetId: target.targetId,
          idempotencyKey: customKey || idempotencyKey,
          testScenario,
          paymentMethodType,
        }),
      });
      const data = await res.json();

      if (res.status === 409 || data.code === 'DUPLICATE_PAYMENT') {
        setResultFeedback({
          type: 'duplicate',
          message:
            data.message ||
            'Protection anti-double paiement : cette transaction a déjà été confirmée.',
          tx: data.transaction,
        });
      } else if (!res.ok || !data.success) {
        setResultFeedback({
          type: 'error',
          message:
            data.message ||
            'Le paiement a échoué. Aucune option payante n’a été activée.',
          tx: data.transaction,
        });
      } else {
        setResultFeedback({
          type: 'success',
          message: data.message || 'Paiement confirmé en Mode Test !',
          tx: data.transaction,
        });
        onPaymentConfirmed({
          transaction: data.transaction,
          user: data.user,
          listing: data.listing,
          message: data.message,
        });
      }
    } catch (err: any) {
      setResultFeedback({
        type: 'error',
        message: err.message || 'Erreur réseau lors de la vérification du paiement.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-stone-200 flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#1E3D34] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-amber-300" />
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                Paiement Sécurisé en Dirhams (MAD)
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                Mode Test / Bac à sable — CMI & Payzone Maroc
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/80"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Mandatory Test Mode & PCI Warning */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">
                Mode Test clairement indiqué — Aucun débit réel
              </span>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                L’intégration réelle CMI / Payzone Maroc sera activée après validation des clés marchandes de production. Darna ne stocke jamais les numéros complets de cartes bancaires.
              </p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-stone-200 flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                {target.type === 'subscription' ? 'Abonnement mensuel' : 'Mise en avant ponctuelle'}
              </span>
              <h4 className="font-bold text-sm sm:text-base text-stone-900">{target.title}</h4>
              <p className="text-xs text-stone-600">{target.subtitle}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xl font-extrabold text-[#C15C3D]">{target.amount} DH</span>
              <span className="block text-[10px] text-stone-500">TTC (MAD)</span>
            </div>
          </div>

          {/* Payment Method Token Selector (No raw card numbers stored) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-stone-700">
              1. Choisir le canal de paiement marocain (Jeton de test) :
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentMethodType('cmi_card')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  paymentMethodType === 'cmi_card'
                    ? 'border-[#1E3D34] bg-[#1E3D34]/5 ring-1 ring-[#1E3D34]'
                    : 'border-stone-200 hover:bg-stone-50'
                }`}
              >
                <div className="font-bold text-xs text-stone-900">Carte CMI / Visa Maroc</div>
                <div className="text-[11px] text-stone-500 mt-0.5">Jeton Test •••• 4242</div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethodType('payzone')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  paymentMethodType === 'payzone'
                    ? 'border-[#1E3D34] bg-[#1E3D34]/5 ring-1 ring-[#1E3D34]'
                    : 'border-stone-200 hover:bg-stone-50'
                }`}
              >
                <div className="font-bold text-xs text-stone-900">Payzone Maroc</div>
                <div className="text-[11px] text-stone-500 mt-0.5">Jeton Test •••• 1111</div>
              </button>
            </div>
          </div>

          {/* Test Scenario Simulator */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-stone-700">
              2. Scénario du simulateur de paiement :
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setTestScenario('success');
                  setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  testScenario === 'success'
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 ring-1 ring-emerald-600'
                    : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Paiement confirmé</span>
                </div>
                <div className="text-[10px] opacity-80 mt-0.5">
                  Active l’option après confirmation
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTestScenario('failed');
                  setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  testScenario === 'failed'
                    ? 'border-red-600 bg-red-50/70 text-red-950 ring-1 ring-red-600'
                    : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span>Simuler un paiement échoué</span>
                </div>
                <div className="text-[10px] opacity-80 mt-0.5">
                  Vérifie qu’aucune option n’est activée
                </div>
              </button>
            </div>
          </div>

          {/* Feedback message */}
          {resultFeedback && (
            <div
              className={`p-4 rounded-2xl border text-xs space-y-2 ${
                resultFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : resultFeedback.type === 'duplicate'
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-red-50 border-red-200 text-red-950'
              }`}
            >
              <div className="font-bold flex items-center gap-2">
                {resultFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>{resultFeedback.message}</span>
              </div>
              {resultFeedback.tx && (
                <div className="text-[11px] opacity-80">
                  Réf transaction : <strong>{resultFeedback.tx.id}</strong> • Statut :{' '}
                  <strong className="uppercase">{resultFeedback.tx.status}</strong>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            {resultFeedback?.type !== 'success' ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => executeCheckout()}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#C15C3D] hover:bg-[#a94f33] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Traitement sécurisé en cours...'
                    : testScenario === 'failed'
                    ? `Tester l'échec de paiement (${target.amount} DH)`
                    : `Confirmer le paiement Test (${target.amount} DH)`}
                </span>
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => executeCheckout(idempotencyKey)}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tester anti-double paiement</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#1E3D34] hover:bg-[#152c25] text-white font-bold text-xs"
                >
                  Terminer et fermer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
