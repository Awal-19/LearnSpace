import { ArrowLeft, Calendar, FileText, GraduationCap, Info, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { ThemeToggle } from '../../app/ThemeToggle';
import { Button } from '../../design';
import { getLegalDocument, type LegalDocumentKind } from './legalContent';

export interface LegalDocumentPageProps {
  kind: LegalDocumentKind;
}

export function LegalDocumentPage({ kind }: LegalDocumentPageProps) {
  const { status } = useAuth();
  const doc = getLegalDocument(kind);
  const siblingDoc = getLegalDocument(kind === 'terms' ? 'privacy' : 'terms');
  const isAuthenticated = status === 'authenticated';

  return (
    <div className="auth-canvas min-h-screen text-fg">
      {/* Top Navigation */}
      <header className="sticky top-0 z-20 border-b border-line/80 bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-4">
            <Link
              to={isAuthenticated ? '/' : '/login'}
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
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <Link
              to={siblingDoc.route}
              className="hidden rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary-300 hover:text-primary-600 sm:inline-flex dark:hover:text-primary-400"
            >
              {siblingDoc.title}
            </Link>
            <Link
              to={isAuthenticated ? '/' : '/signup'}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-primary-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {isAuthenticated ? 'Back to Workspace' : 'Back to Sign up'}
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        {/* Document Hero Card */}
        <div className="rounded-3xl border border-primary-100 bg-gradient-to-br from-white via-primary-50/70 to-blue-50/80 p-6 shadow-card sm:p-8 dark:border-line dark:from-surface dark:via-surface dark:to-primary-950/30">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:border-primary-800 dark:bg-primary-500/15 dark:text-primary-300">
              {doc.kind === 'terms' ? (
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              LearnSpace Legal Document
            </span>
            <span className="rounded-full border border-line bg-surface/90 px-3 py-1 text-xs font-medium text-muted">
              Version {doc.version}
            </span>
          </div>

          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
            {doc.title}
          </h1>
          <p className="mt-2.5 max-w-3xl text-base leading-relaxed text-muted">{doc.subtitle}</p>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Calendar
                className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
                aria-hidden="true"
              />
              Effective Date: {doc.effectiveDate}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar
                className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
                aria-hidden="true"
              />
              Last Updated: {doc.lastUpdated}
            </span>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary-200/80 bg-white/85 px-4 py-3.5 text-xs leading-relaxed text-muted dark:border-primary-800/70 dark:bg-surface2/60">
            <Info
              className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400"
              aria-hidden="true"
            />
            <p>{doc.draftNotice}</p>
          </div>
        </div>

        {/* Two-column reading layout */}
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[260px_1fr]">
          {/* Table of Contents */}
          <aside className="rounded-2xl border border-line bg-surface p-4 shadow-sm lg:sticky lg:top-24">
            <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Contents
            </p>
            <nav aria-label="Document sections" className="mt-2.5 space-y-0.5">
              {doc.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-500/10 dark:hover:text-primary-300"
                >
                  {section.number}. {section.title}
                </a>
              ))}
            </nav>

            <div className="mt-4 border-t border-line pt-4">
              <Link
                to={siblingDoc.route}
                className="block rounded-xl bg-primary-50/75 px-3 py-2 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100/80 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
              >
                Read {siblingDoc.title} &rarr;
              </Link>
            </div>
          </aside>

          {/* Main Document Body */}
          <article className="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-10">
            <div className="space-y-8">
              {doc.sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 space-y-3 border-b border-line/70 pb-8 last:border-b-0 last:pb-0"
                >
                  <h2 className="font-display text-xl font-semibold tracking-tight text-fg">
                    {section.number}. {section.title}
                  </h2>

                  {section.paragraphs.map((paragraph, idx) => (
                    <p key={idx} className="text-[15px] leading-7 text-fg/85">
                      {paragraph}
                    </p>
                  ))}

                  {section.bullets ? (
                    <ul className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-fg/85">
                      {section.bullets.map((bullet, idx) => (
                        <li key={idx}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}

                  {section.callout ? (
                    <div className="mt-3 rounded-2xl border border-primary-200 bg-primary-50/70 px-5 py-4 dark:border-primary-800/70 dark:bg-primary-950/35">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                        {section.callout.title}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-fg/85">
                        {section.callout.body}
                      </p>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
              <Link
                to={siblingDoc.route}
                className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
              >
                View {siblingDoc.title}
              </Link>
              <Link to={isAuthenticated ? '/' : '/signup'}>
                <Button variant="primary">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {isAuthenticated ? 'Return to Dashboard' : 'Return to Create Account'}
                </Button>
              </Link>
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}
