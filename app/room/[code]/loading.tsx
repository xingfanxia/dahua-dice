import { getTranslations } from 'next-intl/server';

/** Route-level loading fallback for the room (server-component fetch). */
export default async function Loading() {
  const t = await getTranslations('common');
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div
        className="animate-pulse text-2xl text-gray-500 dark:text-gray-400"
        role="status"
        aria-label={t('loading')}
      >
        🎲
      </div>
    </main>
  );
}
