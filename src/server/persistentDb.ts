import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type {
  Listing,
  ListingReport,
  User,
  SubscriptionPlan,
  BoostOption,
  PaymentTransaction,
} from '../types/index.ts';
import {
  INITIAL_LISTINGS,
  INITIAL_REPORTS,
  INITIAL_SUBSCRIPTION_PLANS,
  INITIAL_BOOST_OPTIONS,
  INITIAL_USERS,
} from '../data/mockListings.ts';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
} from '../utils/security.ts';
import {
  isCloudSqlConfigured,
  fetchAllCloudSqlState,
  syncUserToCloudSql,
  syncSessionToCloudSql,
  deleteSessionFromCloudSql,
  deleteUserSessionsFromCloudSql,
  revokeAllSessionsInCloudSql,
  syncPasswordResetTokenToCloudSql,
  syncListingToCloudSql,
  deleteListingFromCloudSql,
  syncReportToCloudSql,
  syncPlanToCloudSql,
  syncBoostOptionToCloudSql,
  syncTransactionToCloudSql,
} from '../db/users.ts';

const requireModule = createRequire(import.meta.url);

export class DarnaPersistentDb {
  private db: any;
  public readonly dbFilePath: string;
  private readonly enableCloudSqlSync: boolean;
  private simulateCloudSqlFailure = false;
  private cloudSqlHydrated = false;
  private lastCloudSqlSyncAt = 0;
  private cloudSqlHydratingPromise: Promise<void> | null = null;

  constructor(
    customDbPath?: string,
    options?: { enableCloudSqlSync?: boolean; allowLocalFallbackInProd?: boolean }
  ) {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !customDbPath && !options?.allowLocalFallbackInProd && !isCloudSqlConfigured()) {
      throw new Error(
        'POSTGRESQL_REQUIRED_IN_PRODUCTION: En production, PostgreSQL (Cloud SQL) doit obligatoirement être configuré. Le repli silencieux sur une base locale est interdit.'
      );
    }

    this.enableCloudSqlSync =
      options?.enableCloudSqlSync !== undefined
        ? Boolean(options.enableCloudSqlSync && isCloudSqlConfigured())
        : !customDbPath && isCloudSqlConfigured();
    this.dbFilePath =
      customDbPath ||
      process.env.DARNA_DB_PATH ||
      path.resolve(process.cwd(), 'data', 'darna.sqlite');

    if (this.dbFilePath !== ':memory:') {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const sqlite = requireModule('node:sqlite');
    this.db = new sqlite.DatabaseSync(this.dbFilePath);
    this.initSchema();
    this.seedInitialDataIfEmpty();
  }

  /**
   * Allows testing PostgreSQL connection failure behavior deterministically.
   * When enabled, all write operations reject before modifying local SQLite.
   */
  public setSimulateCloudSqlFailure(fail: boolean): void {
    this.simulateCloudSqlFailure = fail;
  }

  public isCloudSqlSyncEnabled(): boolean {
    return this.enableCloudSqlSync;
  }

  public getActiveSessionCount(): number {
    const nowIso = new Date().toISOString();
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM sessions WHERE expires_at > ?')
      .get(nowIso) as { cnt: number } | undefined;
    return Number(row?.cnt || 0);
  }

  private assertCloudSqlWritable(): void {
    if (this.simulateCloudSqlFailure) {
      throw new Error(
        'CLOUD_SQL_CONNECTION_FAILURE: Connexion PostgreSQL indisponible, écriture annulée.'
      );
    }
    if (process.env.NODE_ENV === 'production' && !this.enableCloudSqlSync && !isCloudSqlConfigured()) {
      throw new Error(
        'POSTGRESQL_REQUIRED_IN_PRODUCTION: En production, PostgreSQL (Cloud SQL) doit obligatoirement être configuré.'
      );
    }
  }

