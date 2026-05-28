import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Lightweight health check for Vercel / uptime monitors (spec §6). */
export function GET() {
  return NextResponse.json({ ok: true });
}
