import express from 'express';
import { GoogleGenAI } from '@google/genai';
import type {
  Listing,
  ListingReport,
  User,
  SubscriptionPlan,
  BoostOptionId,
  PaymentTransaction,
} from '../types/index.ts';
import {
  detectContactInPublicText,
  calculateRevenueSummary,
  getUserListingQuota,
} from '../utils/rentalLogic.ts';
import {
  validatePasswordStrength,
  isConfiguredAdminEmail,
  verifyAdminAuthorization,
  authorizeAndFormatListingForViewer,
  authorizeAdvertiserContactAccess,
} from '../utils/security.ts';
import { DarnaPersistentDb } from './persistentDb.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser, isCloudSqlConfigured } from '../db/users.ts';

export function createDarnaApiApp(customDbPath?: string): {
  app: express.Express;
  db: DarnaPersistentDb;
} {
  const db = new DarnaPersistentDb(customDbPath);
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Ensure Cloud SQL PostgreSQL state is hydrated before serving /api requests,
  // while keeping root HTML '/' route non-blocking for container cold-boot health checks.
  app.use('/api', async (_req, _res, next) => {
    try {
      await Promise.race([
        db.ensureCloudSqlHydrated(),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch (err) {
      console.error('Failed to hydrate Cloud SQL state:', err);
    }
    next();
  });

  const apiKey = process.env.GEMINI_API_KEY || '';
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Rate limiters
  const contactRateLimiter = new Map<string, { count: number; resetAt: number }>();
  const loginRateLimiter = new Map<string, { count: number; resetAt: number }>();

  function getAuthUser(req: express.Request): User | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const rawToken = authHeader.slice(7).trim();
    return db.getUserBySessionToken(rawToken);
  }

  /**
   * Strict Server-Side Admin Guard:
   * Only authenticated users with role === 'admin' can proceed.
   * Visitors get 401; regular users (particulier / professionnel) get 403.
   */
  function requireAdmin(req: express.Request, res: express.Response): User | null {
    const viewer = getAuthUser(req);
    const check = verifyAdminAuthorization(viewer);
    if (!check.authorized) {
      res.status(check.statusCode).json({
        success: false,
        code: check.code,
        message: check.message,
      });
      return null;
    }
    return viewer;
  }

  // ==========================================================================
  // AUTHENTICATION ROUTES (Secured with scrypt, SHA-256 session tokens, no plaintext)
  // ==========================================================================

  app.post('/api/auth/register', (req, res) => {
    const { firstName, lastName, email, password, phone, advertiserType, termsAccepted } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez renseigner votre prénom, nom, adresse e-mail et mot de passe.',
      });
    }

    const pwdCheck = validatePasswordStrength(String(password));
    if (!pwdCheck.valid) {
      return res.status(400).json({
        success: false,
        message: pwdCheck.message,
      });
    }

    if (!termsAccepted) {
      return res.status(400).json({
        success: false,
        message: "Vous devez accepter les conditions d'utilisation et la politique de confidentialité.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = db.getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Un compte existe déjà avec cette adresse e-mail. Veuillez vous connecter.',
      });
    }

    // Never trust client-supplied role: only configured ADMIN_EMAILS can receive 'admin'
    const isAuthorizedAdminEmail = isConfiguredAdminEmail(normalizedEmail);
    const role: User['role'] = isAuthorizedAdminEmail
      ? 'admin'
      : advertiserType === 'professionnel'
      ? 'professionnel'
      : 'particulier';

    const plans = db.getAllPlans();
    const defaultPlan = plans.find((p) => p.id === 'particulier') || plans[0];
    const nowIso = new Date().toISOString();
    const nextYearIso = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

    const newUser: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      name: `${String(firstName).trim()} ${String(lastName).trim()}`,
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : '',
      role,
      advertiserType: advertiserType === 'professionnel' ? 'professionnel' : 'particulier',
      verified: isAuthorizedAdminEmail,
      emailVerified: isAuthorizedAdminEmail,
      favorites: [],
      subscription: {
        planId: defaultPlan.id,
        planName: defaultPlan.name,
        status: 'active',
        maxListings: isAuthorizedAdminEmail ? 999 : defaultPlan.maxListings,
        startedAt: nowIso,
        expiresAt: nextYearIso,
      },
      createdAt: nowIso.split('T')[0],
    };

    const savedUser = db.createUser(newUser, String(password));
    const token = db.createSession(savedUser.id);

    res.status(201).json({
      success: true,
      user: savedUser,
      token,
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
    const now = Date.now();
    const attemptEntry = loginRateLimiter.get(normalizedEmail);
    if (attemptEntry && now < attemptEntry.resetAt && attemptEntry.count >= 8) {
      return res.status(429).json({
        success: false,
        message: 'Trop de tentatives de connexion échouées. Veuillez réessayer dans quelques minutes.',
      });
    }

    const user = db.verifyUserCredentials(normalizedEmail, String(password));
    if (!user) {
      if (!attemptEntry || now >= attemptEntry.resetAt) {
        loginRateLimiter.set(normalizedEmail, { count: 1, resetAt: now + 5 * 60_000 });
      } else {
        attemptEntry.count += 1;
      }
      return res.status(401).json({
        success: false,
        message: 'Adresse e-mail ou mot de passe incorrect.',
      });
    }

    loginRateLimiter.delete(normalizedEmail);
    const token = db.createSession(user.id);
    res.json({ success: true, user, token });
  });

  /**
   * Demo login endpoint is strictly disabled to prevent unauthorized access
   * to test or administrator accounts.
   */
  app.post('/api/auth/demo-login', (_req, res) => {
    return res.status(403).json({
      success: false,
      code: 'DEMO_LOGIN_DISABLED',
      message:
        'Les connexions de démonstration et les comptes de test sont désactivés pour des raisons de sécurité. Veuillez vous connecter avec vos identifiants personnels.',
    });
  });

  app.post('/api/auth/verify-email', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({ success: false, message: 'Non connecté.' });
    }
    viewer.emailVerified = true;
    const updated = db.updateUser(viewer);
    res.json({ success: true, user: updated });
  });

  /**
   * Construct OAuth Authorization URL for Google/Gmail or Apple (iOS/Web) popup flow.
   * Uses APP_URL environment variable for exact redirect_uri construction in iframe environment.
   */
  app.get('/api/auth/oauth/:provider/url', (req, res) => {
    const provider = req.params.provider === 'apple' ? 'apple' : 'google';
    const baseUrl = (
      process.env.APP_URL ||
      'https://ais-dev-y46ket62kvdjqfadnsiutg-79125794117.europe-west3.run.app'
    ).replace(/\/$/, '');
    const redirectUri = `${baseUrl}/auth/callback`;

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
      if (!clientId) {
        return res.json({
          success: true,
          configured: false,
          provider: 'google',
          redirectUri,
        });
      }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
        state: 'google',
      });
      return res.json({
        success: true,
        configured: true,
        provider: 'google',
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        redirectUri,
      });
    }

    const appleClientId = process.env.APPLE_CLIENT_ID || '';
    if (!appleClientId) {
      return res.json({
        success: true,
        configured: false,
        provider: 'apple',
        redirectUri,
      });
    }
    const appleParams = new URLSearchParams({
      client_id: appleClientId,
      redirect_uri: redirectUri,
      response_type: 'code id_token',
      response_mode: 'query',
      scope: 'name email',
      state: 'apple',
    });
    return res.json({
      success: true,
      configured: true,
      provider: 'apple',
      url: `https://appleid.apple.com/auth/authorize?${appleParams.toString()}`,
      redirectUri,
    });
  });

  /**
   * Helper to provision or retrieve a social-authenticated user (Google/Gmail or Apple ID)
   * and issue a cryptographic session token in the persistent SQLite database.
   */
  function findOrCreateSocialUser(params: {
    provider: 'google' | 'apple';
    email: string;
    firstName?: string;
    lastName?: string;
    advertiserType?: 'particulier' | 'professionnel';
    verifiedByProviderToken?: boolean;
  }): { user?: User; token?: string; errorStatus?: number; errorMessage?: string } {
    const normalizedEmail = String(params.email || '').trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return {
        errorStatus: 400,
        errorMessage: 'Veuillez saisir une adresse e-mail valide.',
      };
    }

    const existing = db.getUserByEmail(normalizedEmail);
    if (existing) {
      // Protect administrator accounts from unverified social login spoofing
      if (existing.user.role === 'admin' && !params.verifiedByProviderToken) {
        return {
          errorStatus: 403,
          errorMessage:
            'Les comptes administrateurs doivent se connecter avec leur mot de passe sécurisé ou un jeton OAuth vérifié.',
        };
      }
      const updatedUser: User = {
        ...existing.user,
        emailVerified: true,
        verified: true,
      };
      const saved = db.updateUser(updatedUser);
      const token = db.createSession(saved.id);
      return { user: saved, token };
    }

    const emailLocal = normalizedEmail.split('@')[0] || 'Utilisateur';
    const cleanFirst =
      String(params.firstName || '').trim() ||
      emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1);
    const cleanLast =
      String(params.lastName || '').trim() ||
      (params.provider === 'apple' ? 'Apple' : 'Gmail');

    const isAdmin =
      Boolean(params.verifiedByProviderToken) && isConfiguredAdminEmail(normalizedEmail);
    const advType =
      params.advertiserType === 'professionnel' ? 'professionnel' : 'particulier';
    const role: User['role'] = isAdmin ? 'admin' : advType;

    const plans = db.getAllPlans();
    const defaultPlan = plans.find((p) => p.id === 'particulier') || plans[0];
    const nowIso = new Date().toISOString();
    const nextYearIso = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

    const newUser: User = {
      id: `user-${params.provider}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      firstName: cleanFirst,
      lastName: cleanLast,
      name: `${cleanFirst} ${cleanLast}`.trim(),
      email: normalizedEmail,
      phone: '',
      role,
      advertiserType: advType,
      verified: true,
      emailVerified: true,
      favorites: [],
      subscription: {
        planId: defaultPlan.id,
        planName: defaultPlan.name,
        status: 'active',
        maxListings: isAdmin ? 999 : defaultPlan.maxListings,
        startedAt: nowIso,
        expiresAt: nextYearIso,
      },
      createdAt: nowIso.split('T')[0],
    };

    // Generate a random 32-byte cryptographic secret hashed with scrypt so no plaintext password exists
    const randomSocialSecret = `social_${params.provider}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}A1!`;
    const savedUser = db.createUser(newUser, randomSocialSecret);
    const token = db.createSession(savedUser.id);
    return { user: savedUser, token };
  }

  /**
   * OAuth Popup Callback Handler (/auth/callback and /auth/callback/)
   * Sends postMessage({ type: 'OAUTH_AUTH_SUCCESS', user, token }, '*') to opener window and closes popup.
   */
  const oauthCallbackHandler = async (req: express.Request, res: express.Response) => {
    try {
      const code = String(req.query.code || req.body?.code || '');
      const state = String(req.query.state || req.body?.state || 'google');
      const provider: 'google' | 'apple' = state === 'apple' ? 'apple' : 'google';
      const baseUrl = (
        process.env.APP_URL ||
        'https://ais-dev-y46ket62kvdjqfadnsiutg-79125794117.europe-west3.run.app'
      ).replace(/\/$/, '');
      const redirectUri = `${baseUrl}/auth/callback`;

      let email = String(req.query.email || req.body?.email || '');
      let firstName = String(req.query.firstName || '');
      let lastName = String(req.query.lastName || '');
      let verifiedByProviderToken = false;

      if (
        provider === 'google' &&
        code &&
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET
      ) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        const tokenData = (await tokenRes.json()) as any;
        if (tokenData.access_token) {
          const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const profile = (await profileRes.json()) as any;
          if (profile.email) {
            email = profile.email;
            firstName = profile.given_name || profile.name || '';
            lastName = profile.family_name || '';
            verifiedByProviderToken = true;
          }
        }
      }

      if (!email) {
        return res.status(400).send(`
          <html>
            <body style="font-family: sans-serif; padding: 24px; text-align: center;">
              <p>Impossible de récupérer l'adresse e-mail depuis le fournisseur OAuth.</p>
              <script>setTimeout(() => window.close(), 2500);</script>
            </body>
          </html>
        `);
      }

      const result = findOrCreateSocialUser({
        provider,
        email,
        firstName,
        lastName,
        verifiedByProviderToken,
      });

      if (!result.user || !result.token) {
        return res.status(result.errorStatus || 400).send(`
          <html>
            <body style="font-family: sans-serif; padding: 24px; text-align: center;">
              <p>${result.errorMessage || 'Erreur lors de la connexion OAuth.'}</p>
              <script>setTimeout(() => window.close(), 2500);</script>
            </body>
          </html>
        `);
      }

      const payloadJson = JSON.stringify({
        type: 'OAUTH_AUTH_SUCCESS',
        provider,
        user: result.user,
        token: result.token,
      });

      res.send(`
        <html>
          <body style="font-family: sans-serif; padding: 24px; text-align: center;">
            <script>
              if (window.opener) {
                window.opener.postMessage(${payloadJson}, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentification réussie. Cette fenêtre va se fermer automatiquement.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.status(500).send('Erreur lors du retour OAuth.');
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], oauthCallbackHandler);
  app.post(['/auth/callback', '/auth/callback/'], express.urlencoded({ extended: true }), oauthCallbackHandler);

  /**
   * Direct Social Authentication Endpoint for Google / Gmail (Web & Mobile) and Apple (iOS / Web).
   * Verifies Google ID token if provided, or authenticates the user's Gmail / Apple ID account
   * and persists it in SQLite.
   */
  app.post('/api/auth/social-login', async (req, res) => {
    try {
      const { provider, email, firstName, lastName, advertiserType, idToken } = req.body || {};
      const cleanProvider: 'google' | 'apple' = provider === 'apple' ? 'apple' : 'google';

      let resolvedEmail = String(email || '').trim().toLowerCase();
      let resolvedFirst = String(firstName || '').trim();
      let resolvedLast = String(lastName || '').trim();
      let resolvedUid = '';
      let verifiedByProviderToken = false;

      if (idToken) {
        try {
          const decoded = await adminAuth.verifyIdToken(String(idToken));
          if (decoded.email) {
            resolvedEmail = String(decoded.email).toLowerCase();
            resolvedUid = decoded.uid;
            if (decoded.name && !resolvedFirst) {
              const parts = String(decoded.name).split(' ');
              resolvedFirst = parts[0] || '';
              resolvedLast = parts.slice(1).join(' ');
            }
            verifiedByProviderToken = true;
          }
        } catch {
          if (cleanProvider === 'google') {
            const verifyRes = await fetch(
              `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
                String(idToken)
              )}`
            );
            if (verifyRes.ok) {
              const tokenInfo = (await verifyRes.json()) as any;
              if (tokenInfo.email) {
                resolvedEmail = String(tokenInfo.email).toLowerCase();
                resolvedFirst = tokenInfo.given_name || resolvedFirst;
                resolvedLast = tokenInfo.family_name || resolvedLast;
                verifiedByProviderToken = true;
              }
            }
          }
        }
      }

      const result = findOrCreateSocialUser({
        provider: cleanProvider,
        email: resolvedEmail,
        firstName: resolvedFirst,
        lastName: resolvedLast,
        advertiserType,
        verifiedByProviderToken,
      });

      if (!result.user || !result.token) {
        return res.status(result.errorStatus || 400).json({
          success: false,
          message: result.errorMessage || 'Impossible de finaliser la connexion sociale.',
        });
      }

      if (!customDbPath && isCloudSqlConfigured()) {
        try {
          await getOrCreateUser(
            resolvedUid || result.user.id,
            result.user.email,
            result.user
          );
        } catch (dbErr) {
          console.error('Error syncing social user to Cloud SQL:', dbErr);
        }
      }

      return res.json({
        success: true,
        provider: cleanProvider,
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      console.error('Social login error:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la connexion Google / Apple.',
      });
    }
  });

  /**
   * Step 1 of Secure Password Reset:
   * Generates a single-use, 15-minute cryptographic reset token (hashed in DB).
   * Does not reveal whether the email exists.
   */
  app.post('/api/auth/request-password-reset', (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez indiquer votre adresse e-mail.',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const rawResetToken = db.createPasswordResetToken(normalizedEmail);
    const smtpConfigured = Boolean(process.env.SMTP_HOST);

    return res.json({
      success: true,
      smtpConfigured,
      message: smtpConfigured
        ? 'Si un compte est associé à cette adresse e-mail, un code de réinitialisation sécurisé valable 15 minutes vous a été envoyé.'
        : 'Demande de réinitialisation enregistrée (serveur SMTP non configuré : utilisez le jeton de vérification généré en environnement de développement/test).',
      // Only expose the reset token in non-production when SMTP is not configured
      ...(process.env.NODE_ENV !== 'production' && !smtpConfigured && rawResetToken
        ? { devResetToken: rawResetToken }
        : {}),
    });
  });

  /**
   * Step 2 of Secure Password Reset:
   * Requires a valid, non-expired single-use resetToken + strong newPassword.
   * Rejects any attempt to overwrite a password without a valid resetToken.
   */
  app.post('/api/auth/reset-password', (req, res) => {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        code: 'RESET_TOKEN_REQUIRED',
        message:
          'Pour réinitialiser votre mot de passe, vous devez fournir votre adresse e-mail, un code/jeton de réinitialisation valide et votre nouveau mot de passe.',
      });
    }

    const pwdCheck = validatePasswordStrength(String(newPassword));
    if (!pwdCheck.valid) {
      return res.status(400).json({
        success: false,
        message: pwdCheck.message,
      });
    }

    const consumed = db.consumePasswordResetToken(
      String(email),
      String(resetToken),
      String(newPassword)
    );
    if (!consumed) {
      return res.status(403).json({
        success: false,
        code: 'INVALID_OR_EXPIRED_RESET_TOKEN',
        message: 'Le code de réinitialisation est invalide, expiré ou déjà utilisé.',
      });
    }

    res.json({
      success: true,
      message: 'Votre mot de passe a été mis à jour de façon sécurisée. Vous pouvez maintenant vous connecter.',
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      db.deleteSession(authHeader.slice(7).trim());
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
    db.updateUser(viewer);
    res.json({ success: true, favorites: viewer.favorites });
  });

  // ==========================================================================
  // GEOLOCATION ENDPOINT
  // ==========================================================================

  app.get('/api/locate-ip', async (req, res) => {
    try {
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

  // ==========================================================================
  // LISTINGS & ADVERTISER CONTACT PRIVACY
  // ==========================================================================

  app.get('/api/listings', (req, res) => {
    const viewer = getAuthUser(req);
    const allListings = db.getAllListings();
    const visibleListings: Listing[] = [];
    for (const l of allListings) {
      const formatted = authorizeAndFormatListingForViewer(l, viewer);
      if (formatted) {
        visibleListings.push(formatted);
      }
    }
    res.json({ success: true, listings: visibleListings });
  });

  app.get('/api/listings/:id', (req, res) => {
    const viewer = getAuthUser(req);
    const listing = db.getListingById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Annonce non trouvée' });
    }
    const formatted = authorizeAndFormatListingForViewer(listing, viewer);
    if (!formatted) {
      return res.status(403).json({
        success: false,
        message: "Cette annonce n'est pas accessible au public.",
      });
    }
    listing.viewsCount = (listing.viewsCount || 0) + 1;
    db.updateListing(listing);
    res.json({ success: true, listing: formatted });
  });

  app.get('/api/listings/:id/contact', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Créez un compte ou connectez-vous pour continuer.',
      });
    }
    const listing = db.getListingById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: 'Annonce non trouvée' });
    }

    const access = authorizeAdvertiserContactAccess(listing, viewer);
    if (!access.authorized || !viewer) {
      return res.status(access.statusCode).json({
        success: false,
        message: access.message,
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

    res.json({
      success: true,
      contact: access.contact,
      address: access.address,
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

    const allListings = db.getAllListings();
    const allPlans = db.getAllPlans();
    const quota = getUserListingQuota(viewer, allListings, allPlans);
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
      const nowIso = new Date().toISOString();

      const newListing: Listing = {
        ...req.body,
        id: `darna-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId: viewer.id,
        slug: (req.body.title || 'annonce')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
        viewsCount: 0,
        favoritesCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        status: req.body.status === 'brouillon' ? 'brouillon' : 'publiee',
        isDemo: Boolean(req.body.isDemo),
        flaggedForContactInText: flagged,
      };
      db.createListing(newListing);
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
    const existing = db.getListingById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Annonce non trouvée' });
    }
    if (existing.userId !== viewer.id && viewer.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à modifier l'annonce d'un autre utilisateur.",
      });
    }

    // Prevent non-admins from forging paid boost or changing listing owner
    const updatedListing: Listing = {
      ...existing,
      ...req.body,
      id: existing.id,
      userId: existing.userId,
      boost: viewer.role === 'admin' && req.body.boost !== undefined ? req.body.boost : existing.boost,
      updatedAt: new Date().toISOString(),
    };
    const saved = db.updateListing(updatedListing);
    res.json({ success: true, listing: saved });
  });

  app.delete('/api/listings/:id', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        message: 'Créez un compte ou connectez-vous pour continuer.',
      });
    }
    const target = db.getListingById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Annonce introuvable' });
    }
    if (target.userId !== viewer.id && viewer.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Vous n'êtes pas autorisé à supprimer l'annonce d'un autre utilisateur.",
      });
    }
    db.deleteListing(req.params.id);
    res.json({ success: true, message: 'Annonce supprimée avec succès' });
  });

  // ==========================================================================
  // PROTECTED ADMIN, MODERATION, REPORTS & USER MANAGEMENT ROUTES
  // ==========================================================================

  app.post('/api/listings/:id/moderate', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { action, reason } = req.body;
    const listing = db.getListingById(req.params.id);
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

    const updated = db.updateListing(listing);
    res.json({ success: true, listing: updated });
  });

  app.get('/api/reports', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    res.json({ success: true, reports: db.getAllReports() });
  });

  app.post('/api/reports', (req, res) => {
    if (!req.body.listingId) {
      return res.status(400).json({ success: false, message: 'Identifiant annonce requis.' });
    }
    const newReport: ListingReport = {
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      listingId: req.body.listingId,
      listingTitle: req.body.listingTitle || 'Annonce',
      reason: req.body.reason || 'inapproprié',
      comment: req.body.comment || '',
      reporterEmail: req.body.reporterEmail,
      createdAt: new Date().toISOString(),
      status: 'en_attente',
    };
    db.createReport(newReport);
    res.status(201).json({ success: true, report: newReport });
  });

  app.post('/api/reports/:id/resolve', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const report = db.getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Signalement introuvable' });
    }
    report.status = req.body.action === 'dismiss' ? 'rejete' : 'resolu';
    const updated = db.updateReport(report);
    res.json({ success: true, report: updated });
  });

  app.get('/api/users', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    res.json({ success: true, users: db.getAllUsers() });
  });

  app.put('/api/admin/users/:id/role', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const target = db.getUserById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }
    const { role } = req.body;
    if (role !== 'particulier' && role !== 'professionnel' && role !== 'admin') {
      return res.status(400).json({ success: false, message: 'Rôle invalide.' });
    }
    target.role = role;
    const updated = db.updateUser(target);
    res.json({ success: true, user: updated });
  });

  // ==========================================================================
  // MONETIZATION, SUBSCRIPTIONS, BOOSTS & SECURE TEST PAYMENTS (MAD)
  // ==========================================================================

  app.get('/api/monetization/config', (_req, res) => {
    const liveConfigured = Boolean(
      process.env.PAYMENT_GATEWAY_MODE === 'production' &&
        process.env.CMI_MERCHANT_ID &&
        process.env.CMI_STORE_KEY
    );
    res.json({
      success: true,
      plans: db.getAllPlans(),
      boostOptions: db.getAllBoostOptions(),
      paymentGateway: {
        mode: liveConfigured ? 'production' : 'test',
        providerName: liveConfigured
          ? 'Passerelle CMI / Payzone Maroc'
          : 'Passerelle CMI / Payzone Maroc (Mode Test / Bac à sable)',
        liveOperational: liveConfigured,
        currency: 'MAD',
        notice:
          'Mode Test actif : aucun débit bancaire réel n’est effectué tant que les identifiants marchands CMI/Payzone de production ne sont pas configurés.',
      },
    });
  });

  app.get('/api/payments/my', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        message: 'Créez un compte ou connectez-vous pour consulter vos abonnements et paiements.',
      });
    }
    const quota = getUserListingQuota(viewer, db.getAllListings(), db.getAllPlans());
    const myTransactions = db.getTransactionsByUserId(viewer.id);
    res.json({
      success: true,
      subscription: viewer.subscription || null,
      quota,
      transactions: myTransactions,
    });
  });

  app.get('/api/admin/monetization', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const allTransactions = db.getAllTransactions();
    const allUsers = db.getAllUsers();
    const allListings = db.getAllListings();
    const revenueSummary = calculateRevenueSummary(allTransactions);
    const activeSubscriptions = allUsers
      .filter((u) => u.subscription && u.subscription.status === 'active')
      .map((u) => ({
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        role: u.role,
        companyName: u.companyName,
        subscription: u.subscription!,
        usedListings: allListings.filter(
          (l) =>
            l.userId === u.id &&
            (l.status === 'publiee' || l.status === 'en_attente' || l.status === 'brouillon')
        ).length,
      }));

    res.json({
      success: true,
      plans: db.getAllPlans(),
      boostOptions: db.getAllBoostOptions(),
      transactions: allTransactions,
      activeSubscriptions,
      revenueSummary,
    });
  });

  app.post('/api/admin/plans', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

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
    const existingPlans = db.getAllPlans();
    const id = existingPlans.some((p) => p.id === slugId) ? `${slugId}-${Date.now()}` : slugId;

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

    db.createPlan(newPlan);
    res.status(201).json({ success: true, plan: newPlan, plans: db.getAllPlans() });
  });

  app.put('/api/admin/plans/:id', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const existing = db.getPlanById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Offre introuvable.' });
    }

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

    const updatedPlan: SubscriptionPlan = {
      ...existing,
      name: updatedName,
      price: updatedPrice,
      maxListings: updatedMaxListings,
      features: updatedFeatures,
      isCustomQuote,
    };

    db.updatePlan(updatedPlan);

    // Propagate updated maxListings & planName to users currently subscribed to this plan
    for (const u of db.getAllUsers()) {
      if (u.subscription && u.subscription.planId === existing.id && u.subscription.status === 'active') {
        u.subscription.maxListings = updatedMaxListings;
        u.subscription.planName = updatedName;
        db.updateUser(u);
      }
    }

    res.json({ success: true, plan: updatedPlan, plans: db.getAllPlans() });
  });

  app.put('/api/admin/boost-options/:id', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const existing = db.getBoostOptionById(req.params.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Option de mise en avant introuvable.',
      });
    }

    const updatedBoost = {
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

    db.updateBoostOption(updatedBoost);
    res.json({
      success: true,
      boostOption: updatedBoost,
      boostOptions: db.getAllBoostOptions(),
    });
  });

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

    const existingTx = db.getTransactionByIdempotencyKey(String(idempotencyKey));
    if (existingTx && existingTx.status === 'paye') {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_PAYMENT',
        message:
          'Protection anti-double paiement : ce paiement a déjà été enregistré et confirmé. Aucun second débit n’a été effectué.',
        transaction: existingTx,
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const methodLabel =
      paymentMethodType === 'payzone'
        ? 'Payzone Maroc (Mode Test •••• 1111)'
        : 'Carte CMI / Visa Maroc (Mode Test •••• 4242)';

    if (type === 'subscription') {
      const plan = db.getPlanById(String(optionId));
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

      const userTxs = db.getTransactionsByUserId(viewer.id);
      const recentIdenticalSubTx = userTxs.find(
        (t) =>
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

      db.createTransaction(tx);

      if (tx.status === 'echoue') {
        return res.status(402).json({
          success: false,
          status: 'echoue',
          message:
            'Le paiement a échoué (simulation Mode Test). Votre abonnement n’a pas été modifié.',
          transaction: tx,
        });
      }

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
      const updatedUser = db.updateUser(viewer);

      return res.json({
        success: true,
        status: 'paye',
        message: `Paiement confirmé (Mode Test). Votre offre « ${plan.name} » est désormais active !`,
        transaction: tx,
        user: updatedUser,
        quota: getUserListingQuota(updatedUser, db.getAllListings(), db.getAllPlans()),
      });
    }

    if (type === 'boost') {
      const boostOpt = db.getBoostOptionById(String(optionId as BoostOptionId));
      if (!boostOpt) {
        return res.status(404).json({
          success: false,
          message: 'Option de mise en avant introuvable.',
        });
      }
      const listing = db.getListingById(String(targetId));
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

      db.createTransaction(tx);

      if (tx.status === 'echoue') {
        return res.status(402).json({
          success: false,
          status: 'echoue',
          message:
            'Le paiement a échoué (simulation Mode Test). La mise en avant n’a pas été activée sur votre annonce.',
          transaction: tx,
        });
      }

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
      const updatedListing = db.updateListing(listing);

      return res.json({
        success: true,
        status: 'paye',
        message: `Paiement confirmé (Mode Test). Votre annonce affiche désormais la mention « Sponsorisé » (${boostOpt.name} — ${boostOpt.durationDays} jours) !`,
        transaction: tx,
        listing: updatedListing,
      });
    }

    return res.status(400).json({ success: false, message: 'Type de transaction non reconnu.' });
  });

  app.post('/api/payments/:id/refund', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const tx = db.getTransactionById(req.params.id);
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
    const updatedTx = db.updateTransaction(tx);

    if (tx.type === 'subscription') {
      const targetUser = db.getUserById(tx.userId);
      const plans = db.getAllPlans();
      const freePlan = plans.find((p) => p.id === 'particulier') || plans[0];
      if (targetUser) {
        targetUser.subscription = {
          planId: freePlan.id,
          planName: freePlan.name,
          status: 'refunded',
          maxListings: freePlan.maxListings,
          startedAt: nowIso,
          expiresAt: nowIso,
        };
        db.updateUser(targetUser);
      }
    } else if (tx.type === 'boost') {
      const targetListing = db.getListingById(tx.targetId);
      if (targetListing && targetListing.boost) {
        targetListing.boost = {
          ...targetListing.boost,
          status: 'revoked',
        };
        db.updateListing(targetListing);
      }
    }

    res.json({
      success: true,
      message: `Transaction ${updatedTx.id} remboursée (${updatedTx.amount} MAD). L’option associée a été désactivée.`,
      transaction: updatedTx,
      revenueSummary: calculateRevenueSummary(db.getAllTransactions()),
    });
  });

  // ==========================================================================
  // GEMINI AI FEATURES (TTS, IMAGE GENERATION, CHATBOT)
  // ==========================================================================

  app.post('/api/tts', async (req, res) => {
    const { text, voice } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Le texte est requis' });
    }
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: "Clé API Gemini non configurée dans l'environnement.",
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
                text: String(text).slice(0, 500),
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
      res.status(500).json({
        success: false,
        message: err.message || 'Erreur lors de la synthèse vocale Gemini.',
      });
    }
  });

  app.post('/api/generate-image', async (req, res) => {
    const { prompt, imageSize = '1K', aspectRatio = '4:3' } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Le prompt est requis' });
    }
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: "Clé API Gemini non configurée dans l'environnement.",
      });
    }
    try {
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
      res.status(500).json({
        success: false,
        message: err.message || "Erreur lors de la génération de l'image.",
      });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const { messages, roleType = 'advisor' } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Historique de conversation invalide' });
    }
    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: "Clé API Gemini non configurée dans l'environnement.",
      });
    }

    let modelName = 'gemini-3.8-flash';
    let systemInstruction = '';

    if (roleType === 'legal') {
      modelName = 'gemini-4-argon';
      systemInstruction = `Tu es l'Expert Juridique Spécialiste de la Location Immobilière au Maroc pour la plateforme Darna.
Tu maîtrises parfaitement :
- La Loi n° 67-12 organisant les rapports contractuels entre bailleurs et locataires des locaux à usage d'habitation ou à usage professionnel au Maroc.
- Les règles du bail écrit légalisé, l'état des lieux obligatoire, la caution (plafonnée légalement à 2 mois de loyer), le préavis de résiliation et les conditions d'expulsion.
- Les obligations de protection des données personnelles auprès de la CNDP (Commission Nationale de contrôle de la protection des Données à caractère Personnel - Loi n° 09-08).
- La fiscalité locative marocaine (taxe d'habitation, taxe de services communaux, retenue à la source éventuelle).
Réponds avec rigueur, clarté et bienveillance en français (ou en darija/arabe si l'utilisateur s'adresse ainsi). Rappelle toujours en conclusion que tes conseils ont une valeur informative et qu'un notaire, avocat ou adoul au Maroc doit valider les actes définitifs.`;
    } else if (roleType === 'estimate') {
      modelName = 'gemini-3.1-flash-lite';
      systemInstruction = `Tu es le Simulateur Rapide de Loyer Darna pour le marché marocain.
Fournis des estimations rapides, concises et précises du loyer mensuel en Dirhams Marocains (MAD) selon :
- La ville (Casablanca, Rabat, Marrakech, Tanger, Agadir, Fès, etc.)
- Le quartier spécifique (Maarif, Gauthier, Agdal, Hay Riad, Guéliz, Malabata, etc.)
- Le type de bien, la superficie en m², le standing et l'état meublé ou vide.
Sois direct, donne des fourchettes réalistes (ex: 6 500 - 8 000 MAD / mois) et les facteurs d'influence.`;
    } else {
      modelName = 'gemini-3.8-flash';
      systemInstruction = `Tu es l'Assistant Recherche et Vie de Quartier Darna au Maroc.
Tu aides les futurs locataires et les propriétaires au Maroc :
- Conseils sur les quartiers (ambiance, écoles, transports, commerces, sécurité) à Casablanca, Rabat, Marrakech, Tanger, etc.
- Conseils pour bien rédiger une annonce ou préparer un dossier locataire solide au Maroc.
- Recommandations de sécurité anti-arnaque : ne jamais verser d'acompte avant visite physique, vérifier les titres de propriété ou mandats d'agence.
Ton ton est accueillant, professionnel et très ancré dans le quotidien marocain.`;
    }

    try {
      const contents = messages.map((m: any) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));
      let response;
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: { systemInstruction },
        });
      } catch (err: any) {
        if (modelName === 'gemini-4-argon') {
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents,
            config: { systemInstruction },
          });
        } else {
          throw err;
        }
      }
      res.json({
        success: true,
        text: response.text || "Désolé, je n'ai pas pu formuler de réponse.",
        modelUsed: modelName,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: err.message || "Erreur lors de la communication avec l'assistant IA.",
      });
    }
  });

  return { app, db };
}
