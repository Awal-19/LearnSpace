import { BookOpen, GraduationCap, Sparkles, TrendingUp } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { ThemeToggle } from '../ThemeToggle';

const highlights = [
  {
    icon: BookOpen,
    title: 'Interactive Learning',
    iconBg: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400',
  },
  {
    icon: Sparkles,
    title: 'AI-Powered Assistance',
    iconBg: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  },
  {
    icon: TrendingUp,
    title: 'Track Your Progress',
    iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  },
];

/** Unified light-blue & white frosted glass layout for public auth pages. */
export function AuthLayout() {
  return (
    <div className="auth-canvas relative flex min-h-screen flex-col overflow-hidden text-fg">
      {/* Subtle abstract Liquid Glass curved waves & translucent arcs behind right card */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg
          className="h-full w-full opacity-90 dark:opacity-30"
          viewBox="0 0 1440 900"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient
              id="lsGlassRibbonA"
              x1="520"
              y1="0"
              x2="1440"
              y2="900"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#DBEAFE" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient
              id="lsGlassRibbonB"
              x1="780"
              y1="900"
              x2="1440"
              y2="120"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#BFDBFE" stopOpacity="0.6" />
              <stop offset="55%" stopColor="#EFF6FF" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          <path
            d="M 860 -80 C 660 210, 650 610, 1080 980 L 1520 980 L 1520 -80 Z"
            fill="url(#lsGlassRibbonA)"
          />
          <path
            d="M 1010 -60 C 815 240, 825 630, 1210 960"
            stroke="#FFFFFF"
            strokeOpacity="0.85"
            strokeWidth="2"
          />
          <path
            d="M 460 940 C 690 660, 1040 520, 1490 620 L 1490 960 Z"
            fill="url(#lsGlassRibbonB)"
          />
          <path
            d="M 520 940 C 745 660, 1085 535, 1490 630"
            stroke="#FFFFFF"
            strokeOpacity="0.8"
            strokeWidth="2"
          />
          <ellipse
            cx="1090"
            cy="350"
            rx="340"
            ry="340"
            fill="#FFFFFF"
            fillOpacity="0.28"
            stroke="#FFFFFF"
            strokeOpacity="0.7"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {/* Top Header Bar: Brand on left, circular theme toggle on right */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6 sm:px-10 sm:pt-7">
        <Link
          to="/login"
          className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight transition-opacity hover:opacity-85"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_8px_18px_rgba(37,99,235,0.28)]">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="text-fg">Learn</span>
            <span className="text-primary-600 dark:text-primary-400">Space</span>
          </span>
        </Link>

        <ThemeToggle />
      </header>

      {/* Main Split Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-8 sm:px-10 lg:py-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14">
          {/* Left Branding Section */}
          <div className="space-y-6">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200/80 bg-primary-50/90 px-3.5 py-1.5 text-xs font-medium text-primary-700 shadow-sm backdrop-blur-sm dark:border-primary-500/25 dark:bg-primary-500/15 dark:text-primary-300">
              <Sparkles
                className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
                aria-hidden="true"
              />
              <span>Smarter Learning. Brighter Future.</span>
            </div>

            <div className="space-y-4">
              <h2 className="font-display text-3xl font-bold leading-[1.12] tracking-[-0.03em] text-fg sm:text-[42px] xl:text-[46px]">
                Your learning
                <br className="hidden sm:block" /> journey,{' '}
                <span className="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                  reimagined.
                </span>
              </h2>
              <p className="max-w-md text-[15px] leading-relaxed text-muted">
                One intelligent space to learn, understand, organize and achieve more.
              </p>
            </div>

            {/* 3 Feature Highlight Cards */}
            <div className="hidden max-w-lg gap-3.5 pt-2 sm:grid sm:grid-cols-3">
              {highlights.map(({ icon: Icon, title, iconBg }) => (
                <div
                  key={title}
                  className="auth-feature-card rounded-2xl p-4 transition-transform duration-base hover:-translate-y-0.5"
                >
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${iconBg}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-xs font-semibold leading-snug text-fg">{title}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Authentication Frosted Glass Card */}
          <main className="flex w-full justify-center lg:justify-end">
            <div className="auth-form-glass w-full max-w-[420px] animate-fade-up rounded-[28px] p-6 sm:p-8">
              <Outlet />
            </div>
          </main>
        </div>

        {/* Bottom Caption */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-muted lg:mt-10">
          <p>Built for ambitious students.</p>
          <nav aria-label="Legal documents" className="flex items-center gap-4">
            <Link
              to="/terms-and-conditions"
              className="transition-colors hover:text-primary-600 hover:underline dark:hover:text-primary-400"
            >
              Terms and Conditions
            </Link>
            <Link
              to="/privacy-policy"
              className="transition-colors hover:text-primary-600 hover:underline dark:hover:text-primary-400"
            >
              Privacy Policy
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
