import React, { useState, useEffect, useMemo } from 'react';
import {
  Home,
  Heart,
  MessageSquare,
  User as UserIcon,
  Plus,
  Bell,
  SlidersHorizontal,
  MapPin,
  Building,
  Sparkles,
  Bot,
  Shield,
  Scale,
  Search,
  Globe,
  CheckCircle,
  HelpCircle,
  ChevronRight,
  Filter
} from 'lucide-react';
import { Listing, ListingFilter, User, UserRole, Language, ListingReport } from './types';
import { INITIAL_LISTINGS, INITIAL_USERS, INITIAL_REPORTS } from './data/mockListings';
import { MOROCCAN_CITIES, CATEGORIES_CONFIG } from './data/moroccoLocations';
import { filterAndSortListings, formatMAD } from './utils/rentalLogic';
import { TRANSLATIONS } from './data/translations';
import { ListingCard } from './components/ListingCard';
import { ListingDetailModal } from './components/ListingDetailModal';
import { PostListingWizard } from './components/PostListingWizard';
import { DarnaChatbot } from './components/DarnaChatbot';
import { AdminDashboard } from './components/AdminDashboard';
import { UserProfileModal } from './components/UserProfileModal';
import { LegalAndCndpModal } from './components/LegalAndCndpModal';
import { ReportListingModal } from './components/ReportListingModal';
import { FilterBar } from './components/FilterBar';
import { MoroccoMap } from './components/MoroccoMap';

