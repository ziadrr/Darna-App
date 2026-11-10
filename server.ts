import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  INITIAL_LISTINGS,
  INITIAL_USERS,
  INITIAL_REPORTS,
  INITIAL_SUBSCRIPTION_PLANS,
  INITIAL_BOOST_OPTIONS
} from './src/data/mockListings.ts';
import {
  Listing,
  ListingReport,
  User,
  SubscriptionPlan,
  BoostOption,
  PaymentTransaction,
  BoostOptionId
} from './src/types/index.ts';
import {
  sanitizeListingForVisitor,
  sanitizeListingForPublic,
  detectContactInPublicText,
  calculateRevenueSummary,
  getUserListingQuota
} from './src/utils/rentalLogic.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = 3000;

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// In-memory persistent database for session
let dbListings: Listing[] = [...INITIAL_LISTINGS];
let dbUsers: User[] = [...INITIAL_USERS];
let dbReports: ListingReport[] = [...INITIAL_REPORTS];
let dbPlans: SubscriptionPlan[] = [...INITIAL_SUBSCRIPTION_PLANS];
let dbBoostOptions: BoostOption[] = [...INITIAL_BOOST_OPTIONS];
// Strictly empty initial transactions: no fake payments or fake revenues
let dbTransactions: PaymentTransaction[] = [];

const dbPasswords = new Map<string, string>([
  ['karim.bennani@gmail.com', 'Darna2026!'],
  ['contact@atlasprestige.ma', 'Darna2026!'],
  ['admin@darna.ma', 'Admin2026!'],
]);
const dbSessions = new Map<string, string>(); // token -> userId
const contactRateLimiter = new Map<string, { count: number; resetAt: number }>();

function getAuthUser(req: express.Request): User | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const userId = dbSessions.get(token);
  if (!userId) return null;
  return dbUsers.find((u) => u.id === userId) || null;
}

