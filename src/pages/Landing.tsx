import { Link } from 'react-router-dom';
import { Bone, BookOpenText, Brain, Camera, CalendarClock, FileUp, GraduationCap, Hand, Layers, LibraryBig, MessageCircleQuestion, Presentation, Repeat, Sigma, Swords, Target, Upload, WifiOff } from 'lucide-react';
import { Logo } from '../components/ui';
import { TutorFace } from '../components/TutorFace';
import { METHODS } from '../methods';
import '../styles/landing.css';

/** A looping, silent demo of the whiteboard tutor (pure CSS — nothing to download). */
function DemoBoard() {
  return (
    <div className="demo" aria-hidden="true">
      <div className="demo-chips">
        <span>
          <Sigma size={14} /> Topic
        </span>
        <span className="on">
          <Target size={14} /> Exam prep
        </span>
        <span>
          <Camera size={14} /> Homework
        </span>
      </div>
      <div className="demo-board">
        <div className="d-line d1 d-head">Osmosis</div>
        <div className="d-line d2">
          water moves <span className="d-key">dilute → concentrated</span>
        </div>
        <div className="d-line d3 d-flow">
          <span>dilute</span>
          <i>→</i>
          <span>membrane</span>
          <i>→</i>
          <span>concentrated</span>
        </div>
        <div className="d-line d4 d-box">
          <b>Exam tip</b> always say <u>partially permeable membrane</u>
        </div>
        <svg className="d-circle" viewBox="0 0 220 70">
          <path d="M110 6 C200 6 205 64 110 64 C14 64 12 4 128 2" />
        </svg>
      </div>
      <div className="demo-bar">
        <TutorFace size={38} speaking />
        <p>Notice the water always moves towards the more concentrated side…</p>
        <span className="demo-ask">
          <Hand size={14} /> I have a question
        </span>
      </div>
    </div>
  );
}

const USES = [
  { icon: BookOpenText, title: 'Teach me this whole PDF', text: 'Hand over a 90-page lecture pack. The tutor teaches it lesson by lesson, in order, at your pace.', tint: 'var(--hl-blue)' },
  { icon: Camera, title: 'Help with my homework', text: 'Snap a maths, chemistry or accounting problem. Solve it together, then try a similar one alone.', tint: 'var(--hl-pink)' },
  { icon: Target, title: 'I have an exam soon', text: 'A fast review of what examiners ask, how to answer it, and practice that finds your gaps.', tint: 'var(--hl-orange)' },
  { icon: GraduationCap, title: 'Teach me something new', text: 'Type any topic — from the Krebs cycle to contract law — and get a lesson from the beginning.', tint: 'var(--hl-green)' },
];

const UNIS = ['Makerere', 'Kyambogo', 'MUST', 'Gulu', 'UCU', 'Busitema', 'Kabale', 'Muni', 'IUIU', 'KIU'];

