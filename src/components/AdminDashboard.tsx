import React, { useState } from 'react';
import {
  Shield,
  CheckCircle,
  XCircle,
  EyeOff,
  AlertTriangle,
  Users,
  FileText,
  MapPin,
  Tag,
  Search,
  Filter,
  Check,
  RefreshCw,
  Clock,
  ArrowUpRight,
  CreditCard,
  Sparkles,
  Building2,
  Plus,
  Save,
  RotateCcw,
  TrendingUp
} from 'lucide-react';
import {
  Listing,
  ListingReport,
  User,
  SubscriptionPlan,
  BoostOption,
  PaymentTransaction
} from '../types';
import { formatMAD, calculateRevenueSummary, getUserListingQuota } from '../utils/rentalLogic';

interface AdminDashboardProps {
  listings: Listing[];
  reports: ListingReport[];
  users: User[];
  plans: SubscriptionPlan[];
  boostOptions: BoostOption[];
  transactions: PaymentTransaction[];
  onModerateListing: (
    id: string,
    action: 'approve' | 'reject' | 'hide' | 'expire',
    reason?: string
  ) => Promise<void>;
  onResolveReport: (id: string, action: 'resolve' | 'dismiss') => Promise<void>;
  onSelectListing: (listing: Listing) => void;
  onUpdatePlan: (planId: string, updated: Partial<SubscriptionPlan>) => Promise<void>;
  onCreatePlan: (newPlan: Partial<SubscriptionPlan>) => Promise<void>;
  onUpdateBoostOption: (boostId: string, updated: Partial<BoostOption>) => Promise<void>;
  onRefundTransaction: (txId: string) => Promise<void>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  listings,
  reports,
  users,
  plans,
  boostOptions,
  transactions,
  onModerateListing,
  onResolveReport,
  onSelectListing,
  onUpdatePlan,
  onCreatePlan,
  onUpdateBoostOption,
  onRefundTransaction,
}) => {
  const [activeTab, setActiveTab] = useState<
    'subscriptions' | 'boosts' | 'revenues' | 'pending' | 'reports' | 'allListings' | 'users' | 'cndp'
  >('subscriptions');
  const [filterText, setFilterText] = useState('');
  const [rejectReason, setRejectReason] = useState('Photos floues ou justificatif manquant');
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);

  // Plan editing state
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<{
    name: string;
    price: string;
    maxListings: string;
    featuresText: string;
    isCustomQuote: boolean;
  }>({
    name: '',
    price: '0',
    maxListings: '10',
    featuresText: '',
    isCustomQuote: false,
  });

  // New plan creation state
  const [newPlanForm, setNewPlanForm] = useState({
    name: '',
    price: '299',
    maxListings: '25',
    featuresText: 'Jusqu’à 25 annonces actives\nBadge Professionnel\nSupport dédié',
    isCustomQuote: false,
  });

  // Boost editing state
  const [editingBoostId, setEditingBoostId] = useState<string | null>(null);
  const [boostDraft, setBoostDraft] = useState<{
    name: string;
    price: string;
    durationDays: string;
    description: string;
  }>({
    name: '',
    price: '49',
    durationDays: '7',
    description: '',
  });

  const pendingListings = listings.filter((l) => l.status === 'en_attente');
  const reportedListings = reports.filter((r) => r.status === 'en_attente');
  const revenueSummary = calculateRevenueSummary(transactions);

  const startEditingPlan = (plan: SubscriptionPlan) => {
    setEditingPlanId(plan.id);
    setPlanDraft({
      name: plan.name,
      price: plan.price !== null ? String(plan.price) : '0',
      maxListings: String(plan.maxListings),
      featuresText: plan.features.join('\n'),
      isCustomQuote: Boolean(plan.isCustomQuote || plan.price === null),
    });
  };

  const handleSavePlan = async (planId: string) => {
    await onUpdatePlan(planId, {
      name: planDraft.name,
      price: planDraft.isCustomQuote ? null : Number(planDraft.price) || 0,
      maxListings: Math.max(1, Number(planDraft.maxListings) || 1),
      features: planDraft.featuresText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      isCustomQuote: planDraft.isCustomQuote,
    });
    setEditingPlanId(null);
  };

  const handleCreateNewPlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanForm.name.trim()) return;
    await onCreatePlan({
      name: newPlanForm.name.trim(),
      price: newPlanForm.isCustomQuote ? null : Number(newPlanForm.price) || 0,
      period: 'mois',
      maxListings: Math.max(1, Number(newPlanForm.maxListings) || 5),
      features: newPlanForm.featuresText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      isCustomQuote: newPlanForm.isCustomQuote,
    });
    setNewPlanForm({
      name: '',
      price: '299',
      maxListings: '25',
      featuresText: 'Jusqu’à 25 annonces actives\nBadge Professionnel',
      isCustomQuote: false,
    });
  };

  const startEditingBoost = (opt: BoostOption) => {
    setEditingBoostId(opt.id);
    setBoostDraft({
      name: opt.name,
      price: String(opt.price),
      durationDays: String(opt.durationDays),
      description: opt.description,
    });
  };

  const handleSaveBoost = async (boostId: string) => {
    await onUpdateBoostOption(boostId, {
      name: boostDraft.name,
      price: Math.max(1, Number(boostDraft.price) || 49),
      durationDays: Math.max(1, Number(boostDraft.durationDays) || 7),
      description: boostDraft.description,
    });
    setEditingBoostId(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-stone-900 to-[#1E3D34] text-white p-6 rounded-3xl shadow-lg border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-400 text-stone-900">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold">
              Console d'Administration, Offres & Revenus Darna
            </h1>
          </div>
          <p className="text-xs text-stone-300 mt-1">
            Gestion des abonnements professionnels, options de mise en avant, paiements MAD et modération.
          </p>
        </div>

        {/* Counter Pills */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/10 text-center">
            <span className="block text-lg font-bold text-amber-300">
              {revenueSummary.totalNetRevenue} DH
            </span>
            <span className="text-[10px] uppercase font-semibold text-stone-300">
              Revenu Net (Test)
            </span>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/10 text-center">
            <span className="block text-lg font-bold text-emerald-300">
              {plans.length} offres
            </span>
            <span className="text-[10px] uppercase font-semibold text-stone-300">Abonnements</span>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/10 text-center">
            <span className="block text-lg font-bold text-amber-200">{pendingListings.length}</span>
            <span className="text-[10px] uppercase font-semibold text-stone-300">En attente</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-stone-200">
        {[
          { id: 'subscriptions', label: `Offres & Abonnements (${plans.length})`, icon: Building2 },
          { id: 'boosts', label: `Options Mise en avant (${boostOptions.length})`, icon: Sparkles },
          {
            id: 'revenues',
            label: `Paiements & Revenus (${transactions.length})`,
            icon: CreditCard,
          },
          { id: 'pending', label: `Modération (${pendingListings.length})`, icon: Clock },
          { id: 'reports', label: `Signalements (${reportedListings.length})`, icon: AlertTriangle },
          { id: 'allListings', label: `Annonces (${listings.length})`, icon: FileText },
          { id: 'users', label: `Utilisateurs (${users.length})`, icon: Users },
          { id: 'cndp', label: 'CNDP & Légal', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#1E3D34] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: OFFRES D'ABONNEMENT & ABONNEMENTS ACTIFS */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-8">
          {/* Edit Existing Plans */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-stone-900 text-base">
                  1. Configurer les offres d’abonnement (Prix, Plafond d’annonces & Fonctionnalités)
                </h3>
                <p className="text-xs text-stone-500">
                  Modifiez en temps réel les tarifs en Dirhams (DH / mois), le nombre d’annonces autorisées et les avantages inclus.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const isEditing = editingPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4"
                  >
                    {isEditing ? (
                      <div className="space-y-3 text-xs">
                        <div>
                          <label className="block font-bold text-stone-700 mb-1">
                            Nom de l’offre :
                          </label>
                          <input
                            type="text"
                            value={planDraft.name}
                            onChange={(e) =>
                              setPlanDraft({ ...planDraft, name: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-xl border border-stone-300 font-semibold"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`custom-${plan.id}`}
                            checked={planDraft.isCustomQuote}
                            onChange={(e) =>
                              setPlanDraft({ ...planDraft, isCustomQuote: e.target.checked })
                            }
                          />
                          <label htmlFor={`custom-${plan.id}`} className="font-semibold text-stone-700">
                            Tarif « Sur devis »
                          </label>
                        </div>

                        {!planDraft.isCustomQuote && (
                          <div>
                            <label className="block font-bold text-stone-700 mb-1">
                              Prix mensuel (DH / mois) :
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={planDraft.price}
                              onChange={(e) =>
                                setPlanDraft({ ...planDraft, price: e.target.value })
                              }
                              className="w-full px-3 py-2 rounded-xl border border-stone-300 font-bold text-[#C15C3D]"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block font-bold text-stone-700 mb-1">
                            Nombre d’annonces autorisées :
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={planDraft.maxListings}
                            onChange={(e) =>
                              setPlanDraft({ ...planDraft, maxListings: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-xl border border-stone-300 font-bold"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-stone-700 mb-1">
                            Fonctionnalités (1 par ligne) :
                          </label>
                          <textarea
                            rows={4}
                            value={planDraft.featuresText}
                            onChange={(e) =>
                              setPlanDraft({ ...planDraft, featuresText: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => handleSavePlan(plan.id)}
                            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Enregistrer</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPlanId(null)}
                            className="py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-stone-100 text-[#1E3D34]">
                              {plan.name}
                            </span>
                            <span className="text-xs font-bold text-stone-500">
                              Max : {plan.maxListings} annonces
                            </span>
                          </div>

                          <div className="text-xl font-extrabold text-[#C15C3D]">
                            {plan.isCustomQuote || plan.price === null
                              ? 'Sur devis'
                              : plan.price === 0
                              ? 'Gratuit (0 DH)'
                              : `${plan.price} DH / ${plan.period}`}
                          </div>

                          <ul className="space-y-1 text-xs text-stone-600 pt-2 border-t border-stone-100">
                            {plan.features.map((f, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <button
                          type="button"
                          onClick={() => startEditingPlan(plan)}
                          className="w-full py-2 px-3 rounded-xl border border-stone-300 hover:border-[#C15C3D] text-stone-800 hover:text-[#C15C3D] text-xs font-bold transition-colors mt-3"
                        >
                          Modifier cette offre
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Create a New Subscription Plan */}
          <form
            onSubmit={handleCreateNewPlanSubmit}
            className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 space-y-4 shadow-xs"
          >
            <h4 className="font-bold text-sm text-stone-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#C15C3D]" />
              <span>Créer une nouvelle offre d’abonnement</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Nom de l’offre</label>
                <input
                  type="text"
                  placeholder="Ex: Agence Élite"
                  value={newPlanForm.name}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Prix (DH / mois)</label>
                <input
                  type="number"
                  min={0}
                  disabled={newPlanForm.isCustomQuote}
                  value={newPlanForm.price}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, price: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Annonces autorisées
                </label>
                <input
                  type="number"
                  min={1}
                  value={newPlanForm.maxListings}
                  onChange={(e) =>
                    setNewPlanForm({ ...newPlanForm, maxListings: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-stone-300"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-bold text-stone-700 mb-1">
                Fonctionnalités incluses (1 par ligne)
              </label>
              <textarea
                rows={2}
                value={newPlanForm.featuresText}
                onChange={(e) =>
                  setNewPlanForm({ ...newPlanForm, featuresText: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-stone-300"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-stone-700">
                <input
                  type="checkbox"
                  checked={newPlanForm.isCustomQuote}
                  onChange={(e) =>
                    setNewPlanForm({ ...newPlanForm, isCustomQuote: e.target.checked })
                  }
                />
                <span>Offre sur devis</span>
              </label>

              <button
                type="submit"
                className="px-5 py-2.5 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter l’offre</span>
              </button>
            </div>
          </form>

          {/* Active Subscriptions List */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 space-y-4 shadow-xs">
            <h4 className="font-bold text-sm text-stone-900">
              2. Abonnements actifs des particuliers et agences ({users.length} comptes)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 uppercase text-[10px]">
                    <th className="py-2.5 px-3">Compte / Agence</th>
                    <th className="py-2.5 px-3">Rôle</th>
                    <th className="py-2.5 px-3">Offre Actuelle</th>
                    <th className="py-2.5 px-3">Quota utilisé</th>
                    <th className="py-2.5 px-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {users.map((u) => {
                    const q = getUserListingQuota(u, listings, plans);
                    return (
                      <tr key={u.id}>
                        <td className="py-3 px-3">
                          <div className="font-bold text-stone-900">{u.name}</div>
                          <div className="text-[11px] text-stone-500">{u.email}</div>
                        </td>
                        <td className="py-3 px-3 uppercase font-bold text-[10px] text-stone-600">
                          {u.role}
                        </td>
                        <td className="py-3 px-3 font-extrabold text-[#1E3D34]">
                          {q.planName}
                        </td>
                        <td className="py-3 px-3 font-semibold">
                          {q.usedListings} / {q.maxListings} annonces
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            {u.subscription?.status || 'active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: OPTIONS DE MISE EN AVANT (PRIX & DURÉE) */}
      {activeTab === 'boosts' && (
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-stone-900 text-base">
              Configurer les options de mise en avant (« Sponsorisé »)
            </h3>
            <p className="text-xs text-stone-500">
              Modifiez le tarif en Dirhams (DH) et la durée en jours de chaque formule de sponsorisation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {boostOptions.map((opt) => {
              const isEditing = editingBoostId === opt.id;
              return (
                <div
                  key={opt.id}
                  className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs flex flex-col justify-between space-y-4"
                >
                  {isEditing ? (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block font-bold text-stone-700 mb-1">
                          Intitulé de l’option :
                        </label>
                        <input
                          type="text"
                          value={boostDraft.name}
                          onChange={(e) =>
                            setBoostDraft({ ...boostDraft, name: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 font-bold"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block font-bold text-stone-700 mb-1">
                            Prix (DH) :
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={boostDraft.price}
                            onChange={(e) =>
                              setBoostDraft({ ...boostDraft, price: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-xl border border-stone-300 font-bold text-[#C15C3D]"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-stone-700 mb-1">
                            Durée (jours) :
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={boostDraft.durationDays}
                            onChange={(e) =>
                              setBoostDraft({ ...boostDraft, durationDays: e.target.value })
                            }
                            className="w-full px-3 py-2 rounded-xl border border-stone-300 font-bold"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-stone-700 mb-1">
                          Description :
                        </label>
                        <textarea
                          rows={3}
                          value={boostDraft.description}
                          onChange={(e) =>
                            setBoostDraft({ ...boostDraft, description: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-stone-300"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => handleSaveBoost(opt.id)}
                          className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Enregistrer</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingBoostId(null)}
                          className="py-2 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-amber-400 text-stone-950 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 fill-current" /> {opt.badgeLabel}
                          </span>
                          <span className="text-xs font-bold text-stone-500">
                            {opt.durationDays} jours
                          </span>
                        </div>
                        <h4 className="font-bold text-base text-stone-900">{opt.name}</h4>
                        <div className="text-2xl font-extrabold text-[#C15C3D]">
                          {opt.price} DH{' '}
                          <span className="text-xs font-normal text-stone-500">
                            / {opt.durationDays} jours
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 leading-relaxed">{opt.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => startEditingBoost(opt)}
                        className="w-full py-2 px-3 rounded-xl border border-stone-300 hover:border-[#C15C3D] text-stone-800 hover:text-[#C15C3D] text-xs font-bold transition-colors mt-3"
                      >
                        Modifier le prix ou la durée
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: PAIEMENTS, REMBOURSEMENTS & REVENUS PAR TYPE */}
      {activeTab === 'revenues' && (
        <div className="space-y-6">
          {/* Revenue Cards by Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <span className="text-[11px] font-bold uppercase text-stone-500">
                Revenus Abonnements
              </span>
              <div className="text-2xl font-extrabold text-[#1E3D34]">
                {revenueSummary.subscriptionRevenue} MAD
              </div>
              <p className="text-[11px] text-stone-500">
                Paiements d’abonnements confirmés
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <span className="text-[11px] font-bold uppercase text-stone-500">
                Revenus Mises en avant
              </span>
              <div className="text-2xl font-extrabold text-[#C15C3D]">
                {revenueSummary.boostRevenue} MAD
              </div>
              <p className="text-[11px] text-stone-500">
                Options Premium, Top & Accueil
              </p>
            </div>

            <div className="bg-[#1E3D34] text-white p-5 rounded-2xl shadow-md space-y-1">
              <span className="text-[11px] font-bold uppercase text-emerald-200">
                Revenu Net Total Encaissé
              </span>
              <div className="text-2xl font-extrabold text-amber-300">
                {revenueSummary.totalNetRevenue} MAD
              </div>
              <p className="text-[11px] text-stone-200">
                {revenueSummary.paidTransactionsCount} achat(s) confirmé(s)
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-1">
              <span className="text-[11px] font-bold uppercase text-stone-500">
                Remboursements & Échecs
              </span>
              <div className="text-xl font-extrabold text-stone-800">
                {revenueSummary.refundedTotal} MAD remboursés
              </div>
              <p className="text-[11px] text-stone-500">
                {revenueSummary.refundedTransactionsCount} remboursé(s) •{' '}
                {revenueSummary.failedTransactionsCount} échoué(s)
              </p>
            </div>
          </div>

          {/* All Transactions Table */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-sm text-stone-900">
                  Journal des transactions et statuts de paiement (Mode Test MAD)
                </h4>
                <p className="text-xs text-stone-500">
                  Aucun faux revenu pré-rempli : seules les transactions réellement exécutées apparaissent ici.
                </p>
              </div>
            </div>

            {transactions.length === 0 ? (
              <div className="p-10 text-center bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                <CreditCard className="w-8 h-8 text-stone-300 mx-auto" />
                <p className="text-xs font-bold text-stone-700">
                  Aucune transaction enregistrée pour le moment (0 MAD).
                </p>
                <p className="text-[11px] text-stone-500">
                  Testez la souscription d’un abonnement ou d’une mise en avant depuis la page « Abonnements & Tarifs » pour voir les achats et revenus en temps réel.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-4 rounded-2xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
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
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                          {tx.type === 'subscription' ? 'Abonnement' : 'Mise en avant'}
                        </span>
                        <span className="font-bold text-stone-900">{tx.targetLabel}</span>
                      </div>
                      <p className="text-[11px] text-stone-500">
                        Client : <strong>{tx.userName}</strong> ({tx.userEmail}) •{' '}
                        {tx.paymentMethodLabel} • {new Date(tx.createdAt).toLocaleString('fr-FR')}
                      </p>
                      {tx.failureReason && (
                        <p className="text-[11px] text-red-600 font-medium">
                          Motif : {tx.failureReason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      <span className="text-sm font-extrabold text-[#C15C3D]">
                        {tx.amount} MAD
                      </span>

                      {tx.status === 'paye' && (
                        <button
                          type="button"
                          onClick={() => onRefundTransaction(tx.id)}
                          className="px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1 transition-colors"
                          title="Rembourser ce paiement et révoquer l'option"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Rembourser</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 1: PENDING LISTINGS QUEUE */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-stone-900 text-sm">
              Annonces soumises en attente d'approbation :
            </h3>
            <span className="text-xs text-stone-500">
              Chaque annonce doit respecter les critères de décence, prix réaliste et conformité CNDP.
            </span>
          </div>

          {pendingListings.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-stone-200">
              <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <h4 className="font-bold text-stone-900 text-sm">File de modération vide</h4>
              <p className="text-xs text-stone-500">Toutes les annonces soumises ont été examinées.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {pendingListings.map((listing) => (
                <div
                  key={listing.id}
                  className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs flex flex-col md:flex-row gap-5 items-start justify-between"
                >
                  <div className="flex gap-4 items-start">
                    <img
                      src={listing.images[0] || 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=80'}
                      alt={listing.title}
                      className="w-24 h-24 rounded-xl object-cover shrink-0 border border-stone-200"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                          {listing.category}
                        </span>
                        <span className="text-xs text-stone-400">Réf : {listing.id}</span>
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                          En attente
                        </span>
                      </div>

                      <h4
                        onClick={() => onSelectListing(listing)}
                        className="font-bold text-base text-stone-900 hover:text-[#C15C3D] cursor-pointer mt-1"
                      >
                        {listing.title}
                      </h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        📍 {listing.district}, {listing.city} • Loyer : <strong className="text-[#C15C3D]">{formatMAD(listing.price, listing.period)}</strong>
                      </p>
                      <p className="text-xs text-stone-600 line-clamp-2 mt-2 bg-stone-50 p-2 rounded-lg">
                        {listing.description}
                      </p>

                      <div className="text-[11px] text-stone-500 mt-2 flex items-center gap-3">
                        <span>Annonceur : <strong>{listing.contact.name}</strong> ({listing.contact.type})</span>
                        <span>Tél : {listing.contact.phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Moderation Actions */}
                  <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
                    <button
                      onClick={() => onModerateListing(listing.id, 'approve')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Approuver & Publier</span>
                    </button>

                    <button
                      onClick={() => onModerateListing(listing.id, 'reject', 'Photos non conformes ou prix incohérent.')}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Refuser l'annonce</span>
                    </button>

                    <button
                      onClick={() => onSelectListing(listing)}
                      className="px-4 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Voir la fiche</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <h3 className="font-bold text-stone-900 text-sm">Signalements déposés par les utilisateurs :</h3>

          {reports.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-3xl border border-stone-200">
              <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-xs text-stone-500">Aucun signalement actif.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full uppercase">
                        {report.reason.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-stone-400">
                        {new Date(report.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${report.status === 'en_attente' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-600'}`}>
                        {report.status}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-stone-900 mt-1">
                      {report.listingTitle} (ID : {report.listingId})
                    </h4>
                    <p className="text-xs text-stone-600 mt-0.5 italic">
                      "{report.comment || 'Pas de commentaire supplémentaire'}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onModerateListing(report.listingId, 'hide', `Masquée suite au signalement ${report.id}`)}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Masquer le bien</span>
                    </button>
                    <button
                      onClick={() => onResolveReport(report.id, 'dismiss')}
                      className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold"
                    >
                      Rejeter le signalement
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ALL LISTINGS */}
      {activeTab === 'allListings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-stone-900 text-sm">Gestion de l'ensemble du catalogue :</h3>
            <span className="text-xs text-stone-500">{listings.length} biens répertoriés</span>
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-stone-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF7F2] border-b border-stone-200 text-stone-600 uppercase font-bold text-[10px]">
                <tr>
                  <th className="p-3">Bien</th>
                  <th className="p-3">Ville / Quartier</th>
                  <th className="p-3">Prix</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Vues / Favs</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {listings.map((l) => (
                  <tr key={l.id} className="hover:bg-stone-50">
                    <td className="p-3 font-semibold text-stone-900 max-w-[200px] truncate">
                      {l.title}
                    </td>
                    <td className="p-3 text-stone-600">
                      {l.district}, {l.city}
                    </td>
                    <td className="p-3 font-bold text-[#C15C3D]">
                      {formatMAD(l.price, l.period)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          l.status === 'publiee'
                            ? 'bg-emerald-100 text-emerald-800'
                            : l.status === 'en_attente'
                            ? 'bg-amber-100 text-amber-800'
                            : l.status === 'masquee'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="p-3 text-stone-500">
                      👁️ {l.viewsCount} • ❤️ {l.favoritesCount}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {l.status !== 'publiee' && (
                          <button
                            onClick={() => onModerateListing(l.id, 'approve')}
                            className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            title="Publier"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {l.status !== 'masquee' && (
                          <button
                            onClick={() => onModerateListing(l.id, 'hide')}
                            className="p-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
                            title="Masquer"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onSelectListing(l)}
                          className="p-1 rounded bg-stone-100 text-stone-700 hover:bg-stone-200"
                          title="Voir"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <h3 className="font-bold text-stone-900 text-sm">Comptes utilisateurs enregistrés :</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {users.map((u) => (
              <div key={u.id} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-2">
                <div className="flex items-center gap-3">
                  <img src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'} alt={u.name} className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <h4 className="font-bold text-xs text-stone-900">{u.name}</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 uppercase">
                      {u.role}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-stone-500 space-y-0.5 pt-2 border-t border-stone-100">
                  <div>📧 {u.email}</div>
                  <div>📞 {u.phone}</div>
                  <div>📍 {u.city || 'Maroc'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: CNDP & LEGAL AUDIT */}
      {activeTab === 'cndp' && (
        <div className="bg-white p-6 rounded-3xl border border-stone-200 space-y-4">
          <div className="flex items-center gap-2 text-stone-900 font-bold text-base">
            <Shield className="w-5 h-5 text-[#C15C3D]" />
            <h3>Points de Vigilance Juridique & CNDP (Loi 09-08 au Maroc)</h3>
          </div>

          <div className="text-xs text-stone-700 leading-relaxed space-y-3">
            <p className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-900">
              ⚠️ <strong>Note Juridique Importante avant Mise en Production Réelle :</strong><br />
              La législation marocaine impose des obligations strictes aux éditeurs de plateformes web d'annonces mettant en relation des tiers.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-bold text-stone-900">1. Déclaration CNDP (Loi n° 09-08)</h4>
                <p className="text-stone-600">
                  Avant tout déploiement public avec collecte de données personnelles (nom, téléphone, adresse, CIN), un dossier de notification/déclaration préalable doit être formellement déposé auprès de la Commission Nationale de contrôle de la protection des Données à caractère Personnel (CNDP) à Rabat.
                </p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-bold text-stone-900">2. Rôle d'Hébergeur & Non-Intermédiaire</h4>
                <p className="text-stone-600">
                  Darna agit strictement comme hébergeur de petites annonces au sens légal et ne perçoit pas les loyers ni les dépôts de garantie. Les transactions doivent s'effectuer directement entre bailleur et locataire avec signature d'un bail écrit légalisé (loi 67-12).
                </p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-bold text-stone-900">3. Masquage des Adresses et Téléphones</h4>
                <p className="text-stone-600">
                  Conformément au principe de minimisation des données de la CNDP, notre système permet à tout annonceur de masquer son numéro et son adresse exacte aux simples visiteurs non vérifiés.
                </p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <h4 className="font-bold text-stone-900">4. Droit d'Accès et de Rectification</h4>
                <p className="text-stone-600">
                  Tout utilisateur peut exercer à tout moment ses droits d'accès, d'opposition et de rectification de ses données en s'adressant au délégué à la protection des données Darna à contact@darna.ma.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