export default function App() {
  // Global Data State
  const [listings, setListings] = useState<Listing[]>(INITIAL_LISTINGS);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [reports, setReports] = useState<ListingReport[]>(INITIAL_REPORTS);
  const [favorites, setFavorites] = useState<string[]>(['darna-casa-01']);

  // Current User Session (Mock Auth with instant role switcher)
  const [currentUser, setCurrentUser] = useState<User>(INITIAL_USERS[0]);

  // Language & RTL State
  const [lang, setLang] = useState<Language>('fr');
  const t = TRANSLATIONS[lang] || TRANSLATIONS.fr;

  // Navigation / View State
  const [currentView, setCurrentView] = useState<'home' | 'search' | 'admin' | 'favorites'>('home');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Search & Filter State
  const [filters, setFilters] = useState<ListingFilter>({
    category: 'all',
    city: undefined,
    district: undefined,
    priceMax: 50000,
    sortBy: 'recent',
  });

  // Modal Dialogs State
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [isPostWizardOpen, setIsPostWizardOpen] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [reportingListing, setReportingListing] = useState<Listing | null>(null);
  const [showNotificationToast, setShowNotificationToast] = useState(false);

  // Sync RTL with document body
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Fetch listings from server on load
  useEffect(() => {
    fetch('/api/listings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.listings) {
          setListings(data.listings);
        }
      })
      .catch((err) => console.log('Using local seed listings:', err));
  }, []);

  // Filtered Listings
  const filteredListings = useMemo(() => {
    return filterAndSortListings(listings, filters);
  }, [listings, filters]);

  // Featured / Recent Listings for Home View
  const recentListings = useMemo(() => {
    return listings.filter((l) => l.status === 'publiee').slice(0, 6);
  }, [listings]);

  // Favorites Listings List
  const favoriteListingsList = useMemo(() => {
    return listings.filter((l) => favorites.includes(l.id));
  }, [listings, favorites]);

  // Handlers
  const handleToggleFavorite = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCreateListing = async (newListingData: Partial<Listing>) => {
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newListingData,
          userId: currentUser.id,
        }),
      });
      const data = await res.json();
      if (data.success && data.listing) {
        setListings((prev) => [data.listing, ...prev]);
      } else {
        // Fallback local
        const localListing: Listing = {
          ...(newListingData as Listing),
          id: `darna-${Date.now()}`,
          slug: (newListingData.title || 'annonce').toLowerCase().replace(/\s+/g, '-'),
          viewsCount: 0,
          favoritesCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'en_attente',
        };
        setListings((prev) => [localListing, ...prev]);
      }
      setShowNotificationToast(true);
      setTimeout(() => setShowNotificationToast(false), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleModerateListing = async (
    id: string,
    action: 'approve' | 'reject' | 'hide' | 'expire',
    reason?: string
  ) => {
    try {
      await fetch(`/api/listings/${id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
    } catch (err) {
      console.warn('API error, updating locally:', err);
    }

    setListings((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (action === 'approve') return { ...l, status: 'publiee', rejectionReason: undefined };
        if (action === 'reject') return { ...l, status: 'refusee', rejectionReason: reason };
        if (action === 'hide') return { ...l, status: 'masquee', rejectionReason: reason };
        if (action === 'expire') return { ...l, status: 'expiree' };
        return l;
      })
    );
  };

  const handleResolveReport = async (reportId: string, action: 'resolve' | 'dismiss') => {
    try {
      await fetch(`/api/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch (err) {
      console.warn('API error:', err);
    }

    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, status: action === 'dismiss' ? 'rejete' : 'resolu' } : r
      )
    );
  };

  const handleSubmitReport = async (
    listingId: string,
    reason: string,
    comment: string,
    email: string
  ) => {
    const newReport: ListingReport = {
      id: `rep-${Date.now()}`,
      listingId,
      listingTitle: listings.find((l) => l.id === listingId)?.title || 'Annonce',
      reason: reason as any,
      comment,
      reporterEmail: email,
      createdAt: new Date().toISOString(),
      status: 'en_attente',
    };

    setReports((prev) => [newReport, ...prev]);

    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReport),
      });
    } catch (err) {
      console.warn('API report error:', err);
    }
  };

  const handleDeleteListing = async (id: string) => {
    setListings((prev) => prev.filter((l) => l.id !== id));
    try {
      await fetch(`/api/listings/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn(err);
    }
  };

  const handleSwitchUserRole = (newRole: UserRole) => {
    const updated = {
      ...currentUser,
      role: newRole,
      advertiserType: newRole === 'professionnel' ? 'professionnel' : 'particulier',
    };
    setCurrentUser(updated as User);
    if (newRole === 'admin') {
      setCurrentView('admin');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-stone-800 pb-20 sm:pb-8 selection:bg-[#C15C3D]/20 selection:text-[#C15C3D]">
      {/* Toast Notification Banner */}
      {showNotificationToast && (
        <div className="fixed top-4 right-4 z-50 bg-[#1E3D34] text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-500/30 animate-fade-in text-xs sm:text-sm font-semibold">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>Votre annonce a été soumise avec succès ! Elle est transmise à l'équipe de modération.</span>
        </div>
      )}

      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-200/80 px-4 sm:px-8 py-3.5 transition-all">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo matching the phone mockup: terracotta house icon + "Darna" in Playfair serif */}
          <div
            onClick={() => setCurrentView('home')}
            className="flex items-center gap-2 cursor-pointer select-none group"
          >
            <div className="w-9 h-9 rounded-xl bg-[#C15C3D] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <Home className="w-5 h-5 fill-current" />
            </div>
            <span className="text-2xl font-serif-title font-bold text-stone-900 tracking-tight">
              Darna
            </span>
            <span className="hidden sm:inline text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-100 text-[#1E3D34] border border-stone-200">
              Maroc
            </span>
          </div>

          {/* Quick Search on Desktop / Tablet */}
          <div className="hidden md:flex items-center gap-2 max-w-sm flex-1 mx-6">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filters.query || ''}
                onChange={(e) => {
                  setFilters({ ...filters, query: e.target.value });
                  if (currentView !== 'search') setCurrentView('search');
                }}
                placeholder={t.searchPlaceholder}
                className="w-full text-xs pl-9 pr-4 py-2 rounded-full border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-[#C15C3D] focus:bg-white"
              />
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language Switcher */}
            <div className="flex items-center gap-1 text-xs font-semibold bg-stone-100 p-1 rounded-xl">
              <button
                onClick={() => setLang('fr')}
                className={`px-2 py-1 rounded-lg transition-colors ${
                  lang === 'fr' ? 'bg-white text-stone-900 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                FR
              </button>
              <button
                onClick={() => setLang('ar')}
                className={`px-2 py-1 rounded-lg transition-colors ${
                  lang === 'ar' ? 'bg-white text-[#C15C3D] shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                عر
              </button>
              <button
                onClick={() => setLang('en')}
                className={`px-2 py-1 rounded-lg transition-colors ${
                  lang === 'en' ? 'bg-white text-stone-900 shadow-2xs font-bold' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                EN
              </button>
            </div>

            {/* Role Demo Pill */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors"
              title="Changer de rôle pour tester (Visiteur, Particulier, Agence, Admin)"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Rôle : <strong>{currentUser.role}</strong></span>
            </button>

            {/* Notification bell matching mockup */}
            <button
              onClick={() => setShowNotificationToast(true)}
              className="p-2 text-stone-600 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors relative"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="w-2 h-2 rounded-full bg-[#C15C3D] absolute top-1.5 right-1.5"></span>
            </button>

            {/* CTA "+ Déposer une annonce" in warm terracotta pill */}
            <button
              onClick={() => setIsPostWizardOpen(true)}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-full text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>{t.postAd}</span>
            </button>

            {/* Profile Avatar */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="w-9 h-9 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-bold text-xs border border-stone-300 hover:ring-2 hover:ring-[#C15C3D] transition-all"
              title="Mon Compte Darna"
            >
              {currentUser.name.charAt(0)}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-7">
        {/* VIEW 1: HOME VIEW */}
        {currentView === 'home' && (
          <div className="space-y-8 animate-fade-in">
            {/* Hero Section matching the phone mockup: "Trouvez votre prochain chez-vous" */}
            <div className="pt-2 sm:pt-4 space-y-2">
              <h1 className="text-3xl sm:text-5xl font-serif-title font-bold text-[#1E3D34] tracking-tight max-w-xl leading-tight">
                {t.tagline}
              </h1>
              <p className="text-xs sm:text-sm text-stone-600 max-w-lg leading-relaxed">
                {t.subtagline}
              </p>
            </div>

            {/* Search Bar & Category Pills matching Mockup */}
            <FilterBar
              filters={filters}
              onChangeFilters={(newFilters) => {
                setFilters(newFilters);
                setCurrentView('search');
              }}
              onResetFilters={() => setFilters({ category: 'all', priceMax: 50000 })}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              isFilterDrawerOpen={isFilterDrawerOpen}
              onToggleFilterDrawer={() => setIsFilterDrawerOpen((prev) => !prev)}
              totalResultsCount={filteredListings.length}
            />

            {/* Section "Annonces récentes" or Interactive Map on Home */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
                  {viewMode === 'map' ? 'Carte interactive des annonces au Maroc' : t.recentAds}
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
                    className="px-3.5 py-1.5 rounded-xl bg-white border border-stone-200 hover:border-[#C15C3D] text-xs font-bold text-[#1E3D34] flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#C15C3D]" />
                    <span>{viewMode === 'map' ? 'Afficher en grille' : 'Voir sur la carte'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentView('search')}
                    className="text-xs sm:text-sm font-semibold text-[#1E3D34] hover:text-[#C15C3D] flex items-center gap-1 transition-colors"
                  >
                    <span>{t.viewAll}</span>
                  </button>
                </div>
              </div>

              {viewMode === 'map' ? (
                <MoroccoMap
                  listings={filteredListings}
                  selectedListing={selectedListing}
                  onSelectListing={(listing) => setSelectedListing(listing)}
                  center={
                    filters.city
                      ? [
                          MOROCCAN_CITIES.find((c) => c.name.toLowerCase() === filters.city?.toLowerCase())?.lat || 32.2,
                          MOROCCAN_CITIES.find((c) => c.name.toLowerCase() === filters.city?.toLowerCase())?.lng || -6.8,
                        ]
                      : [32.2, -6.8]
                  }
                  zoom={filters.city ? 12 : 6}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {recentListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      isFavorite={favorites.includes(listing.id)}
                      onToggleFavorite={handleToggleFavorite}
                      onClick={() => setSelectedListing(listing)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Mobile Prominent CTA button matching mockup: "+ Déposer une annonce" in large terracotta button */}
            <div className="pt-2 sm:hidden">
              <button
                onClick={() => setIsPostWizardOpen(true)}
                className="w-full py-4 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span>{t.postAd}</span>
              </button>
            </div>

            {/* Moroccan Market Trust & Safety Banner */}
            <div className="bg-gradient-to-br from-[#1E3D34] to-stone-900 text-white p-6 sm:p-8 rounded-3xl shadow-md border border-emerald-950 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-bold border border-white/10">
                    <Shield className="w-3.5 h-3.5" />
                    <span>L'immobilier marocain en toute transparence</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold">
                    Direct propriétaire et agences certifiées, sans mauvaises surprises
                  </h3>
                  <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
                    Darna applique la législation marocaine du bail d'habitation (loi 67-12) et les recommandations de la CNDP. Contactez directement les annonceurs par WhatsApp marocain sans commission intermédiaire.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => setIsChatbotOpen(true)}
                    className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-stone-900 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
                  >
                    <Bot className="w-4 h-4" />
                    <span>Ouvrir l'Assistant IA</span>
                  </button>
                  <button
                    onClick={() => setIsLegalModalOpen(true)}
                    className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold border border-white/20 transition-all"
                  >
                    <span>Guide CNDP & Légal</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: SEARCH & RESULTS VIEW */}
        {currentView === 'search' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-stone-900">
                  Location immobilière au Maroc
                </h1>
                <p className="text-xs text-stone-500 mt-0.5">
                  {filteredListings.length} annonce(s) disponible(s) selon vos critères
                </p>
              </div>

              {/* View toggle button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                  className="px-4 py-2 bg-white border border-stone-200 text-stone-700 hover:border-[#1E3D34] rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all"
                >
                  <span>Basculer sur : <strong>{viewMode === 'list' ? 'Carte du Maroc' : 'Liste'}</strong></span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <FilterBar
              filters={filters}
              onChangeFilters={setFilters}
              onResetFilters={() => setFilters({ category: 'all', priceMax: 50000 })}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              isFilterDrawerOpen={isFilterDrawerOpen}
              onToggleFilterDrawer={() => setIsFilterDrawerOpen((prev) => !prev)}
              totalResultsCount={filteredListings.length}
            />

            {/* List or Map View */}
            {viewMode === 'map' ? (
              <div className="space-y-4">
                <MoroccoMap
                  listings={filteredListings}
                  selectedListing={selectedListing}
                  onSelectListing={(listing) => setSelectedListing(listing)}
                  center={
                    filters.city
                      ? [
                          MOROCCAN_CITIES.find((c) => c.name.toLowerCase() === filters.city?.toLowerCase())?.lat || 31.7917,
                          MOROCCAN_CITIES.find((c) => c.name.toLowerCase() === filters.city?.toLowerCase())?.lng || -7.0926,
                        ]
                      : [31.7917, -7.0926]
                  }
                  zoom={filters.city ? 12 : 6}
                />
              </div>
            ) : (
              <div>
                {filteredListings.length === 0 ? (
                  <div className="p-16 text-center bg-white rounded-3xl border border-stone-200 space-y-3">
                    <Building className="w-12 h-12 text-stone-300 mx-auto" />
                    <h3 className="text-base font-bold text-stone-800">{t.noResults}</h3>
                    <p className="text-xs text-stone-500 max-w-md mx-auto">{t.noResultsSub}</p>
                    <button
                      onClick={() => setFilters({ category: 'all', priceMax: 50000 })}
                      className="px-4 py-2 bg-[#C15C3D] text-white rounded-xl text-xs font-bold hover:bg-[#a94f33]"
                    >
                      {t.resetFilters}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {filteredListings.map((listing) => (
                      <ListingCard
                        key={listing.id}
                        listing={listing}
                        isFavorite={favorites.includes(listing.id)}
                        onToggleFavorite={handleToggleFavorite}
                        onClick={() => setSelectedListing(listing)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: FAVORITES VIEW */}
        {currentView === 'favorites' && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Mes Annonces Favorites</h1>
              <p className="text-xs text-stone-500 mt-0.5">
                Retrouvez facilement les biens que vous avez sauvegardés
              </p>
            </div>

            {favoriteListingsList.length === 0 ? (
              <div className="p-16 text-center bg-white rounded-3xl border border-stone-200 space-y-3">
                <Heart className="w-12 h-12 text-stone-300 mx-auto" />
                <h3 className="text-base font-bold text-stone-800">Aucun favori enregistré</h3>
                <p className="text-xs text-stone-500">
                  Cliquez sur le cœur d'une annonce pour l'ajouter à vos favoris.
                </p>
                <button
                  onClick={() => setCurrentView('search')}
                  className="px-4 py-2 bg-[#C15C3D] text-white rounded-xl text-xs font-bold"
                >
                  Explorer les annonces
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {favoriteListingsList.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    isFavorite={true}
                    onToggleFavorite={handleToggleFavorite}
                    onClick={() => setSelectedListing(listing)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: ADMIN CONSOLE */}
        {currentView === 'admin' && (
          <AdminDashboard
            listings={listings}
            reports={reports}
            users={users}
            onModerateListing={handleModerateListing}
            onResolveReport={handleResolveReport}
            onSelectListing={(listing) => setSelectedListing(listing)}
          />
        )}
      </main>

      {/* FLOATING ACTION BUTTON FOR AI CHATBOT */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-8 z-30">
        <button
          onClick={() => setIsChatbotOpen(true)}
          className="group flex items-center gap-2.5 px-4 py-3 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-full shadow-2xl border border-emerald-500/40 hover:scale-105 transition-all"
        >
          <div className="w-7 h-7 rounded-full bg-amber-400 text-stone-900 flex items-center justify-center font-bold">
            <Bot className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold pr-1">Assistant Darna</span>
          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full text-emerald-200">
            gemini-4-argon
          </span>
        </button>
      </div>

      {/* BOTTOM MOBILE NAVIGATION BAR matching the mockup image */}
      {/* (Accueil, Favoris, Messages, Profil) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 px-6 py-2.5 flex items-center justify-between">
        <button
          onClick={() => setCurrentView('home')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            currentView === 'home' ? 'text-[#1E3D34] font-bold' : 'text-stone-400'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">{t.home}</span>
        </button>

        <button
          onClick={() => setCurrentView('favorites')}
          className={`flex flex-col items-center gap-1 transition-colors ${
            currentView === 'favorites' ? 'text-[#1E3D34] font-bold' : 'text-stone-400'
          }`}
        >
          <Heart className="w-5 h-5" />
          <span className="text-[10px]">{t.favorites}</span>
        </button>

        <button
          onClick={() => setIsChatbotOpen(true)}
          className="flex flex-col items-center gap-1 text-stone-400 hover:text-[#1E3D34] transition-colors"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px]">{t.messages}</span>
        </button>

        <button
          onClick={() => setIsProfileModalOpen(true)}
          className="flex flex-col items-center gap-1 text-stone-400 hover:text-[#1E3D34] transition-colors"
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px]">{t.profile}</span>
        </button>
      </nav>

      {/* ALL MODALS */}
      <ListingDetailModal
        listing={selectedListing}
        isOpen={!!selectedListing}
        onClose={() => setSelectedListing(null)}
        isFavorite={selectedListing ? favorites.includes(selectedListing.id) : false}
        onToggleFavorite={handleToggleFavorite}
        onOpenReport={(listing) => {
          setSelectedListing(null);
          setReportingListing(listing);
        }}
      />

      <PostListingWizard
        isOpen={isPostWizardOpen}
        onClose={() => setIsPostWizardOpen(false)}
        onSubmit={handleCreateListing}
        currentUser={currentUser}
      />

      <DarnaChatbot
        isOpen={isChatbotOpen}
        onClose={() => setIsChatbotOpen(false)}
      />

      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={currentUser}
        onSwitchRole={handleSwitchUserRole}
        myListings={listings.filter((l) => l.userId === currentUser.id)}
        favoriteListings={favoriteListingsList}
        onOpenListing={(listing) => setSelectedListing(listing)}
        onOpenCreateAd={() => setIsPostWizardOpen(true)}
        onDeleteListing={handleDeleteListing}
      />

      <LegalAndCndpModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
      />

      <ReportListingModal
        listing={reportingListing}
        isOpen={!!reportingListing}
        onClose={() => setReportingListing(null)}
        onSubmitReport={handleSubmitReport}
      />
    </div>
  );
}
