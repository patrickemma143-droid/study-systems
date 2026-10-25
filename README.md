# Charis Study

Charis Study turns a lecture PDF, slides, Word notes, pasted text or **just a topic name** into bite-size lessons, then lets the student choose how to learn it. Every method is built on how memory works.

It is a **Charis Creations** product. The core app is **API-free**: no AI keys and no cost per student, and everything runs on your own server. Optional **AI helpers** (simple explanations, a tutor chat and AI marking) switch on when you add a Gemini or Claude API key. See [AI helpers](#ai-helpers-optional).

---

## Quick start (Windows, Mac or Linux)

You need **Node.js 22 LTS or newer** from <https://nodejs.org>. Check it with `node -v`.

```bash
cd "charis-study"
npm install
copy .env.example .env        # Windows   (Mac/Linux: cp .env.example .env)
npm run dev
```

Open **http://localhost:5173**. Create an account, then click **Try a sample lecture** to see the whole experience in seconds.

`npm run dev` runs two things together:

- the API on port 3000
- the web app on port 5173, which forwards `/api` to the API

The SQLite database creates itself in `data/charis-study.db` the first time it runs.

### Production build

```bash
npm run build      # builds the web app into dist/ and the server into build/server.js
npm start          # runs server.js: one Node process serves the API and the app on PORT (default 3000, which Hostinger expects)
```

To check the study engine on its own, run `npm run test:engine`. Add `-v` to see every card and question it makes from the sample lecture.

---

## Study methods included

| Method | What the student does | Memory principle |
|---|---|---|
| **Bite-size lessons** | Reads 150–350-word chunks: "in a nutshell", the main points, the full notes with highlighted jargon (tap a term for its meaning), and "think deeper" questions | Chunking, elaboration |
| **Flashcards** | Definition, reverse, fill-the-gap and list cards with Again/Hard/Good/Easy ratings | Spaced repetition (SM-2), active recall |
| **Practice quiz** | Multiple choice, true/false, typed fill-the-gap, put-in-order. Wrong answers move that lesson's cards to the front of the queue | Testing effect |
| **Mixed quiz** | Questions from every pack, mixed together | Interleaving |
| **Cram plan** | A 15/30/60-minute guided plan: cheat sheet → quick-fire cards → quiz → (blurt) → mistakes. Focuses on the "most examinable" lessons | Prioritised retrieval for last-minute readers |
| **Feynman technique** | Studies a lesson, hides it, explains it in simple words (typed or spoken), then sees which key ideas and terms were covered or missed, plus a simplicity check | Self-explanation |
| **Blurting** | Writes everything they remember against a timer, then compares it with the notes | Free recall |
| **Memory palace** | Places key ideas along a familiar route (walk to campus, your home, your body, or a custom route), with a suggested vivid image for each stop. Then a "walk it" recall mode | Method of loci |
| **Mnemonics** | An acronym, silly sentences and a story for every list; unordered lists are rearranged to make an easier word. Students can make their own | Acronyms, acrostics, story method |
| **Mind map** | A radial map of lessons and key terms, with an outline view on phones | Dual coding |
| **Cornell notes** | Questions on the left, notes on the right, summary below. "Cover notes" to self-test. Printable | Cornell system |
| **Listen mode** | Lessons read aloud, plus audio flashcards (question, pause, answer) for the taxi or the walk | Audio learning |
| **Cheat sheet** | Definitions, lists with acronyms and key points on one printable page | Summary review |
| **Focus timer** | A Pomodoro timer (25/5, 15/3, 50/10) that keeps running across pages and logs study time | Focused practice and spacing |

Also included:

- a dashboard with streaks, a daily goal, minutes per day and cards in long-term memory
- exam dates (flashcard intervals are capped so everything is reviewed before the exam)
- a method recommender that uses the exam date and what the student enjoys
- dark mode, a mobile layout with a bottom tab bar, and keyboard shortcuts

## Supported inputs

- **PDF**: lecture notes and slides exported to PDF. Headings are detected from font size, and repeated headers and footers are removed.
- **PowerPoint (.pptx)**: slide titles, bullets and speaker notes.
- **Word (.docx)**: headings, bold headings, bullets and tables.
- **Text (.txt or .md)**, or notes pasted straight in.
- **Only a topic**: lessons are built from Wikipedia, with a Simple English introduction. The pack also links to Khan Academy, YouTube, OpenStax, LibreTexts, MIT OCW, Google Scholar and past-paper searches.

Files are read **in the browser**. Only the extracted text is sent to the server.

---

## How the API-free engine works

The engine lives in `shared/engine/` and is plain TypeScript with no AI.

1. **Clean**: fix PDF ligatures and hyphenation, strip citations, page numbers, and headers or footers that repeat on many pages.
2. **Chunk**: split by headings, break long sections at paragraph boundaries, and merge tiny ones (such as title slides).
3. **Key terms**: RAKE-style phrase extraction, scored by frequency, spread, headings and definitions. "Topic words" that appear everywhere (like *cell* in a biology lecture) are ignored.
4. **Definitions**: patterns such as *"X is a…"*, *"X refers to…"*, *"… is called X"* and *"Term: meaning"*.
5. **Lists**: bullet groups and inline enumerations (*"The four stages of mitosis are A, B, C and D"*), including *"…three structures. These are A, B and C."*
6. **Key points**: TextRank sentence ranking, boosted for definitions, key terms and cue words.
7. **Generation**: flashcards, quiz questions (distractors come from the pack's own vocabulary), mnemonics, memory-palace stops and elaboration questions.
8. **Recall checking** (`recall.ts`): concept coverage and a readability check, used by Feynman and blurting.

### Limitations of the API-free version

- It **selects** the best sentences but cannot rewrite them in simpler words.
- Cards and questions come from patterns. They are strongest for definition-heavy subjects and weaker for maths working, derivations, code and diagrams.
- There is no tutor chat for follow-up questions.
- Feynman and blurting marking checks which ideas and terms were covered. It does not truly grade understanding.
- Scanned PDFs or photos of notes have no text layer, so they can't be read yet. The app warns the student when this happens.
- Equations, tables and images are flattened or dropped.
- Topic mode only uses Wikipedia, so it won't match a specific lecturer's syllabus.
- The engine is tuned for English.

---

## Personal study coach

- **Timetable** (`/plan`): the student enters their free time and exam dates; the app plans the week. Nearest exams and unread lessons come first (most examinable first when the exam is within 3 days), flashcards are booked on the days they fall due, the evening before a paper becomes a cram session, and the plan rebuilds itself as notes, progress and exam dates change. "Add to my phone calendar" downloads an `.ics` file with a 10-minute alarm on each session.
- **Reminders**: free web push notifications (no SMS cost) 10 minutes before each session, plus a daily nudge at the student's chosen time about due cards and close exams. Works on Android Chrome and desktop browsers; on iPhone the student first adds the app to the Home Screen (iOS 16.4+). Keys are generated automatically and stored in the database; set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` only if you want fixed keys. `REMINDERS_OFF=true` stops the reminder loop.
- **Smarter flashcard scheduling** (FSRS-5, the model behind modern Anki): each card has a memory stability and difficulty, and comes back just before it would be forgotten, so students do the fewest reviews for the most remembering. Near an exam, cards that would fade before the paper are brought forward and cards that will last are left alone. Due cards are shown most-at-risk first. Existing cards carry over automatically.
- **Typed answers**: flashcards can be answered by typing. Short answers are matched forgivingly (small typos allowed); longer ones are marked on the key words included. The app suggests Again / Hard / Good / Easy, and Enter accepts it.
- **Cram levels**: Chill, Steady, Intense and Extreme, suggested from the exam date and how many lessons are understood. Extreme ("paper tomorrow, nothing read") picks the most examinable lessons that fit before bedtime, teaches them fast in 25-minute sprints with breaks, tests them, lists what was left out, and ends with sleep and a morning plan.

## Points and weekly rankings

Students earn points only for work the server can check, in four kinds:

| Kind | Earned for |
| --- | --- |
| Memory | Flashcards remembered. Typed answers are re-marked on the server: right 3, nearly right 2; a self-rated Good 1. +15 for clearing all due cards in a day. |
| Fast learner | +10 for proving a lesson (all its cards right, or explained at 70%+), doubled within a day of adding the notes, 1.5× within 3 days. Quizzes: 2 per correct answer, first two a day per pack. |
| Explainer | Feynman explanations and blurts, re-marked on the server against the lesson. Text copied from the notes (runs of 6+ words) earns nothing; peeking at the notes halves the points. The best attempt per lesson per week counts. |
| Consistency | +10 for reaching the daily study goal. |

Each kind has a daily cap. Weeks run Monday to Sunday (Kampala time). `/ranks` shows this week live and last week's final results, for everyone, the student's university, or their course, with each student's university, course and best quiz and explanation scores. Every Monday at 08:00 students with reminders on get their result. Students can hide themselves from the rankings on their profile.

Flashcards also gained **Previous card**: step back through the cards answered in this session (← / →) and change a rating within 30 minutes. In the Feynman technique, **Peek at the notes** now opens the notes beside your explanation instead of leaving it.

## Exams: papers, past papers, readiness

- **Quiz levels**: Easy (fewer, clearer choices), Medium (the standard quiz) and Hard ("twisted": NOT questions, swapped definitions, choose the one correct description, type the term with no options). Points per correct answer: 1, 2 and 4.
- **Mock exam paper** (`/pack/:id/paper`): objective, short-answer and structured/essay sections with marks, instructions, time and a marking guide. Download as PDF (print → Save as PDF) or as a Word file.
- **Scanned PDFs and photos**: pages that are pictures are read with text recognition (Tesseract OCR) in the student's browser — nothing is uploaded. Students choose the pages (big books: one pack per chapter). Repeated book headers and specks are removed; formulas, tables and diagrams in scans come out rough. The OCR engine is copied from `node_modules` into `public/ocr` at build time.
- **Past papers**: upload (PDF, Word, scans, photos, text) or paste a past paper, with its marking key if you have it. The app finds the questions, sections, marks, time, the "answer any THREE" rule, the command words examiners use and which of the student's topics came up, then sets mock papers in the same style. Students can also practise the real past paper question by question, with the key's answer one tap away.
- **Exam readiness** on each pack and on Home: a score from lessons understood, what is remembered right now, quiz scores and explanations, the weakest lessons to fix next, and an encouraging message. Reminders in the last three days include it.
- **After the paper**: the day after the exam date the student is asked how it went, which topics came up and whether the app helped. Results appear on the admin page.
- Lessons show a clear **Start reading / End of lesson** marker with highlighted headings, and each flashcard shows which lesson it comes from.

## Public profiles and search engines

Students can make an opt-in **public profile** (`/u/<name>`) with their university, course, points, lessons mastered and weekly achievements ("#1 at Gulu University", "Top Explainer"). These pages, the public **top students** page (`/leaderboard`, public profiles only), `sitemap.xml` and `robots.txt` are server-rendered with search descriptions and schema.org data so Google can index them. Set `PUBLIC_URL` (e.g. `https://study.chariscreations.com`) once you use your own domain, then add the site and sitemap in Google Search Console.

## Library, classes, battles and offline study

- **Library** (`/library`): students share study packs and past papers with everyone (opt-in, with a "I'm allowed to share this" tick). Browse by faculty (Medicine, Engineering, Computing, Business, Law, Education, Agriculture, Sciences, Arts & Social Sciences), search by course code, topic, book, university or year, read the full text, and "Add to my study packs" in one tap. Faculty, course code, university and exam year are guessed from the notes. Uploading notes that are already shared offers the shared copy instead (smart packs come with their AI cards). Ratings, reports (three reports hide an item until an admin checks it on the admin page) and Helper points for the uploader each time someone uses it.
- **Exam coach** (`/pack/:id/coach`): ranks lessons by how often they appear in the pack's past papers (years, marks, "due for a comeback"), combines that with weak spots (unstudied lessons, fading or forgotten cards, wrong quiz answers, low explanation scores) and builds a 10-card drill and a focused quiz.
- **Answer marking**: write a full answer to any past-paper or mock-paper question and get it marked point by point against the marking key (instant, no AI) or by the AI examiner (uses the `feedback` allowance).
- **Classes** (`/classes`): a course rep or lecturer creates a class with a join code/link (shareable on WhatsApp); shares packs and past papers; sets the exam date (copied to members' packs and timetables); class board; weekly class ranking; push notifications to members.
- **Quiz battles** (`/battle/:code`): challenge a classmate to the same 5–20 questions, either **live** (both join, press ready, a countdown starts the same question for both, and each sees the other's score move) or **any time** (each plays when they open the link); answers are marked on the server; most right wins, ties go to the faster player; Fast learner points for the winner.
- **Offline**: "Save for offline" on a pack keeps its lessons and flashcards on the device; flashcard answers, quiz results, lesson progress and study minutes made offline are kept on the phone and sent when the connection returns (and before logging out). The service worker fetches pages and data from the network first, so new versions still load straight away.

## AI helpers (optional)

Everything above works with no AI. Add one API key and these appear for logged-in students:

| Helper | Where | What it does |
| --- | --- | --- |
| **Explain it simply** | Every lesson, plus "Explain every lesson simply" on the pack page | Re-teaches the lesson in plain English with a local example, key points and exam-style questions (which can be added to flashcards) |
| **Ask the tutor** | Bottom of every lesson | A short chat that answers from the student's own notes |
| **AI marking** | Feynman and blurting results | Reads the answer for meaning, lists what was right, what is missing and any misunderstanding |
| **Admin page** | `/admin` (admins only) | Students, AI use and estimated cost for today and 30 days, and a button to move a student to Pro |

**Cost controls built in**

- **Shared answers.** A simple explanation is stored against the lesson text. When a classmate opens the same notes, they get the stored answer: no AI call, no cost and none of their daily allowance. AI marking is cached the same way for identical answers.
- **Daily allowances** per student, counted on the server and reset at midnight Kampala time (`TZ_OFFSET_HOURS`). Defaults: Free 10 explanations, 5 tutor questions, 3 AI marks; Pro 200, 60, 30.
- **Small requests.** Only the lesson being studied is sent (capped at about 12,000 characters), the tutor sees just the last 8 messages, and replies have tight length limits. With Claude, the lesson notes are prompt-cached so follow-up questions are cheaper.
- A per-student burst limit (40 AI requests a minute) stops runaway scripts.
- Batch processing (half price, but answers arrive minutes later) is not used, because students want answers straight away. It is a later option for pre-explaining popular course packs overnight.

**Switching it on (Hostinger)**

1. Get a key. Gemini: [Google AI Studio](https://aistudio.google.com/apikey) → *Create API key*. Claude: [Claude Console](https://console.anthropic.com) → *API keys*.
2. hPanel → your Node.js app → **Environment variables**, add `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`) and `ADMIN_EMAILS` (your login email), then **Save and redeploy**.
3. Open `/api/health`. The `engine` line should say `built-in + AI (gemini, …)` and `aiCheck` should say `working` (otherwise it shows the error, e.g. an invalid key or model name).

**Privacy note.** On the Gemini API's **free tier**, Google may use the content you send to improve its products. Turn on billing for the project (paid tier) before real students' notes go through it. A Google AI Pro or "Gemini for students" subscription covers the Gemini app only; the API is billed separately.

| Variable | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` | | Turns AI on with Gemini |
| `ANTHROPIC_API_KEY` | | Turns AI on with Claude (used if no Gemini key) |
| `AI_PROVIDER` | auto | `gemini`, `claude`, or `mock` (fake answers, for testing only) |
| `AI_MODEL` | `gemini-3.5-flash-lite` / `claude-haiku-5-5` | Model name |
| `AI_LIMITS_FREE` | `simplify=10,tutor=5,feedback=3,build=30,paper=2` | Daily allowance on Free (build = smart lessons, paper = AI exam papers) |
| `AI_LIMITS_PRO` | `simplify=200,tutor=60,feedback=30,build=400,paper=20` | Daily allowance on Pro |
| `ADMIN_EMAILS` | | Comma-separated emails that can open `/admin` (admins always get Pro) |
| `TZ_OFFSET_HOURS` | `3` | When "today" starts for allowances (3 = Kampala) |
| `AI_PRICE_INPUT`, `AI_PRICE_OUTPUT` | built-in table | USD per million tokens, for the admin cost estimates |
| `AI_GEMINI_THINKING_LEVEL` | model default | Gemini only, e.g. `minimal` or `low` |

The code is in `server/ai/` (`providers.ts` talks to Gemini or Claude, `prompts.ts` holds the prompts, `service.ts` does caching, allowances and usage logging), `server/routes/ai.ts`, `server/routes/admin.ts`, `src/components/AiPanels.tsx` and `src/pages/Admin.tsx`. The API-free engine is still what builds every pack; the AI only adds to it.

---

## Deployment

### Hostinger (Business or Cloud plan), the main setup

Hostinger runs Node.js apps straight from GitHub. Once you connect it, **every push to `main` rebuilds and redeploys the site**. FTP/FTPS is not used. Any file you change through FTP or File Manager is overwritten on the next deploy.

1. **Create a MySQL database.** In hPanel go to **Websites → (your site) → Databases → Management**. Create a database and user, and note the name, user and password. The host is `localhost`.
2. **Add the app.** Go to **Websites → Add website → Node.js web app → Import Git repository**. Connect GitHub and pick `patrickemma143-droid/study-systems`, branch `main`.
   - A Node.js app must be added as a *new* website. If your domain is already attached to another site, remove it there first.
3. **Build settings.** Use these:

   | Setting | Value |
   |---|---|
   | Framework | Express (or "Other") |
   | Node version | 22 |
   | Build command | `npm run build` |
   | Entry file | `server.js` |

4. **Environment variables.** Add these in the deploy settings:

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `JWT_SECRET` | a long random string (generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
   | `COOKIE_SECURE` | `true` |
   | `DB_HOST` | `localhost` |
   | `DB_PORT` | `3306` |
   | `DB_USER` | your MySQL user |
   | `DB_PASSWORD` | your MySQL password |
   | `DB_NAME` | your database name |
   | `CONTACT_EMAIL` | your email (Wikipedia asks for a contact in requests) |

5. **Deploy.** The tables are created automatically on first start. Open your domain, create an account and try the sample lecture.

**Updating the site:** push to `main`. The **CI** check in GitHub Actions runs type checks, the engine test and a production build on every push, so a broken build shows up in GitHub before you go looking at the live site.

**Without MySQL:** if you leave out the `DB_*` variables, the app uses SQLite. On Hostinger it stores the database in `<domain folder>/charis-data/`, outside the folders that get rebuilt, so data survives redeploys. MySQL is still recommended there, because Hostinger backs it up.

**Restarting:** use the Restart option on the website dashboard. Server logs are on the deployment page.

**Checking it's healthy:** open `https://<your-site>/api/health`. It shows `"ok": true` when the server and database are connected. Otherwise it says what's wrong, for example a wrong `DB_PASSWORD`. If the database is unreachable, the site stays up and retries in the background instead of crashing.

### VPS (any provider)

```bash
git clone https://github.com/patrickemma143-droid/study-systems.git && cd study-systems
npm ci && npm run build
cp .env.example .env    # set JWT_SECRET, COOKIE_SECURE=true, and DB_* if you use MySQL
npm i -g pm2 && pm2 start server.js --name charis-study && pm2 save
```

Put Nginx in front (`proxy_pass http://127.0.0.1:3000;`) and add HTTPS with Certbot.

### Environment variables

See `.env.example`. MySQL settings can be given as `DB_*` (Hostinger's names), as `MYSQL_*`, or as a single `DATABASE_URL=mysql://user:pass@localhost:3306/dbname`. When any of these are set, MySQL is used automatically. The MySQL path has been tested end to end on MariaDB 10.11, the database Hostinger runs.

## Project structure

```
charis-study/
├─ shared/                 code used by both server and browser
│  ├─ engine/              the API-free study engine
│  │  ├─ index.ts          buildStudyPack()
│  │  ├─ blocks.ts         text → structured blocks, cleaning
│  │  ├─ chunker.ts        bite-size sections
│  │  ├─ keyterms.ts       key-term extraction
│  │  ├─ definitions.ts    definitions and lists
│  │  ├─ summarize.ts      TextRank key points
│  │  ├─ practice.ts       flashcards, quiz, elaboration prompts
│  │  ├─ mnemonics.ts      acronyms, acrostics, stories
│  │  └─ recall.ts         Feynman and blurting checks
│  ├─ srs.ts               spaced-repetition scheduler (exam-aware)
│  ├─ resources.ts         free learning links for topic mode
│  └─ sample.ts            the sample lecture
├─ server.js               production entry file (Hostinger "Entry file")
├─ .github/workflows/ci.yml build check on every push
├─ server/                 Express API
│  ├─ index.ts             app, security headers, static hosting
│  ├─ config.ts            settings, data folder (survives Hostinger redeploys)
│  ├─ db.ts                Knex + in-code migrations (SQLite or MySQL)
│  ├─ auth.ts              accounts (bcrypt + JWT cookie)
│  ├─ routes/packs.ts      create, list and manage study packs; topic mode
│  ├─ routes/study.ts      cards, reviews, quizzes, progress, notes, stats
│  ├─ routes/ai.ts         optional AI helpers (explain, tutor, marking)
│  ├─ routes/admin.ts      admin overview, AI usage and cost, Pro upgrades
│  ├─ routes/plan.ts       timetable, study settings, reminder devices, calendar export
│  ├─ notify.ts            web push reminders (checks every minute)
│  ├─ points.ts            study points, copy check, weekly leaderboard
│  ├─ readiness.ts         exam readiness score and encouragement
│  ├─ public.ts            public profiles, top students, sitemap, robots.txt
│  ├─ routes/papers.ts     past paper upload and analysis
│  ├─ routes/points.ts     my points, rankings, ranking visibility
│  ├─ ai/                  AI providers, prompts, shared cache and daily allowances
│  └─ services/wikipedia.ts
└─ src/                    React web app (Vite)
   ├─ lib/extract/         PDF (pdf.js), Word (mammoth), PowerPoint (JSZip) readers
   ├─ components/          layout, focus timer, quiz runner, highlighter, etc.
   └─ pages/               one page per study method
```

## Suggested next steps

- Password reset by email, and Google sign-in.
- An offline mode (PWA service worker) so packs work without data.
- OCR for scanned notes (Tesseract.js runs in the browser for free).
- Class groups, so a lecturer or class rep can share a pack with a whole course.
- Mobile money payments (MTN MoMo, Airtel Money) so students can buy Pro themselves.
- AI help when building a pack: OCR and explanation of scanned notes, diagrams and equations.
- An Android app built from the same code with Capacitor.
