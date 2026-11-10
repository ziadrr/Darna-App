import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { INITIAL_LISTINGS, INITIAL_USERS, INITIAL_REPORTS } from './src/data/mockListings.ts';
import { Listing, ListingReport, User } from './src/types/index.ts';

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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // API Routes: Listings
  app.get('/api/listings', (_req, res) => {
    res.json({ success: true, listings: dbListings });
  });

  app.get('/api/listings/:id', (req, res) => {
    const listing = dbListings.find((l) => l.id === req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Annonce non trouvée' });
    }
    // Increment view count
    listing.viewsCount += 1;
    res.json({ success: true, listing });
  });

  app.post('/api/listings', (req, res) => {
    try {
      const newListing: Listing = {
        ...req.body,
        id: `darna-${Date.now()}`,
        slug: (req.body.title || 'annonce')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
        viewsCount: 0,
        favoritesCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // New listings default to pending validation unless created by admin
        status: req.body.status || 'en_attente',
      };
      dbListings.unshift(newListing);
      res.status(201).json({ success: true, listing: newListing });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  app.put('/api/listings/:id', (req, res) => {
    const index = dbListings.findIndex((l) => l.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Annonce non trouvée' });
    }
    dbListings[index] = {
      ...dbListings[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    res.json({ success: true, listing: dbListings[index] });
  });

  app.delete('/api/listings/:id', (req, res) => {
    const initialLen = dbListings.length;
    dbListings = dbListings.filter((l) => l.id !== req.params.id);
    if (dbListings.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Annonce introuvable' });
    }
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
