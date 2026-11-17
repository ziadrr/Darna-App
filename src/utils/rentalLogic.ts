import type {
  Listing,
  ListingFilter,
  ListingContact,
  CityData,
  PaymentTransaction,
  RevenueSummary,
  SubscriptionPlan,
  TransactionType,
  User
} from '../types/index.ts';

/**
 * Determine whether a listing is for rent ('location', default) or sale ('vente')
 */
export function getListingTransactionType(
  listing: Partial<Listing> | null | undefined
): TransactionType {
  return listing?.transactionType === 'vente' ? 'vente' : 'location';
}

/**
 * Human-readable badge label for a listing's transaction type
 */
export function getTransactionBadgeLabel(
  listing: Partial<Listing> | null | undefined
): 'À louer' | 'À vendre' {
  return getListingTransactionType(listing) === 'vente' ? 'À vendre' : 'À louer';
}

/**
 * Check if an image URL comes from a stock/demo provider (e.g. Unsplash) rather than a real user upload
 */
export function isDemoImageUrl(url: string | null | undefined): boolean {
  const clean = String(url || '').trim().toLowerCase();
  if (!clean) return false;
  return (
    clean.includes('images.unsplash.com') ||
    clean.includes('unsplash.com') ||
    clean.includes('picsum.photos')
  );
}

/**
 * Check if a listing is a demo listing or uses demo stock photos
 */
export function hasDemoImages(listing: Partial<Listing> | null | undefined): boolean {
  if (!listing) return false;
  if (listing.isDemo) return true;
  if (!Array.isArray(listing.images) || listing.images.length === 0) return false;
  return listing.images.some((img) => isDemoImageUrl(img));
}

/**
 * Default replacement image URL when a listing image fails to load
 */
export const FALLBACK_LISTING_IMAGE_URL = '/og-default.png';

/**
 * Shared onError handler for all listing <img> elements to swap broken URLs with FALLBACK_LISTING_IMAGE_URL
 */
export function handleListingImageError(e: { currentTarget: HTMLImageElement }): void {
  const img = e.currentTarget;
  if (img && !img.src.endsWith(FALLBACK_LISTING_IMAGE_URL)) {
    img.onerror = null;
    if (img.dataset) {
      img.dataset.fallbackApplied = 'true';
    }
    img.src = FALLBACK_LISTING_IMAGE_URL;
  }
}

/**
 * Return the configured public origin for share links
 */
export function getConfiguredAppOrigin(): string {
  try {
    const envMeta = (import.meta as any)?.env;
    const configured = String(
      envMeta?.VITE_APP_URL || envMeta?.VITE_PUBLIC_URL || ''
    )
      .trim()
      .replace(/\/$/, '');
    if (configured && /^https?:\/\//i.test(configured)) {
      return configured;
    }
  } catch {
    // Ignore when import.meta.env is unavailable
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'https://darna.ma';
}

/**
 * Format price in Moroccan Dirhams (MAD) for rent or sale
 */
export function formatMAD(
  price: number,
  period: string = 'mois',
  transactionType: TransactionType = 'location'
): string {
  const formatted = new Intl.NumberFormat('fr-MA', {
    style: 'decimal',
    maximumFractionDigits: 0
  }).format(price).replace(/\u202F/g, ' ');

  if (transactionType === 'vente' || period === 'unique' || period === 'vente') {
    return `${formatted} MAD`;
  }
  if (period === 'jour') {
    return `${formatted} MAD / jour`;
  } else if (period === 'an') {
    return `${formatted} MAD / an`;
  }
  return `${formatted} MAD / mois`;
}

/**
 * Format Moroccan phone number
 */
export function formatMoroccanPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('0')) {
    return `+212 ${cleaned.slice(1, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8, 10)}`;
  }
  if (cleaned.startsWith('+212')) {
    const rest = cleaned.slice(4);
    return `+212 ${rest.slice(0, 1)} ${rest.slice(1, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7, 9)}`;
  }
  return phone;
}

/**
 * Build WhatsApp click-to-chat URL with a prefilled message
 */
