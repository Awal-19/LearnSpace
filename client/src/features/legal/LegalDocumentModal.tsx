import { Calendar, ExternalLink, FileText, Info, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Modal } from '../../design';
import { getLegalDocument, type LegalDocumentKind } from './legalContent';

export interface LegalDocumentModalProps {
  kind: LegalDocumentKind | null;
  onClose: () => void;
  onSwitchDocument?: (kind: LegalDocumentKind) => void;
}

export function LegalDocumentModal({ kind, onClose, onSwitchDocument }: LegalDocumentModalProps) {
  const doc = kind ? getLegalDocument(kind) : null;
  const otherKind: LegalDocumentKind = kind === 'privacy' ? 'terms' : 'privacy';
  const otherDoc = getLegalDocument(otherKind);

  return (
    <Modal
      open={Boolean(kind)}
      onClose={onClose}
      title={doc?.title ?? 'Legal Document'}
      className="max-w-3xl"
    >
      {doc ? (
        <div className="flex max-h-[78vh] flex-col">
          {/* Document metadata & quick switcher */}
          <div className="border-b border-line bg-primary-50/60 px-6 py-4 dark:bg-primary-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-white px-2.5 py-1 font-medium text-primary-700 dark:border-primary-800 dark:bg-surface2 dark:text-primary-300">
                  {doc.kind === 'terms' ? (
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Version {doc.version}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar
                    className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
                    aria-hidden="true"
                  />
                  Effective: {doc.effectiveDate}
                </span>
                <span aria-hidden="true">&middot;</span>
                <span>Last updated: {doc.lastUpdated}</span>
              </div>

              <div className="flex items-center gap-2">
                {onSwitchDocument ? (
                  <button
                    type="button"
                    onClick={() => onSwitchDocument(otherKind)}
                    className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-primary-600 transition-colors hover:border-primary-300 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-500/10"
                  >
                    View {otherDoc.title}
                  </button>
                ) : null}
                <Link
                  to={doc.route}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-primary-600 dark:hover:text-primary-400"
                >
                  Open full page
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-primary-200/80 bg-white/85 px-3.5 py-2.5 text-xs leading-relaxed text-muted dark:border-primary-800/70 dark:bg-surface/80">
              <Info
                className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400"
                aria-hidden="true"
              />
              <p>{doc.draftNotice}</p>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <p className="text-sm leading-relaxed text-muted">{doc.subtitle}</p>

            {doc.sections.map((section) => (
              <section
                key={section.id}
                className="space-y-2.5 border-b border-line/70 pb-5 last:border-b-0 last:pb-0"
              >
                <h3 className="font-display text-base font-semibold text-fg">
                  {section.number}. {section.title}
                </h3>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-sm leading-relaxed text-fg/85">
                    {paragraph}
                  </p>
                ))}
                {section.bullets ? (
                  <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg/85">
                    {section.bullets.map((bullet, idx) => (
                      <li key={idx}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
                {section.callout ? (
                  <div className="rounded-xl border border-primary-200 bg-primary-50/70 px-4 py-3 dark:border-primary-800/70 dark:bg-primary-950/35">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                      {section.callout.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-fg/85">
                      {section.callout.body}
                    </p>
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface2/40 px-6 py-4">
            <p className="text-xs text-muted">
              Check the box on the sign-up form to confirm your acceptance.
            </p>
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
