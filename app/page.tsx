import { HomeClient } from './HomeClient';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; join?: string }>;
}) {
  const params = await searchParams;
  return (
    <HomeClient
      initialError={params.error ?? null}
      initialJoinCode={params.join?.toUpperCase() ?? null}
    />
  );
}
