import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  console.log('[proxy] called:', request.nextUrl.pathname, '| SITE_PASSWORD set:', !!process.env.SITE_PASSWORD)
  const sitePassword = process.env.SITE_PASSWORD
  if (!sitePassword) return NextResponse.next()

  const cookie = request.cookies.get('sama_access')
  if (!cookie || cookie.value !== sitePassword) {
    return NextResponse.redirect(new URL('/enter-password', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!enter-password|api|_next|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}
