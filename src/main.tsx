import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/lexend/latin-400.css';
import '@fontsource/lexend/latin-500.css';
import '@fontsource/lexend/latin-600.css';
import '@fontsource/lexend/latin-700.css';
import '@fontsource/caveat/latin-600.css';
import './styles/global.css';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { Loading, ToastProvider } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyPage, reloadForNewVersion } from './lib/lazyPage';
import Landing from './pages/Landing';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';

// If a newer version was deployed while this page was open, its files have new names:
// reload once instead of failing.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewVersion()) e.preventDefault();
});

// Study pages load on demand so the first visit stays light on mobile data.
const NewPack = lazyPage(() => import('./pages/NewPack'));
const PackHome = lazyPage(() => import('./pages/PackHome'));
const Lesson = lazyPage(() => import('./pages/Lesson'));
const Flashcards = lazyPage(() => import('./pages/Flashcards'));
const QuizPage = lazyPage(() => import('./pages/QuizPage'));
const Cram = lazyPage(() => import('./pages/Cram'));
const Feynman = lazyPage(() => import('./pages/Feynman'));
const Blurt = lazyPage(() => import('./pages/Blurt'));
const Palace = lazyPage(() => import('./pages/Palace'));
const Mnemonics = lazyPage(() => import('./pages/Mnemonics'));
const MindMap = lazyPage(() => import('./pages/MindMap'));
const Cornell = lazyPage(() => import('./pages/Cornell'));
const Listen = lazyPage(() => import('./pages/Listen'));
const CheatSheet = lazyPage(() => import('./pages/CheatSheet'));
const Profile = lazyPage(() => import('./pages/Profile'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
        <Route path="/login" element={<PublicOnly><AuthPage mode="login" /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><AuthPage mode="register" /></PublicOnly>} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/home" element={<Dashboard />} />
          <Route path="/new" element={<NewPack />} />
          <Route path="/review" element={<Flashcards />} />
          <Route path="/quiz/mixed" element={<QuizPage mixed />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/pack/:id" element={<PackHome />} />
          <Route path="/pack/:id/learn/:chunk" element={<Lesson />} />
          <Route path="/pack/:id/cards" element={<Flashcards />} />
          <Route path="/pack/:id/quiz" element={<QuizPage />} />
          <Route path="/pack/:id/cram" element={<Cram />} />
          <Route path="/pack/:id/feynman" element={<Feynman />} />
          <Route path="/pack/:id/blurt" element={<Blurt />} />
          <Route path="/pack/:id/palace" element={<Palace />} />
          <Route path="/pack/:id/mnemonics" element={<Mnemonics />} />
          <Route path="/pack/:id/mindmap" element={<MindMap />} />
          <Route path="/pack/:id/cornell" element={<Cornell />} />
          <Route path="/pack/:id/listen" element={<Listen />} />
          <Route path="/pack/:id/sheet" element={<CheatSheet />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