export function buildWhatsAppLink(
  phone: string,
  listingTitle: string,
  listingUrl?: string,
  transactionType: TransactionType = 'location'
): string {
  if (!phone) return '#';
  let cleanNumber = phone.replace(/[^0-9]/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '212' + cleanNumber.substring(1);
  }
  const opLabel = transactionType === 'vente' ? 'à la vente' : 'à la location';
  const linkSuffix = listingUrl ? ` (${listingUrl})` : '';
  const text = encodeURIComponent(
    `Bonjour, je vous contacte au sujet de votre annonce sur Darna : "${listingTitle}"${linkSuffix}. Ce bien est-il toujours disponible ${opLabel} ? Merci.`
  );
  return `https://wa.me/${cleanNumber}?text=${text}`;
}

/**
 * Detect phone numbers, email addresses or external links in public text fields
 */
export function detectContactInPublicText(text: string): {
  hasContactInfo: boolean;
  matches: string[];
} {
  if (!text) return { hasContactInfo: false, matches: [] };
  const matches: string[] = [];

  // Detect Moroccan or international phone numbers (e.g., 06 61 23 45 67, +212661234567, 0522-40-90-90)
  const phoneRegex = /(?:\+212|00212|0)\s*[5-7](?:[\s.-]*\d){8}\b/g;
  const foundPhones = text.match(phoneRegex);
  if (foundPhones) {
    matches.push(...foundPhones);
  }

  // Detect email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const foundEmails = text.match(emailRegex);
  if (foundEmails) {
    matches.push(...foundEmails);
  }

  // Detect external URLs / WhatsApp links
  const urlRegex = /(?:https?:\/\/|www\.|wa\.me\/)[^\s]+/gi;
  const foundUrls = text.match(urlRegex);
  if (foundUrls) {
    matches.push(...foundUrls);
  }

  return {
    hasContactInfo: matches.length > 0,
    matches
  };
}

/**
 * Validate listing submission according to Moroccan real estate criteria
 */
export interface ValidationError {
  field: string;
  message: string;
}

export function validateListingForm(data: Partial<Listing>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.title || data.title.trim().length < 5) {
    errors.push({ field: 'title', message: "Le titre doit comporter au moins 5 caractères" });
  }

  if (!data.category) {
    errors.push({ field: 'category', message: "Veuillez choisir un type de bien" });
  }

  if (!data.city || data.city.trim().length === 0) {
    errors.push({ field: 'city', message: "La ville est obligatoire" });
  }

  if (!data.district || data.district.trim().length === 0) {
    errors.push({ field: 'district', message: "Le quartier est obligatoire" });
  }

  if (!data.price || Number(data.price) <= 0) {
    errors.push({ field: 'price', message: "Le loyer doit être supérieur à 0 MAD" });
  }

  if (!data.surface || Number(data.surface) <= 0) {
    errors.push({ field: 'surface', message: "La superficie doit être renseignée en m²" });
  }

  if (!data.description || data.description.trim().length < 20) {
    errors.push({ field: 'description', message: "La description doit contenir au moins 20 caractères" });
  }

  // Prevent phone/email/links in public title & description
  const titleLeak = detectContactInPublicText(data.title || '');
  const descLeak = detectContactInPublicText(data.description || '');
  if (titleLeak.hasContactInfo || descLeak.hasContactInfo) {
    errors.push({
      field: 'publicContactLeak',
      message: "Pour votre sécurité et la confidentialité, n'incluez pas de numéro de téléphone, d'adresse e-mail ou de lien externe dans le titre ou la description publique."
    });
  }

  // Category specific validation
  if (['appartement', 'studio', 'maison', 'villa', 'chambre'].includes(data.category as string)) {
    if (data.bedrooms === undefined || data.bedrooms === null || data.bedrooms < 0) {
      errors.push({ field: 'bedrooms', message: "Le nombre de chambres est requis pour ce type de bien" });
    }
  }

  if (['appartement', 'studio', 'maison', 'villa', 'bureau', 'chambre'].includes(data.category as string)) {
    if (data.bathrooms === undefined || data.bathrooms === null || data.bathrooms < 0) {
      errors.push({ field: 'bathrooms', message: "Le nombre de salles de bain est requis" });
    }
  }

  if ((data.contact?.showPhone || data.contact?.showWhatsApp) && (!data.contact?.phone || data.contact.phone.trim().length < 8)) {
    errors.push({ field: 'contact.phone', message: "Un numéro de téléphone marocain valide est requis pour activer le contact téléphonique ou WhatsApp" });
  } else if (!data.contact?.phone && !data.contact?.email) {
    errors.push({ field: 'contact.phone', message: "Veuillez renseigner au moins un moyen de contact" });
  }

  if (data.contact?.showPhone && data.contact.phoneConsentAccepted === false) {
    errors.push({
      field: 'contact.phoneConsentAccepted',
      message: "Vous devez donner votre accord explicite avant de rendre votre numéro de téléphone visible aux utilisateurs connectés"
    });
  }

  if (!data.legalConsentAccepted) {
    errors.push({
      field: 'legalConsentAccepted',
      message: "Vous devez confirmer être autorisé à louer ce bien et accepter les conditions d'utilisation"
    });
  }

  return errors;
}

