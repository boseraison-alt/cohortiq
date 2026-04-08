"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { t, type Lang } from "@/lib/i18n";

interface Props {
  courseId: string;
  color: string;
  lang?: Lang;
}

interface TreeNode {
  id: string;
  label: string;
  summary: string;
  children: TreeNode[];
}

interface TreeData {
  title: string;
  branches: TreeNode[];
}

// ── Layout engine ────────────────────────────────────────────────────────

interface LayoutNode {
  node: TreeNode;
  x: number;
  y: number;
  depth: number;
  parentX?: number;
  parentY?: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

const NODE_W = 164;
const NODE_H = 40;
const H_GAP = 32;
const V_GAP = 72;

function measureWidth(node: TreeNode, expanded: Set<string>): number {
  if (node.children.length === 0 || !expanded.has(node.id)) return NODE_W;
  const childrenW =
    node.children.reduce((sum, c) => sum + measureWidth(c, expanded), 0) +
    (node.children.length - 1) * H_GAP;
  return Math.max(NODE_W, childrenW);
}

function layoutVisible(root: TreeData, expanded: Set<string>): LayoutNode[] {
  const result: LayoutNode[] = [];
  const rootNode: TreeNode = {
    id: "__root__",
    label: root.title,
    summary: `Overview of ${root.title}`,
    children: root.branches,
  };

  function layout(
    node: TreeNode,
    depth: number,
    offsetX: number,
    subtreeW: number,
    parentX?: number,
    parentY?: number
  ) {
    const x = offsetX + subtreeW / 2;
    const y = depth * (NODE_H + V_GAP);
    const isExp = expanded.has(node.id);
    const hasKids = node.children.length > 0;
    result.push({ node, x, y, depth, parentX, parentY, hasChildren: hasKids, isExpanded: isExp });
    if (!hasKids || !isExp) return;
    const childWidths = node.children.map((c) => measureWidth(c, expanded));
    const totalChildW =
      childWidths.reduce((a, b) => a + b, 0) + (node.children.length - 1) * H_GAP;
    let childX = offsetX + (subtreeW - totalChildW) / 2;
    for (let i = 0; i < node.children.length; i++) {
      layout(node.children[i], depth + 1, childX, childWidths[i], x, y);
      childX += childWidths[i] + H_GAP;
    }
  }

  const rootW = measureWidth(rootNode, expanded);
  layout(rootNode, 0, -rootW / 2, rootW);
  return result;
}

// ── Animated SVG curved path ──────────────────────────────────────────────

function CurvePath({
  x1, y1, x2, y2, color, isNew,
}: {
  x1: number; y1: number; x2: number; y2: number; color: string; isNew: boolean;
}) {
  const midY = (y1 + NODE_H / 2 + y2) / 2;
  const d = `M ${x1} ${y1 + NODE_H / 2} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeOpacity={0.35}
      pathLength={isNew ? 1 : undefined}
      className={isNew ? "path-animate" : undefined}
    />
  );
}

// ── Depth-based glass node styles ────────────────────────────────────────

function nodeStyle(depth: number, color: string, isSelected: boolean) {
  if (depth === 0) {
    return {
      background: `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`,
      color: "#fff",
      border: `1px solid ${color}`,
      fontSize: 13,
      fontWeight: 700,
      backdropFilter: "none",
      boxShadow: isSelected
        ? `0 0 0 3px ${color}60, 0 8px 32px ${color}50`
        : `0 4px 24px ${color}40, 0 2px 8px rgba(0,0,0,0.3)`,
    };
  }
  if (depth === 1) {
    return {
      background: `${color}14`,
      color,
      border: isSelected ? `2px solid ${color}` : `1px solid ${color}45`,
      fontSize: 11,
      fontWeight: 700,
      backdropFilter: "blur(16px) saturate(1.4)",
      WebkitBackdropFilter: "blur(16px) saturate(1.4)",
      boxShadow: isSelected
        ? `0 0 0 3px ${color}40, 0 6px 24px ${color}30`
        : `0 2px 12px rgba(0,0,0,0.18), inset 0 1px 0 ${color}20`,
    };
  }
  if (depth === 2) {
    return {
      background: "rgba(255,255,255,0.04)",
      color: "var(--color-text)",
      border: isSelected ? `2px solid ${color}80` : `1px solid rgba(255,255,255,0.10)`,
      fontSize: 10,
      fontWeight: 600,
      backdropFilter: "blur(12px) saturate(1.3)",
      WebkitBackdropFilter: "blur(12px) saturate(1.3)",
      boxShadow: isSelected
        ? `0 0 0 2px ${color}30, 0 4px 16px rgba(0,0,0,0.2)`
        : `0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)`,
    };
  }
  return {
    background: "rgba(255,255,255,0.025)",
    color: "var(--color-muted-light)",
    border: isSelected ? `2px solid ${color}60` : `1px solid rgba(255,255,255,0.06)`,
    fontSize: 9,
    fontWeight: 500,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
  };
}

// ── Main component ───────────────────────────────────────────────────────

export default function ConceptMapTab({ courseId, color, lang = "en" }: Props) {
  const T = (key: string) => t(key, lang);

  const [loading, setLoading] = useState(false);
  const [tree, setTree] = useState<TreeData | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["__root__"]));
  const [error, setError] = useState("");

  // Pan & zoom
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Bloom animation: track which node IDs were visible last render
  const prevNodeIdsRef = useRef<Set<string>>(new Set());

  // Compute layout (null-safe, needed before useEffect below)
  const nodes = tree ? layoutVisible(tree, expanded) : [];

  // After each render, snapshot current node IDs for next render's bloom detection
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    prevNodeIdsRef.current = new Set(nodes.map((ln) => ln.node.id));
  });

  // Center on load
  useEffect(() => {
    if (tree && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({ x: rect.width / 2, y: 60 });
    }
  }, [tree]);

  const generate = async () => {
    setLoading(true);
    setError("");
    setSelectedNode(null);
    setExpanded(new Set(["__root__"]));
    prevNodeIdsRef.current = new Set();
    try {
      const res = await fetch("/api/ai/concept-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setTree(data);
      setPan({ x: 0, y: 0 });
      setScale(1);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.3, Math.min(2.5, s * (e.deltaY > 0 ? 0.92 : 1.08))));
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.x),
      y: dragStart.current.py + (e.clientY - dragStart.current.y),
    });
  };
  const handleMouseUp = () => setDragging(false);

  // ── Empty / loading state ────────────────────────────────────────────
  if (!tree) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 px-6 text-center">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl glass"
          style={{ boxShadow: `0 8px 32px ${color}30` }}
        >
          🧩
        </div>
        <div>
          <p className="font-serif text-lg font-semibold mb-1.5">{T("map.title")}</p>
          <p className="text-xs text-muted max-w-xs leading-relaxed">
            AI builds a visual mind map from your course materials. Tap branches to explore deeper concepts.
          </p>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          onClick={generate}
          disabled={loading}
          className="btn-haptic px-7 py-3 rounded-2xl text-sm font-semibold disabled:opacity-50"
          style={{
            background: loading ? "var(--color-border-light)" : color,
            color: "#fff",
            boxShadow: loading ? "none" : `0 4px 20px ${color}50`,
          }}
        >
          {loading ? T("map.generating") : T("map.generate")}
        </button>
        {loading && (
          <p className="text-[11px] text-muted animate-pulse">Reading course materials…</p>
        )}
      </div>
    );
  }

  // ── Bloom detection ──────────────────────────────────────────────────
  const newNodeIdSet = new Set(
    nodes.filter((ln) => !prevNodeIdsRef.current.has(ln.node.id)).map((ln) => ln.node.id)
  );
  const staggerMap = new Map<string, number>();
  let si = 0;
  for (const ln of nodes) {
    if (newNodeIdSet.has(ln.node.id)) staggerMap.set(ln.node.id, si++);
  }

  // ── Canvas dimensions ────────────────────────────────────────────────
  const minX = Math.min(...nodes.map((n) => n.x - NODE_W / 2)) - 60;
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W / 2)) + 60;
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H)) + 80;
  const svgW = maxX - minX;
  const svgH = maxY + 20;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-2.5 border-b border-border flex items-center gap-3 shrink-0"
        style={{ backdropFilter: "blur(10px)", background: "rgba(255,255,255,0.02)" }}>
        <span className="text-sm font-semibold flex-1" style={{ color }}>
          🧩 {tree.title}
        </span>
        <span className="text-[10px] text-muted hidden sm:block">
          Click to expand · Drag to pan · Scroll to zoom
        </span>
        <button
          onClick={() => { setTree(null); generate(); }}
          disabled={loading}
          className="btn-haptic px-3 py-1.5 rounded-lg text-[11px] border border-border text-muted disabled:opacity-50"
        >
          {loading ? T("map.generating") : T("map.regenerate")}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Canvas ── */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative"
          style={{ background: "var(--color-bg)" }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Radial glow behind nodes — makes glass visible */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse 75% 50% at 50% 35%, ${color}18 0%, transparent 68%)`,
          }} />
          {/* Dot grid */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: `radial-gradient(circle, ${color}30 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }} />

          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "0 0",
              width: svgW,
              height: svgH,
              position: "relative",
            }}
          >
            {/* SVG curves */}
            <svg
              width={svgW}
              height={svgH}
              style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
              viewBox={`${minX} 0 ${svgW} ${svgH}`}
            >
              {nodes
                .filter((n) => n.parentX !== undefined)
                .map((n) => (
                  <CurvePath
                    key={n.node.id + "-c"}
                    x1={n.parentX!}
                    y1={n.parentY!}
                    x2={n.x}
                    y2={n.y}
                    color={color}
                    isNew={newNodeIdSet.has(n.node.id)}
                  />
                ))}
            </svg>

            {/* Nodes */}
            {nodes.map((ln) => {
              const isSelected = selectedNode?.id === ln.node.id;
              const isRoot = ln.node.id === "__root__";
              const isNew = newNodeIdSet.has(ln.node.id);
              const stagger = staggerMap.get(ln.node.id) ?? 0;
              const delayClass = isNew && stagger > 0 ? `node-bloom-d${Math.min(stagger, 8)}` : "";
              // Float: all non-root nodes gently oscillate after bloom
              const floatIdx = (stagger % 8) + 1;
              const floatClass = !isRoot && !isNew
                ? `node-float node-float-d${floatIdx}`
                : !isRoot && isNew
                ? `node-bloom ${delayClass}` // bloom takes priority; float kicks in after
                : "";
              const ds = nodeStyle(ln.depth, color, isSelected);

              return (
                <div
                  key={ln.node.id}
                  className={[
                    "absolute rounded-2xl flex items-center justify-center text-center px-3 select-none",
                    isRoot ? "root-breathe" : floatClass,
                    !isRoot ? "cursor-pointer" : "",
                    isSelected && ln.depth > 0 ? "glow-pulse" : "",
                  ].join(" ")}
                  style={{
                    left: ln.x - NODE_W / 2 - minX,
                    top: ln.y,
                    width: NODE_W,
                    height: NODE_H,
                    ...ds,
                    // @ts-ignore
                    "--node-glow-base": `0 0 14px ${color}35`,
                    "--node-glow-peak": `0 0 28px ${color}55, 0 0 48px ${color}20`,
                    "--root-glow-base": `0 4px 24px ${color}40, 0 0 0 2px ${color}30`,
                    "--root-glow-peak": `0 8px 40px ${color}70, 0 0 0 3px ${color}60, 0 0 60px ${color}25`,
                    transition:
                      "box-shadow 0.2s ease, border-color 0.2s ease, transform 0.15s cubic-bezier(0.34,1.56,0.64,1)",
                    zIndex: isSelected ? 10 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isRoot && !isSelected)
                      (e.currentTarget as HTMLElement).style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isRoot) return;
                    setSelectedNode(ln.node);
                    if (ln.hasChildren) toggleExpand(ln.node.id);
                  }}
                >
                  {/* Expand chevron — rotates on expand */}
                  {ln.hasChildren && !isRoot && (
                    <span
                      className="absolute -bottom-3 left-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                      style={{
                        background: ds.background as string,
                        border: `1px solid ${color}40`,
                        color: ln.depth === 1 ? color : "var(--color-muted-light)",
                        transform: `translateX(-50%) rotate(${ln.isExpanded ? 180 : 0}deg)`,
                        transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        zIndex: 2,
                      }}
                    >
                      ▾
                    </span>
                  )}

                  {/* Inner glow ring on depth-1 */}
                  {ln.depth === 1 && (
                    <span
                      className="absolute inset-0 rounded-2xl pointer-events-none"
                      style={{
                        background: `radial-gradient(ellipse at 50% 0%, ${color}18 0%, transparent 70%)`,
                      }}
                    />
                  )}

                  <span
                    className="truncate leading-tight relative z-10"
                    style={{ fontSize: ds.fontSize, fontWeight: ds.fontWeight }}
                  >
                    {ln.node.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Info panel ── */}
        {selectedNode && (
          <div
            key={selectedNode.id}
            className="w-80 border-l border-border overflow-y-auto px-5 py-5 shrink-0 slide-from-right"
            style={{
              backdropFilter: "blur(20px) saturate(1.4)",
              WebkitBackdropFilter: "blur(20px) saturate(1.4)",
              background: "rgba(255,255,255,0.03)",
              borderLeft: `1px solid rgba(255,255,255,0.08)`,
            }}
          >
            <div
              className="h-1 w-12 rounded-full mb-4"
              style={{ background: color, boxShadow: `0 2px 8px ${color}60` }}
            />

            <h2 className="font-serif text-base font-bold mb-3" style={{ color }}>
              {selectedNode.label}
            </h2>

            <div
              className="rounded-2xl p-4 mb-4"
              style={{
                background: `${color}08`,
                border: `1px solid ${color}20`,
                backdropFilter: "blur(8px)",
              }}
            >
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
                {selectedNode.summary}
              </p>
            </div>

            {selectedNode.children.length > 0 && (
              <div>
                <p className="text-[10px] text-muted uppercase tracking-widest mb-2.5">
                  {selectedNode.children.length} sub-topics
                </p>
                {selectedNode.children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => {
                      setSelectedNode(child);
                      if (child.children.length > 0) {
                        setExpanded((prev) => new Set([...prev, child.id]));
                      }
                    }}
                    className="card-lift w-full text-left px-3.5 py-2.5 rounded-xl border mb-1.5 text-xs"
                    style={{
                      background: "rgba(255,255,255,0.025)",
                      border: `1px solid rgba(255,255,255,0.07)`,
                      color: "var(--color-text)",
                    }}
                  >
                    <span className="font-semibold" style={{ color }}>
                      {child.label}
                    </span>
                    <p className="text-[10px] text-muted mt-0.5 line-clamp-2 leading-relaxed">
                      {child.summary}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setSelectedNode(null)}
              className="btn-haptic mt-5 text-[10px] text-muted hover:text-muted-light flex items-center gap-1"
            >
              <span style={{ fontSize: 9 }}>✕</span> Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
