import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('particulier'),
  dataJson: text('data_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userUid: text('user_uid').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userUid: text('user_uid').notNull(),
  email: text('email').notNull(),
  expiresAt: text('expires_at').notNull(),
  used: integer('used').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const listings = pgTable('listings', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('publiee'),
  city: text('city').notNull(),
  category: text('category').notNull(),
  price: integer('price').notNull(),
  dataJson: text('data_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  listingId: text('listing_id').notNull(),
  status: text('status').notNull().default('pending'),
  dataJson: text('data_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const subscriptionPlans = pgTable('subscription_plans', {
  id: text('id').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  dataJson: text('data_json').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const boostOptions = pgTable('boost_options', {
  id: text('id').primaryKey(),
  sortOrder: integer('sort_order').notNull().default(0),
  dataJson: text('data_json').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  idempotencyKey: text('idempotency_key'),
  dataJson: text('data_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings),
  transactions: many(transactions),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  owner: one(users, {
    fields: [listings.userId],
    references: [users.uid],
  }),
  reports: many(reports),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  listing: one(listings, {
    fields: [reports.listingId],
    references: [listings.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.uid],
  }),
}));
