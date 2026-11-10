import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMAD,
  formatMoroccanPhone,
  buildWhatsAppLink,
  validateListingForm,
  filterAndSortListings,
  sanitizeListingForPublic
} from '../src/utils/rentalLogic.ts';
import { Listing, ListingFilter } from '../src/types/index.ts';

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

  it('validates mandatory fields and category-specific rules', () => {
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
      contact: { phone: '0661234567', name: 'Rachid', type: 'particulier', showPhone: true, showEmail: false, showWhatsApp: true, showExactAddress: false, email: '' },
      legalConsentAccepted: true
    };

    const garageErrors = validateListingForm(validGarage as unknown as Partial<Listing>);
    assert.equal(garageErrors.length, 0, 'Garage should have no validation errors without bedrooms');
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
        category: 'appartement',
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

    // Filter by city Casablanca
    const casaResults = filterAndSortListings(mockListings, { city: 'Casablanca' });
    assert.equal(casaResults.length, 1);
    assert.equal(casaResults[0].id, '1');

    // Filter by price range
    const budgetResults = filterAndSortListings(mockListings, { priceMax: 10000 });
    assert.equal(budgetResults.length, 1);
    assert.equal(budgetResults[0].id, '1');

    // Filter by amenity Piscine
    const poolResults = filterAndSortListings(mockListings, { amenities: ['Piscine'] });
    assert.equal(poolResults.length, 1);
    assert.equal(poolResults[0].id, '2');
  });

  it('sanitizes public contact info when advertiser opts to hide exact phone or street address', () => {
    const privateListing: Listing = {
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
        email: 'karim@test.com',
        showPhone: false,
        showEmail: true,
        showWhatsApp: false,
        showExactAddress: false
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

    const sanitized = sanitizeListingForPublic(privateListing);
    assert.equal(sanitized.contact.phone, '', 'Phone must be masked when showPhone is false');
    assert.equal(sanitized.address, 'Racine, Casablanca', 'Exact street address must be masked when showExactAddress is false');
    assert.equal(sanitized.contact.email, 'karim@test.com', 'Email stays visible if selected');
  });
});
