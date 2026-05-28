'use client';

/**
 * Themed error boundary. Uses CSS theme vars (with the :root fallback in
 * globals.css) so it renders correctly even if the failure was inside a provider.
 */
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 px-6 text-center"
      style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      <p className="text-4xl" aria-hidden="true">
        🎲
      </p>
      <h1 className="text-xl font-display">出错了 · Something went wrong</h1>
      <button
        type="button"
        onClick={reset}
        className="px-6 min-h-[44px] rounded-2xl font-medium"
        style={{ background: 'var(--color-primary)', color: 'var(--color-bg)' }}
      >
        重试 · Retry
      </button>
    </main>
  );
}
