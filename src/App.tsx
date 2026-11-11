import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Home,
  Heart,
  MessageSquare,
  User as UserIcon,
  Plus,
  MapPin,
  Building,
  Bot,
  Shield,
  Search,
  CheckCircle,
  LogIn,
  Sparkles,
  CreditCard
} from 'lucide-react';
import {
  Listing,
  ListingFilter,
  User,
  Language,
  ListingReport,
  PendingAction,
  DetectedLocation,
  SubscriptionPlan,
  BoostOption,
  PaymentTransaction
} from './types';
import {
  INITIAL_LISTINGS,
  INITIAL_SUBSCRIPTION_PLANS,
  INITIAL_BOOST_OPTIONS
} from './data/mockListings';
import { MOROCCAN_CITIES } from './data/moroccoLocations';
import {
  filterAndSortListings,
  sanitizeListingForVisitor,
  findNearestMoroccanCity,
  calculateDistanceKm,
  getBoostPriorityWeight
} from './utils/rentalLogic';
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
import { AuthModal } from './components/AuthModal';
import {
  SubscriptionPlansView,
  BoostListingModal,
  PaymentCheckoutModal,
  CheckoutTarget
} from './components/MonetizationComponents';

export default function App() {
  // Global Data State: Visitor default listings have all phone numbers/WhatsApp/emails stripped
  const [listings, setListings] = useState<Listing[]>(() =>
    INITIAL_LISTINGS.filter((l) => l.status === 'publiee').map(sanitizeListingForVisitor)
  );
  // Admin-only collections are never populated in visitor memory
  const [users, setUsers] = useState<User[]>([]);
  const [reports, setReports] = useState<ListingReport[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  // Monetization State (Plans, Boost Options, Transactions)
  const [plans, setPlans] = useState<SubscriptionPlan[]>(INITIAL_SUBSCRIPTION_PLANS);
  const [boostOptions, setBoostOptions] = useState<BoostOption[]>(INITIAL_BOOST_OPTIONS);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [myTransactions, setMyTransactions] = useState<PaymentTransaction[]>([]);
  const [boostingListing, setBoostingListing] = useState<Listing | null>(null);
  const [preselectedBoostOpt, setPreselectedBoostOpt] = useState<BoostOption | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);

  // Auth Session State: Visitor (null) by default
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem('darna_token')
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [authReasonMessage, setAuthReasonMessage] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // Automatic Wi-Fi / IP + GPS Geolocation State
  const [userLocation, setUserLocation] = useState<DetectedLocation>({
    city: 'Casablanca',
    lat: 33.5731,
    lng: -7.5898,
    source: 'wifi_ip',
    accuracyLabel: 'Ville détectée via connexion Wi-Fi / Réseau',
  });
  const [, setIsLocatingGps] = useState(false);
  const [homeProximityMode] = useState<'city' | 'nearest' | 'all'>('city');

  // Language & RTL State
  const [lang, setLang] = useState<Language>('fr');
  const t = TRANSLATIONS[lang] || TRANSLATIONS.fr;

  // Navigation / View State
  const [currentView, setCurrentView] = useState<
    'home' | 'search' | 'pricing' | 'admin' | 'favorites'
  >('home');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Search & Filter State
  const [filters, setFilters] = useState<ListingFilter>({
    category: 'all',
    city: undefined,
    district: undefined,
    priceMax: 50000,
    sortBy: 'recent',
    userLat: 33.5731,
    userLng: -7.5898,
  });

  // Modal Dialogs State
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [isPostWizardOpen, setIsPostWizardOpen] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [reportingListing, setReportingListing] = useState<Listing | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // Sync RTL with document body
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Apply detected coordinates and find closest Moroccan city
  const applyCoordinates = useCallback(
    (lat: number, lng: number, source: 'gps' | 'wifi_ip' | 'manual', customCityName?: string) => {
      const nearest = findNearestMoroccanCity(lat, lng, MOROCCAN_CITIES);
      const matchedCity = customCityName || nearest.city.name;
      const accuracyLabel =
        source === 'gps'
          ? `Position GPS précise (${matchedCity})`
          : source === 'manual'
          ? `Ville sélectionnée : ${matchedCity}`
          : `Ville détectée via Wi-Fi / Réseau (${matchedCity})`;

      setUserLocation((prev) => {
        if (
          prev.city === matchedCity &&
          Math.abs(prev.lat - lat) < 0.01 &&
          Math.abs(prev.lng - lng) < 0.01
        ) {
          return prev;
        }
        return {
          city: matchedCity,
          lat,
          lng,
          source,
          accuracyLabel,
        };
      });
      setFilters((prev) => {
        if (
          prev.userLat !== undefined &&
          prev.userLng !== undefined &&
          Math.abs(prev.userLat - lat) < 0.01 &&
          Math.abs(prev.userLng - lng) < 0.01
        ) {
          return prev;
        }
        return {
          ...prev,
          userLat: lat,
          userLng: lng,
        };
      });
    },
    []
  );

  // Request precise browser GPS / Wi-Fi triangulation
  const requestGpsLocation = useCallback(
    (silent: boolean = false) => {
      if (!('geolocation' in navigator)) {
        if (!silent) {
          showToast('La géolocalisation GPS n’est pas disponible sur cet appareil.');
        }
        return;
      }
      setIsLocatingGps(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocatingGps(false);
          const { latitude, longitude } = pos.coords;
          const nearest = findNearestMoroccanCity(latitude, longitude, MOROCCAN_CITIES);
          if (nearest.distanceKm <= 800) {
            applyCoordinates(latitude, longitude, 'gps', nearest.city.name);
            if (!silent) {
              showToast(`Position GPS activée : annonces autour de ${nearest.city.name} affichées.`);
            }
          } else {
            applyCoordinates(nearest.city.lat, nearest.city.lng, 'gps', nearest.city.name);
            if (!silent) {
              showToast(`Localisation activée : rattachée à ${nearest.city.name} (Maroc).`);
            }
          }
        },
        () => {
          setIsLocatingGps(false);
          if (!silent) {
            showToast('Localisation par Wi-Fi/Réseau maintenue.');
          }
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      );
    },
    [applyCoordinates, showToast]
  );

  // Automatic location detection on app entry (runs once)
  useEffect(() => {
    let mounted = true;
    fetch('/api/locate-ip')
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.success && data.lat && data.lng) {
          const nearest = findNearestMoroccanCity(data.lat, data.lng, MOROCCAN_CITIES);
          const city = nearest.distanceKm <= 800 ? nearest.city.name : 'Casablanca';
          const lat = nearest.distanceKm <= 800 ? data.lat : 33.5731;
          const lng = nearest.distanceKm <= 800 ? data.lng : -7.5898;
          applyCoordinates(lat, lng, 'wifi_ip', city);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [applyCoordinates]);

  // Fetch monetization config (plans & boost options)
  const fetchMonetizationConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/monetization/config');
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.plans)) setPlans(data.plans);
        if (Array.isArray(data.boostOptions)) setBoostOptions(data.boostOptions);
      }
    } catch (err) {
      console.warn('Fallback to default monetization config:', err);
    }
  }, []);

  // Fetch user's payment history and (only if admin) admin monetization/users/reports data
  const fetchPaymentData = useCallback(async (token?: string | null, role?: string) => {
    if (!token) {
      setMyTransactions([]);
      setUsers([]);
      setReports([]);
      return;
    }
    try {
      const myRes = await fetch('/api/payments/my', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const myData = await myRes.json();
      if (myData.success && Array.isArray(myData.transactions)) {
        setMyTransactions(myData.transactions);
      }

      if (role === 'admin') {
        const [admRes, usersRes, reportsRes] = await Promise.all([
          fetch('/api/admin/monetization', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/users', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/reports', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const [admData, usersData, reportsData] = await Promise.all([
          admRes.json(),
          usersRes.json(),
          reportsRes.json(),
        ]);
        if (admData.success) {
          if (Array.isArray(admData.transactions)) setTransactions(admData.transactions);
          if (Array.isArray(admData.plans)) setPlans(admData.plans);
          if (Array.isArray(admData.boostOptions)) setBoostOptions(admData.boostOptions);
        }
        if (usersData.success && Array.isArray(usersData.users)) {
          setUsers(usersData.users);
        }
        if (reportsData.success && Array.isArray(reportsData.reports)) {
          setReports(reportsData.reports);
        }
      }
    } catch (err) {
      console.warn('Error fetching payment data:', err);
    }
  }, []);

  useEffect(() => {
    fetchMonetizationConfig();
  }, [fetchMonetizationConfig]);

  // Fetch listings (sanitized by server based on authToken)
  const fetchListings = useCallback(async (token?: string | null) => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/listings', { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.listings)) {
        setListings(data.listings);
        return data.listings as Listing[];
      }
    } catch (err) {
      console.warn('Fallback to sanitized local listings:', err);
    }
    return null;
  }, []);

  // Restore session on mount if token exists
  useEffect(() => {
    if (authToken) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user) {
            setCurrentUser(data.user);
            setFavorites(data.user.favorites || []);
            fetchListings(authToken);
            fetchPaymentData(authToken, data.user.role);
          } else {
            localStorage.removeItem('darna_token');
            setAuthToken(null);
            setCurrentUser(null);
            fetchListings(null);
          }
        })
        .catch(() => {
          fetchListings(null);
        });
    } else {
      fetchListings(null);
    }
  }, [authToken, fetchListings, fetchPaymentData]);

  // Open listing from URL query parameter ?annonce=id if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const annonceId = params.get('annonce');
    if (annonceId && listings.length > 0 && !selectedListing) {
      const found = listings.find((l) => l.id === annonceId);
      if (found) setSelectedListing(found);
    }
  }, [listings, selectedListing]);

  // Keep selectedListing synchronized when listings update (e.g. after login reveals contact info)
  useEffect(() => {
    if (selectedListing) {
      const updated = listings.find((l) => l.id === selectedListing.id);
      if (updated) {
        setSelectedListing(updated);
      }
    }
  }, [listings, selectedListing]);

  // Require authentication helper
  const requireAuth = (action: PendingAction, customReason?: string) => {
    setPendingAction(action);
    setAuthInitialMode('login');
    setAuthReasonMessage(customReason);
    setIsAuthModalOpen(true);
  };

  // Handle successful login or registration and return user to pendingAction
  const handleAuthSuccess = async (user: User, token: string) => {
    localStorage.setItem('darna_token', token);
    setAuthToken(token);
    setCurrentUser(user);
    setFavorites(user.favorites || []);
    setIsAuthModalOpen(false);

    const updatedListings = await fetchListings(token);
    await fetchPaymentData(token, user.role);

    if (pendingAction) {
      if (pendingAction.type === 'post_ad') {
        setEditingListing(null);
        setIsPostWizardOpen(true);
      } else if (pendingAction.type === 'contact') {
        const target =
          (updatedListings || listings).find((l) => l.id === pendingAction.listingId) || null;
        if (target) {
          setSelectedListing(target);
        }
      } else if (pendingAction.type === 'favorite') {
        const id = pendingAction.listingId;
        setFavorites((prev) => (prev.includes(id) ? prev : [...prev, id]));
        fetch('/api/auth/favorites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ listingId: id }),
        }).catch(() => {});
        showToast('Annonce enregistrée dans vos favoris !');
      } else if (pendingAction.type === 'subscribe') {
        const plan = plans.find((p) => p.id === pendingAction.planId);
        if (plan && plan.price !== null) {
          setCheckoutTarget({
            type: 'subscription',
            optionId: plan.id,
            targetId: plan.id,
            title: `Abonnement ${plan.name}`,
            subtitle: `Jusqu’à ${plan.maxListings} annonces actives / ${plan.period}`,
            amount: plan.price,
          });
        }
      } else if (pendingAction.type === 'boost') {
        const target =
          (updatedListings || listings).find((l) => l.id === pendingAction.listingId) || null;
        if (target) {
          setBoostingListing(target);
        }
      }
      setPendingAction(null);
    } else {
      showToast(`Bienvenue sur Darna, ${user.firstName || user.name} !`);
    }
  };

  const handleLogout = async () => {
    if (authToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
    localStorage.removeItem('darna_token');
    setAuthToken(null);
    setCurrentUser(null);
    setFavorites([]);
    setMyTransactions([]);
    setIsProfileModalOpen(false);
    if (currentView === 'admin') setCurrentView('home');
    await fetchListings(null);
    showToast('Vous êtes déconnecté.');
  };

  // Filtered Listings for Search view
  const filteredListings = useMemo(() => {
    return filterAndSortListings(listings, {
      ...filters,
      userLat: userLocation.lat,
      userLng: userLocation.lng,
    });
  }, [listings, filters, userLocation.lat, userLocation.lng]);

  // Smart Geolocation + Homepage Sponsored Listings for Home View
  const homeDisplayedListings = useMemo(() => {
    const published = listings.filter((l) => l.status === 'publiee');
    const sortWithSponsoredAndProximity = (arr: Listing[]) =>
      [...arr].sort((a, b) => {
        const boostDiff = getBoostPriorityWeight(b) - getBoostPriorityWeight(a);
        if (boostDiff !== 0) return boostDiff;
        return (
          calculateDistanceKm(userLocation.lat, userLocation.lng, a.latitude, a.longitude) -
          calculateDistanceKm(userLocation.lat, userLocation.lng, b.latitude, b.longitude)
        );
      });

    if (homeProximityMode === 'city') {
      // Homepage-sponsored listings appear first, followed by same-city listings, then nearest
      const homepageBoosted = published.filter(
        (l) => getBoostPriorityWeight(l) >= 3
      );
      const inCity = sortWithSponsoredAndProximity(
        published.filter(
          (l) =>
            l.city.toLowerCase() === userLocation.city.toLowerCase() &&
            !homepageBoosted.some((hb) => hb.id === l.id)
        )
      );
      const othersSortedByDist = sortWithSponsoredAndProximity(
        published.filter(
          (l) =>
            l.city.toLowerCase() !== userLocation.city.toLowerCase() &&
            !homepageBoosted.some((hb) => hb.id === l.id)
        )
      );
      return [...homepageBoosted, ...inCity, ...othersSortedByDist].slice(0, 6);
    }
    if (homeProximityMode === 'nearest') {
      return sortWithSponsoredAndProximity(published).slice(0, 6);
    }
    return published.slice(0, 6);
  }, [listings, homeProximityMode, userLocation.city, userLocation.lat, userLocation.lng]);

  // Favorites Listings List
  const favoriteListingsList = useMemo(() => {
    return listings.filter((l) => favorites.includes(l.id));
  }, [listings, favorites]);

  // Handlers
  const handleToggleFavorite = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) {
      requireAuth(
        { type: 'favorite', listingId: id },
        'Connectez-vous pour sauvegarder vos annonces favorites dans votre espace personnel.'
      );
      return;
    }
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    if (authToken) {
      fetch('/api/auth/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ listingId: id }),
      }).catch(() => {});
    }
  };

  const handleOpenPostAd = () => {
    if (!currentUser) {
      requireAuth(
        { type: 'post_ad' },
        'Un compte est requis pour publier et gérer vos annonces immobilières.'
      );
      return;
    }
    setEditingListing(null);
    setIsPostWizardOpen(true);
  };

  const handleSaveListing = async (listingData: Partial<Listing>, editingId?: string) => {
    if (!currentUser || !authToken) {
      requireAuth({ type: 'post_ad' });
      return;
    }

    try {
      if (editingId) {
        const res = await fetch(`/api/listings/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(listingData),
        });
        const data = await res.json();
        if (data.success && data.listing) {
          setListings((prev) =>
            prev.map((l) => (l.id === editingId ? data.listing : l))
          );
          showToast('Votre annonce a été mise à jour avec succès !');
        }
      } else {
        const res = await fetch('/api/listings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(listingData),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(
            data.message ||
              'Impossible de publier l’annonce. Vérifiez la limite de votre abonnement.'
          );
          if (data.code === 'QUOTA_EXCEEDED') {
            setIsPostWizardOpen(false);
            setCurrentView('pricing');
          }
          return;
        }
        if (data.listing) {
          setListings((prev) => [data.listing, ...prev]);
          showToast('Votre annonce a été publiée avec succès !');
        }
      }
      setEditingListing(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleListingStatus = async (listing: Listing) => {
    if (!currentUser || !authToken) return;
    const nextStatus = listing.status === 'publiee' ? 'masquee' : 'publiee';
    try {
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success && data.listing) {
        setListings((prev) =>
          prev.map((l) => (l.id === listing.id ? data.listing : l))
        );
        showToast(
          nextStatus === 'publiee'
            ? 'Annonce réactivée et visible par le public.'
            : 'Annonce désactivée temporairement.'
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteListing = async (id: string) => {
    if (!currentUser || !authToken) return;
    try {
      const res = await fetch(`/api/listings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        setListings((prev) => prev.filter((l) => l.id !== id));
        showToast('Annonce supprimée définitivement.');
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const handleVerifyEmail = async () => {
    if (!authToken) return;
    try {
      const reqRes = await fetch('/api/auth/request-email-verification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const reqData = await reqRes.json();
      if (!reqData.success || !reqData.devVerificationToken) {
        showToast(
          reqData.message ||
            'Un jeton de vérification e-mail est requis (serveur SMTP requis en production).'
        );
        return;
      }

      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ verificationToken: reqData.devVerificationToken }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setCurrentUser(data.user);
        showToast('Votre adresse e-mail est désormais vérifiée par jeton cryptographique !');
      } else {
        showToast(data.message || 'Jeton de vérification e-mail invalide.');
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const handleModerateListing = async (
    id: string,
    action: 'approve' | 'reject' | 'hide' | 'expire',
    reason?: string
  ) => {
    if (!authToken || currentUser?.role !== 'admin') return;
    try {
      const res = await fetch(`/api/listings/${id}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.listing) {
        setListings((prev) => prev.map((l) => (l.id === id ? data.listing : l)));
      }
    } catch (err) {
      console.warn('API error:', err);
    }
  };

  const handleResolveReport = async (reportId: string, action: 'resolve' | 'dismiss') => {
    if (!authToken || currentUser?.role !== 'admin') return;
    try {
      const res = await fetch(`/api/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.report) {
        setReports((prev) => prev.map((r) => (r.id === reportId ? data.report : r)));
      }
    } catch (err) {
      console.warn('API error:', err);
    }
  };

  const handleSubmitReport = async (
    listingId: string,
    reason: string,
    comment: string,
    email: string
  ) => {
    const newReportPayload = {
      listingId,
      listingTitle: listings.find((l) => l.id === listingId)?.title || 'Annonce',
      reason: reason as any,
      comment,
      reporterEmail: email,
    };

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReportPayload),
      });
      const data = await res.json();
      if (data.success && data.report && currentUser?.role === 'admin') {
        setReports((prev) => [data.report, ...prev]);
      }
      showToast('Merci. Votre signalement a été transmis à notre équipe.');
    } catch (err) {
      console.warn('API report error:', err);
    }
  };

  // Monetization & Payment Handlers
  const handleSelectSubscriptionPlan = (plan: SubscriptionPlan) => {
    if (!currentUser) {
      requireAuth(
        { type: 'subscribe', planId: plan.id },
        `Connectez-vous ou créez un compte pour souscrire à l'offre « ${plan.name} ».`
      );
      return;
    }
    if (plan.price === null || plan.isCustomQuote) return;
    setCheckoutTarget({
      type: 'subscription',
      optionId: plan.id,
      targetId: plan.id,
      title: `Abonnement ${plan.name}`,
      subtitle: `Jusqu’à ${plan.maxListings} annonces actives / ${plan.period}`,
      amount: plan.price,
    });
  };

  const handleOpenBoostForListing = (listing: Listing, preselected?: BoostOption) => {
    if (!currentUser) {
      requireAuth(
        { type: 'boost', listingId: listing.id, optionId: preselected?.id },
        'Connectez-vous pour mettre en avant votre annonce.'
      );
      return;
    }
    setPreselectedBoostOpt(preselected || null);
    setBoostingListing(listing);
  };

  const handleProceedBoostToCheckout = (listing: Listing, option: BoostOption) => {
    setBoostingListing(null);
    setCheckoutTarget({
      type: 'boost',
      optionId: option.id,
      targetId: listing.id,
      title: option.name,
      subtitle: `Annonce : ${listing.title} (${option.durationDays} jours)`,
      amount: option.price,
    });
  };

  const handlePaymentConfirmed = async (data: {
    transaction: PaymentTransaction;
    user?: User;
    listing?: Listing;
    message: string;
  }) => {
    if (data.user) {
      setCurrentUser(data.user);
      setUsers((prev) => prev.map((u) => (u.id === data.user!.id ? data.user! : u)));
    }
    if (data.listing) {
      setListings((prev) => prev.map((l) => (l.id === data.listing!.id ? data.listing! : l)));
    }
    setTransactions((prev) => [data.transaction, ...prev]);
    setMyTransactions((prev) => [data.transaction, ...prev]);
    showToast(data.message);
    await fetchPaymentData(authToken, data.user?.role || currentUser?.role);
  };

  // Admin Monetization Handlers
  const handleAdminUpdatePlan = async (planId: string, updated: Partial<SubscriptionPlan>) => {
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.plans)) {
        setPlans(data.plans);
        showToast(`L'offre « ${data.plan.name} » a été mise à jour avec succès.`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminCreatePlan = async (newPlan: Partial<SubscriptionPlan>) => {
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(newPlan),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.plans)) {
        setPlans(data.plans);
        showToast(`Nouvelle offre « ${data.plan.name} » créée !`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminUpdateBoostOption = async (
    boostId: string,
    updated: Partial<BoostOption>
  ) => {
    try {
      const res = await fetch(`/api/admin/boost-options/${boostId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.boostOptions)) {
        setBoostOptions(data.boostOptions);
        showToast(`L'option « ${data.boostOption.name} » a été mise à jour.`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminRefundTransaction = async (txId: string) => {
    try {
      const res = await fetch(`/api/payments/${txId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Transaction remboursée avec succès.');
        await fetchListings(authToken);
        await fetchPaymentData(authToken, currentUser?.role);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-stone-800 pb-20 sm:pb-8 selection:bg-[#C15C3D]/20 selection:text-[#C15C3D]">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-[#1E3D34] text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-500/30 animate-fade-in text-xs sm:text-sm font-semibold">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/80 px-4 sm:px-8 py-3 transition-all">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Zone 1: Brand Logo */}
          <button
            type="button"
            onClick={() => setCurrentView('home')}
            className="flex items-center gap-2.5 cursor-pointer select-none group shrink-0 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[#C15C3D] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <Home className="w-5 h-5 fill-current" />
            </div>
            <span className="text-2xl font-serif-title font-bold text-stone-900 tracking-tight whitespace-nowrap">
              Darna
            </span>
          </button>

          {/* Zone 2: Clean Centered Primary Navigation Links */}
          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-1 bg-stone-100/90 p-1.5 rounded-full border border-stone-200/80 shrink-0"
          >
            <button
              type="button"
              onClick={() => setCurrentView('home')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                currentView === 'home'
                  ? 'bg-white text-[#1E3D34] shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {t.home}
            </button>

            <button
              type="button"
              onClick={() => setCurrentView('search')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                currentView === 'search'
                  ? 'bg-white text-[#1E3D34] shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Explorer
            </button>

            <button
              type="button"
              onClick={() => setCurrentView('pricing')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                currentView === 'pricing'
                  ? 'bg-[#1E3D34] text-white shadow-2xs'
                  : 'text-stone-700 hover:text-[#1E3D34] hover:bg-white/60'
              }`}
            >
              <Sparkles
                className={`w-3.5 h-3.5 shrink-0 ${
                  currentView === 'pricing' ? 'text-amber-300' : 'text-[#C15C3D]'
                }`}
              />
              <span>Abonnements & Tarifs</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentView('favorites')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                currentView === 'favorites'
                  ? 'bg-white text-[#1E3D34] shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {t.favorites}
            </button>

            {currentUser?.role === 'admin' && (
              <button
                type="button"
                onClick={() => setCurrentView('admin')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  currentView === 'admin'
                    ? 'bg-stone-900 text-amber-300 shadow-2xs'
                    : 'text-stone-700 hover:text-stone-900 hover:bg-white/60'
                }`}
              >
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>Admin</span>
              </button>
            )}
          </nav>

          {/* Zone 3: Header Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Language Switcher */}
            <div className="hidden lg:flex items-center gap-0.5 text-xs font-semibold bg-stone-100 p-1 rounded-xl border border-stone-200/60 shrink-0">
              <button
                type="button"
                onClick={() => setLang('fr')}
                className={`px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
                  lang === 'fr'
                    ? 'bg-white text-stone-900 shadow-2xs font-bold'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                FR
              </button>
              <button
                type="button"
                onClick={() => setLang('ar')}
                className={`px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
                  lang === 'ar'
                    ? 'bg-white text-[#C15C3D] shadow-2xs font-bold'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                عر
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2 py-1 rounded-lg transition-colors whitespace-nowrap ${
                  lang === 'en'
                    ? 'bg-white text-stone-900 shadow-2xs font-bold'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                EN
              </button>
            </div>

            {/* CTA "+ Déposer une annonce" */}
            <button
              type="button"
              onClick={handleOpenPostAd}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-full text-xs font-bold shadow-sm hover:shadow-md transition-all active:scale-95 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
              <span>{t.postAd}</span>
            </button>

            {/* Auth / Profile Button */}
            {currentUser ? (
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold border border-stone-300 transition-all whitespace-nowrap shrink-0"
                title="Mon espace personnel Darna"
              >
                <div className="w-6 h-6 rounded-full bg-[#1E3D34] text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                  {currentUser.name.charAt(0)}
                </div>
                <span className="hidden sm:inline max-w-[110px] truncate">
                  {currentUser.firstName || currentUser.name}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPendingAction(null);
                  setAuthReasonMessage(undefined);
                  setAuthInitialMode('login');
                  setIsAuthModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 text-xs font-bold shadow-2xs transition-all whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5 text-[#C15C3D] shrink-0" />
                <span>Se connecter</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-7">
        {/* VIEW 1: HOME VIEW */}
        {currentView === 'home' && (
          <div className="space-y-7 animate-fade-in">
            {/* Hero Section */}
            <div className="pt-2 sm:pt-4 space-y-2">
              <h1 className="text-3xl sm:text-5xl font-serif-title font-bold text-[#1E3D34] tracking-tight max-w-xl leading-tight">
                {t.tagline}
              </h1>
              <p className="text-xs sm:text-sm text-stone-600 max-w-lg leading-relaxed">
                {t.subtagline}
              </p>
            </div>

            {/* Search Bar & Category Pills */}
            <FilterBar
              filters={filters}
              onChangeFilters={(newFilters) => {
                setFilters(newFilters);
                setCurrentView('search');
              }}
              onResetFilters={() =>
                setFilters({
                  category: 'all',
                  priceMax: 50000,
                  sortBy: 'recent',
                  userLat: userLocation.lat,
                  userLng: userLocation.lng,
                })
              }
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              isFilterDrawerOpen={isFilterDrawerOpen}
              onToggleFilterDrawer={() => setIsFilterDrawerOpen((prev) => !prev)}
              totalResultsCount={filteredListings.length}
            />

            {/* Section "Annonces récentes" (silently prioritized by user's city & proximity) or Interactive Map */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-stone-900">
                  {viewMode === 'map'
                    ? 'Carte interactive des annonces au Maroc'
                    : t.recentAds}
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
                    className="px-3.5 py-1.5 rounded-xl bg-white border border-stone-200 hover:border-[#C15C3D] text-xs font-bold text-[#1E3D34] flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#C15C3D]" />
                    <span>
                      {viewMode === 'map' ? 'Afficher en grille' : 'Voir sur la carte'}
                    </span>
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
                  center={[userLocation.lat, userLocation.lng]}
                  zoom={11}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {homeDisplayedListings.map((listing) => (
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

            {/* Mobile Prominent CTA button */}
            <div className="pt-2 sm:hidden">
              <button
                type="button"
                onClick={handleOpenPostAd}
                className="w-full py-4 bg-[#C15C3D] hover:bg-[#a94f33] text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
                <span>{t.postAd}</span>
              </button>
            </div>

            {/* Clean Dedicated Section for Professional Subscriptions & Boosts */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2 text-xs font-bold text-[#C15C3D]">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Particuliers, Agences Immobilières & Promoteurs</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-stone-900">
                  Abonnements professionnels & Mise en avant des annonces
                </h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                  Découvrez nos formules adaptées au marché marocain : offre Particulier gratuite, abonnements Agence dès 199 DH / mois et options de visibilité « Sponsorisé » dès 49 DH.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setCurrentView('pricing')}
                  className="px-5 py-3 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all whitespace-nowrap"
                >
                  <CreditCard className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>Consulter les abonnements & tarifs</span>
                </button>
              </div>
            </div>

            {/* Moroccan Market Trust & Safety Banner */}
            <div className="bg-gradient-to-br from-[#1E3D34] to-stone-900 text-white p-6 sm:p-8 rounded-3xl shadow-md border border-emerald-950 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-bold border border-white/10">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Location immobilière en toute prudence</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold">
                    Mise en relation directe entre particuliers et professionnels au Maroc
                  </h3>
                  <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
                    Darna protège les coordonnées des annonceurs conformément à la loi 09-08 (CNDP) et informe sur la législation marocaine du bail (loi 67-12). Rappel de prudence : ne versez jamais d'argent avant d'avoir visité le bien et vérifié les justificatifs.
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

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                  className="px-4 py-2 bg-white border border-stone-200 text-stone-700 hover:border-[#1E3D34] rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-all"
                >
                  <span>
                    Basculer sur :{' '}
                    <strong>{viewMode === 'list' ? 'Carte du Maroc' : 'Liste'}</strong>
                  </span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <FilterBar
              filters={filters}
              onChangeFilters={setFilters}
              onResetFilters={() =>
                setFilters({
                  category: 'all',
                  priceMax: 50000,
                  sortBy: 'recent',
                  userLat: userLocation.lat,
                  userLng: userLocation.lng,
                })
              }
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
                          MOROCCAN_CITIES.find(
                            (c) => c.name.toLowerCase() === filters.city?.toLowerCase()
                          )?.lat || userLocation.lat,
                          MOROCCAN_CITIES.find(
                            (c) => c.name.toLowerCase() === filters.city?.toLowerCase()
                          )?.lng || userLocation.lng,
                        ]
                      : [userLocation.lat, userLocation.lng]
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
                    <p className="text-xs text-stone-500 max-w-md mx-auto">
                      {t.noResultsSub}
                    </p>
                    <button
                      onClick={() =>
                        setFilters({
                          category: 'all',
                          priceMax: 50000,
                          sortBy: 'recent',
                          userLat: userLocation.lat,
                          userLng: userLocation.lng,
                        })
                      }
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
                        userLocation={userLocation}
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
                Retrouvez facilement les biens que vous avez sauvegardés dans votre compte
              </p>
            </div>

            {!currentUser ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-stone-200 space-y-3">
                <Heart className="w-12 h-12 text-stone-300 mx-auto" />
                <h3 className="text-base font-bold text-stone-800">
                  Créez un compte ou connectez-vous pour continuer.
                </h3>
                <p className="text-xs text-stone-500 max-w-md mx-auto">
                  Enregistrez vos annonces coup de cœur de façon permanente pour les retrouver sur tous vos appareils.
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      setAuthInitialMode('register');
                      setIsAuthModalOpen(true);
                    }}
                    className="px-4 py-2.5 bg-[#C15C3D] text-white rounded-xl text-xs font-bold"
                  >
                    Créer un compte
                  </button>
                  <button
                    onClick={() => {
                      setAuthInitialMode('login');
                      setIsAuthModalOpen(true);
                    }}
                    className="px-4 py-2.5 bg-[#1E3D34] text-white rounded-xl text-xs font-bold"
                  >
                    Se connecter
                  </button>
                </div>
              </div>
            ) : favoriteListingsList.length === 0 ? (
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
                    userLocation={userLocation}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3.5: PRICING, PROFESSIONAL SUBSCRIPTIONS & PAID BOOSTS */}
        {currentView === 'pricing' && (
          <SubscriptionPlansView
            plans={plans}
            boostOptions={boostOptions}
            currentUser={currentUser}
            myListings={
              currentUser ? listings.filter((l) => l.userId === currentUser.id) : []
            }
            onSelectPlan={handleSelectSubscriptionPlan}
            onOpenBoostForListing={handleOpenBoostForListing}
            onOpenAuth={() => {
              setPendingAction(null);
              setAuthInitialMode('login');
              setIsAuthModalOpen(true);
            }}
          />
        )}

        {/* VIEW 4: ADMIN CONSOLE */}
        {currentView === 'admin' && currentUser?.role === 'admin' && (
          <AdminDashboard
            listings={listings}
            reports={reports}
            users={users}
            plans={plans}
            boostOptions={boostOptions}
            transactions={transactions}
            onModerateListing={handleModerateListing}
            onResolveReport={handleResolveReport}
            onSelectListing={(listing) => setSelectedListing(listing)}
            onUpdatePlan={handleAdminUpdatePlan}
            onCreatePlan={handleAdminCreatePlan}
            onUpdateBoostOption={handleAdminUpdateBoostOption}
            onRefundTransaction={handleAdminRefundTransaction}
          />
        )}
      </main>

      {/* FLOATING ACTION BUTTON FOR ASSISTANT */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-30">
        <button
          type="button"
          onClick={() => setIsChatbotOpen(true)}
          aria-label="Ouvrir l'assistant Darna"
          className="group flex items-center gap-2 p-3 sm:px-4 sm:py-2.5 bg-[#1E3D34] hover:bg-[#152c25] text-white rounded-full shadow-lg border border-emerald-500/30 hover:scale-105 transition-all"
        >
          <div className="w-6 h-6 rounded-full bg-amber-400 text-stone-900 flex items-center justify-center font-bold shrink-0">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <span className="hidden sm:inline text-xs font-bold pr-1 whitespace-nowrap">
            Assistant Darna
          </span>
        </button>
      </div>

      {/* BOTTOM MOBILE NAVIGATION BAR */}
      <nav
        aria-label="Navigation mobile"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 px-2 py-2 flex items-center justify-around"
      >
        <button
          type="button"
          onClick={() => setCurrentView('home')}
          className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${
            currentView === 'home' ? 'text-[#1E3D34] font-bold' : 'text-stone-500'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] whitespace-nowrap">{t.home}</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('search')}
          className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${
            currentView === 'search' ? 'text-[#1E3D34] font-bold' : 'text-stone-500'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] whitespace-nowrap">Explorer</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('pricing')}
          className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${
            currentView === 'pricing' ? 'text-[#C15C3D] font-bold' : 'text-stone-500'
          }`}
        >
          <CreditCard className="w-5 h-5" />
          <span className="text-[10px] whitespace-nowrap">Tarifs & Pro</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('favorites')}
          className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${
            currentView === 'favorites' ? 'text-[#1E3D34] font-bold' : 'text-stone-500'
          }`}
        >
          <Heart className="w-5 h-5" />
          <span className="text-[10px] whitespace-nowrap">{t.favorites}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (currentUser) {
              setIsProfileModalOpen(true);
            } else {
              setPendingAction(null);
              setIsAuthModalOpen(true);
            }
          }}
          className="flex-1 flex flex-col items-center gap-1 py-1 text-stone-500 hover:text-[#1E3D34] transition-colors"
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] whitespace-nowrap">
            {currentUser ? t.profile : 'Connexion'}
          </span>
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
        currentUser={currentUser}
        onRequireAuth={(action) =>
          requireAuth(
            action,
            'Connectez-vous ou créez un compte gratuit pour afficher le numéro de téléphone ou contacter cet annonceur.'
          )
        }
        allListings={listings}
        onSelectListing={(listing) => setSelectedListing(listing)}
        onOpenBoostModal={(listing) => {
          setSelectedListing(null);
          handleOpenBoostForListing(listing);
        }}
      />

      <PostListingWizard
        isOpen={isPostWizardOpen}
        onClose={() => {
          setIsPostWizardOpen(false);
          setEditingListing(null);
        }}
        onSubmit={handleSaveListing}
        currentUser={currentUser}
        editingListing={editingListing}
      />

      <DarnaChatbot isOpen={isChatbotOpen} onClose={() => setIsChatbotOpen(false)} />

      {currentUser && (
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          currentUser={currentUser}
          myListings={listings.filter((l) => l.userId === currentUser.id)}
          allListings={listings}
          plans={plans}
          myTransactions={myTransactions}
          favoriteListings={favoriteListingsList}
          onOpenListing={(listing) => setSelectedListing(listing)}
          onOpenCreateAd={() => {
            setEditingListing(null);
            setIsPostWizardOpen(true);
          }}
          onEditListing={(listing) => {
            setEditingListing(listing);
            setIsPostWizardOpen(true);
          }}
          onBoostListing={(listing) => {
            setIsProfileModalOpen(false);
            handleOpenBoostForListing(listing);
          }}
          onOpenPricingPage={() => setCurrentView('pricing')}
          onToggleListingStatus={handleToggleListingStatus}
          onDeleteListing={handleDeleteListing}
          onVerifyEmail={handleVerifyEmail}
          onLogout={handleLogout}
        />
      )}

      <BoostListingModal
        isOpen={!!boostingListing}
        onClose={() => {
          setBoostingListing(null);
          setPreselectedBoostOpt(null);
        }}
        listing={boostingListing}
        boostOptions={boostOptions}
        initialOption={preselectedBoostOpt}
        onProceedToCheckout={handleProceedBoostToCheckout}
      />

      <PaymentCheckoutModal
        isOpen={!!checkoutTarget}
        onClose={() => setCheckoutTarget(null)}
        target={checkoutTarget}
        authToken={authToken}
        onPaymentConfirmed={handlePaymentConfirmed}
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

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setPendingAction(null);
        }}
        initialMode={authInitialMode}
        reasonMessage={authReasonMessage}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