function formatListingForViewer(listing: Listing, viewer: User | null): Listing {
  if (!viewer) {
    return sanitizeListingForVisitor(listing);
  }
  if (viewer.role === 'admin' || listing.userId === viewer.id) {
    return listing;
  }
  return sanitizeListingForPublic(listing, true);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Auth Routes
  app.post('/api/auth/register', (req, res) => {
    const { firstName, lastName, email, password, phone, advertiserType, termsAccepted } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez renseigner votre prénom, nom, adresse e-mail et mot de passe.',
      });
    }
    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 6 caractères.',
      });
    }
    if (!termsAccepted) {
      return res.status(400).json({
        success: false,
        message: "Vous devez accepter les conditions d'utilisation et la politique de confidentialité.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = dbUsers.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Un compte existe déjà avec cette adresse e-mail. Veuillez vous connecter.',
      });
    }

    const role = advertiserType === 'professionnel' ? 'professionnel' : 'particulier';
    const defaultPlan = dbPlans.find((p) => p.id === 'particulier') || dbPlans[0];
    const nowIso = new Date().toISOString();
    const nextYearIso = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

    const newUser: User = {
      id: `user-${Date.now()}`,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      name: `${String(firstName).trim()} ${String(lastName).trim()}`,
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : '',
      role,
      advertiserType: advertiserType === 'professionnel' ? 'professionnel' : 'particulier',
      verified: false,
      emailVerified: false,
      favorites: [],
      subscription: {
        planId: defaultPlan.id,
        planName: defaultPlan.name,
        status: 'active',
        maxListings: defaultPlan.maxListings,
        startedAt: nowIso,
        expiresAt: nextYearIso,
      },
      createdAt: nowIso.split('T')[0],
    };

    dbUsers.push(newUser);
    dbPasswords.set(normalizedEmail, String(password));

    const token = `darna-tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    dbSessions.set(token, newUser.id);

    res.status(201).json({
      success: true,
      user: newUser,
      token,
      verificationCodeHint: '123456',
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez saisir votre adresse e-mail et votre mot de passe.',
      });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = dbUsers.find((u) => u.email.toLowerCase() === normalizedEmail);
    const savedPassword = dbPasswords.get(normalizedEmail);

    if (!user || (savedPassword && savedPassword !== password)) {
      return res.status(401).json({
        success: false,
        message: 'Adresse e-mail ou mot de passe incorrect.',
      });
    }

    const token = `darna-tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    dbSessions.set(token, user.id);

    res.json({ success: true, user, token });
  });

  app.post('/api/auth/demo-login', (req, res) => {
    const { role } = req.body;
    let user = dbUsers[0];
    if (role === 'professionnel') {
      user = dbUsers.find((u) => u.role === 'professionnel') || dbUsers[1];
    } else if (role === 'admin') {
      user = dbUsers.find((u) => u.role === 'admin') || dbUsers[2];
    }
    const token = `darna-tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    dbSessions.set(token, user.id);
    res.json({ success: true, user, token });
  });

  app.post('/api/auth/verify-email', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({ success: false, message: 'Non connecté.' });
    }
    viewer.emailVerified = true;
    res.json({ success: true, user: viewer });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const { email, newPassword } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Veuillez indiquer votre adresse e-mail.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = dbUsers.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (user && newPassword && String(newPassword).length >= 6) {
      dbPasswords.set(normalizedEmail, String(newPassword));
    }
    res.json({
      success: true,
      message: 'Un lien de réinitialisation de mot de passe a été envoyé à votre adresse e-mail.',
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      dbSessions.delete(authHeader.slice(7).trim());
    }
    res.json({ success: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({ success: false, user: null });
    }
    res.json({ success: true, user: viewer });
  });

  app.post('/api/auth/favorites', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        message: 'Créez un compte ou connectez-vous pour continuer.',
      });
    }
    const { listingId } = req.body;
    if (!listingId) {
      return res.status(400).json({ success: false, message: 'ID annonce manquant.' });
    }
    const favs = viewer.favorites || [];
    const exists = favs.includes(listingId);
    viewer.favorites = exists ? favs.filter((id) => id !== listingId) : [...favs, listingId];
    res.json({ success: true, favorites: viewer.favorites });
  });

  // Automatic Wi-Fi / IP Network Geolocation Endpoint
  app.get('/api/locate-ip', async (req, res) => {
    try {
      // Check Cloud Run / Proxy geolocation headers first
      const gcpCity = req.headers['x-appengine-city'] as string | undefined;
      const gcpLatLong = req.headers['x-appengine-citylatlong'] as string | undefined;
      if (gcpLatLong && gcpLatLong.includes(',')) {
        const [latStr, lngStr] = gcpLatLong.split(',');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (!isNaN(lat) && !isNaN(lng)) {
          return res.json({
            success: true,
            city: gcpCity ? gcpCity.charAt(0).toUpperCase() + gcpCity.slice(1) : 'Casablanca',
            lat,
            lng,
            source: 'wifi_ip',
          });
        }
      }

      // Default Moroccan hub coordinates (Casablanca Maârif) when behind local/cloud proxy
      res.json({
        success: true,
        city: 'Casablanca',
        lat: 33.5731,
        lng: -7.5898,
        source: 'wifi_ip',
      });
    } catch {
      res.json({
        success: true,
        city: 'Casablanca',
        lat: 33.5731,
        lng: -7.5898,
        source: 'wifi_ip',
      });
    }
  });

  // API Routes: Listings (Strictly sanitized based on authentication state)
  app.get('/api/listings', (req, res) => {
    const viewer = getAuthUser(req);
    const sanitized = dbListings.map((l) => formatListingForViewer(l, viewer));
    res.json({ success: true, listings: sanitized });
  });

  app.get('/api/listings/:id', (req, res) => {
    const viewer = getAuthUser(req);
    const listing = dbListings.find((l) => l.id === req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Annonce non trouvée' });
    }
    listing.viewsCount += 1;
    res.json({ success: true, listing: formatListingForViewer(listing, viewer) });
  });

  // Protected endpoint to retrieve advertiser contact details with rate-limiting against scraping
  app.get('/api/listings/:id/contact', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        message: 'Créez un compte ou connectez-vous pour continuer.',
      });
    }

    const now = Date.now();
    const rateKey = viewer.id;
    const rateEntry = contactRateLimiter.get(rateKey);
    if (!rateEntry || now > rateEntry.resetAt) {
      contactRateLimiter.set(rateKey, { count: 1, resetAt: now + 60_000 });
    } else {
      rateEntry.count += 1;
      if (rateEntry.count > 30) {
        return res.status(429).json({
          success: false,
          message: 'Trop de demandes de coordonnées. Veuillez patienter une minute.',
        });
      }
    }

    const listing = dbListings.find((l) => l.id === req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Annonce non trouvée' });
    }

    const sanitized = sanitizeListingForPublic(listing, true);
    res.json({
      success: true,
      contact: sanitized.contact,
      address: sanitized.address,
    });
  });

  app.post('/api/listings', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        message: 'Créez un compte ou connectez-vous pour continuer.',
      });
    }

    // Check subscription plan listing limit
    const quota = getUserListingQuota(viewer, dbListings, dbPlans);
    if (!quota.canPublish) {
      return res.status(403).json({
        success: false,
        code: 'QUOTA_EXCEEDED',
        message: `Vous avez atteint la limite de votre offre « ${quota.planName} » (${quota.usedListings}/${quota.maxListings} annonces). Passez à une offre supérieure pour publier davantage de biens.`,
        quota,
      });
    }

    try {
      const titleCheck = detectContactInPublicText(req.body.title || '');
      const descCheck = detectContactInPublicText(req.body.description || '');
      const flagged = titleCheck.hasContactInfo || descCheck.hasContactInfo;

      const newListing: Listing = {
        ...req.body,
        id: `darna-${Date.now()}`,
        userId: viewer.id,
        slug: (req.body.title || 'annonce')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
        viewsCount: 0,
        favoritesCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: req.body.status === 'brouillon' ? 'brouillon' : 'publiee',
        isDemo: false,
        flaggedForContactInText: flagged,
      };
      dbListings.unshift(newListing);
      res.status(201).json({ success: true, listing: newListing });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  app.put('/api/listings/:id', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        message: 'Créez un compte ou connectez-vous pour continuer.',
      });
    }
    const index = dbListings.findIndex((l) => l.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Annonce non trouvée' });
    }
    if (dbListings[index].userId !== viewer.id && viewer.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à modifier l'annonce d'un autre utilisateur.",
      });
    }
    dbListings[index] = {
      ...dbListings[index],
      ...req.body,
      id: dbListings[index].id,
      userId: dbListings[index].userId,
      updatedAt: new Date().toISOString(),
    };
    res.json({ success: true, listing: dbListings[index] });
  });

  app.delete('/api/listings/:id', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        message: 'Créez un compte ou connectez-vous pour continuer.',
      });
    }
    const target = dbListings.find((l) => l.id === req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Annonce introuvable' });
    }
    if (target.userId !== viewer.id && viewer.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à supprimer l'annonce d'un autre utilisateur.",
      });
    }
    dbListings = dbListings.filter((l) => l.id !== req.params.id);
    res.json({ success: true, message: 'Annonce supprimée avec succès' });
  });

  // Moderation Route (Approve, Reject, Hide)
  app.post('/api/listings/:id/moderate', (req, res) => {
    const { action, reason } = req.body;
    const listing = dbListings.find((l) => l.id === req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Annonce non trouvée' });
    }

    if (action === 'approve') {
      listing.status = 'publiee';
      delete listing.rejectionReason;
    } else if (action === 'reject') {
      listing.status = 'refusee';
      listing.rejectionReason = reason || 'Non conforme aux critères de publication Darna.';
    } else if (action === 'hide') {
      listing.status = 'masquee';
      listing.rejectionReason = reason || 'Masquée suite à un signalement.';
    } else if (action === 'expire') {
      listing.status = 'expiree';
    }

    listing.updatedAt = new Date().toISOString();
    res.json({ success: true, listing });
  });

  // Reports
  app.get('/api/reports', (_req, res) => {
    res.json({ success: true, reports: dbReports });
  });

  app.post('/api/reports', (req, res) => {
    const newReport: ListingReport = {
      id: `rep-${Date.now()}`,
      listingId: req.body.listingId,
      listingTitle: req.body.listingTitle || 'Annonce',
      reason: req.body.reason || 'inapproprié',
      comment: req.body.comment || '',
      reporterEmail: req.body.reporterEmail,
      createdAt: new Date().toISOString(),
      status: 'en_attente',
    };
    dbReports.unshift(newReport);
    res.status(201).json({ success: true, report: newReport });
  });

  app.post('/api/reports/:id/resolve', (req, res) => {
    const report = dbReports.find((r) => r.id === req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Signalement introuvable' });
    }
    report.status = req.body.action === 'dismiss' ? 'rejete' : 'resolu';
    res.json({ success: true, report });
  });

  // Users
  app.get('/api/users', (_req, res) => {
    res.json({ success: true, users: dbUsers });
  });

  // ============================================================================
  // MONETIZATION, SUBSCRIPTIONS, BOOSTS & SECURE TEST PAYMENTS (MAD)
  // ============================================================================

  // Public Monetization Config (Plans, Boost Options & Payment Gateway Mode)
  app.get('/api/monetization/config', (_req, res) => {
    res.json({
      success: true,
      plans: dbPlans,
      boostOptions: dbBoostOptions,
      paymentGateway: {
        mode: 'test',
        providerName: 'Passerelle CMI / Payzone Maroc (Mode Test / Bac à sable)',
        liveOperational: false,
        currency: 'MAD',
        notice:
          'Mode Test actif : aucun débit bancaire réel n’est effectué tant que les identifiants marchands CMI/Payzone de production ne sont pas configurés.',
      },
    });
  });

  // Authenticated user's current subscription, quota & payment history
  app.get('/api/payments/my', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        message: 'Créez un compte ou connectez-vous pour consulter vos abonnements et paiements.',
      });
    }
    const quota = getUserListingQuota(viewer, dbListings, dbPlans);
    const myTransactions = dbTransactions.filter((t) => t.userId === viewer.id);
    res.json({
      success: true,
      subscription: viewer.subscription || null,
      quota,
      transactions: myTransactions,
    });
  });

  // Admin: Get full monetization overview (plans, boost options, active subscriptions, transactions, revenue breakdown)
  app.get('/api/admin/monetization', (_req, res) => {
    const revenueSummary = calculateRevenueSummary(dbTransactions);
    const activeSubscriptions = dbUsers
      .filter((u) => u.subscription && u.subscription.status === 'active')
      .map((u) => ({
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        role: u.role,
        companyName: u.companyName,
        subscription: u.subscription!,
        usedListings: dbListings.filter(
          (l) =>
            l.userId === u.id &&
            (l.status === 'publiee' || l.status === 'en_attente' || l.status === 'brouillon')
        ).length,
      }));

    res.json({
      success: true,
      plans: dbPlans,
      boostOptions: dbBoostOptions,
      transactions: dbTransactions,
      activeSubscriptions,
      revenueSummary,
    });
  });

  // Admin: Create a new subscription plan
  app.post('/api/admin/plans', (req, res) => {
    const { name, price, period = 'mois', maxListings, features, isCustomQuote } = req.body;
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Le nom de l'offre est obligatoire.",
      });
    }
    const slugId = String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const id = dbPlans.some((p) => p.id === slugId) ? `${slugId}-${Date.now()}` : slugId;

    const newPlan: SubscriptionPlan = {
      id,
      name: String(name).trim(),
      price: isCustomQuote ? null : Math.max(0, Number(price) || 0),
      period: period === 'an' ? 'an' : 'mois',
      maxListings: Math.max(1, Number(maxListings) || 5),
      features: Array.isArray(features)
        ? features.map((f: any) => String(f).trim()).filter(Boolean)
        : ['Publication d’annonces vérifiées'],
      isCustomQuote: Boolean(isCustomQuote),
    };

    dbPlans.push(newPlan);
    res.status(201).json({ success: true, plan: newPlan, plans: dbPlans });
  });

  // Admin: Update an existing subscription plan (price, maxListings, features, name)
  app.put('/api/admin/plans/:id', (req, res) => {
    const idx = dbPlans.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Offre introuvable.' });
    }

    const existing = dbPlans[idx];
    const isCustomQuote =
      req.body.isCustomQuote !== undefined ? Boolean(req.body.isCustomQuote) : existing.isCustomQuote;
    const updatedPrice = isCustomQuote
      ? null
      : req.body.price !== undefined
      ? Math.max(0, Number(req.body.price))
      : existing.price;
    const updatedMaxListings =
      req.body.maxListings !== undefined
        ? Math.max(1, Number(req.body.maxListings))
        : existing.maxListings;
    const updatedName =
      req.body.name !== undefined && String(req.body.name).trim().length > 0
        ? String(req.body.name).trim()
        : existing.name;
    const updatedFeatures = Array.isArray(req.body.features)
      ? req.body.features.map((f: any) => String(f).trim()).filter(Boolean)
      : existing.features;

    dbPlans[idx] = {
      ...existing,
      name: updatedName,
      price: updatedPrice,
      maxListings: updatedMaxListings,
      features: updatedFeatures,
      isCustomQuote,
    };

    // Propagate updated maxListings & planName to users currently subscribed to this plan
    for (const u of dbUsers) {
      if (u.subscription && u.subscription.planId === existing.id && u.subscription.status === 'active') {
        u.subscription.maxListings = updatedMaxListings;
        u.subscription.planName = updatedName;
      }
    }

    res.json({ success: true, plan: dbPlans[idx], plans: dbPlans });
  });

  // Admin: Update a listing boost option (price in MAD, durationDays, name, description)
  app.put('/api/admin/boost-options/:id', (req, res) => {
    const idx = dbBoostOptions.findIndex((b) => b.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({
        success: false,
        message: 'Option de mise en avant introuvable.',
      });
    }

    const existing = dbBoostOptions[idx];
    dbBoostOptions[idx] = {
      ...existing,
      name:
        req.body.name !== undefined && String(req.body.name).trim()
          ? String(req.body.name).trim()
          : existing.name,
      description:
        req.body.description !== undefined && String(req.body.description).trim()
          ? String(req.body.description).trim()
          : existing.description,
      price:
        req.body.price !== undefined
          ? Math.max(1, Number(req.body.price))
          : existing.price,
      durationDays:
        req.body.durationDays !== undefined
          ? Math.max(1, Number(req.body.durationDays))
          : existing.durationDays,
    };

    res.json({
      success: true,
      boostOption: dbBoostOptions[idx],
      boostOptions: dbBoostOptions,
    });
  });

  // Checkout Endpoint (Test Mode CMI / Payzone Maroc):
  // - Never stores full card numbers
  // - Protects against double payments via idempotencyKey and active purchase check
  // - Only activates subscription or listing boost AFTER confirmed payment ('paye')
  app.post('/api/payments/checkout', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        message: 'Créez un compte ou connectez-vous pour souscrire une offre ou mettre en avant une annonce.',
      });
    }

    const {
      type,
      optionId,
      targetId,
      idempotencyKey,
      testScenario = 'success',
      paymentMethodType = 'cmi_card',
      cardNumber,
    } = req.body;

    // Security check: Reject if client attempts to send or store a full raw card number
    if (cardNumber && String(cardNumber).replace(/\D/g, '').length >= 12) {
      return res.status(400).json({
        success: false,
        message:
          'Sécurité PCI-DSS : ne transmettez jamais de numéro de carte bancaire complet au serveur. Utilisez le jeton sécurisé du prestataire en mode test.',
      });
    }

    if (!type || !optionId || !idempotencyKey) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres de paiement incomplets.',
      });
    }

    // 1. Idempotency protection: check if this idempotencyKey already succeeded
    const duplicateByKey = dbTransactions.find(
      (t) => t.idempotencyKey === idempotencyKey && t.status === 'paye'
    );
    if (duplicateByKey) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_PAYMENT',
        message:
          'Protection anti-double paiement : ce paiement a déjà été enregistré et confirmé. Aucun second débit n’a été effectué.',
        transaction: duplicateByKey,
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const methodLabel =
      paymentMethodType === 'payzone'
        ? 'Payzone Maroc (Mode Test •••• 1111)'
        : 'Carte CMI / Visa Maroc (Mode Test •••• 4242)';

    if (type === 'subscription') {
      const plan = dbPlans.find((p) => p.id === optionId);
      if (!plan) {
        return res.status(404).json({ success: false, message: 'Offre d’abonnement introuvable.' });
      }
      if (plan.isCustomQuote || plan.price === null) {
        return res.status(400).json({
          success: false,
          message:
            'L’offre Entreprise est disponible uniquement sur devis personnalisé. Contactez notre service grands comptes.',
        });
      }

      // Check if user already has this exact paid plan active (within last 60 seconds) to prevent accidental double click
      const recentIdenticalSubTx = dbTransactions.find(
        (t) =>
          t.userId === viewer.id &&
          t.type === 'subscription' &&
          t.optionId === plan.id &&
          t.status === 'paye' &&
          now.getTime() - new Date(t.createdAt).getTime() < 60_000
      );
      if (recentIdenticalSubTx) {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_PAYMENT',
          message: `Protection anti-double paiement : votre abonnement « ${plan.name} » vient déjà d'être activé.`,
          transaction: recentIdenticalSubTx,
        });
      }

      const tx: PaymentTransaction = {
        id: `tx-sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        idempotencyKey: String(idempotencyKey),
        userId: viewer.id,
        userName: viewer.name,
        userEmail: viewer.email,
        type: 'subscription',
        targetId: plan.id,
        targetLabel: `Abonnement ${plan.name}`,
        optionId: plan.id,
        amount: plan.price,
        currency: 'MAD',
        status: testScenario === 'failed' ? 'echoue' : 'paye',
        provider: 'test_cmi_sandbox',
        paymentMethodLabel: plan.price === 0 ? 'Activation gratuite (0 MAD)' : methodLabel,
        failureReason:
          testScenario === 'failed'
            ? 'Transaction refusée par la banque émettrice (Simulation d’échec Mode Test).'
            : undefined,
        createdAt: nowIso,
        confirmedAt: testScenario === 'failed' ? undefined : nowIso,
      };

      dbTransactions.unshift(tx);

      if (tx.status === 'echoue') {
        return res.status(402).json({
          success: false,
          status: 'echoue',
          message:
            'Le paiement a échoué (simulation Mode Test). Votre abonnement n’a pas été modifié.',
          transaction: tx,
        });
      }

      // Payment confirmed ('paye'): Activate subscription now
      const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
      viewer.subscription = {
        planId: plan.id,
        planName: plan.name,
        status: 'active',
        maxListings: plan.maxListings,
        startedAt: nowIso,
        expiresAt,
        transactionId: tx.id,
      };
      if (plan.id !== 'particulier' && viewer.role === 'particulier') {
        viewer.role = 'professionnel';
        viewer.advertiserType = 'professionnel';
      }

      return res.json({
        success: true,
        status: 'paye',
        message: `Paiement confirmé (Mode Test). Votre offre « ${plan.name} » est désormais active !`,
        transaction: tx,
        user: viewer,
        quota: getUserListingQuota(viewer, dbListings, dbPlans),
      });
    }

    if (type === 'boost') {
      const boostOpt = dbBoostOptions.find((b) => b.id === (optionId as BoostOptionId));
      if (!boostOpt) {
        return res.status(404).json({
          success: false,
          message: 'Option de mise en avant introuvable.',
        });
      }
      const listing = dbListings.find((l) => l.id === targetId);
      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Annonce cible introuvable.',
        });
      }
      if (listing.userId !== viewer.id && viewer.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous ne pouvez mettre en avant que vos propres annonces.',
        });
      }

      // Check duplicate active boost with same option on the same listing
      if (
        listing.boost &&
        listing.boost.status === 'active' &&
        listing.boost.optionId === boostOpt.id &&
        new Date(listing.boost.expiresAt).getTime() > now.getTime()
      ) {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_PAYMENT',
          message: `Protection anti-double paiement : cette annonce bénéficie déjà de l’option « ${boostOpt.name} » active.`,
        });
      }

      const tx: PaymentTransaction = {
        id: `tx-boost-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        idempotencyKey: String(idempotencyKey),
        userId: viewer.id,
        userName: viewer.name,
        userEmail: viewer.email,
        type: 'boost',
        targetId: listing.id,
        targetLabel: `${boostOpt.name} — ${listing.title}`,
        optionId: boostOpt.id,
        amount: boostOpt.price,
        currency: 'MAD',
        status: testScenario === 'failed' ? 'echoue' : 'paye',
        provider: 'test_cmi_sandbox',
        paymentMethodLabel: methodLabel,
        failureReason:
          testScenario === 'failed'
            ? 'Autorisation bancaire refusée (Simulation d’échec Mode Test).'
            : undefined,
        createdAt: nowIso,
        confirmedAt: testScenario === 'failed' ? undefined : nowIso,
      };

      dbTransactions.unshift(tx);

      if (tx.status === 'echoue') {
        return res.status(402).json({
          success: false,
          status: 'echoue',
          message:
            'Le paiement a échoué (simulation Mode Test). La mise en avant n’a pas été activée sur votre annonce.',
          transaction: tx,
        });
      }

      // Payment confirmed ('paye'): Activate boost on listing
      const expiresAt = new Date(
        now.getTime() + boostOpt.durationDays * 24 * 3600 * 1000
      ).toISOString();

      listing.boost = {
        optionId: boostOpt.id,
        optionName: boostOpt.name,
        status: 'active',
        startedAt: nowIso,
        expiresAt,
        transactionId: tx.id,
      };
      listing.updatedAt = nowIso;

      return res.json({
        success: true,
        status: 'paye',
        message: `Paiement confirmé (Mode Test). Votre annonce affiche désormais la mention « Sponsorisé » (${boostOpt.name} — ${boostOpt.durationDays} jours) !`,
        transaction: tx,
        listing,
      });
    }

    return res.status(400).json({ success: false, message: 'Type de transaction non reconnu.' });
  });

  // Admin: Refund a confirmed transaction and revoke the corresponding subscription or boost
  app.post('/api/payments/:id/refund', (req, res) => {
    const tx = dbTransactions.find((t) => t.id === req.params.id);
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction introuvable.' });
    }
    if (tx.status !== 'paye') {
      return res.status(400).json({
        success: false,
        message: 'Seul un paiement confirmé (« payé ») peut faire l’objet d’un remboursement.',
      });
    }

    const nowIso = new Date().toISOString();
    tx.status = 'rembourse';
    tx.refundedAt = nowIso;

    if (tx.type === 'subscription') {
      const targetUser = dbUsers.find((u) => u.id === tx.userId);
      const freePlan = dbPlans.find((p) => p.id === 'particulier') || dbPlans[0];
      if (targetUser) {
        targetUser.subscription = {
          planId: freePlan.id,
          planName: freePlan.name,
          status: 'refunded',
          maxListings: freePlan.maxListings,
          startedAt: nowIso,
          expiresAt: nowIso,
        };
      }
    } else if (tx.type === 'boost') {
      const targetListing = dbListings.find((l) => l.id === tx.targetId);
      if (targetListing && targetListing.boost) {
        targetListing.boost = {
          ...targetListing.boost,
          status: 'revoked',
        };
      }
    }

    res.json({
      success: true,
      message: `Transaction ${tx.id} remboursée (${tx.amount} MAD). L’option associée a été désactivée.`,
      transaction: tx,
      revenueSummary: calculateRevenueSummary(dbTransactions),
    });
  });

  // Feature 1: TTS with gemini-3.8-flash-tts
  app.post('/api/tts', async (req, res) => {
    const { text, voice } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Le texte est requis' });
    }

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'Clé API Gemini non configurée dans l\'environnement.',
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.slice(0, 500), // Clean readable excerpt
                speechMetadata: {
                  style: 'Voix chaleureuse, posée, professionnelle, visite guidée immobilière.',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error('Aucune donnée audio générée.');
      }

      res.json({
        success: true,
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (err: any) {
      console.error('Error generating TTS:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Erreur lors de la synthèse vocale Gemini.',
      });
    }
  });

  // Feature 2: Image Generation with gemini-3-pro-image-preview and 1K, 2K, 4K size affordance
  app.post('/api/generate-image', async (req, res) => {
    const { prompt, imageSize = '1K', aspectRatio = '4:3' } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Le prompt est requis' });
    }

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'Clé API Gemini non configurée dans l\'environnement.',
      });
    }

    try {
      // Use gemini-3-pro-image-preview as requested
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: `High-end Moroccan interior design or architecture: ${prompt}` }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
            imageSize: imageSize as any,
          },
        },
      });

      let imageUrl: string | null = null;
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!imageUrl) {
        throw new Error("L'image n'a pas pu être extraite de la réponse.");
      }

      res.json({ success: true, imageUrl, imageSize });
    } catch (err: any) {
      console.error('Error generating image with gemini-3-pro-image-preview:', err);
      res.status(500).json({
        success: false,
        message: err.message || "Erreur lors de la génération de l'image.",
      });
    }
  });

  // Feature 3: Gemini Chatbot (Multi-turn, role system instruction, model routing)
  // gemini-4-argon for complex tasks (legal/contract/CNDP), gemini-3.8-flash for general, gemini-3.1-flash-lite for fast
  app.post('/api/chat', async (req, res) => {
    const { messages, roleType = 'advisor' } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Historique de conversation invalide' });
    }

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: 'Clé API Gemini non configurée dans l\'environnement.',
      });
    }

    let modelName = 'gemini-3.8-flash';
    let systemInstruction = '';

    if (roleType === 'legal') {
      // Complex task: Moroccan rental legislation (Loi 67-12), tenant/landlord rights, CNDP compliance
      modelName = 'gemini-4-argon';
      systemInstruction = `Tu es l'Expert Juridique Spécialiste de la Location Immobilière au Maroc pour la plateforme Darna.
Tu maîtrises parfaitement :
- La Loi n° 67-12 organisant les rapports contractuels entre bailleurs et locataires des locaux à usage d'habitation ou à usage professionnel au Maroc.
- Les règles du bail écrit légalisé, l'état des lieux obligatoire, la caution (plafonnée légalement à 2 mois de loyer), le préavis de résiliation et les conditions d'expulsion.
- Les obligations de protection des données personnelles auprès de la CNDP (Commission Nationale de contrôle de la protection des Données à caractère Personnel - Loi n° 09-08).
- La fiscalité locative marocaine (taxe d'habitation, taxe de services communaux, retenue à la source éventuelle).
Réponds avec rigueur, clarté et bienveillance en français (ou en darija/arabe si l'utilisateur s'adresse ainsi). Rappelle toujours en conclusion que tes conseils ont une valeur informative et qu'un notaire, avocat ou adoul au Maroc doit valider les actes définitifs.`;
    } else if (roleType === 'estimate') {
      // Fast task: rapid rent estimate and budget
      modelName = 'gemini-3.1-flash-lite';
      systemInstruction = `Tu es le Simulateur Rapide de Loyer Darna pour le marché marocain.
Fournis des estimations rapides, concises et précises du loyer mensuel en Dirhams Marocains (MAD) selon :
- La ville (Casablanca, Rabat, Marrakech, Tanger, Agadir, Fès, etc.)
- Le quartier spécifique (Maarif, Gauthier, Agdal, Hay Riad, Guéliz, Malabata, etc.)
- Le type de bien, la superficie en m², le standing et l'état meublé ou vide.
Sois direct, donne des fourchettes réalistes (ex: 6 500 - 8 000 MAD / mois) et les facteurs d'influence.`;
    } else {
      // General task: general real estate advisor
      modelName = 'gemini-3.8-flash';
      systemInstruction = `Tu es l'Assistant Recherche et Vie de Quartier Darna au Maroc.
Tu aides les futurs locataires et les propriétaires au Maroc :
- Conseils sur les quartiers (ambiance, écoles, transports, commerces, sécurité) à Casablanca, Rabat, Marrakech, Tanger, etc.
- Conseils pour bien rédiger une annonce ou préparer un dossier locataire solide au Maroc.
- Recommandations de sécurité anti-arnaque : ne jamais verser d'acompte avant visite physique, vérifier les titres de propriété ou mandats d'agence.
Ton ton est accueillant, professionnel et très ancré dans le quotidien marocain.`;
    }

    try {
      // Format messages into contents array
      const contents = messages.map((m: any) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));

      let response;
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
          },
        });
      } catch (err: any) {
        // If gemini-4-argon had a permission or paid model issue, fall back to gemini-3.8-flash
        if (modelName === 'gemini-4-argon') {
          console.warn('Falling back from gemini-4-argon to gemini-3.8-flash:', err.message);
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents,
            config: {
              systemInstruction,
            },
          });
        } else {
          throw err;
        }
      }

      const text = response.text || "Désolé, je n'ai pas pu formuler de réponse.";
      res.json({
        success: true,
        text,
        modelUsed: modelName,
      });
    } catch (err: any) {
      console.error('Error in chat endpoint:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Erreur lors de la communication avec l\'assistant IA.',
      });
    }
  });

  // Vite middleware in dev or static files in production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Darna Real Estate Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
