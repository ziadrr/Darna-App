import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { INITIAL_LISTINGS, INITIAL_USERS, INITIAL_REPORTS } from './src/data/mockListings.ts';
import { Listing, ListingReport, User } from './src/types/index.ts';
import {
  sanitizeListingForVisitor,
  sanitizeListingForPublic,
  detectContactInPublicText
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
      createdAt: new Date().toISOString().split('T')[0],
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
