import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(_req: NextRequest) {
  // Reserved for future enhancements (locale detection, session validation).
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|audio|dice-textures).*)',
  ],
};
