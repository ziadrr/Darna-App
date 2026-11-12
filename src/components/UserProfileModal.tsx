import React, { useState } from 'react';
import {
  X,
  Home,
  Heart,
  Plus,
  Trash2,
  Eye,
  FileEdit,
  ArrowRight,
  LogOut,
  CheckCircle2,
  MailCheck,
  Power,
  EyeOff,
  Sparkles,
  CreditCard,
  Building2,
  AlertCircle
} from 'lucide-react';
import {
  Listing,
  User,
  PaymentTransaction,
  SubscriptionPlan
} from '../types';
import {
  formatMAD,
  isListingBoostActive,
  getUserListingQuota
} from '../utils/rentalLogic';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  authToken?: string | null;
  myListings: Listing[];
  allListings: Listing[];
  plans: SubscriptionPlan[];
  myTransactions: PaymentTransaction[];
  favoriteListings: Listing[];
  onOpenListing: (listing: Listing) => void;
  onOpenCreateAd: () => void;
  onEditListing: (listing: Listing) => void;
  onBoostListing: (listing: Listing) => void;
  onOpenPricingPage: () => void;
  onToggleListingStatus: (listing: Listing) => Promise<void>;
  onDeleteListing: (id: string) => Promise<void>;
  onVerifyEmail: () => void;
  onUserUpdated?: (user: User) => void;
  onLogout: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  myListings,
  allListings,
  plans,
  myTransactions,
  favoriteListings,
  onOpenListing,
  onOpenCreateAd,
  onEditListing,
  onBoostListing,
  onOpenPricingPage,
  onToggleListingStatus,
  onDeleteListing,
  onVerifyEmail,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'myAds' | 'subscription' | 'favorites'>('myAds');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'publiee' | 'masquee' | 'en_attente' | 'brouillon'
  >('all');

  if (!isOpen) return null;

  const filteredMyListings = myListings.filter((l) =>
    statusFilter === 'all' ? true : l.status === statusFilter
  );

  const quota = getUserListingQuota(currentUser, allListings, plans);
  const usagePercent = Math.min(100, Math.round((quota.usedListings / Math.max(1, quota.maxListings)) * 100));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-fade-in cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-stone-200 cursor-default"
      >
        {/* Top-Right Close Cross (Always pinned at top right of the opened modal) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le profil"
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white hover:bg-stone-200 border border-stone-200 flex items-center justify-center text-stone-600 hover:text-stone-900 shadow-xs transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 py-5 pr-16 bg-[#FAF7F2] border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#1E3D34] text-white flex items-center justify-center font-bold text-lg shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base text-stone-900">{currentUser.name}</h3>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#C15C3D] text-white uppercase">
                  {currentUser.role}
                </span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#1E3D34]/10 text-[#1E3D34]">
                  Offre : {quota.planName} ({quota.usedListings}/{quota.maxListings} annonces)
                </span>
                {currentUser.emailVerified ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> E-mail vérifié
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 flex items-center gap-1">
                    <MailCheck className="w-3 h-3" /> E-mail non vérifié
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500">
                {currentUser.email} {currentUser.phone ? `• ${currentUser.phone}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-1.5 rounded-xl border border-stone-300 hover:border-red-300 hover:bg-red-50 text-stone-700 hover:text-red-700 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Se déconnecter</span>
          </button>
        </div>

        {/* Simple, Compact Email Verification Bar (opens the 6-box verification modal with automatic send) */}
        {!currentUser.emailVerified && (
          <div className="px-6 py-3 bg-amber-50/70 border-b border-amber-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-stone-800">
              <MailCheck className="w-4 h-4 text-[#C15C3D] shrink-0" />
              <span>
                Vérifiez <strong>{currentUser.email}</strong> avec le code à 6 chiffres ou le lien magique envoyé par e-mail.
              </span>
            </div>
            <button
              type="button"
              onClick={onVerifyEmail}
              className="px-3.5 py-1.5 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-xl text-xs font-bold transition-colors shrink-0"
            >
              Saisir mon code à 6 chiffres
            </button>
          </div>
        )}

        {/* Tab selection */}
        <div className="flex overflow-x-auto border-b border-stone-100 px-6 pt-2 bg-white text-xs font-bold gap-5">
          <button
            onClick={() => setActiveTab('myAds')}
            className={`py-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'myAds'
                ? 'border-[#C15C3D] text-[#C15C3D]'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>Mes annonces ({myListings.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('subscription')}
            className={`py-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'subscription'
                ? 'border-[#C15C3D] text-[#C15C3D]'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Mon Offre & Paiements ({myTransactions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('favorites')}
            className={`py-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'favorites'
                ? 'border-[#C15C3D] text-[#C15C3D]'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Heart className="w-4 h-4" />
            <span>Mes favoris ({favoriteListings.length})</span>
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'myAds' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Status sub-filter */}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {[
                    { id: 'all', label: 'Toutes' },
                    { id: 'publiee', label: 'Publiées' },
                    { id: 'masquee', label: 'Désactivées' },
                    { id: 'brouillon', label: 'Brouillons' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStatusFilter(s.id as any)}
                      className={`px-3 py-1 rounded-xl font-semibold border ${
                        statusFilter === s.id
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onOpenCreateAd();
                  }}
                  className="px-4 py-2 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nouvelle annonce</span>
                </button>
              </div>

              {filteredMyListings.length === 0 ? (
                <div className="p-10 text-center bg-stone-50 rounded-2xl border border-stone-200">
                  <p className="text-xs text-stone-500">Aucune annonce trouvée dans cette section.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMyListings.map((listing) => {
                    const isSponsored = isListingBoostActive(listing);
                    return (
                      <div
                        key={listing.id}
                        className={`p-3.5 bg-white border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs transition-colors ${
                          isSponsored
                            ? 'border-amber-400/90 bg-amber-50/20'
                            : 'border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              listing.images[0] ||
                              'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=200&q=80'
                            }
                            alt={listing.title}
                            className="w-16 h-16 rounded-xl object-cover shrink-0 border border-stone-200"
                          />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              {isSponsored && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-400 text-stone-950 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 fill-current" /> Sponsorisé (
                                  {listing.boost?.optionName})
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  listing.status === 'publiee'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : listing.status === 'masquee'
                                    ? 'bg-stone-200 text-stone-700'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {listing.status === 'publiee'
                                  ? 'Active / Publiée'
                                  : listing.status === 'masquee'
                                  ? 'Désactivée'
                                  : listing.status}
                              </span>
                              <span className="text-[11px] text-stone-400">
                                {listing.district}, {listing.city}
                              </span>
                            </div>
                            <h4 className="font-bold text-xs sm:text-sm text-stone-900 mt-1 line-clamp-1">
                              {listing.title}
                            </h4>
                            <span className="text-xs font-bold text-[#C15C3D]">
                              {formatMAD(listing.price, listing.period)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center">
                          <button
                            onClick={() => onBoostListing(listing)}
                            className="px-2.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-stone-950 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs"
                            title="Mettre en avant cette annonce"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{isSponsored ? 'Sponsorisé' : 'Mettre en avant'}</span>
                          </button>

                          <button
                            onClick={() => {
                              onClose();
                              onOpenListing(listing);
                            }}
                            className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold flex items-center gap-1"
                            title="Consulter"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Voir</span>
                          </button>

                          <button
                            onClick={() => {
                              onClose();
                              onEditListing(listing);
                            }}
                            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-[#C15C3D] border border-amber-200 rounded-xl text-xs font-semibold flex items-center gap-1"
                            title="Modifier l'annonce"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                            <span>Modifier</span>
                          </button>

                          <button
                            onClick={() => onToggleListingStatus(listing)}
                            className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold flex items-center gap-1"
                            title={
                              listing.status === 'publiee'
                                ? "Désactiver temporairement l'annonce"
                                : "Réactiver l'annonce"
                            }
                          >
                            {listing.status === 'publiee' ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>Désactiver</span>
                              </>
                            ) : (
                              <>
                                <Power className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Activer</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => onDeleteListing(listing.id)}
                            className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                            title="Supprimer définitivement l'annonce"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SUBSCRIPTION, QUOTA & PAYMENT HISTORY */}
          {activeTab === 'subscription' && (
            <div className="space-y-5">
              {/* Current Offer & Limits Card */}
              <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-stone-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                      Offre d’abonnement actuelle
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Building2 className="w-5 h-5 text-[#1E3D34]" />
                      <h4 className="text-lg font-extrabold text-stone-900">
                        {quota.planName}
                      </h4>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Actif
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPricingPage();
                    }}
                    className="px-4 py-2.5 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
                  >
                    <span>Voir les offres & Changer d’abonnement</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Usage bar */}
                <div className="space-y-1.5 pt-2 border-t border-stone-200/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-700">
                      Utilisation de votre quota d’annonces :
                    </span>
                    <span className="font-extrabold text-[#1E3D34]">
                      {quota.usedListings} / {quota.maxListings} annonces autorisées
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        !quota.canPublish ? 'bg-red-500' : 'bg-[#1E3D34]'
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  {!quota.canPublish ? (
                    <p className="text-[11px] text-red-700 font-semibold flex items-center gap-1 pt-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Limite atteinte. Passez à une offre supérieure (Agence Starter, Pro ou Business) pour publier davantage d’annonces.
                    </p>
                  ) : (
                    <p className="text-[11px] text-stone-500">
                      Il vous reste {quota.remainingListings} annonce(s) disponible(s) sur votre forfait actuel.
                    </p>
                  )}
                </div>
              </div>

              {/* Payment History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-stone-900">
                    Historique de vos paiements et achats (MAD)
                  </h4>
                  <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                    Mode Test CMI / Payzone
                  </span>
                </div>

                {myTransactions.length === 0 ? (
                  <div className="p-8 text-center bg-stone-50 rounded-2xl border border-stone-200">
                    <CreditCard className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs text-stone-500">
                      Aucun paiement enregistré sur votre compte pour le moment.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {myTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3.5 rounded-2xl bg-white border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                tx.status === 'paye'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : tx.status === 'rembourse'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {tx.status === 'paye'
                                ? 'Payé'
                                : tx.status === 'rembourse'
                                ? 'Remboursé'
                                : tx.status === 'echoue'
                                ? 'Échoué'
                                : 'En attente'}
                            </span>
                            <span className="font-bold text-stone-900">{tx.targetLabel}</span>
                          </div>
                          <p className="text-[11px] text-stone-500">
                            Réf : {tx.id} • {new Date(tx.createdAt).toLocaleString('fr-FR')} •{' '}
                            {tx.paymentMethodLabel}
                          </p>
                        </div>

                        <div className="text-left sm:text-right shrink-0">
                          <span className="text-sm font-extrabold text-[#C15C3D]">
                            {tx.amount} MAD
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'favorites' && (
            <div className="space-y-3">
              {favoriteListings.length === 0 ? (
                <div className="p-10 text-center bg-stone-50 rounded-2xl border border-stone-200">
                  <Heart className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-xs text-stone-500">
                    Vous n'avez pas encore enregistré d'annonces favorites.
                  </p>
                </div>
              ) : (
                favoriteListings.map((listing) => (
                  <div
                    key={listing.id}
                    onClick={() => {
                      onClose();
                      onOpenListing(listing);
                    }}
                    className="p-3 bg-white border border-stone-200 rounded-2xl flex items-center justify-between gap-3 shadow-xs hover:border-[#C15C3D] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={listing.images[0]}
                        alt={listing.title}
                        className="w-14 h-14 rounded-xl object-cover shrink-0"
                      />
                      <div>
                        <h4 className="font-bold text-xs sm:text-sm text-stone-900 line-clamp-1">
                          {listing.title}
                        </h4>
                        <p className="text-[11px] text-stone-500">
                          📍 {listing.district}, {listing.city}
                        </p>
                        <span className="text-xs font-bold text-[#C15C3D]">
                          {formatMAD(listing.price, listing.period)}
                        </span>
                      </div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-stone-400" />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

