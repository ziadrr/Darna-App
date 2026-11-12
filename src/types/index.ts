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

export type BoostOptionId = 'premium' | 'top' | 'homepage';

export interface BoostOption {
  id: BoostOptionId;
  name: string;
  description: string;
  price: number; // MAD (e.g. 49, 99, 199)
  durationDays: number;
  badgeLabel: string; // "Sponsorisé"
}

export interface ListingBoost {
  optionId: BoostOptionId;
  optionName: string;
  status: 'active' | 'expired' | 'revoked';
  startedAt: string;
  expiresAt: string;
  transactionId: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number | null; // null = "Sur devis"
  period: 'mois' | 'an';
  maxListings: number;
  features: string[];
  isCustomQuote?: boolean;
  popular?: boolean;
}

export interface UserSubscription {
  planId: string;
  planName: string;
  status: 'active' | 'cancelled' | 'refunded';
  maxListings: number;
  startedAt: string;
  expiresAt: string;
  transactionId?: string;
}

export type PaymentStatus = 'en_attente' | 'paye' | 'echoue' | 'rembourse';

export interface PaymentTransaction {
  id: string;
  idempotencyKey: string;
  userId: string;
  userName: string;
  userEmail: string;
  type: 'subscription' | 'boost';
  targetId: string; // planId or listingId
  targetLabel: string;
  optionId: string; // planId or boostOptionId
  amount: number; // in MAD
  currency: 'MAD';
  status: PaymentStatus;
  provider: 'test_cmi_sandbox';
  paymentMethodLabel: string; // never stores full card numbers
  failureReason?: string;
  createdAt: string;
  confirmedAt?: string;
  refundedAt?: string;
}

export interface RevenueSummary {
  subscriptionRevenue: number;
  boostRevenue: number;
  totalNetRevenue: number;
  refundedTotal: number;
  paidTransactionsCount: number;
  failedTransactionsCount: number;
  refundedTransactionsCount: number;
}

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
  subscription?: UserSubscription;
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
  boost?: ListingBoost;
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
  sortBy?: 'recent' | 'price_asc' | 'price_desc' | 'surface_desc' | 'nearest';
  userLat?: number;
  userLng?: number;
}

export interface DetectedLocation {
  city: string;
  lat: number;
  lng: number;
  source: 'gps' | 'wifi_ip' | 'manual';
  accuracyLabel: string;
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
  | { type: 'subscribe'; planId: string }
  | { type: 'boost'; listingId: string; optionId?: BoostOptionId }
  | { type: 'conversations' }
  | null;

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  createdAt: string;
  read: boolean;
}

export interface ConversationThread {
  id: string;
  listingId: string;
  listingTitle: string;
  listingCity: string;
  listingPrice: number;
  listingImage?: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  advertiserId: string;
  advertiserName: string;
  initiatorId: string;
  initiatorName: string;
  lastMessageText: string;
  lastMessageAt: string;
  unreadCountByUser: Record<string, number>;
  messages: ConversationMessage[];
}


