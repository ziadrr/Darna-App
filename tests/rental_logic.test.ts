import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMAD,
  formatMoroccanPhone,
  buildWhatsAppLink,
  validateListingForm,
  filterAndSortListings,
  sanitizeListingForPublic,
  sanitizeListingForVisitor,
  detectContactInPublicText,
  getSimilarListings,
  calculateDistanceKm,
  findNearestMoroccanCity,
  isListingBoostActive,
  calculateRevenueSummary,
  getUserListingQuota
} from '../src/utils/rentalLogic.ts';
import { Listing, PaymentTransaction, User } from '../src/types/index.ts';
import { MOROCCAN_CITIES } from '../src/data/moroccoLocations.ts';
import { INITIAL_SUBSCRIPTION_PLANS } from '../src/data/mockListings.ts';

describe('Rental Logic & Moroccan Real Estate Suite', () => {
  it('formats prices correctly in Moroccan Dirhams (MAD)', () => {
    const formattedMonth = formatMAD(7500, 'mois');
    assert.match(formattedMonth, /7.*500.*MAD \/ mois/);

    const formattedDay = formatMAD(800, 'jour');
    assert.match(formattedDay, /800.*MAD \/ jour/);

    const formattedYear = formatMAD(90000, 'an');
    assert.match(formattedYear, /90.*000.*MAD \/ an/);
  });

  it('formats Moroccan phone numbers with +212 format', () => {
    assert.equal(formatMoroccanPhone('0661234567'), '+212 6 61 23 45 67');
    assert.equal(formatMoroccanPhone('+212661234567'), '+212 6 61 23 45 67');
  });

  it('constructs correct WhatsApp direct chat links with Moroccan country code and encoded text', () => {
    const link = buildWhatsAppLink('0661234567', 'Bel appartement Maarif');
    assert.ok(link.startsWith('https://wa.me/212661234567?text='));
    assert.ok(link.includes(encodeURIComponent('Bel appartement Maarif')));
  });

  it('detects phone numbers, emails, and links in public text fields', () => {
    const clean = detectContactInPublicText('Bel appartement lumineux proche du tramway à Rabat Agdal.');
    assert.equal(clean.hasContactInfo, false);

    const withPhone = detectContactInPublicText('Appelez-moi vite au 06 61 23 45 67 pour visiter.');
    assert.equal(withPhone.hasContactInfo, true);

    const withEmail = detectContactInPublicText('Écrivez à proprietaire@gmail.com directement.');
    assert.equal(withEmail.hasContactInfo, true);

    const withUrl = detectContactInPublicText('Voir plus sur https://wa.me/212661234567');
    assert.equal(withUrl.hasContactInfo, true);
  });

  it('validates mandatory fields, category-specific rules, and anti-leak rules', () => {
    // Incomplete form
    const invalidForm = {
      title: 'Abc',
      category: 'appartement',
      city: '',
      price: -10,
      surface: 0,
      description: 'Trop court',
      legalConsentAccepted: false
    };

    const errors = validateListingForm(invalidForm as unknown as Partial<Listing>);
    assert.ok(errors.length >= 6);
    assert.ok(errors.some(e => e.field === 'title'));
    assert.ok(errors.some(e => e.field === 'city'));
    assert.ok(errors.some(e => e.field === 'bedrooms'));
    assert.ok(errors.some(e => e.field === 'legalConsentAccepted'));

    // Garage does not require bedrooms or bathrooms
    const validGarage = {
      title: 'Garage sécurisé avec box fermé',
      category: 'garage',
      city: 'Casablanca',
      district: 'Gauthier',
      price: 1200,
      surface: 18,
      description: 'Emplacement de parking privé en sous-sol avec badge magnétique.',
      contact: {
        phone: '0661234567',
        name: 'Rachid',
        type: 'particulier',
        showPhone: true,
        showEmail: false,
        showWhatsApp: true,
        showExactAddress: false,
        phoneConsentAccepted: true,
        email: ''
      },
      legalConsentAccepted: true
    };

    const garageErrors = validateListingForm(validGarage as unknown as Partial<Listing>);
    assert.equal(garageErrors.length, 0, 'Garage should have no validation errors without bedrooms');

    // Public text leak should fail validation
    const leakedGarage = {
      ...validGarage,
      description: 'Emplacement privé en sous-sol, contactez-moi au 0661234567 directement.'
    };
    const leakErrors = validateListingForm(leakedGarage as unknown as Partial<Listing>);
    assert.ok(leakErrors.some(e => e.field === 'publicContactLeak'));
  });

  it('filters listings by city, category, and price correctly', () => {
    const mockListings: Listing[] = [
      {
        id: '1',
        title: 'Appartement Maarif',
        slug: 'appartement-maarif',
        description: 'Superbe appartement lumineux',
        category: 'appartement',
        city: 'Casablanca',
        district: 'Maârif',
        price: 7500,
        period: 'mois',
        surface: 90,
        bedrooms: 2,
        amenities: ['Ascenseur', 'Climatisation'],
        contact: {
          name: 'Ahmed',
          type: 'particulier',
          phone: '0661234567',
          email: 'ahmed@test.ma',
          showPhone: true,
          showEmail: true,
          showWhatsApp: true,
          showExactAddress: false
        },
        userId: 'u1',
        status: 'publiee',
        viewsCount: 12,
        favoritesCount: 3,
        createdAt: '2026-05-01T10:00:00Z',
        updatedAt: '2026-05-01T10:00:00Z',
        availableFrom: '2026-05-01',
        legalConsentAccepted: true,
        latitude: 33.58,
        longitude: -7.63,
        images: []
      },
      {
        id: '2',
        title: 'Villa Palmeraie',
        slug: 'villa-palmeraie',
        description: 'Villa avec piscine privée',
        category: 'villa',
        city: 'Marrakech',
        district: 'Palmeraie',
        price: 18000,
        period: 'mois',
        surface: 350,
        bedrooms: 4,
        amenities: ['Piscine', 'Jardin privé'],
        contact: {
          name: 'Immo Atlas',
          type: 'professionnel',
          phone: '0524430000',
          email: 'contact@immoatlas.ma',
          showPhone: true,
          showEmail: true,
          showWhatsApp: true,
          showExactAddress: true
        },
        userId: 'u2',
        status: 'publiee',
        viewsCount: 45,
        favoritesCount: 8,
        createdAt: '2026-05-02T10:00:00Z',
        updatedAt: '2026-05-02T10:00:00Z',
        availableFrom: '2026-05-01',
        legalConsentAccepted: true,
        latitude: 31.65,
        longitude: -7.95,
        images: []
      },
      {
        id: '3',
        title: 'Studio non validé',
        slug: 'studio-en-attente',
        description: 'En attente de validation',
        category: 'studio',
        city: 'Casablanca',
        district: 'Gauthier',
        price: 4500,
        period: 'mois',
        surface: 40,
        bedrooms: 1,
        amenities: [],
        contact: {
          name: 'Youssef',
          type: 'particulier',
          phone: '0612345678',
          email: 'youssef@test.ma',
          showPhone: true,
          showEmail: true,
          showWhatsApp: false,
          showExactAddress: false
        },
        userId: 'u3',
        status: 'en_attente',
        viewsCount: 0,
        favoritesCount: 0,
        createdAt: '2026-05-03T10:00:00Z',
        updatedAt: '2026-05-03T10:00:00Z',
        availableFrom: '2026-06-01',
        legalConsentAccepted: true,
        latitude: 33.59,
        longitude: -7.62,
        images: []
      }
    ];

    const casaResults = filterAndSortListings(mockListings, { city: 'Casablanca' });
    assert.equal(casaResults.length, 1);
    assert.equal(casaResults[0].id, '1');

    const budgetResults = filterAndSortListings(mockListings, { priceMax: 10000 });
    assert.equal(budgetResults.length, 1);
    assert.equal(budgetResults[0].id, '1');

    const poolResults = filterAndSortListings(mockListings, { amenities: ['Piscine'] });
    assert.equal(poolResults.length, 1);
    assert.equal(poolResults[0].id, '2');

    const similar = getSimilarListings(mockListings[0], mockListings);
    assert.equal(similar.length, 1);
    assert.equal(similar[0].id, '2');
  });

  it('strictly masks all contact numbers for unauthenticated visitors and respects advertiser flags for authenticated users', () => {
    const sampleListing: Listing = {
      id: '1',
      title: 'Bel appartement Racine',
      slug: 'bel-appartement-racine',
      description: 'Superbe appartement',
      category: 'appartement',
      price: 9000,
      period: 'mois',
      surface: 100,
      address: '14 Rue Abou Hanifa, Étage 3, Appt 12',
      city: 'Casablanca',
      district: 'Racine',
      contact: {
        name: 'Karim',
        type: 'particulier',
        phone: '0661234567',
        whatsapp: '0661234567',
        email: 'karim@test.com',
        showPhone: true,
        showEmail: true,
        showWhatsApp: true,
        showExactAddress: false,
        phoneConsentAccepted: true
      },
      userId: 'u1',
      status: 'publiee',
      viewsCount: 20,
      favoritesCount: 4,
      createdAt: '2026-05-01',
      updatedAt: '2026-05-01',
      availableFrom: '2026-05-01',
      legalConsentAccepted: true,
      latitude: 33.58,
      longitude: -7.63,
      amenities: [],
      images: []
    };

    // Unauthenticated visitor NEVER gets phone, whatsapp, email, or exact street address
    const visitorView = sanitizeListingForVisitor(sampleListing);
    assert.equal(visitorView.contact.phone, '');
    assert.equal(visitorView.contact.whatsapp, undefined);
    assert.equal(visitorView.contact.email, '');
    assert.equal(visitorView.address, 'Racine, Casablanca');

    // Authenticated user gets phone/whatsapp/email if advertiser enabled them, but still masks exact address when showExactAddress is false
    const authView = sanitizeListingForPublic(sampleListing, true);
    assert.equal(authView.contact.phone, '0661234567');
    assert.equal(authView.contact.whatsapp, '0661234567');
    assert.equal(authView.contact.email, 'karim@test.com');
    assert.equal(authView.address, 'Racine, Casablanca');

    // When advertiser disables showPhone, even authenticated users do not see the phone number
    const hiddenPhoneListing: Listing = {
      ...sampleListing,
      contact: { ...sampleListing.contact, showPhone: false, showWhatsApp: false }
    };
    const hiddenPhoneAuthView = sanitizeListingForPublic(hiddenPhoneListing, true);
    assert.equal(hiddenPhoneAuthView.contact.phone, '');
    assert.equal(hiddenPhoneAuthView.contact.whatsapp, undefined);
  });

  it('calculates distance in km and detects nearest Moroccan city from Wi-Fi/GPS coordinates', () => {
    // Coordinates in Casablanca Maârif (33.5822, -7.6325)
    const nearestToCasa = findNearestMoroccanCity(33.5822, -7.6325, MOROCCAN_CITIES);
    assert.equal(nearestToCasa.city.name, 'Casablanca');
    assert.ok(nearestToCasa.distanceKm < 15);

    // Coordinates in Marrakech Guéliz (31.634, -8.01)
    const nearestToKech = findNearestMoroccanCity(31.634, -8.01, MOROCCAN_CITIES);
    assert.equal(nearestToKech.city.name, 'Marrakech');

    // Distance between Casablanca and Rabat is ~86 km
    const distCasaRabat = calculateDistanceKm(33.5731, -7.5898, 34.0209, -6.8416);
    assert.ok(distCasaRabat > 70 && distCasaRabat < 100);
  });

  it('prioritizes sponsored listings in default sort while strictly enforcing moderation and search filters', () => {
    const futureIso = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const baseListing: Listing = {
      id: 'reg-1',
      title: 'Appartement standard Casablanca',
      slug: 'appartement-standard-casa',
      description: 'Appartement calme et propre à Casablanca.',
      category: 'appartement',
      city: 'Casablanca',
      district: 'Maârif',
      price: 6000,
      period: 'mois',
      surface: 80,
      bedrooms: 2,
      amenities: [],
      images: [],
      latitude: 33.58,
      longitude: -7.63,
      contact: {
        name: 'Ali',
        type: 'particulier',
        phone: '0661000000',
        email: 'ali@test.ma',
        showPhone: true,
        showEmail: true,
        showWhatsApp: true,
        showExactAddress: false
      },
      userId: 'u1',
      status: 'publiee',
      viewsCount: 10,
      favoritesCount: 1,
      createdAt: '2026-05-04T12:00:00Z',
      updatedAt: '2026-05-04T12:00:00Z',
      availableFrom: 'Immédiate',
      legalConsentAccepted: true
    };

    const sponsoredCasa: Listing = {
      ...baseListing,
      id: 'spons-casa',
      title: 'Appartement Sponsorisé Casablanca',
      createdAt: '2026-05-01T10:00:00Z', // Older than reg-1, but boosted
      boost: {
        optionId: 'top',
        optionName: 'Annonce Top',
        status: 'active',
        startedAt: '2026-05-01T10:00:00Z',
        expiresAt: futureIso,
        transactionId: 'tx-1'
      }
    };

    const sponsoredUnapproved: Listing = {
      ...sponsoredCasa,
      id: 'spons-pending',
      status: 'en_attente' // Not approved by moderation yet
    };

    const all = [baseListing, sponsoredCasa, sponsoredUnapproved];

    // 1. Unapproved sponsored listing is strictly excluded by moderation rule
    const resultsCasa = filterAndSortListings(all, { city: 'Casablanca', sortBy: 'recent' });
    assert.equal(resultsCasa.length, 2);
    // Sponsored Casa ranks first even though it is older than baseListing
    assert.equal(resultsCasa[0].id, 'spons-casa');
    assert.equal(isListingBoostActive(resultsCasa[0]), true);

    // 2. Sponsored Casablanca listing is strictly excluded when filtering for Rabat
    const resultsRabat = filterAndSortListings(all, { city: 'Rabat', sortBy: 'recent' });
    assert.equal(resultsRabat.length, 0);
  });

  it('calculates subscription and boost revenues strictly from confirmed payments and excludes failed or refunded ones', () => {
    const txs: PaymentTransaction[] = [
      {
        id: 'tx-1',
        idempotencyKey: 'k1',
        userId: 'u1',
        userName: 'Agence Atlas',
        userEmail: 'atlas@ma.ma',
        type: 'subscription',
        targetId: 'pro',
        targetLabel: 'Abonnement Agence Pro',
        optionId: 'pro',
        amount: 499,
        currency: 'MAD',
        status: 'paye',
        provider: 'test_cmi_sandbox',
        paymentMethodLabel: 'CMI Test',
        createdAt: '2026-05-04T10:00:00Z'
      },
      {
        id: 'tx-2',
        idempotencyKey: 'k2',
        userId: 'u1',
        userName: 'Agence Atlas',
        userEmail: 'atlas@ma.ma',
        type: 'boost',
        targetId: 'darna-1',
        targetLabel: 'Annonce Top',
        optionId: 'top',
        amount: 99,
        currency: 'MAD',
        status: 'paye',
        provider: 'test_cmi_sandbox',
        paymentMethodLabel: 'CMI Test',
        createdAt: '2026-05-04T10:05:00Z'
      },
      {
        id: 'tx-3',
        idempotencyKey: 'k3',
        userId: 'u2',
        userName: 'Karim',
        userEmail: 'karim@ma.ma',
        type: 'boost',
        targetId: 'darna-2',
        targetLabel: 'Annonce Premium',
        optionId: 'premium',
        amount: 49,
        currency: 'MAD',
        status: 'echoue',
        provider: 'test_cmi_sandbox',
        paymentMethodLabel: 'CMI Test',
        createdAt: '2026-05-04T10:10:00Z'
      },
      {
        id: 'tx-4',
        idempotencyKey: 'k4',
        userId: 'u3',
        userName: 'Agence Sud',
        userEmail: 'sud@ma.ma',
        type: 'subscription',
        targetId: 'starter',
        targetLabel: 'Abonnement Agence Starter',
        optionId: 'starter',
        amount: 199,
        currency: 'MAD',
        status: 'rembourse',
        provider: 'test_cmi_sandbox',
        paymentMethodLabel: 'CMI Test',
        createdAt: '2026-05-04T10:15:00Z'
      }
    ];

    const summary = calculateRevenueSummary(txs);
    assert.equal(summary.subscriptionRevenue, 499);
    assert.equal(summary.boostRevenue, 99);
    assert.equal(summary.totalNetRevenue, 598);
    assert.equal(summary.refundedTotal, 199);
    assert.equal(summary.paidTransactionsCount, 2);
    assert.equal(summary.failedTransactionsCount, 1);
    assert.equal(summary.refundedTransactionsCount, 1);
  });

  it('enforces subscription plan maxListings quota accurately', () => {
    const user: User = {
      id: 'u-test',
      name: 'Particulier Test',
      email: 'test@darna.ma',
      phone: '0661000000',
      role: 'particulier',
      subscription: {
        planId: 'particulier',
        planName: 'Particulier',
        status: 'active',
        maxListings: 2,
        startedAt: '2026-01-01T00:00:00Z',
        expiresAt: '2027-01-01T00:00:00Z'
      },
      createdAt: '2026-01-01'
    };

    const twoListings = [
      { id: 'l1', userId: 'u-test', status: 'publiee' },
      { id: 'l2', userId: 'u-test', status: 'en_attente' }
    ] as Listing[];

    const quotaReached = getUserListingQuota(user, twoListings, INITIAL_SUBSCRIPTION_PLANS);
    assert.equal(quotaReached.usedListings, 2);
    assert.equal(quotaReached.maxListings, 2);
    assert.equal(quotaReached.canPublish, false);
  });
});

