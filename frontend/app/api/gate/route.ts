import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.SITE_PASSWORD || "argo-dev";

  if (password !== correct) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

  const response = NextResponse.json({ ok: true });
  response.cookies.set("site_auth", "granted", {
    httpOnly: true,
    sameSite: cookieDomain ? "none" : "lax", // cross-subdomain requires SameSite=None
    secure: !!cookieDomain, // Secure required when SameSite=None
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
  return response;
}
