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


migrations['003_personal'] = {
  async up(k) {
    const addCol = async (table: string, col: string, build: (t: Knex.AlterTableBuilder) => void) => {
      if (!(await k.schema.hasColumn(table, col))) await k.schema.alterTable(table, build);
    };
    // Memory model (FSRS) for each card
    await addCol('cards', 'stability', (t) => t.float('stability'));
    await addCol('cards', 'difficulty', (t) => t.float('difficulty'));
    await addCol('reviews', 'typed', (t) => t.boolean('typed').notNullable().defaultTo(false));
    // Personal study settings
    await addCol('users', 'tz_offset', (t) => t.integer('tz_offset').notNullable().defaultTo(180));
    await addCol('users', 'reminder_time', (t) => t.string('reminder_time', 5).notNullable().defaultTo('19:00'));
    await addCol('users', 'reminders_on', (t) => t.boolean('reminders_on').notNullable().defaultTo(false));
    await addCol('users', 'study_prefs', (t) => t.text('study_prefs'));
    // The timetable
    await createIfMissing(k, 'plan_sessions', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.integer('pack_id').unsigned().references('id').inTable('packs').onDelete('CASCADE');
      t.string('day', 10).notNullable();
      t.string('start', 5).notNullable();
      t.integer('minutes').notNullable();
      t.string('kind', 12).notNullable();
      t.string('title', 200).notNullable();
      t.text('detail');
      t.string('status', 10).notNullable().defaultTo('planned');
      t.boolean('notified').notNullable().defaultTo(false);
      t.bigInteger('starts_at').notNullable();
      t.bigInteger('created_at').notNullable();
      t.index(['user_id', 'day']);
      t.index(['starts_at']);
    });
    // Phones and browsers that accept reminders
    await createIfMissing(k, 'push_subscriptions', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('endpoint_hash', 64).notNullable().unique();
      t.text('endpoint').notNullable();
      t.string('p256dh', 200).notNullable();
      t.string('auth', 100).notNullable();
      t.string('device', 120);
      t.bigInteger('created_at').notNullable();
    });
    // Stops the same reminder being sent twice
    await createIfMissing(k, 'notification_log', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('dedupe', 120).notNullable().unique();
      t.string('kind', 20).notNullable();
      t.bigInteger('created_at').notNullable();
    });
    await createIfMissing(k, 'app_settings', (t) => {
      t.string('key', 60).primary();
      t.text('value').notNullable();
    });
  },
  async down(k) {
    for (const t of ['app_settings', 'notification_log', 'push_subscriptions', 'plan_sessions']) await k.schema.dropTableIfExists(t);
  },
};


migrations['004_points'] = {
  async up(k) {
    // Points earned for real study work, grouped by week for the leaderboard
    await createIfMissing(k, 'points_events', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('week', 10).notNullable();
      t.string('day', 10).notNullable();
      t.string('category', 12).notNullable();
      t.integer('points').notNullable();
      t.string('reason', 160).notNullable();
      t.integer('score');
      t.string('dedupe', 120).notNullable().unique();
      t.bigInteger('created_at').notNullable();
      t.index(['week', 'user_id']);
      t.index(['user_id', 'day']);
    });
    if (!(await k.schema.hasColumn('users', 'leaderboard'))) await k.schema.alterTable('users', (t) => t.boolean('leaderboard').notNullable().defaultTo(true));
    // Lets a student step back and change a flashcard rating
    if (!(await k.schema.hasColumn('reviews', 'prev_state'))) await k.schema.alterTable('reviews', (t) => t.text('prev_state'));
  },
  async down(k) {
    await k.schema.dropTableIfExists('points_events');
  },
};


migrations['005_exams'] = {
  async up(k) {
    // Past papers uploaded to a pack, with how their questions are set
    await createIfMissing(k, 'past_papers', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.integer('pack_id').unsigned().notNullable().references('id').inTable('packs').onDelete('CASCADE');
      t.string('name', 200).notNullable();
      t.text('text', 'longtext').notNullable();
      t.text('analysis', 'longtext').notNullable();
      t.bigInteger('created_at').notNullable();
      t.index(['pack_id']);
    });
    // "How did the paper go?" after each exam
    await createIfMissing(k, 'exam_reviews', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.integer('pack_id').unsigned().notNullable().references('id').inTable('packs').onDelete('CASCADE');
      t.integer('how_it_went').notNullable();
      t.integer('app_rating');
      t.integer('readiness');
      t.text('topics');
      t.text('comment');
      t.bigInteger('created_at').notNullable();
      t.unique(['user_id', 'pack_id']);
    });
    // Opt-in public profile pages
    const add = async (col: string, build: (t: Knex.AlterTableBuilder) => void) => {
      if (!(await k.schema.hasColumn('users', col))) await k.schema.alterTable('users', build);
    };
    await add('public_profile', (t) => t.boolean('public_profile').notNullable().defaultTo(false));
    await add('public_slug', (t) => t.string('public_slug', 80).unique());
    await add('bio', (t) => t.string('bio', 200));
  },
  async down(k) {
    await k.schema.dropTableIfExists('exam_reviews');
    await k.schema.dropTableIfExists('past_papers');
  },
};


