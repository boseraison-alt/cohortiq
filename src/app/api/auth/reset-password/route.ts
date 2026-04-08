import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// GET — validate a reset token (called by the reset page on load)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false, error: "No token" });

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { email: true } } },
  });

  if (!record || record.used || record.expiresAt < new Date()) {
    return NextResponse.json({ valid: false, error: "Token expired or already used" });
  }

  return NextResponse.json({ valid: true, email: record.user.email });
}

// POST — consume token and set new password
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password || password.length < 8) {
      return NextResponse.json({ error: "Token and password (min 8 chars) required" }, { status: 400 });
    }

    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!record || record.used || record.expiresAt < new Date()) {
      return NextResponse.json({ error: "Token expired or already used" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { password: hashed },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[reset-password]", e.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
