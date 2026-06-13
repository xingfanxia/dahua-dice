'use client';

/**
 * Error boundary. Pure Tailwind light/dark classes so it renders correctly
 * even if the failure was inside a provider.
 */
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-gray-50 px-6 text-center text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <p className="text-4xl" aria-hidden="true">
        🎲
      </p>
      <h1 className="text-xl font-bold">出错了 · Something went wrong</h1>
      <button
        type="button"
        onClick={reset}
        className="min-h-[44px] rounded-2xl bg-red-600 px-6 font-medium text-white"
      >
        重试 · Retry
      </button>
    </main>
  );
}
