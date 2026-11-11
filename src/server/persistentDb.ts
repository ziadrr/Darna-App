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
  private cloudSqlHydrated = false;
  private cloudSqlHydratingPromise: Promise<void> | null = null;

  constructor(customDbPath?: string) {
    this.enableCloudSqlSync = !customDbPath && isCloudSqlConfigured();
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
   * Lazily synchronizes state between Cloud SQL PostgreSQL (when configured) and the local
   * fast cache on the first incoming HTTP request. Never runs at module load time.
   */
  public async ensureCloudSqlHydrated(): Promise<void> {
    if (!this.enableCloudSqlSync || this.cloudSqlHydrated) return;
    if (this.cloudSqlHydratingPromise) {
      return this.cloudSqlHydratingPromise;
    }

    this.cloudSqlHydratingPromise = (async () => {
      try {
        const state = await fetchAllCloudSqlState();
        if (!state) return;

        const nowIso = new Date().toISOString();

        // 1. If Cloud SQL has existing users/listings/plans/transactions, hydrate into local cache
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

        for (const s of state.sessions) {
          this.db
            .prepare(
              'INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
            )
            .run(s.tokenHash, s.userUid, s.expiresAt, nowIso);
        }

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

        state.plans.forEach((p, idx) => {
          this.db
            .prepare(
              'INSERT OR REPLACE INTO subscription_plans (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)'
            )
            .run(p.id, idx, JSON.stringify(p), nowIso);
        });

        state.boostOptions.forEach((b, idx) => {
          this.db
            .prepare(
              'INSERT OR REPLACE INTO boost_options (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)'
            )
            .run(b.id, idx, JSON.stringify(b), nowIso);
        });

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

        // 2. If Cloud SQL was newly provisioned and empty, push existing initial catalog to Cloud SQL
        if (state.plans.length === 0) {
          const allPlans = this.getAllPlans();
          await Promise.all(allPlans.map((p, i) => syncPlanToCloudSql(p, i)));
        }
        if (state.boostOptions.length === 0) {
          const allBoosts = this.getAllBoostOptions();
          await Promise.all(allBoosts.map((b, i) => syncBoostOptionToCloudSql(b, i)));
        }
        if (state.listings.length === 0) {
          const allListings = this.getAllListings();
          await Promise.all(allListings.map((l) => syncListingToCloudSql(l)));
        }
        if (state.reports.length === 0) {
          const allReports = this.getAllReports();
          await Promise.all(allReports.map((r) => syncReportToCloudSql(r)));
        }
        if (state.users.length === 0) {
          const userRows = this.db
            .prepare('SELECT data_json, password_hash FROM users')
            .all() as { data_json: string; password_hash: string }[];
          await Promise.all(
            userRows.map((row) =>
              syncUserToCloudSql(JSON.parse(row.data_json) as User, row.password_hash)
            )
          );
        }

        this.cloudSqlHydrated = true;
      } catch (err) {
        console.error('Cloud SQL hydration warning:', err);
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
  // USERS & AUTHENTICATION
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

  public createUser(user: User, plainPassword: string): User {
    const nowIso = new Date().toISOString();
    const normalizedEmail = user.email.trim().toLowerCase();
    const cleanUser: User = { ...user, email: normalizedEmail };
    const passwordHash = hashPassword(plainPassword);

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

    if (this.enableCloudSqlSync) {
      syncUserToCloudSql(cleanUser, passwordHash).catch((err) =>
        console.error('Cloud SQL user sync error:', err)
      );
    }

    return cleanUser;
  }

  public updateUser(user: User): User {
    const nowIso = new Date().toISOString();
    const normalizedEmail = user.email.trim().toLowerCase();
    const cleanUser: User = { ...user, email: normalizedEmail };

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

    if (this.enableCloudSqlSync) {
      syncUserToCloudSql(cleanUser).catch((err) =>
        console.error('Cloud SQL user update sync error:', err)
      );
    }

    return cleanUser;
  }

  public updateUserPassword(userId: string, newPlainPassword: string): void {
    const nowIso = new Date().toISOString();
    const passwordHash = hashPassword(newPlainPassword);
    this.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, nowIso, userId);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

    if (this.enableCloudSqlSync) {
      const updatedUser = this.getUserById(userId);
      if (updatedUser) {
        syncUserToCloudSql(updatedUser, passwordHash).catch((err) =>
          console.error('Cloud SQL password sync error:', err)
        );
      }
    }
  }

  public verifyUserCredentials(email: string, plainPassword: string): User | null {
    const record = this.getUserByEmail(email);
    if (!record) return null;
    const isValid = verifyPassword(plainPassword, record.passwordHash);
    if (!isValid) return null;
    return record.user;
  }

  // ==========================================================================
  // SESSIONS (Hashed with SHA-256)
  // ==========================================================================

  public createSession(userId: string, ttlMs = 7 * 24 * 3600 * 1000): string {
    const rawToken = `darna_${generateSecureToken(32)}`;
    const tokenHash = hashToken(rawToken);
    const expiresAt = Date.now() + ttlMs;
    const nowIso = new Date().toISOString();

    this.db
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(tokenHash, userId, expiresAt, nowIso);

    if (this.enableCloudSqlSync) {
      syncSessionToCloudSql(tokenHash, userId, expiresAt).catch((err) =>
        console.error('Cloud SQL session sync error:', err)
      );
    }

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

  public deleteSession(rawToken: string): void {
    if (!rawToken) return;
    const tokenHash = hashToken(rawToken);
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    if (this.enableCloudSqlSync) {
      deleteSessionFromCloudSql(tokenHash).catch(() => {});
    }
  }

  // ==========================================================================
  // PASSWORD RESET TOKENS (Single-use, 15-minute expiry, SHA-256 hashed)
  // ==========================================================================

  public createPasswordResetToken(email: string, ttlMs = 15 * 60 * 1000): string | null {
    const record = this.getUserByEmail(email);
    if (!record) return null;

    const rawResetToken = generateSecureToken(24);
    const tokenHash = hashToken(rawResetToken);
    const expiresAt = Date.now() + ttlMs;
    const nowIso = new Date().toISOString();

    this.db
      .prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?')
      .run(record.user.id);

    this.db
      .prepare(
        'INSERT INTO password_reset_tokens (token_hash, user_id, email, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
      )
      .run(tokenHash, record.user.id, record.user.email, expiresAt, nowIso);

    if (this.enableCloudSqlSync) {
      syncPasswordResetTokenToCloudSql(
        tokenHash,
        record.user.id,
        record.user.email,
        expiresAt,
        0
      ).catch(() => {});
    }

    return rawResetToken;
  }

  public consumePasswordResetToken(
    email: string,
    rawResetToken: string,
    newPlainPassword: string
  ): boolean {
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

    this.db
      .prepare('UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?')
      .run(tokenHash);

    if (this.enableCloudSqlSync) {
      syncPasswordResetTokenToCloudSql(
        tokenHash,
        row.user_id,
        row.email,
        row.expires_at,
        1
      ).catch(() => {});
    }

    this.updateUserPassword(row.user_id, newPlainPassword);
    return true;
  }

  // ==========================================================================
  // LISTINGS
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

  public createListing(listing: Listing): Listing {
    const nowIso = new Date().toISOString();
    const sortTime = Date.now();
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

    if (this.enableCloudSqlSync) {
      syncListingToCloudSql(listing).catch((err) =>
        console.error('Cloud SQL listing create sync error:', err)
      );
    }

    return listing;
  }

  public updateListing(listing: Listing): Listing {
    const nowIso = new Date().toISOString();
    const updated = { ...listing, updatedAt: nowIso };
    this.db
      .prepare(
        'UPDATE listings SET status = ?, data_json = ?, updated_at = ? WHERE id = ?'
      )
      .run(updated.status, JSON.stringify(updated), nowIso, updated.id);

    if (this.enableCloudSqlSync) {
      syncListingToCloudSql(updated).catch((err) =>
        console.error('Cloud SQL listing update sync error:', err)
      );
    }

    return updated;
  }

  public deleteListing(id: string): boolean {
    const res = this.db.prepare('DELETE FROM listings WHERE id = ?').run(id);
    if (this.enableCloudSqlSync) {
      deleteListingFromCloudSql(id).catch((err) =>
        console.error('Cloud SQL listing delete sync error:', err)
      );
    }
    return Number(res.changes) > 0;
  }

  // ==========================================================================
  // REPORTS
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

  public createReport(report: ListingReport): ListingReport {
    const nowIso = new Date().toISOString();
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

    if (this.enableCloudSqlSync) {
      syncReportToCloudSql(report).catch((err) =>
        console.error('Cloud SQL report create sync error:', err)
      );
    }

    return report;
  }

  public updateReport(report: ListingReport): ListingReport {
    this.db
      .prepare('UPDATE reports SET status = ?, data_json = ? WHERE id = ?')
      .run(report.status, JSON.stringify(report), report.id);

    if (this.enableCloudSqlSync) {
      syncReportToCloudSql(report).catch((err) =>
        console.error('Cloud SQL report update sync error:', err)
      );
    }

    return report;
  }

  // ==========================================================================
  // SUBSCRIPTION PLANS & BOOST OPTIONS
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

  public createPlan(plan: SubscriptionPlan): SubscriptionPlan {
    const nowIso = new Date().toISOString();
    const maxOrderRow = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM subscription_plans')
      .get() as { maxOrder: number };
    const nextOrder = (maxOrderRow?.maxOrder || 0) + 1;
    this.db
      .prepare(
        'INSERT INTO subscription_plans (id, sort_order, data_json, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(plan.id, nextOrder, JSON.stringify(plan), nowIso);

    if (this.enableCloudSqlSync) {
      syncPlanToCloudSql(plan, nextOrder).catch((err) =>
        console.error('Cloud SQL plan create sync error:', err)
      );
    }

    return plan;
  }

  public updatePlan(plan: SubscriptionPlan): SubscriptionPlan {
    const nowIso = new Date().toISOString();
    this.db
      .prepare('UPDATE subscription_plans SET data_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(plan), nowIso, plan.id);

    if (this.enableCloudSqlSync) {
      syncPlanToCloudSql(plan).catch((err) =>
        console.error('Cloud SQL plan update sync error:', err)
      );
    }

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

  public updateBoostOption(opt: BoostOption): BoostOption {
    const nowIso = new Date().toISOString();
    this.db
      .prepare('UPDATE boost_options SET data_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(opt), nowIso, opt.id);

    if (this.enableCloudSqlSync) {
      syncBoostOptionToCloudSql(opt).catch((err) =>
        console.error('Cloud SQL boost update sync error:', err)
      );
    }

    return opt;
  }

  // ==========================================================================
  // TRANSACTIONS
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

  public createTransaction(tx: PaymentTransaction): PaymentTransaction {
    const nowIso = new Date().toISOString();
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

    if (this.enableCloudSqlSync) {
      syncTransactionToCloudSql(tx).catch((err) =>
        console.error('Cloud SQL transaction create sync error:', err)
      );
    }

    return tx;
  }

  public updateTransaction(tx: PaymentTransaction): PaymentTransaction {
    const nowIso = new Date().toISOString();
    this.db
      .prepare('UPDATE transactions SET status = ?, data_json = ?, updated_at = ? WHERE id = ?')
      .run(tx.status, JSON.stringify(tx), nowIso, tx.id);

    if (this.enableCloudSqlSync) {
      syncTransactionToCloudSql(tx).catch((err) =>
        console.error('Cloud SQL transaction update sync error:', err)
      );
    }

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
