import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// GET: list all videos for a course
export async function GET(req: NextRequest, { params }: { params: { courseId: string } }) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const videos = await prisma.video.findMany({
    where: { courseId: params.courseId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(videos);
}

// POST: add a video — either an external URL or an uploaded file
export async function POST(req: NextRequest, { params }: { params: { courseId: string } }) {
  const session = await getServerSession(authOptions);
  if (!(await requireAdmin(session))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const course = await prisma.course.findUnique({ where: { id: params.courseId } });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") || "";

  // ── File upload (multipart) ──
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const title = (form.get("title") as string)?.trim();
    const description = (form.get("description") as string)?.trim() || null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to public/uploads/videos/
    const uploadDir = path.join(process.env.VERCEL ? "/tmp" : process.cwd() + "/public", "uploads", "videos");
    await mkdir(uploadDir, { recursive: true });

    // Sanitize filename + make unique
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueName = `${Date.now()}_${safeName}`;
    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, buffer);

    const video = await prisma.video.create({
      data: {
        courseId: params.courseId,
        title: title || file.name.replace(/\.[^.]+$/, ""),
        description,
        url: `/uploads/videos/${uniqueName}`,
        sourceType: "file",
        fileName: file.name,
        fileSize: file.size,
      },
    });

    return NextResponse.json(video);
  }

  // ── URL-based video ──
  const { title, description, url } = await req.json();
  if (!url?.trim()) return NextResponse.json({ error: "URL required" }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const video = await prisma.video.create({
    data: {
      courseId: params.courseId,
      title: title.trim(),
      description: description?.trim() || null,
      url: url.trim(),
      sourceType: "url",
    },
  });

  return NextResponse.json(video);
}
