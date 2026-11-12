import { scryptSync, randomBytes, randomInt, timingSafeEqual, createHash } from 'node:crypto';
import type { Listing, User } from '../types/index.ts';
import { sanitizeListingForVisitor, sanitizeListingForPublic } from './rentalLogic.ts';

const SCRYPT_KEYLEN = 64;

/**
 * Hashes a password using Node's cryptographic scrypt KDF with a unique 16-byte random salt.
 * Never stores plaintext passwords.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

/**
 * Verifies a password against a stored scrypt hash using constant-time comparison (timingSafeEqual).
 * Strictly rejects plaintext or malformed hashes.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, keyHex] = parts;
  if (!salt || !keyHex || keyHex.length !== SCRYPT_KEYLEN * 2) {
    return false;
  }
  try {
    const derivedKey = scryptSync(String(password), salt, SCRYPT_KEYLEN);
    const storedKeyBuf = Buffer.from(keyHex, 'hex');
    if (derivedKey.length !== storedKeyBuf.length) return false;
    return timingSafeEqual(derivedKey, storedKeyBuf);
  } catch {
    return false;
  }
}

/**
 * Validates password strength for registration and password reset.
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  message?: string;
} {
  const pwd = String(password || '');
  if (pwd.length < 8) {
    return {
      valid: false,
      message: 'Le mot de passe doit contenir au moins 8 caractères.',
    };
  }
  if (!/[a-zA-Z]/.test(pwd) || !/[0-9!@#$%^&*(),.?":{}|<>_\-+=]/.test(pwd)) {
    return {
      valid: false,
      message:
        'Le mot de passe doit contenir au moins une lettre et un chiffre ou caractère spécial.',
    };
  }
  return { valid: true };
}

/**
 * Generates a cryptographically strong random token.
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Generates a cryptographically secure 6-digit numeric verification code (e.g. "482910").
 */
export function generateSixDigitCode(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Hashes a session or password-reset token with SHA-256 before storing in the database.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Checks whether an email address is in the server's authorized ADMIN_EMAILS list.
 */
export function isConfiguredAdminEmail(email: string, envAdminEmails?: string): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  const rawList =
    envAdminEmails !== undefined
      ? envAdminEmails
      : process.env.ADMIN_EMAILS || 'ayarziad@gmail.com,ghenamreda62@gmail.com,admin@darna.ma';
  const allowedList = rawList
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowedList.includes(normalized);
}

/**
 * Pure server-side RBAC authorization check for administrator endpoints.
 * Visitors receive 401; non-admin authenticated users receive 403; only admins receive 200.
 */
export function verifyAdminAuthorization(viewer: User | null): {
  authorized: boolean;
  statusCode: 200 | 401 | 403;
  code: 'OK' | 'UNAUTHORIZED' | 'FORBIDDEN_ADMIN_ONLY';
  message: string;
} {
  if (!viewer) {
    return {
      authorized: false,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentification requise : veuillez vous connecter.',
    };
  }
  if (viewer.role !== 'admin') {
    return {
      authorized: false,
      statusCode: 403,
      code: 'FORBIDDEN_ADMIN_ONLY',
      message: 'Accès interdit : cette fonction est strictement réservée aux administrateurs autorisés.',
    };
  }
  return {
    authorized: true,
    statusCode: 200,
    code: 'OK',
    message: 'Accès administrateur autorisé.',
  };
}

/**
 * Checks whether a viewer is allowed to view a given listing and returns the properly sanitized listing.
 * - Non-published listings (brouillon, en_attente, refusee, masquee, expiree) are hidden from visitors
 *   and other regular users; only the listing owner or an admin can view them.
 * - Unauthenticated visitors NEVER receive phone, WhatsApp, email, or exact street address.
 * - Authenticated users only receive contact fields that the advertiser explicitly opted to share.
 */
export function authorizeAndFormatListingForViewer(
  listing: Listing,
  viewer: User | null
): Listing | null {
  const isOwner = Boolean(viewer && listing.userId === viewer.id);
  const isAdmin = Boolean(viewer && viewer.role === 'admin');

  if (listing.status !== 'publiee' && !isOwner && !isAdmin) {
    return null;
  }

  if (!viewer) {
    return sanitizeListingForVisitor(listing);
  }

  if (isOwner || isAdmin) {
    return listing;
  }

  return sanitizeListingForPublic(listing, true);
}

/**
 * Verifies whether a viewer is authorized to access an advertiser's contact coordinates.
 */
export function authorizeAdvertiserContactAccess(
  listing: Listing,
  viewer: User | null
): {
  authorized: boolean;
  statusCode: 200 | 401 | 403;
  message?: string;
  contact?: Listing['contact'];
  address?: string;
} {
  if (!viewer) {
    return {
      authorized: false,
      statusCode: 401,
      message: 'Créez un compte ou connectez-vous pour continuer.',
    };
  }

  const isOwner = listing.userId === viewer.id;
  const isAdmin = viewer.role === 'admin';

  if (listing.status !== 'publiee' && !isOwner && !isAdmin) {
    return {
      authorized: false,
      statusCode: 403,
      message: "Les coordonnées de cette annonce ne sont pas accessibles car l'annonce n'est pas publiée.",
    };
  }

  if (isOwner || isAdmin) {
    return {
      authorized: true,
      statusCode: 200,
      contact: listing.contact,
      address: listing.address,
    };
  }

  const sanitized = sanitizeListingForPublic(listing, true);
  return {
    authorized: true,
    statusCode: 200,
    contact: sanitized.contact,
    address: sanitized.address,
  };
}
