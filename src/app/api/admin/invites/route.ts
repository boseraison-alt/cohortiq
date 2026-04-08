import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
import { sendInviteEmail } from "@/lib/email";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(invites);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.invite.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { email } = await req.json();
  if (!email?.trim() || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "User with this email already exists." }, { status: 400 });
  }

  // Check for unused invite to same email
  const existingInvite = await prisma.invite.findFirst({
    where: { email: normalizedEmail, used: false, expiresAt: { gt: new Date() } },
  });
  if (existingInvite) {
    return NextResponse.json({
      error: "An active invite for this email already exists.",
      token: existingInvite.token,
    }, { status: 400 });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.invite.create({
    data: {
      email: normalizedEmail,
      token,
      createdBy: (session!.user as any).id,
      expiresAt,
    },
  });

  // Build the registration URL
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const registerUrl = `${baseUrl}/register?token=${token}`;

  // Send invite email automatically
  const inviterName = session!.user?.name || session!.user?.email || "Your admin";
  const emailResult = await sendInviteEmail({
    to: normalizedEmail,
    registerUrl,
    invitedBy: inviterName,
  });

  return NextResponse.json({
    invite,
    registerUrl,
    emailSent: emailResult.sent,
    message: emailResult.sent
      ? `Invite email sent to ${normalizedEmail}`
      : `Invite created. Email could not be sent — share the link manually.`,
  });
}