export default function Landing() {
  return (
    <div className="landing">
      <header className="l-top">
        <Link to="/" className="brand">
          <Logo />
          <span>Charis Study</span>
        </Link>
        <nav className="l-nav">
          <a href="#how">How it works</a>
          <a href="#uses">For exams</a>
          <a href="#more">Everything else</a>
        </nav>
        <div className="row" style={{ gap: 6 }}>
          <Link to="/login" className="btn ghost">
            Log in
          </Link>
          <Link to="/register" className="btn primary">
            Start free
          </Link>
        </div>
      </header>

      <section className="l-hero">
        <p className="l-eyebrow">
          <Presentation size={15} /> An AI tutor with a whiteboard
        </p>
        <h1>
          Your notes, <span className="grad-text">taught to you.</span>
        </h1>
        <p className="lead">Upload lecture notes, slides, a textbook or a homework problem. Your tutor teaches it step by step on a whiteboard, out loud — and you can stop it to ask anything.</p>
        <div className="row l-cta">
          <Link to="/register" className="btn primary big">
            Start for free
          </Link>
          <Link to="/login" className="btn big ghost">
            I have an account
          </Link>
        </div>
        <p className="small muted">Your first lessons are free · Works on any phone · No app to install</p>
        <DemoBoard />
      </section>

      <section className="l-facts" aria-label="What’s inside">
        <div>
          <strong>18</strong>
          <span>open textbooks ready to study, free</span>
        </div>
        <div>
          <strong>1,700</strong>
          <span>named body structures in 3D</span>
        </div>
        <div>
          <strong>12</strong>
          <span>proven memory methods</span>
        </div>
        <div>
          <strong>
            <WifiOff size={26} />
          </strong>
          <span>keeps working when the data runs out</span>
        </div>
      </section>
      <p className="l-unis">
        Built in Kampala for students at {UNIS.join(', ')} — and every university in between.
      </p>

      <section className="l-section" id="uses">
        <h2>What students use it for</h2>
        <div className="l-uses">
          {USES.map((u) => (
            <div key={u.title} className="l-use" style={{ ['--tint' as any]: u.tint }}>
              <span className="l-use-icon">
                <u.icon size={22} />
              </span>
              <h3>{u.title}</h3>
              <p>{u.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="l-section">
        <h2>If it’s on paper, it can be taught.</h2>
        <div className="l-features">
          <div className="l-feature">
            <Upload />
            <h3>Your notes set the syllabus</h3>
            <p>The tutor teaches from your lecturer’s material — the same terms, the same order, the same emphasis — not a generic internet lesson.</p>
          </div>
          <div className="l-feature">
            <Sigma />
            <h3>Maths, science, law, medicine</h3>
            <p>Equations written out line by line, reactions balanced, graphs drawn, processes as flowcharts — the board shows what words can’t.</p>
          </div>
          <div className="l-feature">
            <MessageCircleQuestion />
            <h3>Stop it whenever you’re lost</h3>
            <p>Tap “I have a question”, type or say it, and the tutor answers on the board — another example, a simpler way — then carries on.</p>
          </div>
          <div className="l-feature">
            <Repeat />
            <h3>Then it makes sure you remember</h3>
            <p>Practice questions after every lesson become flashcards that come back just before you’d forget them, all the way to the exam.</p>
          </div>
        </div>
      </section>

      <section className="l-section" id="how">
        <h2>From your notes to a lesson in under a minute</h2>
        <ol className="l-steps">
          <li>
            <FileUp />
            <h3>Add what you’re studying</h3>
            <p>A PDF, slides, Word notes, a photo of a problem — or just a topic name.</p>
          </li>
          <li>
            <Presentation />
            <h3>The tutor teaches it</h3>
            <p>Short spoken steps with the key ideas written and drawn on the board as it talks.</p>
          </li>
          <li>
            <Brain />
            <h3>Ask, practise, remember</h3>
            <p>Interrupt with questions, check yourself, and keep it with spaced flashcards.</p>
          </li>
        </ol>
      </section>

      <section className="l-section" id="more">
        <h2>Everything else you need before the exam</h2>
        <div className="l-more">
          <div>
            <Layers />
            <strong>Flashcards that space themselves</strong>
            <span>Each card returns right before you’d forget it.</span>
          </div>
          <div>
            <Target />
            <strong>Exam coach and mock papers</strong>
            <span>Upload past papers; get new ones in your examiner’s style, marked against the key.</span>
          </div>
          <div>
            <LibraryBig />
            <strong>A shared library</strong>
            <span>Notes, past papers and open textbooks by faculty and course.</span>
          </div>
          <div>
            <Bone />
            <strong>Anatomy 3D</strong>
            <span>Take the body apart, study each bone with its labelled parts.</span>
          </div>
          <div>
            <Swords />
            <strong>Classes and quiz battles</strong>
            <span>Study with your class and challenge a friend live.</span>
          </div>
          <div>
            <CalendarClock />
            <strong>A timetable that plans itself</strong>
            <span>Sessions around your exams, with reminders on your phone.</span>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 18 }}>
          Plus {METHODS.length} ways to learn your own way: {METHODS.slice(0, 6).map((m) => m.name.toLowerCase()).join(', ')} and more.
        </p>
      </section>

      <section className="l-final">
        <TutorFace size={64} />
        <h2>Start with your notes, slides or a problem.</h2>
        <p>Your first lessons are free.</p>
        <Link to="/register" className="btn primary big">
          Start for free
        </Link>
      </section>

      <footer className="l-foot">
        <span>Charis Study is made by Charis Creations, Kampala.</span>
        <span className="row">
          <Link to="/leaderboard">Top students</Link>
          <Link to="/login">Log in</Link>
          <Link to="/register">Create account</Link>
        </span>
      </footer>
    </div>
  );
}