/**
 * Filter and sort listings
 */
export function filterAndSortListings(listings: Listing[], filters: ListingFilter): Listing[] {
  return listings
    .filter((listing) => {
      // Status check (only published listings unless explicitly reviewing)
      if (listing.status !== 'publiee') {
        return false;
      }

      // Keyword query search
      if (filters.query && filters.query.trim().length > 0) {
        const q = filters.query.toLowerCase().trim();
        const matchesTitle = listing.title.toLowerCase().includes(q);
        const matchesDesc = listing.description.toLowerCase().includes(q);
        const matchesCity = listing.city.toLowerCase().includes(q);
        const matchesDistrict = listing.district.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesCity && !matchesDistrict) {
          return false;
        }
      }

      // City filter
      if (filters.city && filters.city !== 'all') {
        if (listing.city.toLowerCase() !== filters.city.toLowerCase()) {
          return false;
        }
      }

      // District filter
      if (filters.district && filters.district !== 'all') {
        if (listing.district.toLowerCase() !== filters.district.toLowerCase()) {
          return false;
        }
      }

      // Category filter
      if (filters.category && filters.category !== 'all') {
        if (listing.category !== filters.category) {
          return false;
        }
      }

      // Transaction type filter ('location' = Louer / À louer, 'vente' = Acheter / À vendre)
      if (filters.transactionType && filters.transactionType !== 'all') {
        const listingTxType = getListingTransactionType(listing);
        if (listingTxType !== filters.transactionType) {
          return false;
        }
      }

      // Period filter
      if (filters.period && filters.period !== 'all') {
        if (listing.period !== filters.period) {
          return false;
        }
      }

      // Price bounds
      if (filters.priceMin !== undefined && filters.priceMin !== null && filters.priceMin > 0) {
        if (listing.price < filters.priceMin) return false;
      }
      if (filters.priceMax !== undefined && filters.priceMax !== null && filters.priceMax > 0) {
        if (listing.price > filters.priceMax) return false;
      }

      // Surface
      if (filters.surfaceMin !== undefined && filters.surfaceMin !== null && filters.surfaceMin > 0) {
        if (listing.surface < filters.surfaceMin) return false;
      }

      // Bedrooms
      if (filters.bedrooms && filters.bedrooms !== 'all') {
        const b = Number(filters.bedrooms);
        if (b === 4) {
          if (!listing.bedrooms || listing.bedrooms < 4) return false;
        } else {
          if (listing.bedrooms !== b) return false;
        }
      }

      // Furnished
      if (filters.furnished !== undefined && filters.furnished !== 'all') {
        if (listing.furnished !== filters.furnished) return false;
      }

      // Advertiser type
      if (filters.advertiserType && filters.advertiserType !== 'all') {
        if (listing.contact.type !== filters.advertiserType) return false;
      }

      // Amenities filter (must contain all selected)
      if (filters.amenities && filters.amenities.length > 0) {
        const hasAll = filters.amenities.every((a) => listing.amenities?.includes(a));
        if (!hasAll) return false;
      }

      return true;
    })
    .sort((a, b) => {
      switch (filters.sortBy) {
        case 'nearest': {
          if (filters.userLat !== undefined && filters.userLng !== undefined) {
            const distA =
              a.latitude && a.longitude
                ? calculateDistanceKm(filters.userLat, filters.userLng, a.latitude, a.longitude)
                : 9999;
            const distB =
              b.latitude && b.longitude
                ? calculateDistanceKm(filters.userLat, filters.userLng, b.latitude, b.longitude)
                : 9999;
            return distA - distB;
          }
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        case 'price_asc':
          return a.price - b.price;
        case 'price_desc':
          return b.price - a.price;
        case 'surface_desc':
          return b.surface - a.surface;
        case 'recent':
        default: {
          const boostDiff = getBoostPriorityWeight(b) - getBoostPriorityWeight(a);
          if (boostDiff !== 0) return boostDiff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      }
    });
}

/**
 * Check if a listing has an active, non-expired paid boost
 */
export function isListingBoostActive(listing: Listing, nowMs: number = Date.now()): boolean {
  if (!listing.boost || listing.boost.status !== 'active') return false;
  const expiresMs = new Date(listing.boost.expiresAt).getTime();
  return !isNaN(expiresMs) && expiresMs > nowMs;
}

/**
 * Priority weight for active boosted listings:
 * homepage (3) > top (2) > premium (1) > none (0)
 */
export function getBoostPriorityWeight(listing: Listing, nowMs: number = Date.now()): number {
  if (!isListingBoostActive(listing, nowMs)) return 0;
  switch (listing.boost?.optionId) {
    case 'homepage':
      return 3;
    case 'top':
      return 2;
    case 'premium':
      return 1;
    default:
      return 0;
  }
}

/**
 * Calculate real-time revenue breakdown from confirmed transactions only.
 * Failed ('echoue'), pending ('en_attente'), and refunded ('rembourse') transactions
 * do NOT count toward net revenues.
 */
export function calculateRevenueSummary(transactions: PaymentTransaction[]): RevenueSummary {
  let subscriptionRevenue = 0;
  let boostRevenue = 0;
  let refundedTotal = 0;
  let paidTransactionsCount = 0;
  let failedTransactionsCount = 0;
  let refundedTransactionsCount = 0;

  for (const tx of transactions) {
    if (tx.status === 'paye') {
      paidTransactionsCount += 1;
      if (tx.type === 'subscription') {
        subscriptionRevenue += tx.amount;
      } else if (tx.type === 'boost') {
        boostRevenue += tx.amount;
      }
    } else if (tx.status === 'echoue') {
      failedTransactionsCount += 1;
    } else if (tx.status === 'rembourse') {
      refundedTransactionsCount += 1;
      refundedTotal += tx.amount;
    }
  }

  return {
    subscriptionRevenue,
    boostRevenue,
    totalNetRevenue: subscriptionRevenue + boostRevenue,
    refundedTotal,
    paidTransactionsCount,
    failedTransactionsCount,
    refundedTransactionsCount,
  };
}

/**
 * Calculate user's active subscription plan limits and current listing usage
 */
export function getUserListingQuota(
  user: User | null,
  allListings: Listing[],
  plans: SubscriptionPlan[]
): {
  planId: string;
  planName: string;
  maxListings: number;
  usedListings: number;
  remainingListings: number;
  canPublish: boolean;
} {
  if (!user) {
    return {
      planId: 'particulier',
      planName: 'Particulier',
      maxListings: 3,
      usedListings: 0,
      remainingListings: 3,
      canPublish: false,
    };
  }

  const activeSub =
    user.subscription && user.subscription.status === 'active' ? user.subscription : null;
  const matchedPlan =
    plans.find((p) => p.id === (activeSub?.planId || 'particulier')) || plans[0];

  const maxListings =
    user.role === 'admin'
      ? 999
      : activeSub?.maxListings ?? matchedPlan?.maxListings ?? 3;
  const planName = activeSub?.planName || matchedPlan?.name || 'Particulier';
  const planId = activeSub?.planId || matchedPlan?.id || 'particulier';

  const usedListings = allListings.filter(
    (l) =>
      l.userId === user.id &&
      (l.status === 'publiee' || l.status === 'en_attente' || l.status === 'brouillon')
  ).length;

  const remainingListings = Math.max(0, maxListings - usedListings);

  return {
    planId,
    planName,
    maxListings,
    usedListings,
    remainingListings,
    canPublish: usedListings < maxListings,
  };
}

/**
 * Calculate Haversine distance in kilometers between two GPS coordinates
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Find the closest Moroccan city to the given GPS / Wi-Fi coordinates
 */
export function findNearestMoroccanCity(
  lat: number,
  lon: number,
  cities: CityData[]
): { city: CityData; distanceKm: number } {
  let closest = cities[0];
  let minDistance = Infinity;

  for (const c of cities) {
    const dist = calculateDistanceKm(lat, lon, c.lat, c.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = c;
    }
  }

  return { city: closest, distanceKm: minDistance };
}

/**
 * Strictly strip all contact numbers, WhatsApp, emails, and exact street addresses
 * when sending listings to an unauthenticated visitor.
 */
export function sanitizeListingForVisitor(listing: Listing): Listing {
  const rawContact = listing.contact || {
    name: 'Annonceur Darna',
    type: 'particulier' as const,
    phone: '',
    email: '',
    showPhone: false,
    showEmail: false,
    showWhatsApp: false,
    showExactAddress: false,
    phoneConsentAccepted: false,
  };
  const hasExplicitPhoneConsent = rawContact.phoneConsentAccepted === true;
  const sanitizedContact: ListingContact = {
    name: rawContact.name || 'Annonceur Darna',
    type: rawContact.type || 'particulier',
    phone: '',
    whatsapp: undefined,
    email: '',
    showPhone: Boolean(rawContact.showPhone === true && hasExplicitPhoneConsent),
    showEmail: Boolean(rawContact.showEmail === true),
    showWhatsApp: Boolean(rawContact.showWhatsApp === true && hasExplicitPhoneConsent),
    showExactAddress: Boolean(rawContact.showExactAddress === true),
    showMapLocation: rawContact.showMapLocation ?? true,
    phoneConsentAccepted: hasExplicitPhoneConsent
  };

  return {
    ...listing,
    contact: sanitizedContact,
    address: `${listing.district}, ${listing.city}`,
    latitude: rawContact.showMapLocation === false ? 0 : listing.latitude,
    longitude: rawContact.showMapLocation === false ? 0 : listing.longitude
  };
}

/**
 * Sanitize listing contact details for authenticated users (or public if specified).
 * Only reveals contact channels that the advertiser explicitly opted and consented to share.
 */
export function sanitizeListingForPublic(listing: Listing, isAuthenticated: boolean = true): Listing {
  if (!isAuthenticated) {
    return sanitizeListingForVisitor(listing);
  }

  const rawContact = listing.contact || {
    name: 'Annonceur Darna',
    type: 'particulier' as const,
    phone: '',
    email: '',
    showPhone: false,
    showEmail: false,
    showWhatsApp: false,
    showExactAddress: false,
    phoneConsentAccepted: false,
  };
  const hasExplicitPhoneConsent = rawContact.phoneConsentAccepted === true;
  const allowPhone = Boolean(rawContact.showPhone === true && hasExplicitPhoneConsent);
  const allowWhatsApp = Boolean(rawContact.showWhatsApp === true && hasExplicitPhoneConsent);
  const allowEmail = Boolean(rawContact.showEmail === true);
  const allowExactAddress = Boolean(rawContact.showExactAddress === true);

  const sanitizedContact: ListingContact = {
    ...rawContact,
    phone: allowPhone ? rawContact.phone : '',
    email: allowEmail ? rawContact.email : '',
    whatsapp: allowWhatsApp ? rawContact.whatsapp : undefined,
    showPhone: allowPhone,
    showWhatsApp: allowWhatsApp,
    showEmail: allowEmail,
    showExactAddress: allowExactAddress,
    phoneConsentAccepted: hasExplicitPhoneConsent,
  };

  return {
    ...listing,
    contact: sanitizedContact,
    address: allowExactAddress ? listing.address : `${listing.district}, ${listing.city}`,
    latitude: rawContact.showMapLocation === false ? 0 : listing.latitude,
    longitude: rawContact.showMapLocation === false ? 0 : listing.longitude
  };
}

/**
 * Get similar published listings (same city or category, excluding the current listing)
 */
export function getSimilarListings(target: Listing, allListings: Listing[], limit: number = 3): Listing[] {
  return allListings
    .filter((l) => l.id !== target.id && l.status === 'publiee')
    .sort((a, b) => {
      const aScore = (a.city === target.city ? 2 : 0) + (a.category === target.category ? 2 : 0);
      const bScore = (b.city === target.city ? 2 : 0) + (b.category === target.category ? 2 : 0);
      return bScore - aScore;
    })
    .slice(0, limit);
}

/**
 * Formats specific per-file error messages for photo uploads in the listing deposit wizard.
 */
export function formatPhotoUploadErrorMessage(
  status: number,
  code?: string,
  serverMessage?: string,
  fileName?: string
): string {
  const prefix = fileName ? `« ${fileName} » : ` : '';
  if (status === 403 || code === 'EMAIL_NOT_VERIFIED') {
    return `${prefix}E-mail non vérifié — veuillez vérifier votre adresse e-mail avant de téléverser des photos.`;
  }
  if (status === 413 || code === 'IMAGE_QUOTA_EXCEEDED') {
    return `${prefix}Quota atteint — vous avez atteint la limite de 60 photos ou 100 Mo cumulés.`;
  }
  if (status === 429 || code === 'RATE_LIMIT_EXCEEDED') {
    return `${prefix}Trop de demandes — limite de 30 envois par heure atteinte. Veuillez patienter avant de réessayer.`;
  }
  if (
    status === 0 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status >= 500 ||
    code === 'DATABASE_SYNC_FAILED'
  ) {
    return `${prefix}Serveur indisponible — le service de stockage est temporairement injoignable. Cliquez sur « Réessayer ».`;
  }
  if (code === 'IMAGE_TOO_LARGE') {
    return `${prefix}La taille décodée de cette photo dépasse la limite autorisée de 5 Mo.`;
  }
  if (code === 'INVALID_IMAGE_TYPE' || code === 'INVALID_IMAGE_CONTENT') {
    return (
      serverMessage ||
      `${prefix}Format d’image non autorisé. Utilisez uniquement JPEG, PNG, WebP ou GIF.`
    );
  }
  return (
    serverMessage ||
    `${prefix}Échec du téléversement sécurisé (code HTTP ${status}). Cliquez sur « Réessayer ».`
  );
}

/**
 * Map tile layer URLs, attributions, and Morocco bounding constants
 */
export const CARTO_VOYAGER_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const CARTO_VOYAGER_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const OSM_FALLBACK_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_FALLBACK_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const TOPO_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
export const TOPO_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase';

export const MOROCCO_MIN_ZOOM = 5;
export const MOROCCO_MAX_BOUNDS: [[number, number], [number, number]] = [
  [20.0, -18.5],
  [37.5, -0.5],
];

/**
 * Formats a listing price as a compact, high-contrast map marker pill label (e.g. "6 500 MAD")
 */
export function formatMapMarkerPriceMAD(price: number): string {
  const safePrice = Math.max(0, Math.round(Number(price) || 0));
  const formatted = new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    maximumFractionDigits: 0,
  })
    .format(safePrice)
    .replace(/[\u202F\u00A0]/g, ' ');
  return `${formatted} MAD`;
}

