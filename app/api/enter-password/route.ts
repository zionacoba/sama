import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD

  if (!sitePassword) {
    return Response.json({ error: 'Password gate is not configured.' }, { status: 500 })
  }

  const { password } = await request.json()

  if (password !== sitePassword) {
    return Response.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const response = NextResponse.redirect(new URL('/', request.url))
  response.cookies.set('sama_access', password, { httpOnly: true, path: '/' })
  return response
}
