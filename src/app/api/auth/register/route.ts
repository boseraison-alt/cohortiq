import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { token, name, password } = await req.json();

  if (!token || !name?.trim() || !password || password.length < 8) {
    return NextResponse.json(
      { error: "Valid invite token, name, and password (8+ chars) required." },
      { status: 400 }
    );
  }

  // Find valid invite
  const invite = await prisma.invite.findUnique({ where: { token } });

  if (!invite) {
    return NextResponse.json({ error: "Invalid invite link." }, { status: 400 });
  }
  if (invite.used) {
    return NextResponse.json({ error: "This invite has already been used." }, { status: 400 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite has expired." }, { status: 400 });
  }

  // Check if email already registered
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
  }

  // Create user
  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: invite.email.toLowerCase().trim(),
      name: name.trim(),
      password: hashed,
      role: "user",
      invitedBy: invite.createdBy,
    },
  });

  // Mark invite as used
  await prisma.invite.update({
    where: { id: invite.id },
    data: { used: true, usedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    email: user.email,
    message: "Account created. You can now sign in.",
  });
}

// GET: validate a token without registering
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const invite = await prisma.invite.findUnique({ where: { token } });

  if (!invite) return NextResponse.json({ valid: false, error: "Invalid invite." });
  if (invite.used) return NextResponse.json({ valid: false, error: "Already used." });
  if (invite.expiresAt < new Date()) return NextResponse.json({ valid: false, error: "Expired." });

  return NextResponse.json({ valid: true, email: invite.email });
}