/**
 * Returns high-contrast colors and z-index priority for map markers (distinct for location vs vente, and foreground for selected)
 */
export function getMapMarkerColors(
  transactionType: TransactionType = 'location',
  isSelected: boolean = false
): {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  zIndexOffset: number;
  badgeLabel: string;
} {
  if (isSelected) {
    return {
      backgroundColor: '#1E3D34',
      borderColor: '#FBBF24',
      textColor: '#FFFFFF',
      zIndexOffset: 1000,
      badgeLabel: 'Sélectionnée',
    };
  }
  if (transactionType === 'vente') {
    return {
      backgroundColor: '#0F4C81',
      borderColor: '#FFFFFF',
      textColor: '#FFFFFF',
      zIndexOffset: 100,
      badgeLabel: 'Vente',
    };
  }
  return {
    backgroundColor: '#C15C3D',
    borderColor: '#FFFFFF',
    textColor: '#FFFFFF',
    zIndexOffset: 0,
    badgeLabel: 'Location',
  };
}

/**
 * 6-step configuration for PostListingWizard after splitting Step 1 into
 * "Offre et type de bien" (Step 1) and "Localisation et titre" (Step 2).
 */
export type WizardStepNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface WizardStepConfig {
  num: WizardStepNumber;
  label: string;
  heading: string;
  progressWidthClass: string;
}

