"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  courseId: string;
  weeks: { id: string; number: number; label: string | null; materials: any[] }[];
  unassigned: any[];
  color: string;
  onRefresh: () => void;
}

export default function MaterialsTab({ courseId, weeks, unassigned, color, onRefresh }: Props) {
  const [showPaste, setShowPaste] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const [videosCollapsed, setVideosCollapsed] = useState(false);
  const [videos, setVideos] = useState<any[]>([]);
  const [videoMode, setVideoMode] = useState<"url" | "file" | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoDesc, setVideoDesc] = useState("");
  const [videoUploading, setVideoUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const loadVideos = () => {
    fetch(`/api/courses/${courseId}/videos`)
      .then((r) => r.json())
      .then((data) => setVideos(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => { loadVideos(); }, [courseId]);

  const addVideoUrl = async () => {
    if (!videoUrl.trim() || !videoTitle.trim()) return;
    setVideoUploading(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl.trim(), title: videoTitle.trim(), description: videoDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (data.id) {
        setVideoUrl(""); setVideoTitle(""); setVideoDesc(""); setVideoMode(null);
        loadVideos();
      } else alert("Error: " + (data.error || "Failed"));
    } catch (e: any) { alert(e.message); }
    setVideoUploading(false);
  };

  const handleVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", videoTitle.trim() || file.name.replace(/\.[^.]+$/, ""));
      if (videoDesc.trim()) form.append("description", videoDesc.trim());
      const res = await fetch(`/api/courses/${courseId}/videos`, { method: "POST", body: form });
      const data = await res.json();
      if (data.id) {
        setVideoTitle(""); setVideoDesc(""); setVideoMode(null);
        loadVideos();
      } else alert("Error: " + (data.error || "Failed"));
    } catch (e: any) { alert(e.message); }
    setVideoUploading(false);
    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  const deleteVideo = async (vid: string) => {
    if (!confirm("Remove this video?")) return;
    await fetch(`/api/courses/${courseId}/videos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: vid }),
    });
    loadVideos();
  };

  const addMaterial = async (matTitle: string, matContent: string, matWeekId: string, sourceType: string) => {
    await fetch(`/api/courses/${courseId}/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: matTitle, content: matContent, weekId: matWeekId || null, sourceType }),
    });
    onRefresh();
  };

  const handlePaste = async () => {
    if (!content.trim()) return;
    await addMaterial(title.trim() || `Note – ${new Date().toLocaleDateString()}`, content.trim(), "", "pasted");
    setTitle(""); setContent(""); setShowPaste(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(`Reading ${file.name}…`);

    try {
      let text = "";
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "txt" || ext === "md") {
        text = await file.text();
      } else if (ext === "docx") {
        setUploading("Parsing DOCX…");
        const mammoth = await import("mammoth");
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        text = result.value;
      } else if (ext === "pdf") {
        setUploading("Loading PDF engine…");
        // Use pdf.js via CDN
        await new Promise<void>((resolve, reject) => {
          if ((window as any).pdfjsLib) return resolve();
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          s.onload = () => {
            (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
            resolve();
          };
          s.onerror = reject;
          document.head.appendChild(s);
        });
        setUploading("Extracting text from PDF…");
        const buf = await file.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: buf }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          pages.push(tc.items.map((x: any) => x.str).join(" "));
        }
        text = pages.join("\n\n");
      } else {
        alert("Supported: PDF, DOCX, TXT, MD");
        setUploading("");
        return;
      }

      if (!text.trim()) {
        alert("No text could be extracted.");
        setUploading("");
        return;
      }

      await addMaterial(file.name.replace(/\.[^.]+$/, ""), text.trim(), "", ext || "unknown");
    } catch (err: any) {
      alert("Error: " + err.message);
    }
    setUploading("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const deleteMaterial = async (mid: string) => {
    if (!confirm("Remove this material and its chunks?")) return;
    await fetch(`/api/courses/${courseId}/materials/${mid}`, { method: "DELETE" });
    onRefresh();
  };

  const loadPreview = async (mid: string) => {
    if (expanded === mid) { setExpanded(null); return; }
    setExpanded(mid);
    const res = await fetch(`/api/courses/${courseId}/materials/${mid}`);
    const data = await res.json();
    setPreview(data.content?.slice(0, 3000) + (data.content?.length > 3000 ? "\n…[truncated]" : "") || "");
  };

  const renderMaterial = (m: any) => (
    <div key={m.id} className="bg-bg border border-border rounded-lg mb-1.5 overflow-hidden">
      <div onClick={() => loadPreview(m.id)} className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-bg-raised/30 transition-all">
        <span className="text-[13px]" style={{ color }}>{expanded === m.id ? "▼" : "▶"}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{m.title}</p>
          <p className="text-[12px] text-muted mt-0.5">
            {new Date(m.createdAt).toLocaleDateString()} · {m.wordCount.toLocaleString()} words · {m.sourceType}
            {m.status && m.status !== "approved" && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded font-semibold uppercase ${
                m.status === "pending" ? "bg-[#FFA726]/20 text-[#FFA726]" : "bg-[#EF5350]/20 text-[#EF5350]"
              }`}>{m.status}</span>
            )}
            {m.status === "approved" && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded font-semibold uppercase bg-[#4CAF50]/20 text-[#4CAF50]">✓ live</span>
            )}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); deleteMaterial(m.id); }}
          className="text-muted hover:text-danger text-sm px-1"
        >
          🗑
        </button>
      </div>
      {expanded === m.id && (
        <div className="px-4 pb-3 max-h-60 overflow-y-auto">
          <pre className="font-mono text-[13px] leading-relaxed text-muted-light whitespace-pre-wrap break-words">
            {preview}
          </pre>
        </div>
      )}
    </div>
  );

  const allMaterials = [
    ...weeks.flatMap((w) => w.materials),
    ...unassigned,
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-wrap">
        <button
          onClick={() => setShowPaste(!showPaste)}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-bg"
          style={{ background: color }}
        >
          {showPaste ? "Cancel" : "+ Paste Text"}
        </button>
        <label className="bg-bg-raised border border-border-light rounded-lg px-4 py-2 text-xs text-muted-light cursor-pointer inline-flex items-center gap-1">
          📎 Upload File
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={handleFile} className="hidden" disabled={!!uploading} />
        </label>
        {uploading && <span className="text-xs" style={{ color }}>{uploading}</span>}
        <span className="flex-1" />
        <span className="text-[12px] text-muted">Unlimited · PDF · DOCX · TXT</span>
      </div>

      {/* Paste area */}
      {showPaste && (
        <div className="px-5 py-3 border-b border-border bg-[#0D0F14]">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Material title (optional)"
            className="w-full bg-bg-raised border border-border-light rounded px-3 py-2.5 text-sm text-[#E4DED4] outline-none mb-2"
          />
          <textarea
            value={content} onChange={(e) => setContent(e.target.value)}
            placeholder="Paste lecture notes, reading summaries, case studies…"
            rows={7}
            className="w-full bg-bg-raised border border-border-light rounded px-3 py-3 text-xs font-mono leading-relaxed text-[#E4DED4] outline-none resize-y"
          />
          <button
            onClick={handlePaste}
            disabled={!content.trim()}
            className="mt-2 rounded px-5 py-2 text-xs font-semibold text-bg"
            style={{ background: content.trim() ? color : "#252A34" }}
          >
            Save Material
          </button>
        </div>
      )}

      {/* Materials list */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {!allMaterials.length && !videos.length ? (
          <div className="text-center text-muted py-10 text-sm">
            No materials yet. Paste text or upload files to build your knowledge base.
          </div>
        ) : (
          <>
            {/* All materials flat */}
            {allMaterials.map(renderMaterial)}

            {/* Videos folder */}
            <div className="mb-4">
              {/* Header row */}
              <div className="flex items-center gap-2 mb-2">
                <div
                  onClick={() => setVideosCollapsed((v) => !v)}
                  className="flex items-center gap-2 cursor-pointer flex-1"
                >
                  <span className="text-[13px] text-muted">{videosCollapsed ? "▶" : "▼"}</span>
                  <span className="text-base leading-none">🎬</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color }}>Videos</h3>
                  <span className="text-[12px] text-muted">{videos.length} video{videos.length !== 1 ? "s" : ""}</span>
                </div>
                {/* Add buttons */}
                <button
                  onClick={() => { setVideoMode(videoMode === "url" ? null : "url"); setVideosCollapsed(false); }}
                  className="text-[12px] px-2 py-1 rounded border border-border-light text-muted-light hover:border-accent/50 transition-all"
                >
                  + URL
                </button>
                <label className="text-[12px] px-2 py-1 rounded border border-border-light text-muted-light hover:border-accent/50 transition-all cursor-pointer">
                  ⬆ File
                  <input
                    ref={videoFileRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    disabled={videoUploading}
                    onChange={(e) => { setVideoMode("file"); handleVideoFile(e); }}
                  />
                </label>
                <div className="border-t border-border-light flex-1 ml-1" />
              </div>

              {!videosCollapsed && (
                <div>
                  {/* URL input form */}
                  {videoMode === "url" && (
                    <div className="bg-[#0D0F14] border border-border rounded-xl p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[12px] text-muted uppercase tracking-wider">Add Video URL</p>
                        <button onClick={() => setVideoMode(null)} className="text-[12px] text-muted hover:text-danger">✕</button>
                      </div>
                      <input
                        value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)}
                        placeholder="Title *"
                        className="w-full bg-bg-raised border border-border-light rounded px-3 py-2 text-xs text-[#E4DED4] outline-none mb-2"
                      />
                      <input
                        value={videoDesc} onChange={(e) => setVideoDesc(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full bg-bg-raised border border-border-light rounded px-3 py-2 text-xs text-[#E4DED4] outline-none mb-2"
                      />
                      <input
                        value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                        placeholder="https://youtube.com/watch?v=… or https://vimeo.com/…"
                        className="w-full bg-bg-raised border border-border-light rounded px-3 py-2 text-xs text-[#E4DED4] outline-none mb-2"
                      />
                      <button
                        onClick={addVideoUrl}
                        disabled={!videoUrl.trim() || !videoTitle.trim() || videoUploading}
                        className="rounded px-4 py-1.5 text-xs font-semibold text-bg disabled:opacity-50"
                        style={{ background: color }}
                      >
                        {videoUploading ? "Adding…" : "Add Video"}
                      </button>
                    </div>
                  )}

                  {videoUploading && videoMode === "file" && (
                    <p className="text-xs text-muted px-2 py-2">Uploading video…</p>
                  )}

                  {/* Video list */}
                  {videos.length === 0 && !videoUploading ? (
                    <p className="text-[13px] text-muted px-2 py-2">
                      No videos yet — use "+ URL" or "⬆ File" above to add one.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {videos.map((v) => {
                        const isYT = /youtube|youtu\.be/.test(v.url);
                        const isVimeo = /vimeo\.com/.test(v.url);
                        const isFile = v.sourceType === "file";
                        const icon = isYT ? "▶️" : isVimeo ? "🎥" : isFile ? "📹" : "🎬";
                        const typeLabel = isYT ? "YouTube" : isVimeo ? "Vimeo" : isFile ? "Uploaded" : "External";

                        return (
                          <div key={v.id} className="bg-bg border border-border rounded-lg px-4 py-3 flex items-center gap-3">
                            <span className="text-base">{icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{v.title}</p>
                              {v.description && (
                                <p className="text-[12px] text-muted mt-0.5 truncate">{v.description}</p>
                              )}
                              <p className="text-[12px] text-muted mt-0.5">
                                {new Date(v.createdAt).toLocaleDateString()} · {typeLabel}
                              </p>
                            </div>
                            {isFile ? (
                              <a
                                href={v.url}
                                download={v.fileName || true}
                                className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all hover:opacity-80"
                                style={{ borderColor: color + "40", color, background: color + "10" }}
                              >
                                ⬇ Download
                              </a>
                            ) : (
                              <a
                                href={v.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all hover:opacity-80"
                                style={{ borderColor: color + "40", color, background: color + "10" }}
                              >
                                ▶ Watch
                              </a>
                            )}
                            <button
                              onClick={() => deleteVideo(v.id)}
                              className="text-muted hover:text-danger text-sm px-1"
                            >
                              🗑
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
