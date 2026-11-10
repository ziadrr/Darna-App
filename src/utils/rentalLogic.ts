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

  // Category specific validation
  if (['appartement', 'villa', 'chambre'].includes(data.category as string)) {
    if (data.bedrooms === undefined || data.bedrooms === null || data.bedrooms < 0) {
      errors.push({ field: 'bedrooms', message: "Le nombre de chambres est requis pour ce type de bien" });
    }
  }

  if (['appartement', 'villa', 'bureau', 'chambre'].includes(data.category as string)) {
    if (data.bathrooms === undefined || data.bathrooms === null || data.bathrooms < 0) {
      errors.push({ field: 'bathrooms', message: "Le nombre de salles de bain est requis" });
    }
  }

  if (!data.contact?.phone || data.contact.phone.trim().length < 8) {
    errors.push({ field: 'contact.phone', message: "Un numéro de téléphone marocain valide est requis" });
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
      if (filters.priceMin !== undefined && filters.priceMin !== null) {
        if (listing.price < filters.priceMin) return false;
      }
      if (filters.priceMax !== undefined && filters.priceMax !== null) {
        if (listing.price > filters.priceMax) return false;
      }

      // Surface
      if (filters.surfaceMin !== undefined && filters.surfaceMin !== null) {
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
 * Sanitize listing contact details for public privacy
 */
export function sanitizeListingForPublic(listing: Listing): Listing {
  const sanitizedContact: ListingContact = {
    ...listing.contact,
    phone: listing.contact.showPhone ? listing.contact.phone : '',
    email: listing.contact.showEmail ? listing.contact.email : '',
    whatsapp: listing.contact.showWhatsApp ? listing.contact.whatsapp : undefined,
  };

  return {
    ...listing,
    contact: sanitizedContact,
    // Hide exact street address if advertiser turned off showExactAddress
    address: listing.contact.showExactAddress ? listing.address : `${listing.district}, ${listing.city}`
  };
}