export const POST_LISTING_WIZARD_STEPS: ReadonlyArray<WizardStepConfig> = [
  {
    num: 1,
    label: 'Offre et type de bien',
    heading: 'Étape 1 : Offre et type de bien',
    progressWidthClass: 'w-1/6',
  },
  {
    num: 2,
    label: 'Localisation et titre',
    heading: 'Étape 2 : Localisation et titre',
    progressWidthClass: 'w-2/6',
  },
  {
    num: 3,
    label: 'Détails & Prix',
    heading: 'Étape 3 : Détails et prix du bien',
    progressWidthClass: 'w-3/6',
  },
  {
    num: 4,
    label: 'Photos & IA',
    heading: 'Étape 4 : Photos personnelles du bien',
    progressWidthClass: 'w-4/6',
  },
  {
    num: 5,
    label: 'Contact & Confidentialité',
    heading: 'Étape 5 : Contact et confidentialité',
    progressWidthClass: 'w-5/6',
  },
  {
    num: 6,
    label: 'Aperçu',
    heading: 'Étape 6 : Prévisualisation de votre annonce',
    progressWidthClass: 'w-full',
  },
];

export function getWizardProgressPercentage(step: WizardStepNumber): number {
  return Math.round((step / POST_LISTING_WIZARD_STEPS.length) * 100);
}

