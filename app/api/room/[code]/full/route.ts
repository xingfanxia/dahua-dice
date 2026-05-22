import { type NextRequest, NextResponse } from 'next/server';
import { isValidInviteCode } from '@/lib/room/invite-code';
import { requireMembership } from '@/lib/auth/membership';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  if (!isValidInviteCode(code)) {
    return NextResponse.json({ ok: false, reason: 'invalid_code' }, { status: 400 });
  }
  const m = await requireMembership(code);
  if (!m.ok) return NextResponse.json({ ok: false, reason: m.reason }, { status: m.status });
  return NextResponse.json({ ok: true, state: m.state });
}
