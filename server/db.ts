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
const migrations: Record<string, { up: (k: Knex) => Promise<void>; down: (k: Knex) => Promise<void> }> = {
  '001_initial': {
    async up(k) {
      await k.schema.createTable('users', (t) => {
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
      await k.schema.createTable('packs', (t) => {
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
      await k.schema.createTable('cards', (t) => {
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
      await k.schema.createTable('reviews', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.integer('card_id').unsigned().notNullable().references('id').inTable('cards').onDelete('CASCADE');
        t.integer('rating').notNullable();
        t.float('interval_days').notNullable();
        t.bigInteger('reviewed_at').notNullable();
        t.string('day', 10).notNullable();
        t.index(['user_id', 'day']);
      });
      await k.schema.createTable('quiz_attempts', (t) => {
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
      await k.schema.createTable('chunk_progress', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.integer('pack_id').unsigned().notNullable().references('id').inTable('packs').onDelete('CASCADE');
        t.integer('chunk_index').notNullable();
        t.string('status', 16).notNullable().defaultTo('new');
        t.integer('best_recall');
        t.bigInteger('updated_at').notNullable();
        t.unique(['user_id', 'pack_id', 'chunk_index']);
      });
      await k.schema.createTable('notes', (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.integer('pack_id').unsigned().notNullable().references('id').inTable('packs').onDelete('CASCADE');
        t.integer('chunk_index');
        t.string('kind', 20).notNullable();
        t.text('content', 'longtext').notNullable();
        t.bigInteger('created_at').notNullable();
        t.index(['user_id', 'pack_id', 'kind']);
      });
      await k.schema.createTable('activity', (t) => {
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
};

export async function migrate(): Promise<void> {
  await db.migrate.latest({
    migrationSource: {
      getMigrations: async () => Object.keys(migrations).sort(),
      getMigrationName: (name: string) => name,
      getMigration: async (name: string) => migrations[name],
    },
  });
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