export interface WizardStepValidationInput {
  transactionType: TransactionType;
  category: string;
  city: string;
  district: string;
  title: string;
  price: number;
  surface: number;
  description: string;
  images: string[];
  showPhone: boolean;
  showWhatsApp: boolean;
  contactPhone: string;
  phoneConsentAccepted: boolean;
  legalConsentAccepted: boolean;
}

/**
 * Validates a single step of the 6-step listing deposit wizard in top-to-bottom DOM field order.
 */
export function validateWizardStep(
  step: WizardStepNumber,
  input: WizardStepValidationInput
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (step === 1) {
    if (input.transactionType !== 'location' && input.transactionType !== 'vente') {
      errors.push({
        field: 'transactionType',
        message: "Veuillez choisir le type d'offre (À louer ou À vendre).",
      });
    }
    if (!input.category || !input.category.trim()) {
      errors.push({
        field: 'category',
        message: 'Veuillez sélectionner un type de bien.',
      });
    }
  } else if (step === 2) {
    if (!input.city || !input.district) {
      errors.push({
        field: 'location',
        message: 'Veuillez sélectionner la ville et le quartier.',
      });
    }
    if (!input.title || input.title.trim().length < 5) {
      errors.push({
        field: 'title',
        message: 'Le titre doit faire au moins 5 caractères.',
      });
    } else if (detectContactInPublicText(input.title).hasContactInfo) {
      errors.push({
        field: 'title',
        message:
          'Pour votre sécurité, ne mettez pas de numéro de téléphone, e-mail ou lien dans le titre public.',
      });
    }
  } else if (step === 3) {
    if (!input.price || input.price <= 0 || !input.surface || input.surface <= 0) {
      errors.push({
        field: 'specs',
        message: 'Le prix et la superficie doivent être supérieurs à 0.',
      });
    }
    if (!input.description || input.description.trim().length < 20) {
      errors.push({
        field: 'description',
        message: 'La description doit faire au moins 20 caractères.',
      });
    } else if (detectContactInPublicText(input.description).hasContactInfo) {
      errors.push({
        field: 'description',
        message:
          'Veuillez retirer les numéros de téléphone, adresses e-mail ou liens de la description publique.',
      });
    }
  } else if (step === 4) {
    if (!Array.isArray(input.images) || input.images.length === 0) {
      errors.push({
        field: 'images',
        message: 'Veuillez ajouter au moins une photo.',
      });
    }
  } else if (step === 5) {
    if (
      (input.showPhone || input.showWhatsApp) &&
      (!input.contactPhone || input.contactPhone.trim().length < 8)
    ) {
      errors.push({
        field: 'contactPhone',
        message: 'Un numéro de téléphone marocain valide est requis.',
      });
    }
    if ((input.showPhone || input.showWhatsApp) && !input.phoneConsentAccepted) {
      errors.push({
        field: 'phoneConsent',
        message:
          'Vous devez donner votre accord explicite avant de rendre votre numéro visible aux utilisateurs connectés.',
      });
    }
    if (!input.legalConsentAccepted) {
      errors.push({
        field: 'legal',
        message: 'Veuillez accepter les conditions et certifier votre autorisation.',
      });
    }
  }

  return errors;
}

