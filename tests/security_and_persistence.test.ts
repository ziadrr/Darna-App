import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  verifyAdminAuthorization,
  authorizeAdvertiserContactAccess,
} from '../src/utils/security';
import { createDarnaApiApp } from '../src/server/apiApp';
import { DarnaPersistentDb } from '../src/server/persistentDb';

/**
 * Minimal RFC 5321 SMTP server on 127.0.0.1 to test real Nodemailer SMTP email delivery
 * without external network dependencies.
 */
function createLocalTestSmtpServer(): {
  server: net.Server;
  messages: Array<{ raw: string }>;
  start: () => Promise<number>;
  stop: () => Promise<void>;
} {
  const messages: Array<{ raw: string }> = [];
  const server = net.createServer((socket) => {
    socket.write('220 localhost ESMTP DarnaTestMail\r\n');
    let inData = false;
    let dataBuffer = '';

    socket.on('data', (chunk) => {
      const str = chunk.toString('utf8');
      if (inData) {
        dataBuffer += str;
        if (dataBuffer.includes('\r\n.\r\n')) {
          messages.push({ raw: dataBuffer });
          dataBuffer = '';
          inData = false;
          socket.write('250 2.0.0 OK: queued as darna-test-msg\r\n');
        }
        return;
      }

      const lines = str.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-localhost\r\n250 8BITMIME\r\n');
        } else if (upper.startsWith('MAIL FROM')) {
          socket.write('250 2.1.0 OK\r\n');
        } else if (upper.startsWith('RCPT TO')) {
          socket.write('250 2.1.5 OK\r\n');
        } else if (upper === 'DATA') {
          inData = true;
          dataBuffer = '';
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (upper.startsWith('QUIT')) {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });

  return {
    server,
    messages,
    start: () =>
      new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          resolve(addr && typeof addr === 'object' ? addr.port : 0);
        });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe('Darna Security, Authentication, RBAC, Real SMTP Email & Persistence Suite', () => {
  let server: http.Server;
  let baseUrl: string;
  let tempDbPath: string;
  let dbInstance: DarnaPersistentDb;
  let smtpServer: ReturnType<typeof createLocalTestSmtpServer>;
  let smtpPort: number;

  before(async () => {
    tempDbPath = path.join(
      os.tmpdir(),
      `darna-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.sqlite`
    );
    process.env.ADMIN_EMAILS = 'ayarziad@gmail.com,superadmin@darna.ma';

    smtpServer = createLocalTestSmtpServer();
    smtpPort = await smtpServer.start();

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
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    if (smtpServer) {
      await smtpServer.stop();
    }
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
    assert.equal(verifyPassword(plain, plain), false);

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
        role: 'admin',
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
      { method: 'POST', path: '/api/listings/darna-casa-01/moderate', body: { action: 'reject' } },
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
      {
        method: 'POST',
        path: '/api/admin/sessions/revoke-all',
      },
    ];

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

  it('4. enforces real SMTP email sending for password reset, never claims email sent when unconfigured, and never leaks devResetToken', async () => {
    const email = 'youssef.alami@example.ma';

    // A) When SMTP_HOST is not configured, request-password-reset must return 503 and emailSent: false
    delete process.env.SMTP_HOST;
    const unconfRes = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const unconfData = await unconfRes.json();
    assert.equal(unconfRes.status, 503);
    assert.equal(unconfData.emailSent, false);
    assert.equal(unconfData.code, 'EMAIL_SERVICE_NOT_CONFIGURED');
    assert.equal(unconfData.devResetToken, undefined, 'Must never return devResetToken');

    // B) Configure local SMTP server and request password reset
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(smtpPort);

    const reqResetRes = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const reqResetData = await reqResetRes.json();
    assert.equal(reqResetRes.status, 200);
    assert.equal(reqResetData.emailSent, true);
    assert.equal(
      reqResetData.devResetToken,
      undefined,
      'Must never leak devResetToken in HTTP JSON response even in development/test mode'
    );

    // Extract the reset token from the actual SMTP message received by our local SMTP server
    assert.ok(smtpServer.messages.length >= 1, 'SMTP server must have received the email');
    const lastMailRaw = smtpServer.messages[smtpServer.messages.length - 1].raw.replace(
      /=\r?\n/g,
      ''
    );
    const match = lastMailRaw.match(/JETON_RESET:\s*([a-f0-9]{48})/i);
    assert.ok(match && match[1], 'Email body must contain the 48-char cryptographic reset token');
    const emailedResetToken = match[1];

    // C) Forged reset token must fail with 403
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

    // D) Consume real emailed token with strong password
    const confirmResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        resetToken: emailedResetToken,
        newPassword: 'NewSecurePassword2026!',
      }),
    });
    assert.equal(confirmResetRes.status, 200);

    // E) Reusing the same resetToken a second time must fail (single-use)
    const replayResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        resetToken: emailedResetToken,
        newPassword: 'AnotherPassword2026!',
      }),
    });
    assert.equal(replayResetRes.status, 403);
  });

  it('5. protects advertiser contact details from unauthenticated visitors and hides non-published listings', async () => {
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
    const visitorContactRes = await fetch(
      `${baseUrl}/api/listings/${sampleListing.id}/contact`
    );
    assert.equal(visitorContactRes.status, 401);

    assert.equal(verifyAdminAuthorization(null).statusCode, 401);
    assert.equal(authorizeAdvertiserContactAccess(sampleListing, null).statusCode, 401);
  });

  it('6. disables Google and Apple social login endpoints by default and strictly rejects unverified social login attempts', async () => {
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
      assert.equal(noTokenRes.status, 401);
      assert.equal(noTokenData.code, 'PROVIDER_TOKEN_REQUIRED');

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

      assert.equal(
        dbInstance.getUserByEmail('salma.mobile@gmail.com'),
        null,
        'Unverified social login must never create a user in DB'
      );
    } finally {
      delete process.env.ENABLE_SOCIAL_AUTH;
    }
  });

  it('7. requires a valid single-use cryptographic token sent via SMTP to mark an email as verified and never leaks devVerificationToken', async () => {
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

    // A) Without SMTP configured, request-email-verification returns 503 and emailSent: false
    delete process.env.SMTP_HOST;
    const unconfVerifyReq = await fetch(`${baseUrl}/api/auth/request-email-verification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const unconfVerifyData = await unconfVerifyReq.json();
    assert.equal(unconfVerifyReq.status, 503);
    assert.equal(unconfVerifyData.emailSent, false);
    assert.equal(unconfVerifyData.devVerificationToken, undefined);

    // B) Calling /api/auth/verify-email without a token fails with 400
    const noProofRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(noProofRes.status, 400);

    // C) Enable local SMTP server, request email verification, and verify token is delivered by SMTP (never in HTTP JSON)
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(smtpPort);

    const reqTokenRes = await fetch(`${baseUrl}/api/auth/request-email-verification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const reqTokenData = await reqTokenRes.json();
    assert.equal(reqTokenRes.status, 200);
    assert.equal(reqTokenData.emailSent, true);
    assert.equal(
      reqTokenData.devVerificationToken,
      undefined,
      'Must never return devVerificationToken in HTTP response'
    );

    const lastMailRaw = smtpServer.messages[smtpServer.messages.length - 1].raw.replace(
      /=\r?\n/g,
      ''
    );
    const match = lastMailRaw.match(/JETON_VERIFICATION:\s*([a-f0-9]{48})/i);
    assert.ok(match && match[1], 'Email must contain the 48-char verification token');
    const emailedVerifyToken = match[1];

    const validVerifyRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ verificationToken: emailedVerifyToken }),
    });
    const validVerifyData = await validVerifyRes.json();
    assert.equal(validVerifyRes.status, 200);
    assert.equal(validVerifyData.user.emailVerified, true);

    // D) Replaying the same verification token a second time fails with 403
    const replayVerifyRes = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ verificationToken: emailedVerifyToken }),
    });
    assert.equal(replayVerifyRes.status, 403);
  });

  it('8. refuses to confirm a save (HTTP 503) if PostgreSQL synchronization fails and persists across restarts when healthy', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'youssef.alami@example.ma',
        password: 'NewSecurePassword2026!',
      }),
    });
    const { token } = await loginRes.json();

    // Simulate a PostgreSQL connection outage during write
    const listingsBefore = dbInstance.getAllListings().length;
    dbInstance.setSimulateCloudSqlFailure(true);
    try {
      const failedListingRes = await fetch(`${baseUrl}/api/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: 'Annonce pendant panne PostgreSQL',
          description: 'Ne doit jamais être confirmée comme sauvegardée.',
          category: 'appartement',
          price: 5000,
          city: 'Casablanca',
          neighborhood: 'Maarif',
        }),
      });
      const failedListingData = await failedListingRes.json();
      assert.equal(
        failedListingRes.status,
        503,
        'Must return 503 Service Unavailable when PostgreSQL write fails'
      );
      assert.equal(failedListingData.success, false);
      assert.equal(failedListingData.code, 'DATABASE_SYNC_FAILED');
      assert.equal(
        dbInstance.getAllListings().length,
        listingsBefore,
        'Must not write to local SQLite if PostgreSQL sync failed'
      );
    } finally {
      dbInstance.setSimulateCloudSqlFailure(false);
    }

    // Global session revocation
    const revokedCount = await dbInstance.revokeAllSessions();
    assert.ok(revokedCount >= 1, 'Should revoke active sessions');

    // Close current DB connection and reopen to verify restart persistence
    dbInstance.close();
    const reopenedDb = new DarnaPersistentDb(tempDbPath);
    const persistedUser = reopenedDb.getUserByEmail('youssef.alami@example.ma');
    assert.ok(persistedUser, 'Registered user must persist across DB restarts');
    assert.equal(persistedUser.user.emailVerified, true);
    reopenedDb.close();
  });
});
