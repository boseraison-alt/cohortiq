"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * SourcePicker — NotebookLM-style material source selector.
 *
 * Fetches all course materials and presents them as a checklist.
 * Users can select/deselect individual materials to control which
 * content is used as context when generating videos, slide decks,
 * or podcasts.
 *
 * All materials are selected by default (matching previous behavior).
 */

interface Material {
  id: string;
  title: string;
  wordCount: number;
  sourceType: string;
  status: string;
}

interface Week {
  number: number;
  label: string | null;
  materials: Material[];
}

interface Props {
  courseId: string;
  color: string;
  onChange: (selectedIds: string[]) => void;
}

const SOURCE_ICONS: Record<string, string> = {
  pdf: "📄",
  pasted: "📋",
  file: "📎",
  docx: "📝",
  txt: "📃",
  md: "📝",
  photo: "📷",
  unknown: "📄",
};

export default function SourcePicker({ courseId, color, onChange }: Props) {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [unassigned, setUnassigned] = useState<Material[]>([]);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fetch course data
  useEffect(() => {
    fetch(`/api/courses/${courseId}`)
      .then((r) => r.json())
      .then((data) => {
        const wks: Week[] = data.weeks || [];
        const unass: Material[] = data.unassigned || [];

        // Only include approved materials
        const approvedWeeks = wks.map((w) => ({
          ...w,
          materials: w.materials.filter((m: Material) => m.status === "approved"),
        }));
        const approvedUnassigned = unass.filter((m) => m.status === "approved");

        setWeeks(approvedWeeks);
        setUnassigned(approvedUnassigned);

        // Build flat list + select all by default
        const all = [
          ...approvedWeeks.flatMap((w) => w.materials),
          ...approvedUnassigned,
        ];
        setAllMaterials(all);
        const allIds = new Set(all.map((m) => m.id));
        setSelected(allIds);
        onChange(Array.from(allIds));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [courseId]);

  const toggle = useCallback(
    (id: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange(Array.from(next));
        return next;
      });
    },
    [onChange]
  );

  const selectAll = useCallback(() => {
    const allIds = new Set(allMaterials.map((m) => m.id));
    setSelected(allIds);
    onChange(Array.from(allIds));
  }, [allMaterials, onChange]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
    onChange([]);
  }, [onChange]);

  if (!loaded || allMaterials.length === 0) return null;

  const selectedCount = selected.size;
  const totalCount = allMaterials.length;
  const selectedWords = allMaterials
    .filter((m) => selected.has(m.id))
    .reduce((s, m) => s + m.wordCount, 0);
  const allSelected = selectedCount === totalCount;

  const renderMaterial = (m: Material) => {
    const isChecked = selected.has(m.id);
    const icon = SOURCE_ICONS[m.sourceType] || SOURCE_ICONS.unknown;
    return (
      <label
        key={m.id}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all"
        style={{
          background: isChecked ? color + "08" : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!isChecked) e.currentTarget.style.background = "var(--color-bg-raised)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isChecked ? color + "08" : "transparent";
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggle(m.id)}
          className="shrink-0"
          style={{ accentColor: color, width: 16, height: 16 }}
        />
        <span className="text-sm shrink-0">{icon}</span>
        <span
          className="text-sm flex-1 truncate"
          style={{ color: isChecked ? "var(--color-text)" : "var(--color-muted)" }}
        >
          {m.title}
        </span>
        <span className="text-[11px] shrink-0" style={{ color: "var(--color-muted)" }}>
          {m.wordCount.toLocaleString()} words
        </span>
      </label>
    );
  };

  return (
    <div
      className="rounded-xl border mb-4 overflow-hidden"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg-card)" }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
        style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <span className="text-base">📚</span>
        <span className="text-sm font-semibold flex-1" style={{ color: "var(--color-text)" }}>
          Sources
        </span>
        <span
          className="text-[12px] font-medium px-2 py-0.5 rounded-full"
          style={{
            background: selectedCount === 0 ? "var(--color-bg-raised)" : color + "20",
            color: selectedCount === 0 ? "var(--color-muted)" : color,
          }}
        >
          {selectedCount}/{totalCount} selected
        </span>
        <span
          className="text-[12px]"
          style={{ color: "var(--color-muted)" }}
        >
          {selectedWords.toLocaleString()} words
        </span>
        <span style={{ color: "var(--color-muted)", fontSize: 14, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>
          ▾
        </span>
      </button>

      {/* Expanded panel */}
      {open && (
        <div
          className="border-t px-2 py-2"
          style={{ borderColor: "var(--color-border)", maxHeight: 320, overflowY: "auto" }}
        >
          {/* Select all / Deselect all */}
          <div className="flex items-center gap-2 px-3 py-1.5 mb-1">
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="text-[12px] font-semibold transition-all"
              style={{
                color: color,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          {/* Materials grouped by week */}
          {weeks
            .filter((w) => w.materials.length > 0)
            .map((w) => (
              <div key={w.number}>
                <p
                  className="text-[11px] font-bold uppercase tracking-widest px-3 pt-2 pb-1"
                  style={{ color: "var(--color-muted)" }}
                >
                  {w.label || `Week ${w.number}`}
                </p>
                {w.materials.map(renderMaterial)}
              </div>
            ))}

          {/* Unassigned materials */}
          {unassigned.length > 0 && (
            <div>
              <p
                className="text-[11px] font-bold uppercase tracking-widest px-3 pt-2 pb-1"
                style={{ color: "var(--color-muted)" }}
              >
                Other materials
              </p>
              {unassigned.map(renderMaterial)}
            </div>
          )}

          {selectedCount === 0 && (
            <p className="text-[12px] text-center py-3" style={{ color: "#EF5350" }}>
              Select at least one source to generate content
            </p>
          )}
        </div>
      )}
    </div>
  );
}
