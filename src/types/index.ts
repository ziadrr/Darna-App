export type PropertyCategory =
  | 'appartement'
  | 'studio'
  | 'maison'
  | 'villa'
  | 'chambre'
  | 'garage'
  | 'parking'
  | 'commerce'
  | 'bureau'
  | 'terrain'
  | 'autre';

export type ListingStatus =
  | 'brouillon'
  | 'en_attente'
  | 'publiee'
  | 'refusee'
  | 'masquee'
  | 'expiree';

export type AdvertiserType = 'particulier' | 'professionnel';

export type RentPeriod = 'mois' | 'jour' | 'an';

export type UserRole = 'visiteur' | 'particulier' | 'professionnel' | 'admin';

export interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  advertiserType?: AdvertiserType;
  companyName?: string;
  city?: string;
  avatar?: string;
  verified?: boolean;
  emailVerified?: boolean;
  favorites?: string[];
  createdAt: string;
}

export interface ListingContact {
  name: string;
  type: AdvertiserType;
  phone: string;
  whatsapp?: string;
  email: string;
  showPhone: boolean;
  showEmail: boolean;
  showWhatsApp: boolean;
  showExactAddress: boolean;
  showMapLocation?: boolean;
  phoneConsentAccepted?: boolean;
}

export interface Listing {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: PropertyCategory;
  price: number; // in MAD
  period: RentPeriod;
  deposit?: number; // caution en MAD
  surface: number; // m²
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  floor?: number;
  totalFloors?: number;
  furnished?: boolean;
  amenities: string[];
  images: string[];
  city: string;
  district: string; // quartier
  address?: string;
  latitude: number;
  longitude: number;
  contact: ListingContact;
  userId: string;
  status: ListingStatus;
  rejectionReason?: string;
  viewsCount: number;
  favoritesCount: number;
  createdAt: string;
  updatedAt: string;
  availableFrom: string;
  legalConsentAccepted: boolean;
  isDemo?: boolean;
  flaggedForContactInText?: boolean;
}

export interface ListingFilter {
  query?: string;
  city?: string;
  district?: string;
  category?: PropertyCategory | 'all';
  priceMin?: number;
  priceMax?: number;
  period?: RentPeriod | 'all';
  surfaceMin?: number;
  bedrooms?: number | 'all';
  furnished?: boolean | 'all';
  advertiserType?: AdvertiserType | 'all';
  amenities?: string[];
  sortBy?: 'recent' | 'price_asc' | 'price_desc' | 'surface_desc';
}

export interface ListingReport {
  id: string;
  listingId: string;
  listingTitle: string;
  reason: 'arnaque' | 'faux_prix' | 'photos_trompeuses' | 'deja_loue' | 'inapproprié' | 'autre';
  comment: string;
  reporterEmail?: string;
  createdAt: string;
  status: 'en_attente' | 'resolu' | 'rejete';
}

export interface CityData {
  id: string;
  name: string;
  nameAr: string;
  region: string;
  lat: number;
  lng: number;
  popularDistricts: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export type ChatRoleType = 'legal' | 'advisor' | 'estimate';

export type Language = 'fr' | 'ar' | 'en';

export type PendingAction =
  | { type: 'contact'; listingId: string }
  | { type: 'favorite'; listingId: string }
  | { type: 'post_ad' }
  | null;
