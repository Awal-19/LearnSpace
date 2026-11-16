import { Check, Copy } from 'lucide-react';
import { isValidElement, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return '';
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
    <div className="my-4 overflow-hidden rounded-xl border border-neutral-800 bg-[#0d1117] text-neutral-100 shadow-sm">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-3.5 py-2 text-xs text-neutral-400">
        <span className="font-mono lowercase">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="text-[15px] leading-7 text-fg space-y-3 break-words [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeSanitize,
          rehypeKatex,
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
            <h3 className="mt-4 mb-1.5 text-base font-semibold text-fg first:mt-0">
              {children}
            </h3>
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
            <blockquote className="my-3 border-l-4 border-primary-500 bg-surface2/60 py-2 pl-4 pr-3 text-sm italic text-fg rounded-r-lg">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-5 border-line" />,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-line bg-surface2 text-xs font-semibold uppercase tracking-wide text-muted">
              {children}
            </thead>
          ),
          th: ({ children }) => <th className="px-3.5 py-2.5">{children}</th>,
          td: ({ children }) => (
            <td className="border-t border-line px-3.5 py-2.5 align-top">{children}</td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-600 underline decoration-primary-400/50 underline-offset-2 hover:text-primary-700 dark:text-primary-400"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => (
            <CodeBlock className={className}>{children}</CodeBlock>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