/**
 * Resets the wizard form scroll container to the very top (scrollTop = 0)
 * and moves focus to the step heading with preventScroll: true so the mobile virtual keyboard never opens.
 */
export function resetWizardStepScrollAndFocus(
  scrollContainer:
    | {
        scrollTop: number;
        scrollTo?: (options?: ScrollToOptions) => void;
      }
    | null
    | undefined,
  stepTitleEl:
    | {
        focus?: (options?: FocusOptions) => void;
      }
    | null
    | undefined
): void {
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    if (typeof scrollContainer.scrollTo === 'function') {
      try {
        scrollContainer.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        // scrollTop = 0 is already set above as fallback
      }
    }
  }
  if (stepTitleEl && typeof stepTitleEl.focus === 'function') {
    try {
      stepTitleEl.focus({ preventScroll: true });
    } catch {
      stepTitleEl.focus();
    }
  }
}

/**
 * Smoothly scrolls to the first invalid field inside the wizard scroll container.
 * This is the ONLY automatic scroll permitted in the listing deposit wizard.
 */
export function scrollToFirstInvalidField(
  scrollContainer: { querySelector?: (selector: string) => Element | null } | null | undefined,
  errors: ReadonlyArray<ValidationError>
): boolean {
  if (!scrollContainer || typeof scrollContainer.querySelector !== 'function') {
    return false;
  }
  if (!errors || errors.length === 0) {
    return false;
  }
  for (const err of errors) {
    const target = scrollContainer.querySelector(
      `[data-field="${err.field}"]`
    ) as (Element & { scrollIntoView?: (arg?: ScrollIntoViewOptions) => void }) | null;
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }
  }
  return false;
}

