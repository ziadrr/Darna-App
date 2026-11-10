import { Listing, ListingFilter, PropertyCategory, ListingContact } from '../types';

/**
 * Format price in Moroccan Dirhams (MAD)
 */
export function formatMAD(price: number, period: string = 'mois'): string {
  const formatted = new Intl.NumberFormat('fr-MA', {
    style: 'decimal',
    maximumFractionDigits: 0
  }).format(price).replace(/\u202F/g, ' ');

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
export function buildWhatsAppLink(phone: string, listingTitle: string, listingUrl?: string): string {
  if (!phone) return '#';
  let cleanNumber = phone.replace(/[^0-9]/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '212' + cleanNumber.substring(1);
  }
  const text = encodeURIComponent(
    `Bonjour, je vous contacte au sujet de votre annonce sur Darna : "${listingTitle}". Ce bien est-il toujours disponible à la location ? Merci.`
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
        case 'price_asc':
          return a.price - b.price;
        case 'price_desc':
          return b.price - a.price;
        case 'surface_desc':
          return b.surface - a.surface;
        case 'recent':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
}

/**
 * Strictly strip all contact numbers, WhatsApp, emails, and exact street addresses
 * when sending listings to an unauthenticated visitor.
 */
export function sanitizeListingForVisitor(listing: Listing): Listing {
  const sanitizedContact: ListingContact = {
    name: listing.contact.name,
    type: listing.contact.type,
    phone: '',
    whatsapp: undefined,
    email: '',
    showPhone: listing.contact.showPhone,
    showEmail: listing.contact.showEmail,
    showWhatsApp: listing.contact.showWhatsApp,
    showExactAddress: listing.contact.showExactAddress,
    showMapLocation: listing.contact.showMapLocation ?? true,
    phoneConsentAccepted: listing.contact.phoneConsentAccepted ?? true
  };

  return {
    ...listing,
    contact: sanitizedContact,
    address: `${listing.district}, ${listing.city}`,
    latitude: listing.contact.showMapLocation === false ? 0 : listing.latitude,
    longitude: listing.contact.showMapLocation === false ? 0 : listing.longitude
  };
}

/**
 * Sanitize listing contact details for authenticated users (or public if specified).
 * Only reveals contact channels that the advertiser explicitly opted to share.
 */
export function sanitizeListingForPublic(listing: Listing, isAuthenticated: boolean = true): Listing {
  if (!isAuthenticated) {
    return sanitizeListingForVisitor(listing);
  }

  const allowPhone = Boolean(listing.contact.showPhone && listing.contact.phoneConsentAccepted !== false);
  const sanitizedContact: ListingContact = {
    ...listing.contact,
    phone: allowPhone ? listing.contact.phone : '',
    email: listing.contact.showEmail ? listing.contact.email : '',
    whatsapp: listing.contact.showWhatsApp ? listing.contact.whatsapp : undefined,
  };

  return {
    ...listing,
    contact: sanitizedContact,
    address: listing.contact.showExactAddress ? listing.address : `${listing.district}, ${listing.city}`,
    latitude: listing.contact.showMapLocation === false ? 0 : listing.latitude,
    longitude: listing.contact.showMapLocation === false ? 0 : listing.longitude
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
