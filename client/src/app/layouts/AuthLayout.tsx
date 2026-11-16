import { BookOpen, GraduationCap, MessageSquare, Timer } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { ThemeToggle } from '../ThemeToggle';

const highlights = [
  { icon: MessageSquare, text: 'An AI tutor that explains step by step' },
  { icon: BookOpen, text: 'Notes, flashcards and quizzes in one place' },
  { icon: Timer, text: 'Focus sessions that track real study time' },
];

/** Split screen used by every public auth page. The form is rendered through <Outlet />. */
export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel: gradient strip on mobile, full half on desktop */}
      <aside className="auth-gradient relative flex flex-col justify-between overflow-hidden p-6 text-white lg:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

        <Link to="/login" className="relative flex items-center gap-2 font-display text-xl font-semibold">
          <GraduationCap className="h-7 w-7" aria-hidden="true" />
          LearnSpace
        </Link>

        <div className="relative hidden lg:block">
          <h2 className="font-display text-4xl font-semibold leading-tight">
            Learn better,
            <br />
            together with AI.
          </h2>
          <ul className="mt-8 space-y-4">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative hidden text-sm text-white/70 lg:block">Built for university students.</p>
      </aside>

      <div className="flex flex-col">
        <div className="flex justify-end p-4">
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-md animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