  /**
   * Synchronizes state from Cloud SQL PostgreSQL (when configured) so that restarts
   * and multi-instance deployments always read authoritative PostgreSQL data.
   */
  public async ensureCloudSqlHydrated(forceRefresh = false): Promise<void> {
    if (this.simulateCloudSqlFailure) {
      throw new Error('CLOUD_SQL_CONNECTION_FAILURE: Connexion PostgreSQL indisponible.');
    }
    if (process.env.NODE_ENV === 'production' && !this.enableCloudSqlSync && !isCloudSqlConfigured()) {
      throw new Error(
        'POSTGRESQL_REQUIRED_IN_PRODUCTION: En production, PostgreSQL (Cloud SQL) doit obligatoirement être configuré.'
      );
    }
    if (!this.enableCloudSqlSync) return;
    const now = Date.now();
    // Refresh from Cloud SQL across requests for multi-instance consistency (150ms coalescing window)
    if (this.cloudSqlHydrated && !forceRefresh && now - this.lastCloudSqlSyncAt < 150) {
      return;
    }
    if (this.cloudSqlHydratingPromise) {
      return this.cloudSqlHydratingPromise;
    }

    this.cloudSqlHydratingPromise = (async () => {
      try {
        const state = await fetchAllCloudSqlState();
        if (!state) return;

        const nowIso = new Date().toISOString();

        // If Cloud SQL was newly provisioned and completely empty, push initial catalog first
        if (state.plans.length === 0) {
          const allPlans = this.getAllPlans();
          await Promise.all(allPlans.map((p, i) => syncPlanToCloudSql(p, i)));
        } else {
          state.plans.forEach((p, idx) => {
            this.db
              .prepare(
                'INSERT OR REPLACE INTO subscription_plans (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)'
              )
              .run(p.id, idx, JSON.stringify(p), nowIso);
          });
        }

        if (state.boostOptions.length === 0) {
          const allBoosts = this.getAllBoostOptions();
          await Promise.all(allBoosts.map((b, i) => syncBoostOptionToCloudSql(b, i)));
        } else {
          state.boostOptions.forEach((b, idx) => {
            this.db
              .prepare(
                'INSERT OR REPLACE INTO boost_options (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)'
              )
              .run(b.id, idx, JSON.stringify(b), nowIso);
          });
        }

        if (state.listings.length === 0 && !this.cloudSqlHydrated) {
          const allListings = this.getAllListings();
          await Promise.all(allListings.map((l) => syncListingToCloudSql(l)));
        } else if (state.listings.length > 0) {
          // Reconcile listings so deletions on another instance are reflected
          this.db.prepare('DELETE FROM listings').run();
          for (const l of state.listings) {
            const sortTime = new Date(l.createdAt || nowIso).getTime() || Date.now();
            this.db
              .prepare(
                'INSERT OR REPLACE INTO listings (id, user_id, status, sort_time, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
              )
              .run(
                l.id,
                l.userId,
                l.status,
                sortTime,
                JSON.stringify(l),
                l.createdAt || nowIso,
                l.updatedAt || nowIso
              );
          }
        }

        if (state.reports.length === 0 && !this.cloudSqlHydrated) {
          const allReports = this.getAllReports();
          await Promise.all(allReports.map((r) => syncReportToCloudSql(r)));
        } else if (state.reports.length > 0) {
          for (const r of state.reports) {
            const sortTime = new Date(r.createdAt || nowIso).getTime() || Date.now();
            this.db
              .prepare(
                'INSERT OR REPLACE INTO reports (id, listing_id, status, sort_time, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
              )
              .run(
                r.id,
                r.listingId,
                r.status,
                sortTime,
                JSON.stringify(r),
                r.createdAt || nowIso
              );
          }
        }

        if (state.users.length === 0 && !this.cloudSqlHydrated) {
          const userRows = this.db
            .prepare('SELECT data_json, password_hash FROM users')
            .all() as { data_json: string; password_hash: string }[];
          await Promise.all(
            userRows.map((row) =>
              syncUserToCloudSql(JSON.parse(row.data_json) as User, row.password_hash)
            )
          );
        } else if (state.users.length > 0) {
          this.db.prepare('DELETE FROM users').run();
          for (const u of state.users) {
            this.db
              .prepare(
                'INSERT OR REPLACE INTO users (id, email, password_hash, role, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
              )
              .run(
                u.user.id,
                u.user.email.toLowerCase(),
                u.passwordHash,
                u.user.role,
                JSON.stringify(u.user),
                u.user.createdAt || nowIso,
                nowIso
              );
          }
        }

        // Reconcile sessions from Cloud SQL (so session revocations apply across all instances)
        this.db.prepare('DELETE FROM sessions').run();
        for (const s of state.sessions) {
          this.db
            .prepare(
              'INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
            )
            .run(s.tokenHash, s.userUid, s.expiresAt, nowIso);
        }

        if (state.resetTokens) {
          this.db.prepare('DELETE FROM password_reset_tokens').run();
          for (const rt of state.resetTokens) {
            this.db
              .prepare(
                'INSERT OR REPLACE INTO password_reset_tokens (token_hash, user_id, email, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, ?)'
              )
              .run(rt.tokenHash, rt.userUid, rt.email, rt.expiresAt, rt.used, nowIso);
          }
        }

        this.db.prepare('DELETE FROM transactions').run();
        for (const tx of state.transactions) {
          this.db
            .prepare(
              'INSERT OR REPLACE INTO transactions (id, idempotency_key, user_id, status, sort_time, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )
            .run(
              tx.id,
              tx.idempotencyKey || tx.id,
              tx.userId,
              tx.status,
              new Date(tx.createdAt || nowIso).getTime() || Date.now(),
              JSON.stringify(tx),
              tx.createdAt || nowIso,
              nowIso
            );
        }

        this.cloudSqlHydrated = true;
        this.lastCloudSqlSyncAt = Date.now();
      } finally {
        this.cloudSqlHydratingPromise = null;
      }
    })();

    return this.cloudSqlHydratingPromise;
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        sort_time INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        status TEXT NOT NULL,
        sort_time INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS subscription_plans (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS boost_options (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        sort_time INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private seedInitialDataIfEmpty(): void {
    const nowIso = new Date().toISOString();

    const planCountRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM subscription_plans')
      .get() as { cnt: number };
    if (!planCountRow || planCountRow.cnt === 0) {
      const insertPlan = this.db.prepare(
        'INSERT INTO subscription_plans (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)'
      );
      INITIAL_SUBSCRIPTION_PLANS.forEach((plan, index) => {
        insertPlan.run(plan.id, index, JSON.stringify(plan), nowIso);
      });
    }

    const boostCountRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM boost_options')
      .get() as { cnt: number };
    if (!boostCountRow || boostCountRow.cnt === 0) {
      const insertBoost = this.db.prepare(
        'INSERT INTO boost_options (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)'
      );
      INITIAL_BOOST_OPTIONS.forEach((opt, index) => {
        insertBoost.run(opt.id, index, JSON.stringify(opt), nowIso);
      });
    }

    const listingCountRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM listings')
      .get() as { cnt: number };
    if (!listingCountRow || listingCountRow.cnt === 0) {
      const insertListing = this.db.prepare(
        'INSERT INTO listings (id, user_id, status, sort_time, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      INITIAL_LISTINGS.forEach((listing, index) => {
        const sortTime =
          new Date(listing.createdAt || nowIso).getTime() || Date.now() - index * 1000;
        insertListing.run(
          listing.id,
          listing.userId,
          listing.status,
          sortTime,
          JSON.stringify(listing),
          listing.createdAt || nowIso,
          listing.updatedAt || nowIso
        );
      });
    }

    const reportCountRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM reports')
      .get() as { cnt: number };
    if (!reportCountRow || reportCountRow.cnt === 0) {
      const insertReport = this.db.prepare(
        'INSERT INTO reports (id, listing_id, status, sort_time, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      INITIAL_REPORTS.forEach((rep, index) => {
        const sortTime =
          new Date(rep.createdAt || nowIso).getTime() || Date.now() - index * 1000;
        insertReport.run(
          rep.id,
          rep.listingId,
          rep.status,
          sortTime,
          JSON.stringify(rep),
          rep.createdAt || nowIso
        );
      });
    }

    const userCountRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM users')
      .get() as { cnt: number };
    if (!userCountRow || userCountRow.cnt === 0) {
      const insertUser = this.db.prepare(
        'INSERT INTO users (id, email, password_hash, role, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const u of INITIAL_USERS) {
        if (u.role === 'admin') continue;
        const randomLockedHash = hashPassword(generateSecureToken(32));
        insertUser.run(
          u.id,
          u.email.toLowerCase(),
          randomLockedHash,
          u.role,
          JSON.stringify(u),
          u.createdAt || nowIso,
          nowIso
        );
      }
    }
  }

  // ==========================================================================
  // USERS & AUTHENTICATION (Awaited Cloud SQL Write-First)
  // ==========================================================================

  public getAllUsers(): User[] {
    const rows = this.db
      .prepare('SELECT data_json FROM users ORDER BY created_at DESC')
      .all() as { data_json: string }[];
    return rows.map((r) => JSON.parse(r.data_json) as User);
  }

  public getUserById(id: string): User | null {
    const row = this.db
      .prepare('SELECT data_json FROM users WHERE id = ?')
      .get(id) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as User) : null;
  }

  public getUserByEmail(email: string): { user: User; passwordHash: string } | null {
    const normalized = String(email || '').trim().toLowerCase();
    const row = this.db
      .prepare('SELECT data_json, password_hash FROM users WHERE email = ?')
      .get(normalized) as { data_json: string; password_hash: string } | undefined;
    if (!row) return null;
    return {
      user: JSON.parse(row.data_json) as User,
      passwordHash: row.password_hash,
    };
  }

  public async createUser(user: User, plainPassword: string): Promise<User> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();
    const normalizedEmail = user.email.trim().toLowerCase();
    const cleanUser: User = { ...user, email: normalizedEmail };
    const passwordHash = hashPassword(plainPassword);

    // 1. Write to Cloud SQL PostgreSQL first when enabled; throw if it fails
    if (this.enableCloudSqlSync) {
      await syncUserToCloudSql(cleanUser, passwordHash);
    }

    // 2. Update local cache after Cloud SQL succeeds
    this.db
      .prepare(
        'INSERT INTO users (id, email, password_hash, role, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        cleanUser.id,
        normalizedEmail,
        passwordHash,
        cleanUser.role,
        JSON.stringify(cleanUser),
        cleanUser.createdAt || nowIso,
        nowIso
      );

    return cleanUser;
  }

