import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { number, label } = await req.json();

  const week = await prisma.week.create({
    data: { courseId: params.id, number, label: label || `Week ${number}` },
  });

  return NextResponse.json(week);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { weekId, label } = await req.json();

  const week = await prisma.week.update({
    where: { id: weekId },
    data: { label },
  });

  return NextResponse.json(week);
}
