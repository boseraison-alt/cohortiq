import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import crypto from "crypto";

// GET — return (or generate) the current active reset link for a user
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Invalidate old tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: params.id, used: false },
    data: { used: true },
  });

  // Generate a new token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for admin-generated

  await prisma.passwordResetToken.create({
    data: { userId: params.id, token, expiresAt },
  });

  const baseUrl = req.nextUrl.origin;
  return NextResponse.json({
    resetUrl: `${baseUrl}/reset-password?token=${token}`,
    expiresAt,
  });
}