  public async updateUser(user: User): Promise<User> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();
    const normalizedEmail = user.email.trim().toLowerCase();
    const cleanUser: User = { ...user, email: normalizedEmail };

    if (this.enableCloudSqlSync) {
      await syncUserToCloudSql(cleanUser);
    }

    this.db
      .prepare(
        'UPDATE users SET email = ?, role = ?, data_json = ?, updated_at = ? WHERE id = ?'
      )
      .run(
        normalizedEmail,
        cleanUser.role,
        JSON.stringify(cleanUser),
        nowIso,
        cleanUser.id
      );

    return cleanUser;
  }

  public async updateUserPassword(userId: string, newPlainPassword: string): Promise<void> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();
    const passwordHash = hashPassword(newPlainPassword);

    if (this.enableCloudSqlSync) {
      const updatedUser = this.getUserById(userId);
      if (updatedUser) {
        await syncUserToCloudSql(updatedUser, passwordHash);
      }
      await deleteUserSessionsFromCloudSql(userId);
    }

    this.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, nowIso, userId);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  public verifyUserCredentials(email: string, plainPassword: string): User | null {
    const record = this.getUserByEmail(email);
    if (!record) return null;
    const isValid = verifyPassword(plainPassword, record.passwordHash);
    if (!isValid) return null;
    return record.user;
  }

  // ==========================================================================
  // SESSIONS (Hashed with SHA-256, Awaited Cloud SQL Write-First)
  // ==========================================================================

  public async createSession(userId: string, ttlMs = 7 * 24 * 3600 * 1000): Promise<string> {
    this.assertCloudSqlWritable();
    const rawToken = `darna_${generateSecureToken(32)}`;
    const tokenHash = hashToken(rawToken);
    const expiresAt = Date.now() + ttlMs;
    const nowIso = new Date().toISOString();

    if (this.enableCloudSqlSync) {
      await syncSessionToCloudSql(tokenHash, userId, expiresAt);
    }

    this.db
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(tokenHash, userId, expiresAt, nowIso);

    return rawToken;
  }

  public getUserBySessionToken(rawToken: string): User | null {
    if (!rawToken) return null;
    const tokenHash = hashToken(rawToken);
    const row = this.db
      .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
      .get(tokenHash) as { user_id: string; expires_at: number } | undefined;

    if (!row) return null;
    if (Date.now() > row.expires_at) {
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      if (this.enableCloudSqlSync) {
        deleteSessionFromCloudSql(tokenHash).catch(() => {});
      }
      return null;
    }

    return this.getUserById(row.user_id);
  }

  public async deleteSession(rawToken: string): Promise<void> {
    this.assertCloudSqlWritable();
    if (!rawToken) return;
    const tokenHash = hashToken(rawToken);
    if (this.enableCloudSqlSync) {
      await deleteSessionFromCloudSql(tokenHash);
    }
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  public async revokeAllSessions(): Promise<number> {
    this.assertCloudSqlWritable();
    if (this.enableCloudSqlSync) {
      await revokeAllSessionsInCloudSql();
    }
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM sessions')
      .get() as { cnt: number } | undefined;
    const count = countRow?.cnt || 0;
    this.db.prepare('DELETE FROM sessions').run();
    return count;
  }

  // ==========================================================================
  // PASSWORD RESET & EMAIL VERIFICATION TOKENS (Single-use, 15-min, SHA-256)
  // ==========================================================================

  public async createPasswordResetToken(
    email: string,
    ttlMs = 15 * 60 * 1000
  ): Promise<string | null> {
    this.assertCloudSqlWritable();
    const record = this.getUserByEmail(email);
    if (!record) return null;

    const rawResetToken = generateSecureToken(24);
    const tokenHash = hashToken(rawResetToken);
    const expiresAt = Date.now() + ttlMs;
    const nowIso = new Date().toISOString();

    if (this.enableCloudSqlSync) {
      await syncPasswordResetTokenToCloudSql(
        tokenHash,
        record.user.id,
        record.user.email,
        expiresAt,
        0
      );
    }

    this.db
      .prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND email = ?')
      .run(record.user.id, record.user.email);

    this.db
      .prepare(
        'INSERT INTO password_reset_tokens (token_hash, user_id, email, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
      )
      .run(tokenHash, record.user.id, record.user.email, expiresAt, nowIso);

    return rawResetToken;
  }

  public async consumePasswordResetToken(
    email: string,
    rawResetToken: string,
    newPlainPassword: string
  ): Promise<boolean> {
    this.assertCloudSqlWritable();
    if (!email || !rawResetToken || !newPlainPassword) return false;
    const normalizedEmail = String(email).trim().toLowerCase();
    const tokenHash = hashToken(rawResetToken.trim());

    const row = this.db
      .prepare(
        'SELECT user_id, email, expires_at, used FROM password_reset_tokens WHERE token_hash = ?'
      )
      .get(tokenHash) as
      | { user_id: string; email: string; expires_at: number; used: number }
      | undefined;

    if (!row) return false;
    if (row.used !== 0) return false;
    if (row.email.toLowerCase() !== normalizedEmail) return false;
    if (Date.now() > row.expires_at) return false;

    if (this.enableCloudSqlSync) {
      await syncPasswordResetTokenToCloudSql(
        tokenHash,
        row.user_id,
        row.email,
        row.expires_at,
        1
      );
    }

    this.db
      .prepare('UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?')
      .run(tokenHash);

    await this.updateUserPassword(row.user_id, newPlainPassword);
    return true;
  }

  /**
   * Generates a single-use cryptographic token to verify ownership of an email address.
   */
  public async createEmailVerificationToken(
    userId: string,
    email: string,
    ttlMs = 15 * 60 * 1000
  ): Promise<string> {
    this.assertCloudSqlWritable();
    const rawVerifyToken = generateSecureToken(24);
    const tokenHash = hashToken(rawVerifyToken);
    const expiresAt = Date.now() + ttlMs;
    const nowIso = new Date().toISOString();
    const taggedEmail = `verify:${email.trim().toLowerCase()}`;

    if (this.enableCloudSqlSync) {
      await syncPasswordResetTokenToCloudSql(
        tokenHash,
        userId,
        taggedEmail,
        expiresAt,
        0
      );
    }

    this.db
      .prepare(
        'INSERT INTO password_reset_tokens (token_hash, user_id, email, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
      )
      .run(tokenHash, userId, taggedEmail, expiresAt, nowIso);

    return rawVerifyToken;
  }

  /**
   * Validates and consumes a single-use cryptographic email verification token.
   */
  public async consumeEmailVerificationToken(
    userId: string,
    email: string,
    rawVerifyToken: string
  ): Promise<User | null> {
    this.assertCloudSqlWritable();
    if (!userId || !email || !rawVerifyToken) return null;
    const taggedEmail = `verify:${email.trim().toLowerCase()}`;
    const tokenHash = hashToken(rawVerifyToken.trim());

    const row = this.db
      .prepare(
        'SELECT user_id, email, expires_at, used FROM password_reset_tokens WHERE token_hash = ?'
      )
      .get(tokenHash) as
      | { user_id: string; email: string; expires_at: number; used: number }
      | undefined;

    if (!row) return null;
    if (row.used !== 0) return null;
    if (row.user_id !== userId) return null;
    if (row.email !== taggedEmail) return null;
    if (Date.now() > row.expires_at) return null;

    const user = this.getUserById(userId);
    if (!user) return null;

    if (this.enableCloudSqlSync) {
      await syncPasswordResetTokenToCloudSql(
        tokenHash,
        row.user_id,
        row.email,
        row.expires_at,
        1
      );
    }

    this.db
      .prepare('UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?')
      .run(tokenHash);

    user.emailVerified = true;
    user.verified = true;
    const updatedUser = await this.updateUser(user);
    return updatedUser;
  }

  // ==========================================================================
  // LISTINGS (Awaited Cloud SQL Write-First)
  // ==========================================================================

  public getAllListings(): Listing[] {
    const rows = this.db
      .prepare('SELECT data_json FROM listings ORDER BY sort_time DESC')
      .all() as { data_json: string }[];
    return rows.map((r) => JSON.parse(r.data_json) as Listing);
  }

  public getListingById(id: string): Listing | null {
    const row = this.db
      .prepare('SELECT data_json FROM listings WHERE id = ?')
      .get(id) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as Listing) : null;
  }

  public async createListing(listing: Listing): Promise<Listing> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();
    const sortTime = Date.now();

    if (this.enableCloudSqlSync) {
      await syncListingToCloudSql(listing);
    }

    this.db
      .prepare(
        'INSERT INTO listings (id, user_id, status, sort_time, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        listing.id,
        listing.userId,
        listing.status,
        sortTime,
        JSON.stringify(listing),
        listing.createdAt || nowIso,
        listing.updatedAt || nowIso
      );

    return listing;
  }

  public async updateListing(listing: Listing): Promise<Listing> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();
    const updated = { ...listing, updatedAt: nowIso };

    if (this.enableCloudSqlSync) {
      await syncListingToCloudSql(updated);
    }

    this.db
      .prepare(
        'UPDATE listings SET status = ?, data_json = ?, updated_at = ? WHERE id = ?'
      )
      .run(updated.status, JSON.stringify(updated), nowIso, updated.id);

    return updated;
  }

  public async deleteListing(id: string): Promise<boolean> {
    this.assertCloudSqlWritable();
    if (this.enableCloudSqlSync) {
      await deleteListingFromCloudSql(id);
    }
    const res = this.db.prepare('DELETE FROM listings WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  // ==========================================================================
  // REPORTS (Awaited Cloud SQL Write-First)
  // ==========================================================================

  public getAllReports(): ListingReport[] {
    const rows = this.db
      .prepare('SELECT data_json FROM reports ORDER BY sort_time DESC')
      .all() as { data_json: string }[];
    return rows.map((r) => JSON.parse(r.data_json) as ListingReport);
  }

  public getReportById(id: string): ListingReport | null {
    const row = this.db
      .prepare('SELECT data_json FROM reports WHERE id = ?')
      .get(id) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as ListingReport) : null;
  }

  public async createReport(report: ListingReport): Promise<ListingReport> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();

    if (this.enableCloudSqlSync) {
      await syncReportToCloudSql(report);
    }

    this.db
      .prepare(
        'INSERT INTO reports (id, listing_id, status, sort_time, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        report.id,
        report.listingId,
        report.status,
        Date.now(),
        JSON.stringify(report),
        report.createdAt || nowIso
      );

    return report;
  }

  public async updateReport(report: ListingReport): Promise<ListingReport> {
    this.assertCloudSqlWritable();
    if (this.enableCloudSqlSync) {
      await syncReportToCloudSql(report);
    }

    this.db
      .prepare('UPDATE reports SET status = ?, data_json = ? WHERE id = ?')
      .run(report.status, JSON.stringify(report), report.id);

    return report;
  }

  // ==========================================================================
  // SUBSCRIPTION PLANS & BOOST OPTIONS (Awaited Cloud SQL Write-First)
  // ==========================================================================

  public getAllPlans(): SubscriptionPlan[] {
    const rows = this.db
      .prepare('SELECT data_json FROM subscription_plans ORDER BY sort_order ASC')
      .all() as { data_json: string }[];
    return rows.map((r) => JSON.parse(r.data_json) as SubscriptionPlan);
  }

  public getPlanById(id: string): SubscriptionPlan | null {
    const row = this.db
      .prepare('SELECT data_json FROM subscription_plans WHERE id = ?')
      .get(id) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as SubscriptionPlan) : null;
  }

  public async createPlan(plan: SubscriptionPlan): Promise<SubscriptionPlan> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();
    const maxOrderRow = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM subscription_plans')
      .get() as { maxOrder: number };
    const nextOrder = (maxOrderRow?.maxOrder || 0) + 1;

    if (this.enableCloudSqlSync) {
      await syncPlanToCloudSql(plan, nextOrder);
    }

    this.db
      .prepare(
        'INSERT INTO subscription_plans (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(plan.id, nextOrder, JSON.stringify(plan), nowIso);

    return plan;
  }

  public async updatePlan(plan: SubscriptionPlan): Promise<SubscriptionPlan> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();

    if (this.enableCloudSqlSync) {
      await syncPlanToCloudSql(plan);
    }

    this.db
      .prepare('UPDATE subscription_plans SET data_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(plan), nowIso, plan.id);

    return plan;
  }

  public getAllBoostOptions(): BoostOption[] {
    const rows = this.db
      .prepare('SELECT data_json FROM boost_options ORDER BY sort_order ASC')
      .all() as { data_json: string }[];
    return rows.map((r) => JSON.parse(r.data_json) as BoostOption);
  }

  public getBoostOptionById(id: string): BoostOption | null {
    const row = this.db
      .prepare('SELECT data_json FROM boost_options WHERE id = ?')
      .get(id) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as BoostOption) : null;
  }

  public async updateBoostOption(opt: BoostOption): Promise<BoostOption> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();

    if (this.enableCloudSqlSync) {
      await syncBoostOptionToCloudSql(opt);
    }

    this.db
      .prepare('UPDATE boost_options SET data_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(opt), nowIso, opt.id);

    return opt;
  }

  // ==========================================================================
  // TRANSACTIONS (Awaited Cloud SQL Write-First)
  // ==========================================================================

  public getAllTransactions(): PaymentTransaction[] {
    const rows = this.db
      .prepare('SELECT data_json FROM transactions ORDER BY sort_time DESC')
      .all() as { data_json: string }[];
    return rows.map((r) => JSON.parse(r.data_json) as PaymentTransaction);
  }

  public getTransactionsByUserId(userId: string): PaymentTransaction[] {
    const rows = this.db
      .prepare('SELECT data_json FROM transactions WHERE user_id = ? ORDER BY sort_time DESC')
      .all(userId) as { data_json: string }[];
    return rows.map((r) => JSON.parse(r.data_json) as PaymentTransaction);
  }

  public getTransactionById(id: string): PaymentTransaction | null {
    const row = this.db
      .prepare('SELECT data_json FROM transactions WHERE id = ?')
      .get(id) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as PaymentTransaction) : null;
  }

  public getTransactionByIdempotencyKey(key: string): PaymentTransaction | null {
    const row = this.db
      .prepare('SELECT data_json FROM transactions WHERE idempotency_key = ?')
      .get(key) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as PaymentTransaction) : null;
  }

  public async createTransaction(tx: PaymentTransaction): Promise<PaymentTransaction> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();

    if (this.enableCloudSqlSync) {
      await syncTransactionToCloudSql(tx);
    }

    this.db
      .prepare(
        'INSERT INTO transactions (id, idempotency_key, user_id, status, sort_time, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        tx.id,
        tx.idempotencyKey,
        tx.userId,
        tx.status,
        Date.now(),
        JSON.stringify(tx),
        tx.createdAt || nowIso,
        nowIso
      );

    return tx;
  }

  public async updateTransaction(tx: PaymentTransaction): Promise<PaymentTransaction> {
    this.assertCloudSqlWritable();
    const nowIso = new Date().toISOString();

    if (this.enableCloudSqlSync) {
      await syncTransactionToCloudSql(tx);
    }

    this.db
      .prepare('UPDATE transactions SET status = ?, data_json = ?, updated_at = ? WHERE id = ?')
      .run(tx.status, JSON.stringify(tx), nowIso, tx.id);

    return tx;
  }

  public close(): void {
    try {
      this.db.close();
    } catch {
      // Ignore if already closed
    }
  }
}
