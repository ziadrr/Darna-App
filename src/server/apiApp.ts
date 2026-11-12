import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import {
  isEmailServiceConfigured,
  sendEmailVerificationMessage,
  sendPasswordResetMessage,
} from './mailer.ts';

export function computePaymentWebhookHmac(
  payload: {
    transactionId: string;
    status: string;
    amount: number;
    currency?: string;
  },
  storeKey: string
): string {
  const canonical = `${payload.transactionId}:${payload.status}:${Number(payload.amount)}:${
    payload.currency || 'MAD'
  }`;
  return crypto.createHmac('sha256', storeKey).update(canonical).digest('hex');
}

export function createDarnaApiApp(
  customDbPath?: string,
  options?: { enableCloudSqlSync?: boolean; allowLocalFallbackInProd?: boolean }
): {
  app: express.Express;
  db: DarnaPersistentDb;
} {
  const db = new DarnaPersistentDb(customDbPath, options);
  const app = express();

  // Trust Cloud Run / reverse proxy first hop for accurate client IP detection
  app.set('trust proxy', 1);

  // Security headers via Helmet with CSP compatible with Leaflet, Google Fonts, Unsplash, and Firebase
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://apis.google.com'],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
            'https://unpkg.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: [
            "'self'",
            'data:',
            'blob:',
            'https:',
            'http:',
            'https://*.tile.openstreetmap.org',
            'https://unpkg.com',
            'https://images.unsplash.com',
          ],
          mediaSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: [
            "'self'",
            'https://*.googleapis.com',
            'https://*.firebaseio.com',
            'https://*.firebaseapp.com',
            'https://*.tile.openstreetmap.org',
            'wss:',
            'ws:',
          ],
          frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // Default 1MB JSON body limit; allow 15MB only on listing creation/update routes that carry image data
  const defaultJsonParser = express.json({ limit: '1mb' });
  const listingJsonParser = express.json({ limit: '15mb' });

  app.use((req, res, next) => {
    const isListingUploadRoute =
      (req.method === 'POST' && req.path === '/api/listings') ||
      (req.method === 'PUT' && /^\/api\/listings\/[^/]+$/.test(req.path));
    const parser = isListingUploadRoute ? listingJsonParser : defaultJsonParser;
    parser(req, res, (err: any) => {
      if (err && (err.type === 'entity.too.large' || err.status === 413)) {
        return res.status(413).json({
          success: false,
          code: 'PAYLOAD_TOO_LARGE',
          message:
            'La taille de la requête dépasse la limite autorisée (1 Mo maximum par défaut).',
        });
      }
      if (err) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_JSON_PAYLOAD',
          message: 'Format JSON de la requête invalide.',
        });
      }
      next();
    });
  });

  // Ensure Cloud SQL PostgreSQL state is hydrated before serving /api requests.
  // In production, never fall back silently to a local SQLite database if PostgreSQL is unconfigured.
  app.use('/api', async (_req, res, next) => {
    if (
      process.env.NODE_ENV === 'production' &&
      !customDbPath &&
      !options?.allowLocalFallbackInProd &&
      !isCloudSqlConfigured()
    ) {
      return res.status(503).json({
        success: false,
        code: 'POSTGRESQL_REQUIRED_IN_PRODUCTION',
        message:
          "En production, PostgreSQL (Cloud SQL) doit obligatoirement être configuré. Le repli silencieux sur une base locale est interdit.",
      });
    }

    try {
      await Promise.race([
        db.ensureCloudSqlHydrated(),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch (err: any) {
      console.error('Failed to hydrate Cloud SQL state:', err);
      if (
        process.env.NODE_ENV === 'production' ||
        String(err?.message || '').includes('POSTGRESQL_REQUIRED_IN_PRODUCTION')
      ) {
        return res.status(503).json({
          success: false,
          code: 'DATABASE_SYNC_FAILED',
          message:
            'Impossible de synchroniser avec PostgreSQL (Cloud SQL). Le repli sur une base locale est interdit en production.',
        });
      }
    }
    next();
  });

  app.get(['/api/system/status', '/api/system/status/', '/api/health', '/api/health/'], (_req, res) => {
    const cloudSqlConfigured = isCloudSqlConfigured();
    const emailConfigured = isEmailServiceConfigured();
    return res.json({
      success: true,
      version: '2026-11-11-v2',
      nodeEnv: process.env.NODE_ENV || 'development',
      persistence: {
        postgresqlConfigured: cloudSqlConfigured,
        postgresqlSyncEnabled: db.isCloudSqlSyncEnabled(),
        productionLocalFallbackAllowed: false,
        storageEngine: db.isCloudSqlSyncEnabled() ? 'postgresql_cloudsql' : 'sqlite_local',
      },
      email: {
        configured: emailConfigured,
        smtpHostConfigured: Boolean(process.env.SMTP_HOST?.trim()),
        resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
      },
      auth: {
        googleEnabled: false,
        appleEnabled: false,
        activeSessionsCount: db.getActiveSessionCount(),
      },
      payments: {
        mode: 'simulation',
        realPaymentsEnabled: false,
      },
    });
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

  function getClientIp(req: express.Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  // Rate limiters
  const contactRateLimiter = new Map<string, { count: number; resetAt: number }>();
  const loginRateLimiter = new Map<string, { count: number; resetAt: number }>();
  const aiChatUserLimiter = new Map<string, { count: number; resetAt: number }>();
  const aiChatIpLimiter = new Map<string, { count: number; resetAt: number }>();
  const aiTtsUserLimiter = new Map<string, { count: number; resetAt: number }>();
  const aiTtsIpLimiter = new Map<string, { count: number; resetAt: number }>();
  const aiImageUserLimiter = new Map<string, { count: number; resetAt: number }>();
  const aiImageIpLimiter = new Map<string, { count: number; resetAt: number }>();

  function consumeDualRateLimit(
    userMap: Map<string, { count: number; resetAt: number }>,
    ipMap: Map<string, { count: number; resetAt: number }>,
    userId: string,
    clientIp: string,
    maxRequests: number,
    windowMs: number
  ): { allowed: boolean; blockedBy?: 'user' | 'ip' } {
    const now = Date.now();
    const userEntry = userMap.get(userId);
    const ipEntry = ipMap.get(clientIp);

    const userCount = userEntry && now < userEntry.resetAt ? userEntry.count : 0;
    const ipCount = ipEntry && now < ipEntry.resetAt ? ipEntry.count : 0;

    if (userCount >= maxRequests) {
      return { allowed: false, blockedBy: 'user' };
    }
    if (ipCount >= maxRequests) {
      return { allowed: false, blockedBy: 'ip' };
    }

    if (!userEntry || now >= userEntry.resetAt) {
      userMap.set(userId, { count: 1, resetAt: now + windowMs });
    } else {
      userEntry.count += 1;
    }

    if (!ipEntry || now >= ipEntry.resetAt) {
      ipMap.set(clientIp, { count: 1, resetAt: now + windowMs });
    } else {
      ipEntry.count += 1;
    }

    return { allowed: true };
  }

  // Express-rate-limit middlewares for sensitive auth endpoints
  const registerRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: () => Number(process.env.AUTH_REGISTER_RATE_LIMIT || 25),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    message: {
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message:
        'Trop de tentatives de création de compte depuis cette adresse IP. Veuillez réessayer dans quelques minutes.',
    },
  });

  const requestPasswordResetRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: () => Number(process.env.AUTH_RESET_REQUEST_RATE_LIMIT || 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${getClientIp(req)}:${String(req.body?.email || '').trim().toLowerCase()}`,
    message: {
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message:
        'Trop de demandes de réinitialisation de mot de passe. Veuillez patienter quelques minutes avant de réessayer.',
    },
  });

  const resetPasswordRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: () => Number(process.env.AUTH_RESET_CONFIRM_RATE_LIMIT || 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${getClientIp(req)}:${String(req.body?.email || '').trim().toLowerCase()}`,
    message: {
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message:
        'Trop de tentatives de réinitialisation de mot de passe. Veuillez patienter quelques minutes avant de réessayer.',
    },
  });

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
  // SOCIAL AUTHENTICATION SECURITY POLICY & OFFICIAL TOKEN VERIFICATION
  // ==========================================================================

  /**
   * Social login (Google & Apple) is strictly DISABLED in production and by default
   * until all external provider credentials and security checks are explicitly enabled.
   */
  function isSocialAuthEnabled(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return process.env.ENABLE_SOCIAL_AUTH === 'true';
  }

  /**
   * Verifies a provider ID token using the official Firebase Admin SDK (`verifyIdToken`),
   * strictly checking:
   * - Cryptographic RS256 signature against official provider keys
   * - Audience (`aud`) matching the configured project ID
   * - Issuer (`iss`) matching `https://securetoken.google.com/<projectId>`
   * - Expiration (`exp`) and issued-at (`iat`) timestamps
   * - Email verification claim (`email_verified === true`)
   * - Matching sign-in provider (`google.com` or `apple.com`)
   */
  async function verifyOfficialProviderIdToken(
    idToken: string,
    expectedProvider: 'google' | 'apple'
  ): Promise<{
    valid: boolean;
    uid?: string;
    email?: string;
    emailVerified?: boolean;
    firstName?: string;
    lastName?: string;
    errorMessage?: string;
  }> {
    if (!idToken || typeof idToken !== 'string' || idToken.trim().length < 20) {
      return {
        valid: false,
        errorMessage: "Jeton d'identité du fournisseur manquant ou malformé.",
      };
    }

    const expectedProjectId = process.env.FIREBASE_PROJECT_ID || 'fit-phantasmata-cbvhw';
    const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;

    try {
      // checkRevoked = true verifies token revocation status in addition to RS256 signature, aud, iss, exp
      const decoded = await adminAuth.verifyIdToken(idToken.trim(), true);
      const nowSec = Math.floor(Date.now() / 1000);

      if (!decoded || decoded.aud !== expectedProjectId) {
        return {
          valid: false,
          errorMessage: "Audience (aud) du jeton invalide.",
        };
      }
      if (decoded.iss !== expectedIssuer) {
        return {
          valid: false,
          errorMessage: "Émetteur (iss) du jeton invalide.",
        };
      }
      if (!decoded.exp || decoded.exp <= nowSec) {
        return {
          valid: false,
          errorMessage: "Le jeton d'identité a expiré.",
        };
      }
      if (!decoded.uid || !decoded.email) {
        return {
          valid: false,
          errorMessage: "Le jeton ne contient pas d'identifiant unique (sub/uid) ou d'adresse e-mail.",
        };
      }
      if (decoded.email_verified !== true) {
        return {
          valid: false,
          errorMessage: "L'adresse e-mail associée au jeton n'est pas vérifiée par le fournisseur.",
        };
      }

      const signInProvider = decoded.firebase?.sign_in_provider || '';
      const expectedFirebaseProvider =
        expectedProvider === 'apple' ? 'apple.com' : 'google.com';
      if (signInProvider && signInProvider !== expectedFirebaseProvider) {
        return {
          valid: false,
          errorMessage: `Le fournisseur du jeton (${signInProvider}) ne correspond pas à ${expectedFirebaseProvider}.`,
        };
      }

      const nameParts = String(decoded.name || '').trim().split(/\s+/).filter(Boolean);
      return {
        valid: true,
        uid: decoded.uid,
        email: String(decoded.email).trim().toLowerCase(),
        emailVerified: true,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' '),
      };
    } catch {
      return {
        valid: false,
        errorMessage:
          "Échec de la vérification cryptographique du jeton (signature, audience, émetteur ou expiration invalide).",
      };
    }
  }

  /**
   * Provisions or links a social-authenticated user ONLY when a verified provider token
   * (`verifiedByProviderToken === true`, `emailVerifiedByProvider === true`, and non-empty `providerUid`)
   * has been cryptographically validated. Never accepts a plain email address without proof.
   */
  async function findOrCreateSocialUser(params: {
    provider: 'google' | 'apple';
    providerUid: string;
    email: string;
    firstName?: string;
    lastName?: string;
    advertiserType?: 'particulier' | 'professionnel';
    verifiedByProviderToken: boolean;
    emailVerifiedByProvider: boolean;
  }): Promise<{
    user?: User;
    token?: string;
    errorStatus?: number;
    errorCode?: string;
    errorMessage?: string;
  }> {
    if (
      params.verifiedByProviderToken !== true ||
      params.emailVerifiedByProvider !== true ||
      !params.providerUid ||
      String(params.providerUid).trim().length === 0
    ) {
      return {
        errorStatus: 401,
        errorCode: 'UNVERIFIED_PROVIDER_TOKEN',
        errorMessage:
          "Refus de sécurité : aucune session ne peut être créée ou liée à un compte sans un jeton d'identité cryptographiquement vérifié par le fournisseur.",
      };
    }

    const normalizedEmail = String(params.email || '').trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return {
        errorStatus: 400,
        errorCode: 'INVALID_EMAIL',
        errorMessage: 'Veuillez fournir une adresse e-mail valide issue du jeton vérifié.',
      };
    }

    const existing = db.getUserByEmail(normalizedEmail);
    if (existing) {
      // Only link to an existing account if its email was already verified or verified by the provider token
      const updatedUser: User = {
        ...existing.user,
        emailVerified: true,
        verified: true,
      };
      const saved = await db.updateUser(updatedUser);
      const token = await db.createSession(saved.id);
      return { user: saved, token };
    }

    const emailLocal = normalizedEmail.split('@')[0] || 'Utilisateur';
    const cleanFirst =
      String(params.firstName || '').trim() ||
      emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1);
    const cleanLast =
      String(params.lastName || '').trim() ||
      (params.provider === 'apple' ? 'Apple' : 'Google');

    const isAdmin = isConfiguredAdminEmail(normalizedEmail);
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

    const randomSocialSecret = `social_${params.provider}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}A1!`;
    const savedUser = await db.createUser(newUser, randomSocialSecret);
    const token = await db.createSession(savedUser.id);
    return { user: savedUser, token };
  }

  // ==========================================================================
  // AUTHENTICATION ROUTES (Secured with scrypt, SHA-256 session tokens, no plaintext)
  // ==========================================================================

  app.post('/api/auth/register', registerRateLimiter, async (req, res) => {
    try {
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

      const savedUser = await db.createUser(newUser, String(password));
      const token = await db.createSession(savedUser.id);

      return res.status(201).json({
        success: true,
        user: savedUser,
        token,
      });
    } catch (err: any) {
      console.error('Error in POST /api/auth/register:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: "Erreur de persistance vers la base de données PostgreSQL. L'inscription n'a pas été confirmée.",
      });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Veuillez saisir votre adresse e-mail et votre mot de passe.',
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const clientIp = getClientIp(req);
      const loginKey = `${clientIp}:${normalizedEmail}`;
      const maxLoginAttempts = Number(process.env.AUTH_LOGIN_MAX_ATTEMPTS || 8);
      const now = Date.now();
      const attemptEntry = loginRateLimiter.get(loginKey);
      if (attemptEntry && now < attemptEntry.resetAt && attemptEntry.count >= maxLoginAttempts) {
        return res.status(429).json({
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Trop de tentatives de connexion échouées. Veuillez réessayer dans quelques minutes.',
        });
      }

      const user = db.verifyUserCredentials(normalizedEmail, String(password));
      if (!user) {
        if (!attemptEntry || now >= attemptEntry.resetAt) {
          loginRateLimiter.set(loginKey, { count: 1, resetAt: now + 5 * 60_000 });
        } else {
          attemptEntry.count += 1;
        }
        return res.status(401).json({
          success: false,
          message: 'Adresse e-mail ou mot de passe incorrect.',
        });
      }

      loginRateLimiter.delete(loginKey);
      const token = await db.createSession(user.id);
      return res.json({ success: true, user, token });
    } catch (err: any) {
      console.error('Error in POST /api/auth/login:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur de persistance lors de la création de session.',
      });
    }
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

  /**
   * Step 1 of Email Verification:
   * Works both BEFORE login (when `email` is provided in body) and AFTER login (via Bearer token).
   * Generates a single-use SHA-256 hashed cryptographic verification token and sends it
   * via the configured SMTP / transactional email provider.
   * Never claims an email was sent if no email delivery occurred, and never returns the token in HTTP responses.
   */
  app.post('/api/auth/request-email-verification', async (req, res) => {
    try {
      const viewer = getAuthUser(req);
      const bodyEmail =
        typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      const targetUser = viewer || (bodyEmail ? db.getUserByEmail(bodyEmail)?.user || null : null);

      if (! viewer && !bodyEmail) {
        return res.status(401).json({
          success: false,
          emailSent: false,
          message: 'Veuillez indiquer votre adresse e-mail pour recevoir un code de vérification.',
        });
      }

      if (!isEmailServiceConfigured()) {
        return res.status(503).json({
          success: false,
          emailSent: false,
          smtpConfigured: false,
          code: 'EMAIL_SERVICE_NOT_CONFIGURED',
          message:
            "Aucun e-mail n'a été envoyé : le serveur d'envoi d'e-mails (SMTP_HOST) n'est pas encore configuré.",
        });
      }

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          emailSent: false,
          code: 'USER_NOT_FOUND',
          message: "Aucun compte Darna ne correspond à cette adresse e-mail. Créez d'abord votre compte.",
        });
      }

      const rawToken = await db.createEmailVerificationToken(targetUser.id, targetUser.email);
      const mailResult = await sendEmailVerificationMessage({
        toEmail: targetUser.email,
        userName: targetUser.name,
        verificationToken: rawToken,
      });

      if (!mailResult.sent) {
        return res.status(502).json({
          success: false,
          emailSent: false,
          smtpConfigured: mailResult.configured,
          code: 'EMAIL_SEND_FAILED',
          message:
            mailResult.errorMessage ||
            "Échec de l'envoi de l'e-mail de vérification : aucun e-mail n'a pu être acheminé.",
        });
      }

      return res.json({
        success: true,
        emailSent: true,
        smtpConfigured: true,
        provider: mailResult.provider,
        message:
          'Code de vérification envoyé par e-mail (valable 15 minutes).',
      });
    } catch (err) {
      console.error('Error in POST /api/auth/request-email-verification:', err);
      return res.status(503).json({
        success: false,
        emailSent: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Impossible de générer ou enregistrer le jeton de vérification e-mail.',
      });
    }
  });

  /**
   * Step 2 of Email Verification:
   * Works both BEFORE login (with `{ email, verificationToken }`) and AFTER login (via Bearer token).
   * Strictly requires a valid, non-expired single-use cryptographic `verificationToken`.
   * Rejects any request that attempts to mark an email as verified without proof.
   */
  app.post('/api/auth/verify-email', async (req, res) => {
    try {
      const viewer = getAuthUser(req);
      const bodyEmail =
        typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const targetUser = viewer || (bodyEmail ? db.getUserByEmail(bodyEmail)?.user || null : null);

      if (!targetUser) {
        return res.status(401).json({
          success: false,
          message: bodyEmail
            ? 'Aucun compte trouvé pour cette adresse e-mail.'
            : 'Veuillez indiquer votre adresse e-mail ou vous connecter.',
        });
      }

      const { verificationToken } = req.body || {};
      if (!verificationToken || typeof verificationToken !== 'string' || !verificationToken.trim()) {
        return res.status(400).json({
          success: false,
          code: 'EMAIL_VERIFICATION_TOKEN_REQUIRED',
          message:
            'Un jeton de vérification cryptographique valide est requis pour marquer une adresse e-mail comme vérifiée.',
        });
      }

      const verifiedUser = await db.consumeEmailVerificationToken(
        targetUser.id,
        targetUser.email,
        verificationToken.trim()
      );
      if (!verifiedUser) {
        return res.status(403).json({
          success: false,
          code: 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN',
          message: 'Code de vérification invalide ou expiré.',
        });
      }

      return res.json({
        success: true,
        user: verifiedUser,
        message: 'Votre adresse e-mail est maintenant vérifiée !',
      });
    } catch (err) {
      console.error('Error in POST /api/auth/verify-email:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur de persistance lors de la vérification e-mail.',
      });
    }
  });

  /**
   * OAuth URL endpoint — disabled in production and by default until social auth is enabled.
   */
  app.get('/api/auth/oauth/:provider/url', (req, res) => {
    if (!isSocialAuthEnabled()) {
      return res.status(403).json({
        success: false,
        code: 'SOCIAL_AUTH_DISABLED',
        message:
          'Les connexions sociales Google et Apple sont actuellement désactivées côté serveur par mesure de sécurité.',
      });
    }

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
   * OAuth Popup Callback Handler (/auth/callback and /auth/callback/)
   * Disabled in production and by default; never accepts plain email parameters.
   */
  const oauthCallbackHandler = async (req: express.Request, res: express.Response) => {
    if (!isSocialAuthEnabled()) {
      return res.status(403).json({
        success: false,
        code: 'SOCIAL_AUTH_DISABLED',
        message:
          'Les connexions sociales Google et Apple sont désactivées côté serveur par mesure de sécurité.',
      });
    }

    try {
      const idToken = String(req.query.id_token || req.body?.id_token || '');
      const state = String(req.query.state || req.body?.state || 'google');
      const provider: 'google' | 'apple' = state === 'apple' ? 'apple' : 'google';

      if (!idToken) {
        return res.status(401).json({
          success: false,
          code: 'ID_TOKEN_REQUIRED',
          message: "Jeton d'identité OAuth signé requis. Aucune adresse e-mail non vérifiée n'est acceptée.",
        });
      }

      const verifiedToken = await verifyOfficialProviderIdToken(idToken, provider);
      if (!verifiedToken.valid || !verifiedToken.email || !verifiedToken.uid) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_PROVIDER_TOKEN',
          message: verifiedToken.errorMessage || 'Jeton OAuth invalide.',
        });
      }

      const result = await findOrCreateSocialUser({
        provider,
        providerUid: verifiedToken.uid,
        email: verifiedToken.email,
        firstName: verifiedToken.firstName,
        lastName: verifiedToken.lastName,
        verifiedByProviderToken: true,
        emailVerifiedByProvider: Boolean(verifiedToken.emailVerified),
      });

      if (!result.user || !result.token) {
        return res.status(result.errorStatus || 401).json({
          success: false,
          code: result.errorCode || 'SOCIAL_AUTH_FAILED',
          message: result.errorMessage || 'Erreur lors de la connexion OAuth.',
        });
      }

      const payloadJson = JSON.stringify({
        type: 'OAUTH_AUTH_SUCCESS',
        provider,
        user: result.user,
        token: result.token,
      });

      return res.send(`
        <html>
          <body style="font-family: sans-serif; padding: 24px; text-align: center;">
            <script>
              if (window.opener) {
                window.opener.postMessage(${payloadJson}, window.location.origin);
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentification vérifiée. Cette fenêtre va se fermer automatiquement.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth callback error:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors du retour OAuth.',
      });
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], oauthCallbackHandler);
  app.post(['/auth/callback', '/auth/callback/'], express.urlencoded({ extended: true }), oauthCallbackHandler);

  /**
   * Direct Social Authentication Endpoint (/api/auth/social-login).
   * - Disabled in production and by default (`403 SOCIAL_AUTH_DISABLED`).
   * - Even when enabled in test/staging, strictly requires a cryptographically verified `idToken`
   *   validated via `verifyOfficialProviderIdToken` (RS256 signature, `aud`, `iss`, `exp`, `email_verified`).
   * - All plain-email fallbacks are permanently removed.
   */
  app.post('/api/auth/social-login', async (req, res) => {
    if (!isSocialAuthEnabled()) {
      return res.status(403).json({
        success: false,
        code: 'SOCIAL_AUTH_DISABLED',
        message:
          'Les connexions Google et Apple sont désactivées côté serveur tant que la configuration OAuth de production n’est pas activée.',
      });
    }

    try {
      const { provider, advertiserType, idToken } = req.body || {};
      const cleanProvider: 'google' | 'apple' = provider === 'apple' ? 'apple' : 'google';

      if (!idToken || typeof idToken !== 'string') {
        return res.status(401).json({
          success: false,
          code: 'PROVIDER_TOKEN_REQUIRED',
          message:
            "Un jeton d'identité signé par le fournisseur (idToken) est obligatoire. La connexion par simple adresse e-mail est interdite.",
        });
      }

      const verified = await verifyOfficialProviderIdToken(idToken, cleanProvider);
      if (!verified.valid || !verified.email || !verified.uid || !verified.emailVerified) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_PROVIDER_TOKEN',
          message:
            verified.errorMessage ||
            "Jeton d'identité invalide, expiré ou non vérifié par le fournisseur.",
        });
      }

      const result = await findOrCreateSocialUser({
        provider: cleanProvider,
        providerUid: verified.uid,
        email: verified.email,
        firstName: verified.firstName,
        lastName: verified.lastName,
        advertiserType,
        verifiedByProviderToken: true,
        emailVerifiedByProvider: true,
      });

      if (!result.user || !result.token) {
        return res.status(result.errorStatus || 401).json({
          success: false,
          code: result.errorCode || 'SOCIAL_AUTH_REJECTED',
          message: result.errorMessage || 'Impossible de finaliser la connexion sociale.',
        });
      }

      if (!customDbPath && isCloudSqlConfigured()) {
        await getOrCreateUser(verified.uid, result.user.email, result.user);
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
        message: 'Erreur serveur lors de la vérification de la connexion sociale.',
      });
    }
  });

  /**
   * Step 1 of Secure Password Reset:
   * Generates a single-use, 15-minute cryptographic reset token (hashed in DB) and sends it by email.
   * Never claims an email was sent unless SMTP/transactional delivery actually succeeded,
   * and never returns the reset token in HTTP responses.
   */
  app.post(
    '/api/auth/request-password-reset',
    requestPasswordResetRateLimiter,
    async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) {
          return res.status(400).json({
            success: false,
            emailSent: false,
            message: 'Veuillez indiquer votre adresse e-mail.',
          });
        }

        if (!isEmailServiceConfigured()) {
          return res.status(503).json({
            success: false,
            emailSent: false,
            smtpConfigured: false,
            code: 'EMAIL_SERVICE_NOT_CONFIGURED',
            message:
              "Aucun e-mail n'a été envoyé : le serveur d'envoi d'e-mails (SMTP_HOST) n'est pas encore configuré.",
          });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const userRecord = db.getUserByEmail(normalizedEmail);
        const rawResetToken = await db.createPasswordResetToken(normalizedEmail);

        if (!rawResetToken || !userRecord) {
          return res.status(200).json({
            success: true,
            emailSent: false,
            smtpConfigured: true,
            message:
              "Demande traitée. Aucun envoi n'a eu lieu (aucun compte actif ne correspond à cette adresse).",
          });
        }

        const mailResult = await sendPasswordResetMessage({
          toEmail: normalizedEmail,
          userName: userRecord.user.name || 'Membre Darna',
          resetToken: rawResetToken,
        });

        if (!mailResult.sent) {
          return res.status(502).json({
            success: false,
            emailSent: false,
            smtpConfigured: mailResult.configured,
            code: 'EMAIL_SEND_FAILED',
            message:
              mailResult.errorMessage ||
              "Échec de l'envoi de l'e-mail de réinitialisation : aucun e-mail n'a pu être acheminé.",
          });
        }

        return res.json({
          success: true,
          emailSent: true,
          smtpConfigured: true,
          provider: mailResult.provider,
          message:
            'Un e-mail contenant votre code de réinitialisation sécurisé (valable 15 minutes) a été envoyé.',
        });
      } catch (err) {
        console.error('Error in POST /api/auth/request-password-reset:', err);
        return res.status(503).json({
          success: false,
          emailSent: false,
          code: 'DATABASE_SYNC_FAILED',
          message: 'Erreur de persistance lors de la génération du jeton de réinitialisation.',
        });
      }
    }
  );

  /**
   * Step 2 of Secure Password Reset:
   * Requires a valid, non-expired single-use resetToken + strong newPassword.
   * Rejects any attempt to overwrite a password without a valid resetToken.
   */
  app.post('/api/auth/reset-password', resetPasswordRateLimiter, async (req, res) => {
    try {
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

      const consumed = await db.consumePasswordResetToken(
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

      return res.json({
        success: true,
        message: 'Votre mot de passe a été mis à jour de façon sécurisée. Vous pouvez maintenant vous connecter.',
      });
    } catch (err) {
      console.error('Error in POST /api/auth/reset-password:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur de persistance lors de la réinitialisation du mot de passe.',
      });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        await db.deleteSession(authHeader.slice(7).trim());
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Error in POST /api/auth/logout:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur lors de la révocation de la session.',
      });
    }
  });

  app.post('/api/admin/sessions/revoke-all', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    try {
      const revokedCount = await db.revokeAllSessions();
      return res.json({
        success: true,
        revokedCount,
        message: 'Toutes les sessions actives ont été révoquées avec succès.',
      });
    } catch (err) {
      console.error('Error in POST /api/admin/sessions/revoke-all:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur lors de la révocation globale des sessions.',
      });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({ success: false, user: null });
    }
    res.json({ success: true, user: viewer });
  });

  app.post('/api/auth/favorites', async (req, res) => {
    try {
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
      await db.updateUser(viewer);
      return res.json({ success: true, favorites: viewer.favorites });
    } catch (err) {
      console.error('Error in POST /api/auth/favorites:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur de synchronisation PostgreSQL lors de la mise à jour des favoris.',
      });
    }
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

  app.get('/api/listings/:id', async (req, res) => {
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
    try {
      await db.updateListing(listing);
    } catch (err) {
      console.error('Error updating viewsCount in Cloud SQL:', err);
    }
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

  app.post('/api/listings', async (req, res) => {
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
      await db.createListing(newListing);
      return res.status(201).json({ success: true, listing: newListing });
    } catch (err: any) {
      console.error('Error in POST /api/listings:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message:
          "La synchronisation avec la base de données PostgreSQL a échoué. L'annonce n'a pas pu être enregistrée.",
      });
    }
  });

  app.put('/api/listings/:id', async (req, res) => {
    try {
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
      const saved = await db.updateListing(updatedListing);
      return res.json({ success: true, listing: saved });
    } catch (err) {
      console.error('Error in PUT /api/listings/:id:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: "La synchronisation PostgreSQL a échoué. La modification n'a pas été enregistrée.",
      });
    }
  });

  app.delete('/api/listings/:id', async (req, res) => {
    try {
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
      await db.deleteListing(req.params.id);
      return res.json({ success: true, message: 'Annonce supprimée avec succès' });
    } catch (err) {
      console.error('Error in DELETE /api/listings/:id:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: "La synchronisation PostgreSQL a échoué. La suppression n'a pas été confirmée.",
      });
    }
  });

  // ==========================================================================
  // PROTECTED ADMIN, MODERATION, REPORTS & USER MANAGEMENT ROUTES
  // ==========================================================================

  app.post('/api/listings/:id/moderate', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
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

      const updated = await db.updateListing(listing);
      return res.json({ success: true, listing: updated });
    } catch (err) {
      console.error('Error in POST /api/listings/:id/moderate:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur de synchronisation PostgreSQL lors de la modération.',
      });
    }
  });

  app.get('/api/reports', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    res.json({ success: true, reports: db.getAllReports() });
  });

  app.post('/api/reports', async (req, res) => {
    try {
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
      await db.createReport(newReport);
      return res.status(201).json({ success: true, report: newReport });
    } catch (err) {
      console.error('Error in POST /api/reports:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: "Erreur de synchronisation PostgreSQL lors de l'envoi du signalement.",
      });
    }
  });

  app.post('/api/reports/:id/resolve', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
      const report = db.getReportById(req.params.id);
      if (!report) {
        return res.status(404).json({ success: false, message: 'Signalement introuvable' });
      }
      report.status = req.body.action === 'dismiss' ? 'rejete' : 'resolu';
      const updated = await db.updateReport(report);
      return res.json({ success: true, report: updated });
    } catch (err) {
      console.error('Error in POST /api/reports/:id/resolve:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur de synchronisation PostgreSQL lors du traitement du signalement.',
      });
    }
  });

  app.get('/api/users', (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    res.json({ success: true, users: db.getAllUsers() });
  });

  app.put('/api/admin/users/:id/role', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
      const target = db.getUserById(req.params.id);
      if (!target) {
        return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
      }
      const { role } = req.body;
      if (role !== 'particulier' && role !== 'professionnel' && role !== 'admin') {
        return res.status(400).json({ success: false, message: 'Rôle invalide.' });
      }
      target.role = role;
      const updated = await db.updateUser(target);
      return res.json({ success: true, user: updated });
    } catch (err) {
      console.error('Error in PUT /api/admin/users/:id/role:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur de synchronisation PostgreSQL lors de la mise à jour du rôle.',
      });
    }
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

  app.post('/api/admin/plans', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
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

      await db.createPlan(newPlan);
      return res.status(201).json({ success: true, plan: newPlan, plans: db.getAllPlans() });
    } catch (err) {
      console.error('Error in POST /api/admin/plans:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: "Erreur de synchronisation PostgreSQL lors de la création de l'offre.",
      });
    }
  });

  app.put('/api/admin/plans/:id', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
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

      await db.updatePlan(updatedPlan);

      // Propagate updated maxListings & planName to users currently subscribed to this plan
      for (const u of db.getAllUsers()) {
        if (u.subscription && u.subscription.planId === existing.id && u.subscription.status === 'active') {
          u.subscription.maxListings = updatedMaxListings;
          u.subscription.planName = updatedName;
          await db.updateUser(u);
        }
      }

      return res.json({ success: true, plan: updatedPlan, plans: db.getAllPlans() });
    } catch (err) {
      console.error('Error in PUT /api/admin/plans/:id:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: "Erreur de synchronisation PostgreSQL lors de la mise à jour de l'offre.",
      });
    }
  });

  app.put('/api/admin/boost-options/:id', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
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

      await db.updateBoostOption(updatedBoost);
      return res.json({
        success: true,
        boostOption: updatedBoost,
        boostOptions: db.getAllBoostOptions(),
      });
    } catch (err) {
      console.error('Error in PUT /api/admin/boost-options/:id:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur de synchronisation PostgreSQL lors de la modification du boost.',
      });
    }
  });

  app.post('/api/payments/checkout', async (req, res) => {
    try {
      const viewer = getAuthUser(req);
      if (!viewer) {
        return res.status(401).json({
          success: false,
          message: 'Créez un compte ou connectez-vous pour souscrire une offre ou mettre en avant une annonce.',
        });
      }

      // Transaction status must NEVER depend on a client-supplied status field
      if (req.body?.status !== undefined) {
        return res.status(400).json({
          success: false,
          code: 'CLIENT_STATUS_FORBIDDEN',
          message: 'Sécurité paiement : le statut de la transaction ne peut jamais être fourni par le client.',
        });
      }

      const {
        type,
        optionId,
        targetId,
        idempotencyKey,
        testScenario,
        paymentMethodType = 'cmi_card',
        cardNumber,
      } = req.body;

      // testScenario is ONLY accepted if PAYMENT_GATEWAY_MODE=test AND NODE_ENV !== 'production'
      const gatewayMode =
        process.env.PAYMENT_GATEWAY_MODE ||
        (process.env.NODE_ENV === 'production' ? 'production' : 'test');
      const isTestScenarioAllowed =
        gatewayMode === 'test' && process.env.NODE_ENV !== 'production';

      if (testScenario !== undefined && !isTestScenarioAllowed) {
        return res.status(403).json({
          success: false,
          code: 'TEST_SCENARIO_FORBIDDEN',
          message:
            "Le paramètre testScenario n'est accepté que si PAYMENT_GATEWAY_MODE=test et NODE_ENV !== 'production'.",
        });
      }

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

      // Bind idempotencyKey strictly to the authenticated user (viewer.id)
      const existingTx = db.getTransactionByUserAndIdempotencyKey(
        viewer.id,
        String(idempotencyKey)
      );
      if (existingTx && (existingTx.status === 'paye' || existingTx.status === 'en_attente')) {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_PAYMENT',
          message:
            'Protection anti-double paiement : ce paiement a déjà été enregistré pour votre compte. Aucun second débit n’a été effectué.',
          transaction: existingTx,
        });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const methodLabel =
        paymentMethodType === 'payzone'
          ? 'Payzone Maroc (Mode Test •••• 1111)'
          : 'Carte CMI / Visa Maroc (Mode Test •••• 4242)';

      // Determine transaction status strictly on the server:
      // - In production or when PAYMENT_GATEWAY_MODE !== 'test', transactions start as 'en_attente'
      //   and can only transition to 'paye' via /api/payments/webhook with a verified HMAC signature.
      // - In non-production test mode, testScenario ('success' | 'failed') is evaluated server-side.
      const resolvedScenario = isTestScenarioAllowed
        ? testScenario === 'failed'
          ? 'failed'
          : 'success'
        : 'pending_webhook';

      const initialStatus: PaymentTransaction['status'] =
        resolvedScenario === 'pending_webhook'
          ? 'en_attente'
          : resolvedScenario === 'failed'
          ? 'echoue'
          : 'paye';

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
          status: initialStatus,
          provider: 'test_cmi_sandbox',
          paymentMethodLabel: plan.price === 0 ? 'Activation gratuite (0 MAD)' : methodLabel,
          failureReason:
            initialStatus === 'echoue'
              ? 'Transaction refusée par la banque émettrice (Simulation d’échec Mode Test).'
              : undefined,
          createdAt: nowIso,
          confirmedAt: initialStatus === 'paye' ? nowIso : undefined,
        };

        await db.createTransaction(tx);

        if (tx.status === 'echoue') {
          return res.status(402).json({
            success: false,
            status: 'echoue',
            message:
              'Le paiement a échoué (simulation Mode Test). Votre abonnement n’a pas été modifié.',
            transaction: tx,
          });
        }

        if (tx.status === 'en_attente') {
          return res.status(202).json({
            success: true,
            status: 'en_attente',
            message:
              'Transaction créée en attente de confirmation HMAC par la passerelle de paiement CMI.',
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
        const updatedUser = await db.updateUser(viewer);

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
          status: initialStatus,
          provider: 'test_cmi_sandbox',
          paymentMethodLabel: methodLabel,
          failureReason:
            initialStatus === 'echoue'
              ? 'Autorisation bancaire refusée (Simulation d’échec Mode Test).'
              : undefined,
          createdAt: nowIso,
          confirmedAt: initialStatus === 'paye' ? nowIso : undefined,
        };

        await db.createTransaction(tx);

        if (tx.status === 'echoue') {
          return res.status(402).json({
            success: false,
            status: 'echoue',
            message:
              'Le paiement a échoué (simulation Mode Test). La mise en avant n’a pas été activée sur votre annonce.',
            transaction: tx,
          });
        }

        if (tx.status === 'en_attente') {
          return res.status(202).json({
            success: true,
            status: 'en_attente',
            message:
              'Transaction créée en attente de confirmation HMAC par la passerelle de paiement CMI.',
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
        const updatedListing = await db.updateListing(listing);

        return res.json({
          success: true,
          status: 'paye',
          message: `Paiement confirmé (Mode Test). Votre annonce affiche désormais la mention « Sponsorisé » (${boostOpt.name} — ${boostOpt.durationDays} jours) !`,
          transaction: tx,
          listing: updatedListing,
        });
      }

      return res.status(400).json({ success: false, message: 'Type de transaction non reconnu.' });
    } catch (err) {
      console.error('Error in POST /api/payments/checkout:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: "La synchronisation PostgreSQL a échoué. La transaction n'a pas été validée.",
      });
    }
  });

  /**
   * Payment Gateway Webhook (/api/payments/webhook)
   * Verifies HMAC-SHA256 signature using CMI_STORE_KEY before transitioning a transaction to 'paye'
   * and activating the user's subscription or listing boost.
   */
  app.post('/api/payments/webhook', async (req, res) => {
    try {
      const storeKey = process.env.CMI_STORE_KEY?.trim();
      if (!storeKey) {
        return res.status(503).json({
          success: false,
          code: 'WEBHOOK_SECRET_NOT_CONFIGURED',
          message: "La clé secrète CMI_STORE_KEY n'est pas configurée sur le serveur.",
        });
      }

      const providedSignature = String(
        req.headers['x-cmi-signature'] || req.body?.signature || ''
      ).trim();
      if (!providedSignature) {
        return res.status(401).json({
          success: false,
          code: 'MISSING_WEBHOOK_SIGNATURE',
          message: 'Signature HMAC de la passerelle de paiement manquante.',
        });
      }

      const { transactionId, status, amount, currency = 'MAD' } = req.body || {};
      if (!transactionId || (status !== 'paye' && status !== 'echoue')) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_WEBHOOK_PAYLOAD',
          message: 'Paramètres du webhook CMI invalides (transactionId et statut requis).',
        });
      }

      const tx = db.getTransactionById(String(transactionId));
      if (!tx) {
        return res.status(404).json({
          success: false,
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction introuvable.',
        });
      }

      const effectiveAmount = amount !== undefined ? Number(amount) : tx.amount;
      if (Number(effectiveAmount) !== Number(tx.amount)) {
        return res.status(400).json({
          success: false,
          code: 'AMOUNT_MISMATCH',
          message: 'Le montant signé ne correspond pas au montant de la transaction.',
        });
      }

      const expectedCanonicalHmac = computePaymentWebhookHmac(
        {
          transactionId: String(transactionId),
          status: String(status),
          amount: effectiveAmount,
          currency: String(currency),
        },
        storeKey
      );

      const expectedBuf = Buffer.from(expectedCanonicalHmac, 'utf8');
      const providedBuf = Buffer.from(providedSignature, 'utf8');
      const isSignatureValid =
        expectedBuf.length === providedBuf.length &&
        crypto.timingSafeEqual(expectedBuf, providedBuf);

      if (!isSignatureValid) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_WEBHOOK_SIGNATURE',
          message: 'Signature HMAC CMI invalide : authentification du webhook refusée.',
        });
      }

      if (tx.status === 'paye') {
        return res.json({
          success: true,
          status: 'paye',
          message: 'Transaction déjà confirmée.',
          transaction: tx,
        });
      }

      const now = new Date();
      const nowIso = now.toISOString();

      if (status === 'echoue') {
        tx.status = 'echoue';
        tx.failureReason = 'Paiement refusé par la passerelle CMI.';
        const updatedTx = await db.updateTransaction(tx);
        return res.json({
          success: true,
          status: 'echoue',
          message: 'Statut d’échec enregistré suite au webhook CMI.',
          transaction: updatedTx,
        });
      }

      tx.status = 'paye';
      tx.confirmedAt = nowIso;
      const updatedTx = await db.updateTransaction(tx);

      if (tx.type === 'subscription') {
        const plan = db.getPlanById(tx.optionId);
        const targetUser = db.getUserById(tx.userId);
        if (plan && targetUser) {
          const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
          targetUser.subscription = {
            planId: plan.id,
            planName: plan.name,
            status: 'active',
            maxListings: plan.maxListings,
            startedAt: nowIso,
            expiresAt,
            transactionId: tx.id,
          };
          if (plan.id !== 'particulier' && targetUser.role === 'particulier') {
            targetUser.role = 'professionnel';
            targetUser.advertiserType = 'professionnel';
          }
          await db.updateUser(targetUser);
        }
      } else if (tx.type === 'boost') {
        const boostOpt = db.getBoostOptionById(tx.optionId);
        const listing = db.getListingById(tx.targetId);
        if (boostOpt && listing) {
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
          await db.updateListing(listing);
        }
      }

      return res.json({
        success: true,
        status: 'paye',
        message: 'Paiement confirmé par signature HMAC CMI et avantage activé.',
        transaction: updatedTx,
      });
    } catch (err) {
      console.error('Error in POST /api/payments/webhook:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur serveur lors du traitement du webhook de paiement.',
      });
    }
  });

  app.post('/api/payments/:id/refund', async (req, res) => {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    try {
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
      const updatedTx = await db.updateTransaction(tx);

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
          await db.updateUser(targetUser);
        }
      } else if (tx.type === 'boost') {
        const targetListing = db.getListingById(tx.targetId);
        if (targetListing && targetListing.boost) {
          targetListing.boost = {
            ...targetListing.boost,
            status: 'revoked',
          };
          await db.updateListing(targetListing);
        }
      }

      return res.json({
        success: true,
        message: `Transaction ${updatedTx.id} remboursée (${updatedTx.amount} MAD). L’option associée a été désactivée.`,
        transaction: updatedTx,
        revenueSummary: calculateRevenueSummary(db.getAllTransactions()),
      });
    } catch (err) {
      console.error('Error in POST /api/payments/:id/refund:', err);
      return res.status(503).json({
        success: false,
        code: 'DATABASE_SYNC_FAILED',
        message: 'Erreur de synchronisation PostgreSQL lors du remboursement.',
      });
    }
  });

  // ==========================================================================
  // GEMINI AI FEATURES (TTS, IMAGE GENERATION, CHATBOT)
  // Secured with Auth (401), Dual User + IP Rate Limits (429), Input Whitelists (400),
  // and Generic Error Responses (500)
  // ==========================================================================

  const ALLOWED_TTS_VOICES = new Set(['Kore', 'Aoede', 'Puck', 'Charon', 'Fenrir']);
  const ALLOWED_IMAGE_SIZES = new Set(['1K', '2K', '4K']);
  const ALLOWED_ASPECT_RATIOS = new Set(['1:1', '3:4', '4:3', '9:16', '16:9']);
  const ALLOWED_CHAT_ROLES = new Set(['user', 'model']);
  const ALLOWED_CHAT_ROLE_TYPES = new Set(['legal', 'advisor', 'estimate']);

  app.post('/api/tts', async (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Veuillez vous connecter pour utiliser la synthèse vocale IA.',
      });
    }

    const { text, voice = 'Kore' } = req.body || {};
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > 500) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TTS_INPUT',
        message: 'Le texte à lire est requis et ne doit pas dépasser 500 caractères.',
      });
    }
    if (typeof voice !== 'string' || !ALLOWED_TTS_VOICES.has(voice)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TTS_VOICE',
        message: 'La voix sélectionnée ne figure pas dans la liste autorisée.',
      });
    }

    const ttsMaxPerHour = Number(process.env.AI_TTS_HOURLY_LIMIT || 30);
    const rateCheck = consumeDualRateLimit(
      aiTtsUserLimiter,
      aiTtsIpLimiter,
      viewer.id,
      getClientIp(req),
      ttsMaxPerHour,
      60 * 60 * 1000
    );
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message:
          'Limite de synthèse vocale atteinte (maximum 30 générations par heure). Veuillez réessayer plus tard.',
      });
    }

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: "Le service de synthèse vocale IA est temporairement indisponible.",
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim(),
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
              prebuiltVoiceConfig: { voiceName: voice },
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
      console.error('Error in POST /api/tts:', err);
      res.status(500).json({
        success: false,
        message: 'Une erreur est survenue lors de la synthèse vocale. Veuillez réessayer plus tard.',
      });
    }
  });

  app.post('/api/generate-image', async (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: "Veuillez vous connecter pour utiliser le studio de génération d'images IA.",
      });
    }

    const { prompt, imageSize = '1K', aspectRatio = '4:3' } = req.body || {};
    if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > 500) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_IMAGE_PROMPT',
        message: 'Le prompt est requis et ne doit pas dépasser 500 caractères.',
      });
    }
    if (typeof imageSize !== 'string' || !ALLOWED_IMAGE_SIZES.has(imageSize)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_IMAGE_SIZE',
        message: "La taille d'image demandée n'est pas autorisée (valeurs permises : 1K, 2K, 4K).",
      });
    }
    if (typeof aspectRatio !== 'string' || !ALLOWED_ASPECT_RATIOS.has(aspectRatio)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ASPECT_RATIO',
        message: "Le format d'image demandé n'est pas autorisé (valeurs permises : 1:1, 3:4, 4:3, 9:16, 16:9).",
      });
    }

    const imageMaxPerDay = Number(process.env.AI_IMAGE_DAILY_LIMIT || 5);
    const rateCheck = consumeDualRateLimit(
      aiImageUserLimiter,
      aiImageIpLimiter,
      viewer.id,
      getClientIp(req),
      imageMaxPerDay,
      24 * 60 * 60 * 1000
    );
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message:
          "Limite quotidienne de génération d'images atteinte (maximum 5 images par jour). Veuillez réessayer demain.",
      });
    }

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: "Le service de génération d'images IA est temporairement indisponible.",
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [{ text: `High-end Moroccan interior design or architecture: ${prompt.trim()}` }],
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
      console.error('Error in POST /api/generate-image:', err);
      res.status(500).json({
        success: false,
        message: "Une erreur est survenue lors de la génération de l'image. Veuillez réessayer plus tard.",
      });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const viewer = getAuthUser(req);
    if (!viewer) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: "Veuillez vous connecter pour discuter avec l'assistant IA Darna.",
      });
    }

    const { messages, roleType = 'advisor' } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CHAT_MESSAGES',
        message: "L'historique de conversation doit contenir entre 1 et 20 messages.",
      });
    }

    for (const msg of messages) {
      if (
        !msg ||
        typeof msg !== 'object' ||
        typeof msg.role !== 'string' ||
        !ALLOWED_CHAT_ROLES.has(msg.role) ||
        typeof msg.text !== 'string' ||
        msg.text.trim().length === 0 ||
        msg.text.length > 2000
      ) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_CHAT_MESSAGE_ITEM',
          message:
            "Chaque message doit avoir un rôle ('user' ou 'model') et un texte compris entre 1 et 2000 caractères.",
        });
      }
    }

    if (typeof roleType !== 'string' || !ALLOWED_CHAT_ROLE_TYPES.has(roleType)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CHAT_ROLE_TYPE',
        message: "Le mode de conseiller demandé n'est pas valide.",
      });
    }

    const chatMaxPerHour = Number(process.env.AI_CHAT_HOURLY_LIMIT || 20);
    const rateCheck = consumeDualRateLimit(
      aiChatUserLimiter,
      aiChatIpLimiter,
      viewer.id,
      getClientIp(req),
      chatMaxPerHour,
      60 * 60 * 1000
    );
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message:
          "Limite de requêtes atteinte pour l'assistant IA (maximum 20 messages par heure). Veuillez réessayer plus tard.",
      });
    }

    if (!apiKey) {
      return res.status(503).json({
        success: false,
        message: "Le service d'assistant IA est temporairement indisponible.",
      });
    }

    let modelName = 'gemini-2.5-flash';
    let systemInstruction = '';

    if (roleType === 'legal') {
      modelName = 'gemini-2.5-pro';
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
      modelName = 'gemini-2.5-flash';
      systemInstruction = `Tu es l'Assistant Recherche et Vie de Quartier Darna au Maroc.
Tu aides les futurs locataires et les propriétaires au Maroc :
- Conseils sur les quartiers (ambiance, écoles, transports, commerces, sécurité) à Casablanca, Rabat, Marrakech, Tanger, etc.
- Conseils pour bien rédiger une annonce ou préparer un dossier locataire solide au Maroc.
- Recommandations de sécurité anti-arnaque : ne jamais verser d'acompte avant visite physique, vérifier les titres de propriété ou mandats d'agence.
Ton ton est accueillant, professionnel et très ancré dans le quotidien marocain.`;
    }

    try {
      const contents = messages.map((m: { role: 'user' | 'model'; text: string }) => ({
        role: m.role,
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
        if (modelName === 'gemini-2.5-pro') {
          response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
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
      console.error('Error in POST /api/chat:', err);
      res.status(500).json({
        success: false,
        message: "Une erreur est survenue lors de la communication avec l'assistant IA. Veuillez réessayer plus tard.",
      });
    }
  });

  // Strict JSON 404 handler for all /api/* routes so unmatched API endpoints never fall through
  // to the SPA catch-all (index.html homepage).
  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      code: 'API_ENDPOINT_NOT_FOUND',
      path: req.originalUrl,
      message: "Cet endpoint API n'existe pas sur cette version du serveur Darna.",
    });
  });

  return { app, db };
}
