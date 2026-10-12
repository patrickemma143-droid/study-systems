import { Link } from 'react-router-dom';
import { FileUp, Scissors, Shuffle } from 'lucide-react';
import { Logo } from '../components/ui';
import { METHODS } from '../methods';
import '../styles/landing.css';

export default function Landing() {
  return (
    <div className="landing">
      <header className="l-top">
        <Link to="/" className="brand">
          <Logo />
          <span>Charis Study</span>
        </Link>
        <div className="row">
          <Link to="/login" className="btn ghost">
            Log in
          </Link>
          <Link to="/register" className="btn primary">
            Create free account
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <h1>Your notes, turned into things you actually remember.</h1>
          <p className="lead">
            Upload a lecture PDF, your slides or Word notes — or just type a topic. Charis Study breaks it into bite-size lessons, then lets you pick how to learn it:
            flashcards, quizzes, memory palace, mnemonics and more.
          </p>
          <div className="row">
            <Link to="/register" className="btn primary big">
              Start studying free
            </Link>
            <Link to="/login" className="btn big">
              I have an account
            </Link>
          </div>
          <p className="small muted" style={{ marginTop: 14 }}>
            Works on your phone. No app to install. Your notes stay private.
          </p>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="paper">
            <div className="paper-title">Lecture 3: Cells and transport</div>
            <p>
              <span className="hl hl-yellow">Osmosis</span> is the movement of water molecules from a dilute solution to a more concentrated solution through a{' '}
              <span className="hl hl-green">partially permeable membrane</span>.
            </p>
            <p>
              The four stages of <span className="hl hl-pink">mitosis</span> are prophase, metaphase, anaphase and telophase.
            </p>
            <span className="scribble">PMAT!</span>
          </div>
          <div className="flip">
            <div className="flip-inner">
              <div className="flip-face">
                <small>Flashcard</small>
                <strong>What is meant by osmosis?</strong>
              </div>
              <div className="flip-face flip-back">
                <small>Answer</small>
                <span>Water moving from a dilute to a more concentrated solution through a partially permeable membrane.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="l-section">
        <h2>How it works</h2>
        <ol className="how">
          <li>
            <FileUp />
            <h3>Add your notes</h3>
            <p>PDF, PowerPoint, Word, pasted text — or only a topic name, and we gather free material for you.</p>
          </li>
          <li>
            <Scissors />
            <h3>We cut it into small lessons</h3>
            <p>Each lesson is a few minutes long, with the main points pulled out and every hard word explained.</p>
          </li>
          <li>
            <Shuffle />
            <h3>You choose how to study</h3>
            <p>Read, test yourself, listen, draw it out or build a memory palace. Switch any time.</p>
          </li>
        </ol>
      </section>

      <section className="l-section">
        <h2>Twelve ways to make it stick</h2>
        <p className="muted" style={{ maxWidth: 620 }}>
          Every method is based on how memory works: testing yourself, spacing out reviews, explaining in your own words, and linking ideas to pictures and places.
        </p>
        <div className="methods" style={{ marginTop: 20 }}>
          {METHODS.map((m) => (
            <div key={m.id} className="method" style={{ ['--tint' as any]: m.tint }}>
              <span className="glyph">
                <m.icon size={20} />
              </span>
              <h3>{m.name}</h3>
              <p>{m.blurb}</p>
              <span className="meta">Best for: {m.bestFor.toLowerCase()}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="l-section cram-band">
        <div>
          <h2>Exam tomorrow? There’s a plan for that.</h2>
          <p>Tell Charis Study how much time you have. It picks the most examinable parts of your notes and walks you through them, minute by minute.</p>
          <Link to="/register" className="btn primary big">
            Build my cram plan
          </Link>
        </div>
        <ol className="plan">
          <li>
            <b>8 min</b> Read the cheat sheet
          </li>
          <li>
            <b>12 min</b> Quick-fire flashcards
          </li>
          <li>
            <b>8 min</b> Practice quiz
          </li>
          <li>
            <b>2 min</b> Go over your mistakes
          </li>
        </ol>
      </section>

      <footer className="l-foot">
        <span>Charis Study is made by Charis Creations, Kampala.</span>
        <span className="row">
          <Link to="/login">Log in</Link>
          <Link to="/register">Create account</Link>
        </span>
      </footer>
    </div>
  );
}
