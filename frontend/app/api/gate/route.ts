import { NextResponse } from "next/server";

const DEMO_PASSWORD = "V$$$$";

export async function POST(request: Request) {
  const { password } = await request.json();
  const correct = process.env.SITE_PASSWORD || "argo-dev";

  const isDemo = password === DEMO_PASSWORD;
  if (password !== correct && !isDemo) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

  const response = NextResponse.json({ ok: true, redirect: isDemo ? "/demo" : "/dev" });
  response.cookies.set("site_auth", "granted", {
    httpOnly: true,
    sameSite: cookieDomain ? "none" : "lax",
    secure: !!cookieDomain,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
  if (isDemo) {
    response.cookies.set("demo_mode", "1", {
      httpOnly: false,
      sameSite: cookieDomain ? "none" : "lax",
      secure: !!cookieDomain,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
  }
  return response;
}