/**
 * Locks background page scrolling while the wizard modal is open and restores
 * the exact scroll position without any visual jump when closed.
 */
export function lockBackgroundPageScroll(
  doc: Document = document,
  win: Window = window
): () => void {
  const scrollY = win.scrollY || win.pageYOffset || doc.documentElement?.scrollTop || 0;
  const scrollX = win.scrollX || win.pageXOffset || doc.documentElement?.scrollLeft || 0;
  const body = doc.body;
  const html = doc.documentElement;

  const prevBodyOverflow = body.style.overflow;
  const prevBodyPosition = body.style.position;
  const prevBodyTop = body.style.top;
  const prevBodyLeft = body.style.left;
  const prevBodyRight = body.style.right;
  const prevBodyWidth = body.style.width;
  const prevHtmlOverscroll = html.style.overscrollBehavior;

  html.style.overscrollBehavior = 'none';
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = `-${scrollX}px`;
  body.style.right = '0px';
  body.style.width = '100%';

  return () => {
    html.style.overscrollBehavior = prevHtmlOverscroll;
    body.style.overflow = prevBodyOverflow;
    body.style.position = prevBodyPosition;
    body.style.top = prevBodyTop;
    body.style.left = prevBodyLeft;
    body.style.right = prevBodyRight;
    body.style.width = prevBodyWidth;
    win.scrollTo(scrollX, scrollY);
  };
}


