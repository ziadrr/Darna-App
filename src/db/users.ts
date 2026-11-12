import { eq, asc, desc } from 'drizzle-orm';
import { db } from './index.ts';
import {
  users,
  sessions,
  passwordResetTokens,
  listings,
  reports,
  subscriptionPlans,
  boostOptions,
  transactions,
} from './schema.ts';
import type {
  User,
  Listing,
  ListingReport,
  SubscriptionPlan,
  BoostOption,
  PaymentTransaction,
} from '../types/index.ts';
import { hashPassword } from '../utils/security.ts';

export function isCloudSqlConfigured(): boolean {
  return Boolean(
    process.env.SQL_HOST &&
      process.env.SQL_USER &&
      process.env.SQL_PASSWORD &&
      process.env.SQL_DB_NAME
  );
}

/**
 * Safely registers or updates a user in Cloud SQL PostgreSQL using Drizzle's upsert
 * (onConflictDoUpdate) to avoid unique constraint race conditions.
 */
export async function getOrCreateUser(
  uid: string,
  email: string,
  userObj?: User,
  passwordHash?: string
) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const defaultUser: User = userObj || {
      id: uid,
      firstName: normalizedEmail.split('@')[0] || 'Utilisateur',
      lastName: '',
      name: normalizedEmail.split('@')[0] || 'Utilisateur',
      email: normalizedEmail,
      phone: '',
      role: 'particulier',
      advertiserType: 'particulier',
      verified: true,
      emailVerified: true,
      favorites: [],
      createdAt: new Date().toISOString().split('T')[0],
    };

    const computedHash =
      passwordHash || hashPassword(`firebase_${uid}_${Date.now()}_A1!`);

    const result = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        passwordHash: computedHash,
        role: defaultUser.role,
        dataJson: JSON.stringify(defaultUser),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          role: defaultUser.role,
          dataJson: JSON.stringify(defaultUser),
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function getUsersFromCloudSql(): Promise<User[]> {
  try {
    const rows = await db.select().from(users).orderBy(asc(users.createdAt));
    return rows.map((r) => JSON.parse(r.dataJson) as User);
  } catch (error) {
    console.error('Database query failed in getUsersFromCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function syncUserToCloudSql(
  user: User,
  passwordHash?: string
): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    const normalizedEmail = user.email.trim().toLowerCase();
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail));

    const hashToStore =
      passwordHash ||
      existing[0]?.passwordHash ||
      hashPassword(`darna_${user.id}_A1!`);

    await db
      .insert(users)
      .values({
        uid: user.id,
        email: normalizedEmail,
        passwordHash: hashToStore,
        role: user.role,
        dataJson: JSON.stringify(user),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          uid: user.id,
          passwordHash: hashToStore,
          role: user.role,
          dataJson: JSON.stringify(user),
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Database query failed in syncUserToCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function syncSessionToCloudSql(
  tokenHash: string,
  userUid: string,
  expiresAt: number
): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db
      .insert(sessions)
      .values({
        tokenHash,
        userUid,
        expiresAt: String(expiresAt),
      })
      .onConflictDoUpdate({
        target: sessions.tokenHash,
        set: {
          userUid,
          expiresAt: String(expiresAt),
        },
      });
  } catch (error) {
    console.error('Database query failed in syncSessionToCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function deleteSessionFromCloudSql(tokenHash: string): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  } catch (error) {
    console.error('Database query failed in deleteSessionFromCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function deleteUserSessionsFromCloudSql(userUid: string): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db.delete(sessions).where(eq(sessions.userUid, userUid));
  } catch (error) {
    console.error('Database query failed in deleteUserSessionsFromCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function revokeAllSessionsInCloudSql(): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db.delete(sessions);
  } catch (error) {
    console.error('Database query failed in revokeAllSessionsInCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function syncPasswordResetTokenToCloudSql(
  tokenHash: string,
  userUid: string,
  email: string,
  expiresAt: number,
  used = 0
): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db
      .insert(passwordResetTokens)
      .values({
        tokenHash,
        userUid,
        email,
        expiresAt: String(expiresAt),
        used,
      })
      .onConflictDoUpdate({
        target: passwordResetTokens.tokenHash,
        set: {
          used,
          expiresAt: String(expiresAt),
        },
      });
  } catch (error) {
    console.error('Database query failed in syncPasswordResetTokenToCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function syncListingToCloudSql(listing: Listing): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db
      .insert(listings)
      .values({
        id: listing.id,
        userId: listing.userId,
        status: listing.status,
        city: listing.city,
        category: listing.category,
        price: Math.round(Number(listing.price) || 0),
        dataJson: JSON.stringify(listing),
      })
      .onConflictDoUpdate({
        target: listings.id,
        set: {
          userId: listing.userId,
          status: listing.status,
          city: listing.city,
          category: listing.category,
          price: Math.round(Number(listing.price) || 0),
          dataJson: JSON.stringify(listing),
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Database query failed in syncListingToCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function deleteListingFromCloudSql(id: string): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db.delete(listings).where(eq(listings.id, id));
  } catch (error) {
    console.error('Database query failed in deleteListingFromCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function syncReportToCloudSql(report: ListingReport): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db
      .insert(reports)
      .values({
        id: report.id,
        listingId: report.listingId,
        status: report.status,
        dataJson: JSON.stringify(report),
      })
      .onConflictDoUpdate({
        target: reports.id,
        set: {
          status: report.status,
          dataJson: JSON.stringify(report),
        },
      });
  } catch (error) {
    console.error('Database query failed in syncReportToCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function syncPlanToCloudSql(
  plan: SubscriptionPlan,
  sortOrder = 0
): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db
      .insert(subscriptionPlans)
      .values({
        id: plan.id,
        sortOrder,
        dataJson: JSON.stringify(plan),
      })
      .onConflictDoUpdate({
        target: subscriptionPlans.id,
        set: {
          sortOrder,
          dataJson: JSON.stringify(plan),
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Database query failed in syncPlanToCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function syncBoostOptionToCloudSql(
  boost: BoostOption,
  sortOrder = 0
): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db
      .insert(boostOptions)
      .values({
        id: boost.id,
        sortOrder,
        dataJson: JSON.stringify(boost),
      })
      .onConflictDoUpdate({
        target: boostOptions.id,
        set: {
          sortOrder,
          dataJson: JSON.stringify(boost),
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Database query failed in syncBoostOptionToCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function syncTransactionToCloudSql(
  tx: PaymentTransaction,
  rawTxForJson?: PaymentTransaction
): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    const jsonPayload = JSON.stringify(rawTxForJson || tx);
    await db
      .insert(transactions)
      .values({
        id: tx.id,
        userId: tx.userId,
        type: tx.type,
        status: tx.status,
        idempotencyKey: tx.idempotencyKey || null,
        dataJson: jsonPayload,
      })
      .onConflictDoUpdate({
        target: transactions.id,
        set: {
          status: tx.status,
          idempotencyKey: tx.idempotencyKey || null,
          dataJson: jsonPayload,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Database query failed in syncTransactionToCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}

export async function fetchAllCloudSqlState() {
  if (!isCloudSqlConfigured()) return null;
  try {
    const [
      userRows,
      sessionRows,
      resetRows,
      listingRows,
      reportRows,
      planRows,
      boostRows,
      txRows,
    ] = await Promise.all([
      db.select().from(users),
      db.select().from(sessions),
      db.select().from(passwordResetTokens),
      db.select().from(listings).orderBy(desc(listings.createdAt)),
      db.select().from(reports).orderBy(desc(reports.createdAt)),
      db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder)),
      db.select().from(boostOptions).orderBy(asc(boostOptions.sortOrder)),
      db.select().from(transactions).orderBy(desc(transactions.createdAt)),
    ]);

    return {
      users: userRows.map((r) => ({
        user: JSON.parse(r.dataJson) as User,
        passwordHash: r.passwordHash,
      })),
      sessions: sessionRows.map((s) => ({
        tokenHash: s.tokenHash,
        userUid: s.userUid,
        expiresAt: Number(s.expiresAt),
      })),
      resetTokens: resetRows.map((rt) => ({
        tokenHash: rt.tokenHash,
        userUid: rt.userUid,
        email: rt.email,
        expiresAt: Number(rt.expiresAt),
        used: rt.used,
      })),
      listings: listingRows.map((l) => JSON.parse(l.dataJson) as Listing),
      reports: reportRows.map((r) => JSON.parse(r.dataJson) as ListingReport),
      plans: planRows.map((p) => JSON.parse(p.dataJson) as SubscriptionPlan),
      boostOptions: boostRows.map((b) => JSON.parse(b.dataJson) as BoostOption),
      transactions: txRows.map((t) => JSON.parse(t.dataJson) as PaymentTransaction),
    };
  } catch (error) {
    console.error('Database query failed in fetchAllCloudSqlState:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}