migrations['006_paper_keys'] = {
  async up(k) {
    // A past paper's marking key (answer scheme), and what we learnt from it
    if (!(await k.schema.hasColumn('past_papers', 'key_text'))) await k.schema.alterTable('past_papers', (t) => t.text('key_text', 'longtext'));
    if (!(await k.schema.hasColumn('past_papers', 'key_analysis'))) await k.schema.alterTable('past_papers', (t) => t.text('key_analysis', 'longtext'));
  },
  async down() {},
};

migrations['007_library'] = {
  async up(k) {
    // The shared library: study packs and past papers students choose to share with everyone
    await createIfMissing(k, 'library_items', (t) => {
      t.increments('id').primary();
      t.integer('owner_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('kind', 10).notNullable(); // pack | paper
      t.integer('pack_id').unsigned(); // the owner's pack it came from (may be deleted later)
      t.integer('paper_id').unsigned();
      t.string('item_type', 12).notNullable(); // notes | book | slides | paper
      t.string('title', 200).notNullable();
      t.string('faculty', 40).notNullable();
      t.string('university', 160);
      t.string('course_code', 40);
      t.string('course_name', 160);
      t.integer('year');
      t.string('semester', 20);
      t.string('author', 160);
      t.string('description', 600);
      t.string('text_hash', 64);
      t.integer('words').notNullable().defaultTo(0);
      t.integer('lessons').notNullable().defaultTo(0);
      t.integer('cards').notNullable().defaultTo(0);
      t.boolean('smart').notNullable().defaultTo(false);
      t.boolean('has_key').notNullable().defaultTo(false);
      t.text('data', 'longtext').notNullable(); // snapshot: pack JSON or past paper JSON
      t.text('source_text', 'longtext');
      t.integer('uses').notNullable().defaultTo(0);
      t.integer('rating_sum').notNullable().defaultTo(0);
      t.integer('rating_count').notNullable().defaultTo(0);
      t.integer('reports').notNullable().defaultTo(0);
      t.string('status', 10).notNullable().defaultTo('live'); // live | hidden
      t.bigInteger('created_at').notNullable();
      t.bigInteger('updated_at').notNullable();
      t.index(['status', 'faculty']);
      t.index(['course_code']);
      t.index(['text_hash']);
      t.index(['owner_id']);
    });
    await createIfMissing(k, 'library_ratings', (t) => {
      t.increments('id').primary();
      t.integer('item_id').unsigned().notNullable().references('id').inTable('library_items').onDelete('CASCADE');
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.integer('stars').notNullable();
      t.bigInteger('created_at').notNullable();
      t.unique(['item_id', 'user_id']);
    });
    await createIfMissing(k, 'library_reports', (t) => {
      t.increments('id').primary();
      t.integer('item_id').unsigned().notNullable().references('id').inTable('library_items').onDelete('CASCADE');
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('reason', 40).notNullable();
      t.string('detail', 500);
      t.bigInteger('created_at').notNullable();
      t.unique(['item_id', 'user_id']);
    });
    await createIfMissing(k, 'library_uses', (t) => {
      t.increments('id').primary();
      t.integer('item_id').unsigned().notNullable().references('id').inTable('library_items').onDelete('CASCADE');
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.bigInteger('created_at').notNullable();
      t.unique(['item_id', 'user_id']);
    });
    // where a pack came from, so we can link back and not offer the same library item again
    if (!(await k.schema.hasColumn('packs', 'library_item_id'))) await k.schema.alterTable('packs', (t) => t.integer('library_item_id'));
  },
  async down(k) {
    for (const t of ['library_uses', 'library_reports', 'library_ratings', 'library_items']) await k.schema.dropTableIfExists(t);
  },
};

migrations['008_classes'] = {
  async up(k) {
    // Class groups: a course rep or lecturer shares notes, past papers and the exam date with a class
    await createIfMissing(k, 'classes', (t) => {
      t.increments('id').primary();
      t.integer('owner_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('name', 160).notNullable();
      t.string('course_code', 40);
      t.string('university', 160);
      t.string('join_code', 12).notNullable().unique();
      t.string('exam_date', 10);
      t.bigInteger('created_at').notNullable();
    });
    await createIfMissing(k, 'class_members', (t) => {
      t.increments('id').primary();
      t.integer('class_id').unsigned().notNullable().references('id').inTable('classes').onDelete('CASCADE');
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('role', 10).notNullable().defaultTo('member'); // owner | rep | member
      t.bigInteger('joined_at').notNullable();
      t.unique(['class_id', 'user_id']);
      t.index(['user_id']);
    });
    await createIfMissing(k, 'class_items', (t) => {
      t.increments('id').primary();
      t.integer('class_id').unsigned().notNullable().references('id').inTable('classes').onDelete('CASCADE');
      t.integer('added_by').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('kind', 10).notNullable(); // pack | paper
      t.string('title', 200).notNullable();
      t.integer('year');
      t.integer('lessons').notNullable().defaultTo(0);
      t.integer('cards').notNullable().defaultTo(0);
      t.text('data', 'longtext').notNullable();
      t.text('source_text', 'longtext');
      t.bigInteger('created_at').notNullable();
      t.index(['class_id']);
    });
    await createIfMissing(k, 'class_posts', (t) => {
      t.increments('id').primary();
      t.integer('class_id').unsigned().notNullable().references('id').inTable('classes').onDelete('CASCADE');
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.string('text', 1000).notNullable();
      t.bigInteger('created_at').notNullable();
      t.index(['class_id']);
    });
    await createIfMissing(k, 'class_item_uses', (t) => {
      t.increments('id').primary();
      t.integer('item_id').unsigned().notNullable().references('id').inTable('class_items').onDelete('CASCADE');
      t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.integer('pack_id');
      t.bigInteger('created_at').notNullable();
      t.unique(['item_id', 'user_id']);
    });
  },
  async down(k) {
    for (const t of ['class_item_uses', 'class_posts', 'class_items', 'class_members', 'classes']) await k.schema.dropTableIfExists(t);
  },
};

migrations['009_battles'] = {
  async up(k) {
    // Quiz battles: the same questions for two students, marked on the server
    await createIfMissing(k, 'battles', (t) => {
      t.increments('id').primary();
      t.string('code', 12).notNullable().unique();
      t.integer('creator_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.integer('opponent_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      t.integer('class_id');
      t.string('title', 200).notNullable();
      t.string('level', 10).notNullable();
      t.text('questions', 'longtext').notNullable();
      t.integer('creator_score');
      t.integer('creator_ms');
      t.text('creator_answers');
      t.integer('opponent_score');
      t.integer('opponent_ms');
      t.text('opponent_answers');
      t.string('status', 10).notNullable().defaultTo('open'); // open | done
      t.bigInteger('created_at').notNullable();
      t.bigInteger('expires_at').notNullable();
      t.index(['creator_id']);
      t.index(['opponent_id']);
    });
  },
  async down(k) {
    await k.schema.dropTableIfExists('battles');
  },
};

migrations['010_live_battles'] = {
  async up(k) {
    // Live battles: both players start together and see each other's progress
    const add = async (col: string, build: (t: Knex.AlterTableBuilder) => void) => {
      if (!(await k.schema.hasColumn('battles', col))) await k.schema.alterTable('battles', build);
    };
    await add('live', (t) => t.boolean('live').notNullable().defaultTo(false));
    await add('start_at', (t) => t.bigInteger('start_at'));
    await add('creator_ready', (t) => t.boolean('creator_ready').notNullable().defaultTo(false));
    await add('opponent_ready', (t) => t.boolean('opponent_ready').notNullable().defaultTo(false));
  },
  async down() {},
};

migrations['011_tutor'] = {
  async up(k) {
    // Whiteboard tutor lessons a student has opened (to continue later) and the shared voice cache
    if (!(await k.schema.hasTable('tutor_lessons'))) {
      await k.schema.createTable('tutor_lessons', (t) => {
        t.increments('id');
        t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.string('mode', 20).notNullable(); // topic | lesson | exam | homework | text
        t.integer('pack_id').unsigned().nullable();
        t.integer('chunk_index').nullable();
        t.string('title', 200).notNullable();
        t.text('data', 'mediumtext').notNullable();
        t.integer('step').notNullable().defaultTo(0);
        t.bigInteger('created_at').notNullable();
        t.bigInteger('opened_at').notNullable();
        t.index(['user_id', 'opened_at']);
      });
    }
    if (!(await k.schema.hasTable('tts_audio'))) {
      await k.schema.createTable('tts_audio', (t) => {
        t.increments('id');
        t.string('cache_key', 64).notNullable().unique();
        t.string('mime', 40).notNullable();
        if (k.client.config.client === 'mysql2' || k.client.config.client === 'mysql') t.specificType('bytes', 'mediumblob').notNullable();
        else t.binary('bytes').notNullable();
        t.integer('duration_ms').notNullable().defaultTo(0);
        t.integer('hits').notNullable().defaultTo(0);
        t.bigInteger('created_at').notNullable();
      });
    }
  },
  async down() {},
};

migrations['012_tutor_prefs'] = {
  async up(k) {
    // the student's chosen tutor, voice, accent and speed
    if (!(await k.schema.hasColumn('users', 'tutor_prefs'))) await k.schema.alterTable('users', (t) => t.text('tutor_prefs'));
  },
  async down() {},
};

migrations['013_origin'] = {
  async up(k) {
    // where and when a pack's material or a past paper is from (university, course, semester, date)
    if (!(await k.schema.hasColumn('packs', 'origin'))) await k.schema.alterTable('packs', (t) => t.text('origin'));
    if (!(await k.schema.hasColumn('past_papers', 'origin'))) await k.schema.alterTable('past_papers', (t) => t.text('origin'));
    // what the student wrote on a whiteboard lesson
    if (!(await k.schema.hasColumn('tutor_lessons', 'ink'))) await k.schema.alterTable('tutor_lessons', (t) => (k.client.config.client === 'mysql2' ? t.specificType('ink', 'mediumtext') : t.text('ink')));
  },
  async down() {},
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
