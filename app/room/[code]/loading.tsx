/** Themed route-level loading fallback for the room (server-component fetch). */
export default function Loading() {
  return (
    <main
      className="min-h-[100dvh] flex items-center justify-center"
      style={{ background: 'var(--color-bg)' }}
    >
      <div
        className="text-2xl animate-pulse"
        style={{ color: 'var(--color-text-muted)' }}
        role="status"
        aria-label="loading"
      >
        🎲
      </div>
    </main>
  );
}
