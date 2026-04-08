import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

// PATCH — set or add credits for a user
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { action, amount } = await req.json();
  // action: "set" | "add"
  // amount: number (USD)

  if (typeof amount !== "number" || amount < 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const newCredits =
    action === "set"
      ? amount
      : user.creditsGranted + amount;

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { creditsGranted: Math.max(0, newCredits) },
    select: { id: true, email: true, creditsGranted: true },
  });

  return NextResponse.json(updated);
}
