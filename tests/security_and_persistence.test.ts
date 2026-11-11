import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  verifyAdminAuthorization,
  authorizeAdvertiserContactAccess,
} from '../src/utils/security';
import { createDarnaApiApp } from '../src/server/apiApp';
import { DarnaPersistentDb } from '../src/server/persistentDb';

describe('Darna Security, Authentication, RBAC & SQLite Persistence Suite', () => {
  let server: http.Server;
  let baseUrl: string;
  let tempDbPath: string;
  let dbInstance: DarnaPersistentDb;

  before(async () => {
    tempDbPath = path.join(
      os.tmpdir(),
      `darna-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.sqlite`
    );
    process.env.ADMIN_EMAILS = 'ayarziad@gmail.com,superadmin@darna.ma';

    const created = createDarnaApiApp(tempDbPath);
    dbInstance = created.db;

    await new Promise<void>((resolve) => {
      server = created.app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (dbInstance) {
      dbInstance.close();
    }
    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${tempDbPath}${suffix}`;
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch {
          // ignore cleanup error
        }
      }
    }
  });

  it('1. hashes passwords with salted scrypt and never accepts plaintext hashes', () => {
    const plain = 'MarocImmo2026!';
    const hashed = hashPassword(plain);

    assert.ok(hashed.startsWith('scrypt$'), 'Hash must use scrypt prefix');
    assert.ok(!hashed.includes(plain), 'Hash must never contain plaintext password');
    assert.equal(verifyPassword(plain, hashed), true);
    assert.equal(verifyPassword('WrongPassword123!', hashed), false);
    // Rejects raw plaintext stored as hash
    assert.equal(verifyPassword(plain, plain), false);

    // Enforces strong password policy
    assert.equal(validatePasswordStrength('12345').valid, false);
    assert.equal(validatePasswordStrength('onlyletters').valid, false);
    assert.equal(validatePasswordStrength('DarnaSecure2026!').valid, true);
  });

  it('2. disables demo-login endpoint for all roles (particulier, professionnel, admin)', async () => {
    for (const role of ['particulier', 'professionnel', 'admin']) {
      const res = await fetch(`${baseUrl}/api/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      assert.equal(res.status, 403, `demo-login for ${role} must return 403 Forbidden`);
      assert.equal(data.success, false);
      assert.equal(data.code, 'DEMO_LOGIN_DISABLED');
    }
  });

  it('3. blocks unauthenticated visitors (401) and regular users (403) from all admin, moderation, user-list, and refund endpoints', async () => {
    // Register a normal 'particulier' user (even if they try to inject role: 'admin' in body)
    const regUserRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Youssef',
        lastName: 'Alami',
        email: 'youssef.alami@example.ma',
        password: 'UserPass2026!',
        phone: '0661112233',
        advertiserType: 'particulier',
        role: 'admin', // Attempted privilege escalation!
        termsAccepted: true,
      }),
    });
    const regUserData = await regUserRes.json();
    assert.equal(regUserRes.status, 201);
    assert.equal(regUserData.user.role, 'particulier', 'Must ignore client-supplied admin role');
    const regularToken = regUserData.token as string;

    const adminProtectedRoutes: Array<{
      method: string;
      path: string;
      body?: Record<string, unknown>;
    }> = [
      { method: 'POST', path: '/api/listings/darna-1/moderate', body: { action: 'reject' } },
      { method: 'GET', path: '/api/reports' },
      { method: 'POST', path: '/api/reports/rep-1/resolve', body: { action: 'resolve' } },
      { method: 'GET', path: '/api/users' },
      {
        method: 'PUT',
        path: `/api/admin/users/${regUserData.user.id}/role`,
        body: { role: 'admin' },
      },
      { method: 'GET', path: '/api/admin/monetization' },
      {
        method: 'POST',
        path: '/api/admin/plans',
        body: { name: 'Offre Pirate', price: 0, maxListings: 999 },
      },
      {
        method: 'PUT',
        path: '/api/admin/plans/agence-pro',
        body: { price: 1 },
      },
      {
        method: 'PUT',
        path: '/api/admin/boost-options/premium',
        body: { price: 1 },
      },
      {
        method: 'POST',
        path: '/api/payments/tx-fake/refund',
      },
    ];

    // A) Visitor (no token) must receive 401 Unauthorized on every admin endpoint
    for (const route of adminProtectedRoutes) {
      const res = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: route.body ? JSON.stringify(route.body) : undefined,
      });
      const data = await res.json();
      assert.equal(
        res.status,
        401,
        `Visitor should be rejected with 401 on ${route.method} ${route.path}`
      );
      assert.equal(data.code, 'UNAUTHORIZED');
    }

    // B) Authenticated regular user must receive 403 Forbidden on every admin endpoint
    for (const route of adminProtectedRoutes) {
      const res = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regularToken}`,
        },
        body: route.body ? JSON.stringify(route.body) : undefined,
      });
      const data = await res.json();
      assert.equal(
        res.status,
        403,
        `Regular user should be rejected with 403 on ${route.method} ${route.path}`
      );
      assert.equal(data.code, 'FORBIDDEN_ADMIN_ONLY');
    }

    // C) Authorized Admin (email in ADMIN_EMAILS) can access admin endpoints
    const regAdminRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Ziad',
        lastName: 'Ayar',
        email: 'ayarziad@gmail.com',
        password: 'AdminStrong2026!',
        termsAccepted: true,
      }),
    });
    const regAdminData = await regAdminRes.json();
    assert.equal(regAdminRes.status, 201);
    assert.equal(regAdminData.user.role, 'admin');
    const adminToken = regAdminData.token as string;

    const adminMonRes = await fetch(`${baseUrl}/api/admin/monetization`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminMonRes.status, 200);

    const adminUsersRes = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminUsersRes.status, 200);
  });

  it('4. enforces two-step token verification for password reset and blocks unauthenticated password overwrites', async () => {
    const email = 'youssef.alami@example.ma';

    // Attempt to reset password without a valid resetToken must fail
    const directResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        newPassword: 'HackedPassword123!',
      }),
    });
    assert.equal(directResetRes.status, 400);

    // Attempt with a forged resetToken must fail with 403
    const forgedResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        resetToken: 'forged-invalid-token-999999',
        newPassword: 'HackedPassword123!',
      }),
    });
    assert.equal(forgedResetRes.status, 403);

    // Legitimate step 1: request password reset token
    const reqResetRes = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const reqResetData = await reqResetRes.json();
    assert.equal(reqResetRes.status, 200);
    assert.ok(reqResetData.devResetToken, 'Should return devResetToken in test environment');

    // Legitimate step 2: consume resetToken with strong password
    const confirmResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        resetToken: reqResetData.devResetToken,
        newPassword: 'NewSecurePassword2026!',
      }),
    });
    assert.equal(confirmResetRes.status, 200);

    // Reusing the same resetToken a second time must fail (single-use)
    const replayResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        resetToken: reqResetData.devResetToken,
        newPassword: 'AnotherPassword2026!',
      }),
    });
    assert.equal(replayResetRes.status, 403);

    // Login with new password succeeds
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'NewSecurePassword2026!',
      }),
    });
    assert.equal(loginRes.status, 200);
  });

  it('5. protects advertiser contact details from unauthenticated visitors and hides non-published listings', async () => {
    // Visitor requests public listings
    const pubRes = await fetch(`${baseUrl}/api/listings`);
    const pubData = await pubRes.json();
    assert.equal(pubRes.status, 200);
    for (const l of pubData.listings) {
      assert.equal(l.status, 'publiee', 'Visitors must only see published listings');
      assert.equal(l.contact.phone, '', 'Visitor listing phone must be empty');
      assert.ok(!l.contact.whatsapp, 'Visitor listing WhatsApp must be empty');
      assert.ok(!l.contact.email, 'Visitor listing email must be empty');
    }

    const sampleListing = pubData.listings[0];
    // Visitor requests /api/listings/:id/contact -> 401
    const visitorContactRes = await fetch(
      `${baseUrl}/api/listings/${sampleListing.id}/contact`
    );
    assert.equal(visitorContactRes.status, 401);

    // Pure helper verification
    assert.equal(verifyAdminAuthorization(null).statusCode, 401);
    assert.equal(authorizeAdvertiserContactAccess(sampleListing, null).statusCode, 401);
  });

  it('6. disables Google and Apple social login endpoints by default and strictly rejects unverified social login attempts', async () => {
    // A) By default (and in production), all social auth endpoints must return 403 SOCIAL_AUTH_DISABLED
    const gmailDisabledRes = await fetch(`${baseUrl}/api/auth/social-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        email: 'salma.mobile@gmail.com',
        firstName: 'Salma',
        lastName: 'Idrissi',
      }),
    });
    const gmailDisabledData = await gmailDisabledRes.json();
    assert.equal(gmailDisabledRes.status, 403);
    assert.equal(gmailDisabledData.code, 'SOCIAL_AUTH_DISABLED');

    const oauthUrlRes = await fetch(`${baseUrl}/api/auth/oauth/google/url`);
    assert.equal(oauthUrlRes.status, 403);

    const callbackRes = await fetch(
      `${baseUrl}/auth/callback?email=spoof@gmail.com&state=google`
    );
    assert.equal(callbackRes.status, 403);

    // B) Even if ENABLE_SOCIAL_AUTH=true in non-production, plain email without a verified provider idToken is rejected (401)
    process.env.ENABLE_SOCIAL_AUTH = 'true';
    try {
      const noTokenRes = await fetch(`${baseUrl}/api/auth/social-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          email: 'salma.mobile@gmail.com',
          firstName: 'Salma',
          lastName: 'Idrissi',
        }),
      });
      const noTokenData = await noTokenRes.json();
      assert.equal(
        noTokenRes.status,
        401,
        'Social login without idToken must be rejected with 401'
      );
      assert.equal(noTokenData.code, 'PROVIDER_TOKEN_REQUIRED');

      // Forged / unverified JWT must be rejected (401 INVALID_PROVIDER_TOKEN)
      const forgedTokenRes = await fetch(`${baseUrl}/api/auth/social-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          email: 'youssef.alami@example.ma',
          idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.forgedpayload.forgedsignature',
        }),
      });
      const forgedTokenData = await forgedTokenRes.json();
      assert.equal(forgedTokenRes.status, 401);
      assert.equal(forgedTokenData.code, 'INVALID_PROVIDER_TOKEN');

      // Ensure no account was created for salma.mobile@gmail.com
      assert.equal(
        dbInstance.getUserByEmail('salma.mobile@gmail.com'),
        null,
        'Unverified social login must never create a user in DB'
      );
    } finally {
      delete process.env.ENABLE_SOCIAL_AUTH;
    }
  });

  it('7. requires a valid single-use cryptographic token to mark an email as verified', async () => {
    // Login as regular user (whose emailVerified is initially false)
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'youssef.alami@example.ma',
        password: 'NewSecurePassword2026!',
      }),
    });
    const loginData = await loginRes.json();
    assert.equal(loginRes.status, 200);
    assert.equal(loginData.user.emailVerified, false);
    const userToken = loginData.token as string;

    // A) Calling /api/auth/verify-email without a token must fail with 400
    const noProofRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({}),
    });
    const noProofData = await noProofRes.json();
    assert.equal(noProofRes.status, 400);
    assert.equal(noProofData.code, 'EMAIL_VERIFICATION_TOKEN_REQUIRED');

    // B) Calling /api/auth/verify-email with a forged token must fail with 403
    const forgedProofRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ verificationToken: 'forged-verification-token-123' }),
    });
    const forgedProofData = await forgedProofRes.json();
    assert.equal(forgedProofRes.status, 403);
    assert.equal(forgedProofData.code, 'INVALID_OR_EXPIRED_VERIFICATION_TOKEN');

    // C) Requesting a real verification token and consuming it succeeds once
    const reqTokenRes = await fetch(`${baseUrl}/api/auth/request-email-verification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const reqTokenData = await reqTokenRes.json();
    assert.equal(reqTokenRes.status, 200);
    assert.ok(reqTokenData.devVerificationToken);

    const validVerifyRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ verificationToken: reqTokenData.devVerificationToken }),
    });
    const validVerifyData = await validVerifyRes.json();
    assert.equal(validVerifyRes.status, 200);
    assert.equal(validVerifyData.user.emailVerified, true);

    // D) Replaying the same verification token a second time must fail with 403
    const replayVerifyRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ verificationToken: reqTokenData.devVerificationToken }),
    });
    assert.equal(replayVerifyRes.status, 403);
  });

  it('8. persists users, listings, subscriptions, and transactions across database restarts and supports global session revocation', async () => {
    // Test global session revocation
    const revokedCount = await dbInstance.revokeAllSessions();
    assert.ok(revokedCount >= 1, 'Should revoke active sessions');

    // Close current DB connection and open a brand-new connection to the same SQLite file
    dbInstance.close();

    const reopenedDb = new DarnaPersistentDb(tempDbPath);
    const persistedUser = reopenedDb.getUserByEmail('youssef.alami@example.ma');
    assert.ok(persistedUser, 'Registered user must persist on disk across DB restarts');
    assert.ok(
      persistedUser.passwordHash.startsWith('scrypt$'),
      'Persisted password hash must be scrypt'
    );
    assert.equal(persistedUser.user.emailVerified, true);

    const persistedListings = reopenedDb.getAllListings();
    assert.ok(persistedListings.length >= 8, 'Existing listings must be preserved in SQLite');

    const persistedPlans = reopenedDb.getAllPlans();
    assert.equal(persistedPlans.length, 5, '5 subscription plans must be preserved in SQLite');
    reopenedDb.close();
  });
});
