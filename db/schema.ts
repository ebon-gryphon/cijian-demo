import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const spaces = sqliteTable(
  'spaces',
  {
    id: text('id').primaryKey(),
    inviteCode: text('invite_code').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_spaces_invite_code').on(table.inviteCode)],
);

export const members = sqliteTable(
  'members',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    role: text('role', { enum: ['host', 'guest'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    receptionEnabled: integer('reception_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    manualBusy: integer('manual_busy', { mode: 'boolean' })
      .notNull()
      .default(false),
    lastSeenAt: integer('last_seen_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_members_token_hash').on(table.tokenHash),
    uniqueIndex('idx_members_space_role').on(table.spaceId, table.role),
    index('idx_members_space_id').on(table.spaceId),
  ],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    senderMemberId: text('sender_member_id').references(() => members.id, {
      onDelete: 'set null',
    }),
    authorType: text('author_type', { enum: ['human', 'assistant'] })
      .notNull()
      .default('human'),
    assistantForMemberId: text('assistant_for_member_id').references(
      () => members.id,
      { onDelete: 'set null' },
    ),
    text: text('text').notNull(),
    sourcesJson: text('sources_json').notNull().default('[]'),
    unresolvedJson: text('unresolved_json').notNull().default('[]'),
    replyToId: text('reply_to_id'),
    pending: integer('pending', { mode: 'boolean' }).notNull().default(false),
    handled: integer('handled', { mode: 'boolean' }).notNull().default(false),
    replyMode: text('reply_mode', {
      enum: ['model', 'local', 'fallback'],
    }),
    clientNonce: text('client_nonce').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_messages_space_nonce').on(
      table.spaceId,
      table.clientNonce,
    ),
    index('idx_messages_space_created').on(table.spaceId, table.createdAt),
  ],
);
