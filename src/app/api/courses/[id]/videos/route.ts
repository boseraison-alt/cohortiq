import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeFile, mkdir, unlink } from "fs/promises";
import { getUploadDir, getUploadUrl } from "@/lib/uploads";
import path from "path";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const videos = await prisma.video.findMany({
    where: { courseId: params.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(videos);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const course = await prisma.course.findUnique({ where: { id: params.id } });
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

    const uploadDir = getUploadDir("videos");
    await mkdir(uploadDir, { recursive: true });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueName = `${Date.now()}_${safeName}`;
    await writeFile(path.join(uploadDir, uniqueName), buffer);

    const video = await prisma.video.create({
      data: {
        courseId: params.id,
        title: title || file.name.replace(/\.[^.]+$/, ""),
        description,
        url: getUploadUrl("videos", uniqueName),
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
      courseId: params.id,
      title: title.trim(),
      description: description?.trim() || null,
      url: url.trim(),
      sourceType: "url",
    },
  });

  return NextResponse.json(video);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId } = await req.json();
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  // Fetch the record first so we can clean up the file
  const video = await prisma.video.findFirst({
    where: { id: videoId, courseId: params.id },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete the physical file if it's a locally-stored upload
  if (video.url && video.url !== "slides-only" && !video.url.startsWith("http")) {
    try {
      const match = video.url.match(/\/(videos|podcasts)\/([^/]+)$/);
      if (match) {
        const filePath = path.join(getUploadDir(match[1] as "videos" | "podcasts"), match[2]);
        await unlink(filePath);
      }
    } catch {
      // File may already be gone — ignore
    }
  }

  await prisma.video.delete({ where: { id: videoId } });
  return NextResponse.json({ success: true });
}
