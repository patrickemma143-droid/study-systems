import knexFactory, { type Knex } from 'knex';
import { config } from './config';

function makeKnex(): Knex {
  if (config.dbClient === 'mysql') {
    return knexFactory({
      client: 'mysql2',
      connection: { ...config.mysql, charset: 'utf8mb4' },
      pool: { min: 0, max: 10 },
    });
  }
  return knexFactory({
    client: 'better-sqlite3',
    connection: { filename: config.sqliteFile },
    useNullAsDefault: true,
    pool: {
      afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
        conn.pragma('journal_mode = WAL');
        conn.pragma('foreign_keys = ON');
        done(null, conn);
      },
    },
  });
}

export const db = makeKnex();

/**
 * Schema migrations live in code so the app sets up its own database on first run.
 * To change the schema later, append a new entry — never edit an old one.
 */
/** Create a table only if it isn't there yet, so a start that was cut off half-way can simply run again. */
async function createIfMissing(k: Knex, name: string, build: (t: Knex.CreateTableBuilder) => void): Promise<void> {
  if (!(await k.schema.hasTable(name))) await k.schema.createTable(name, build);
}

const migrations: Record<string, { up: (k: Knex) => Promise<void>; down: (k: Knex) => Promise<void> }> = {
  '001_initial': {
    async up(k) {
      await createIfMissing(k, 'users', (t) => {
        t.increments('id').primary();
        t.string('name', 120).notNullable();
        t.string('email', 190).notNullable().unique();
        t.string('password_hash', 100).notNullable();
        t.string('university', 160);
        t.string('course', 160);
        t.integer('daily_goal').notNullable().defaultTo(20);
        t.string('preference', 20);
        t.bigInteger('created_at').notNullable();
      });
      await createIfMissing(k, 'packs', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.string('title', 200).notNullable();
        t.string('source_type', 20).notNullable();
        t.string('source_name', 255);
        t.string('exam_date', 10);
        t.text('source_text', 'longtext');
        t.text('data', 'longtext').notNullable();
        t.text('stats');
        t.bigInteger('created_at').notNullable();
        t.bigInteger('updated_at').notNullable();
        t.bigInteger('last_opened_at');
        t.index(['user_id']);
      });
      await createIfMissing(k, 'cards', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.integer('pack_id').unsigned().notNullable().references('id').inTable('packs').onDelete('CASCADE');
        t.integer('chunk_index').notNullable().defaultTo(0);
        t.string('type', 20).notNullable();
        t.text('front').notNullable();
        t.text('back').notNullable();
        t.string('hint', 255);
        t.float('ease').notNullable().defaultTo(2.5);
        t.float('interval_days').notNullable().defaultTo(0);
        t.integer('reps').notNullable().defaultTo(0);
        t.integer('lapses').notNullable().defaultTo(0);
        t.bigInteger('due_at').notNullable();
        t.bigInteger('last_reviewed_at');
        t.boolean('suspended').notNullable().defaultTo(false);
        t.index(['user_id', 'due_at']);
        t.index(['pack_id']);
      });
      await createIfMissing(k, 'reviews', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.integer('card_id').unsigned().notNullable().references('id').inTable('cards').onDelete('CASCADE');
        t.integer('rating').notNullable();
        t.float('interval_days').notNullable();
        t.bigInteger('reviewed_at').notNullable();
        t.string('day', 10).notNullable();
        t.index(['user_id', 'day']);
      });
      await createIfMissing(k, 'quiz_attempts', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.integer('pack_id').unsigned().references('id').inTable('packs').onDelete('CASCADE');
        t.string('mode', 20).notNullable();
        t.integer('score').notNullable();
        t.integer('total').notNullable();
        t.text('details', 'longtext');
        t.bigInteger('created_at').notNullable();
        t.index(['user_id', 'pack_id']);
      });
      await createIfMissing(k, 'chunk_progress', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.integer('pack_id').unsigned().notNullable().references('id').inTable('packs').onDelete('CASCADE');
        t.integer('chunk_index').notNullable();
        t.string('status', 16).notNullable().defaultTo('new');
        t.integer('best_recall');
        t.bigInteger('updated_at').notNullable();
        t.unique(['user_id', 'pack_id', 'chunk_index']);
      });
      await createIfMissing(k, 'notes', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.integer('pack_id').unsigned().notNullable().references('id').inTable('packs').onDelete('CASCADE');
        t.integer('chunk_index');
        t.string('kind', 20).notNullable();
        t.text('content', 'longtext').notNullable();
        t.bigInteger('created_at').notNullable();
        t.index(['user_id', 'pack_id', 'kind']);
      });
      await createIfMissing(k, 'activity', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.integer('pack_id').unsigned().references('id').inTable('packs').onDelete('SET NULL');
        t.string('method', 30).notNullable();
        t.float('minutes').notNullable().defaultTo(0);
        t.string('day', 10).notNullable();
        t.bigInteger('created_at').notNullable();
        t.index(['user_id', 'day']);
      });
    },
    async down(k) {
      for (const t of ['activity', 'notes', 'chunk_progress', 'quiz_attempts', 'reviews', 'cards', 'packs', 'users']) {
        await k.schema.dropTableIfExists(t);
      }
    },
  },
  '002_ai': {
    async up(k) {
      if (!(await k.schema.hasColumn('users', 'plan'))) {
        await k.schema.alterTable('users', (t) => {
          t.string('plan', 10).notNullable().defaultTo('free');
        });
      }
      // AI results shared by everyone: the same lecture text is only ever sent to the AI once.
      await createIfMissing(k, 'ai_cache', (t) => {
        t.increments('id').primary();
        t.string('cache_key', 64).notNullable().unique();
        t.string('kind', 20).notNullable();
        t.string('model', 60).notNullable();
        t.text('output', 'longtext').notNullable();
        t.integer('tokens_in').notNullable().defaultTo(0);
        t.integer('tokens_out').notNullable().defaultTo(0);
        t.integer('hits').notNullable().defaultTo(0);
        t.bigInteger('created_at').notNullable();
      });
      // One row per AI request: powers daily limits and the admin cost report.
      await createIfMissing(k, 'ai_events', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.string('day', 10).notNullable();
        t.string('kind', 20).notNullable();
        t.string('model', 60).notNullable();
        t.boolean('cached').notNullable().defaultTo(false);
        t.integer('tokens_in').notNullable().defaultTo(0);
        t.integer('tokens_out').notNullable().defaultTo(0);
        t.integer('cost_micro_usd').notNullable().defaultTo(0);
        t.bigInteger('created_at').notNullable();
        t.index(['user_id', 'day']);
        t.index(['day']);
      });
    },
    async down(k) {
      await k.schema.dropTableIfExists('ai_events');
      await k.schema.dropTableIfExists('ai_cache');
      if (await k.schema.hasColumn('users', 'plan')) await k.schema.alterTable('users', (t) => t.dropColumn('plan'));
    },
  },
};

export async function migrate(): Promise<void> {
  const opts = {
    migrationSource: {
      getMigrations: async () => Object.keys(migrations).sort(),
      getMigrationName: (name: string) => name,
      getMigration: async (name: string) => migrations[name],
    },
  };
  try {
    await db.migrate.latest(opts);
  } catch (err: any) {
    // A start that was stopped mid-setup (e.g. by a host restart) leaves the lock set.
    // Only one copy of the app runs, so it's safe to clear it and finish the setup.
    if (!/already locked/i.test(String(err?.message))) throw err;
    console.warn('Clearing a stale database setup lock left by an interrupted start…');
    await db.migrate.forceFreeMigrationsLock(opts);
    await db.migrate.latest(opts);
  }
}

export const now = () => Date.now();

export function parseJSON<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
