import 'katex/contrib/mhchem';
import 'katex/dist/katex.min.css';
import { Check, Copy } from 'lucide-react';
import { isValidElement, memo, useMemo, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { bufferStreamingMath } from './mathUtils';

const MATH_SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', 'language-math', 'math-inline', 'math-display', /^language-[\w-]+$/],
    ],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', 'math', 'math-inline']],
    div: [...(defaultSchema.attributes?.div ?? []), ['className', 'math', 'math-display']],
  },
};

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return '';
}

function extractKatexAnnotation(node: ReactNode): string {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = extractKatexAnnotation(child);
      if (found) return found;
    }
    return '';
  }
  if (isValidElement<{ encoding?: string; children?: ReactNode }>(node)) {
    if (node.type === 'annotation' && node.props.encoding === 'application/x-tex') {
      return extractText(node.props.children).trim();
    }
    return extractKatexAnnotation(node.props.children);
  }
  return '';
}

function KatexDisplayBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const latex = useMemo(() => extractKatexAnnotation(children), [children]);

  const handleCopy = async () => {
    if (!latex) return;
    try {
      await navigator.clipboard.writeText(latex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <span className="group/math relative my-3 block rounded-xl border border-line/50 bg-surface2/40 px-3 py-2.5 dark:bg-white/[0.03]">
      {latex ? (
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label="Copy LaTeX"
          title="Copy LaTeX"
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-lg border border-line/70 bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-muted opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-primary-600 focus-visible:opacity-100 group-hover/math:opacity-100 dark:bg-surface2/90 dark:hover:text-primary-400"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
          <span>{copied ? 'Copied' : 'Copy LaTeX'}</span>
        </button>
      ) : null}
      <span
        className={`${className ?? 'katex-display'} block overflow-x-auto overflow-y-hidden text-center`}
      >
        {children}
      </span>
    </span>
  );
}

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const codeText = extractText(children).replace(/\n$/, '');
  const isBlock = Boolean(className) || codeText.includes('\n');

  if (!isBlock) {
    return (
      <code className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[0.86em] text-fg">
        {children}
      </code>
    );
  }

  const langMatch = className?.match(/language-([\w-]+)/);
  const language = langMatch?.[1] ?? 'code';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable in tests */
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-black/[0.08] bg-[#0d1117] text-neutral-100 shadow-sm dark:border-white/[0.1]">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs text-neutral-400">
        <span className="font-mono lowercase">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-neutral-300 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const prepared = useMemo(() => bufferStreamingMath(content, isStreaming), [content, isStreaming]);

  return (
    <div className="text-[15px] leading-[1.75] text-fg space-y-3.5 break-words">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeSanitize, MATH_SANITIZE_SCHEMA],
          [rehypeKatex, { throwOnError: false, strict: false, output: 'htmlAndMathml' }],
          [rehypeHighlight, { detect: false, ignoreMissing: true }],
        ]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-5 mb-2 text-xl font-semibold tracking-tight text-fg first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 mb-2 text-lg font-semibold tracking-tight text-fg first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 mb-1.5 text-base font-semibold text-fg first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="leading-7 text-fg">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-2.5 ml-5 list-disc space-y-1.5 text-fg">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2.5 ml-5 list-decimal space-y-1.5 text-fg">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-7 pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 rounded-r-xl border-l-4 border-primary-500/70 bg-surface2/50 py-2 pl-4 pr-3 text-sm italic text-fg dark:bg-white/[0.04]">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-5 border-line/80" />,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-xl border border-line/80">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-line/80 bg-surface2/70 text-xs font-semibold uppercase tracking-wide text-muted">
              {children}
            </thead>
          ),
          th: ({ children }) => <th className="px-3.5 py-2.5">{children}</th>,
          td: ({ children }) => (
            <td className="border-t border-line px-3.5 py-2.5 align-top">{children}</td>
          ),
          code: ({ children, className }) => (
            <CodeBlock className={className}>{children}</CodeBlock>
          ),
          pre: ({ children }) => <>{children}</>,
          span: ({ children, className, ...rest }) => {
            if (typeof className === 'string' && className.includes('katex-display')) {
              return <KatexDisplayBlock className={className}>{children}</KatexDisplayBlock>;
            }
            return (
              <span className={className} {...rest}>
                {children}
              </span>
            );
          },
          a: ({ href, children }) => {
            const safeHref =
              href && /^https?:\/\//i.test(href) ? href : href?.startsWith('/') ? href : undefined;
            return (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary-600 underline decoration-primary-400/50 underline-offset-2 hover:text-primary-700 dark:text-primary-400"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {prepared}
      </Markdown>
    </div>
  );
});
