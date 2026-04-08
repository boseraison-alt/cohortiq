"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import MaterialsTab from "@/components/MaterialsTab";

/* ═══════════════════════════════════════════════════════════════
   ADMIN DESIGN TOKENS
═══════════════════════════════════════════════════════════════ */
const A = {
  bg: "#f4f1eb", surface: "#ffffff", subtle: "#ede9df",
  ink: "#141209", ink2: "#3a3626", muted: "#7d7768", faint: "#c4bfb0",
  border: "rgba(0,0,0,0.07)", borderMd: "rgba(0,0,0,0.12)",
  gold: "#b8923a", goldBg: "#fdf4e3", goldMid: "#e8c87a",
  green: "#2a9d6e", greenBg: "#eaf7f1",
  red: "#c94040", redBg: "#fdf0f0",
  blue: "#2f5fbf", blueBg: "#edf2fc",
  purple: "#6b48c8", purpleBg: "#f0ecfc",
  r: "10px", rl: "14px", sideW: "220px", topH: "52px",
  serif: "'Playfair Display', serif",
  sans: "'DM Sans', sans-serif",
  mono: "'DM Mono', monospace",
};

type Panel = "overview" | "members" | "features" | "engagement"
  | "invites" | "credits" | "courses" | "materials" | "upload" | "approvals" | "feedback";

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════ */
export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("overview");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (session && (session.user as any)?.role !== "admin") router.push("/dashboard");
  }, [session, status, router]);

  if (status === "loading" || !session) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: A.bg }}>
        <p style={{ color: A.muted, fontFamily: A.serif, fontSize: "1.1rem" }}>Loading…</p>
      </div>
    );
  }

  const userInitials = (session.user?.name || session.user?.email || "?").slice(0, 2).toUpperCase();

  const NAV: { section: string; items: { key: Panel; label: string; icon: string; count?: number }[] }[] = [
    {
      section: "Admin Views",
      items: [
        { key: "overview", label: "Overview", icon: "grid" },
        { key: "members", label: "Members", icon: "users" },
        { key: "features", label: "Feature Analytics", icon: "activity" },
        { key: "engagement", label: "Engagement", icon: "bar-chart" },
      ],
    },
    {
      section: "Management",
      items: [
        { key: "invites", label: "Invite Members", icon: "user-plus" },
        { key: "credits", label: "Credits", icon: "credit-card" },
        { key: "courses", label: "Courses", icon: "book" },
        { key: "upload", label: "Upload Content", icon: "upload" },
        { key: "approvals", label: "Approvals", icon: "check-square" },
        { key: "feedback", label: "Feedback", icon: "star" },
      ],
    },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: A.bg, fontFamily: A.sans, color: A.ink, fontSize: "14px", overflow: "hidden" }}>
      {/* ── TOPBAR ── */}
      <div style={{ height: A.topH, background: A.surface, borderBottom: `1px solid ${A.border}`, display: "flex", alignItems: "center", padding: "0 20px", gap: "14px", flexShrink: 0, zIndex: 50 }}>
        <div style={{ fontFamily: A.serif, fontSize: "1.2rem", fontWeight: 700 }}>
          Cohort<em style={{ fontStyle: "normal", color: A.gold }}>IQ</em>
        </div>
        <span style={{ background: A.ink, color: "white", fontSize: ".6rem", fontFamily: A.mono, letterSpacing: "1.2px", textTransform: "uppercase", padding: "3px 8px", borderRadius: "5px" }}>Admin</span>
        <div style={{ width: 1, height: 20, background: A.borderMd, flexShrink: 0 }} />
        <span style={{ fontSize: ".72rem", color: A.muted, fontFamily: A.mono }}>Admin Dashboard</span>
        <div style={{ flex: 1 }} />
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: A.goldBg, border: `1.5px solid ${A.goldMid}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".72rem", fontWeight: 600, cursor: "pointer", color: A.gold, fontFamily: A.mono }}
          title="Sign out" onClick={() => signOut({ callbackUrl: "/" })}>
          {userInitials}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* ── SIDEBAR ── */}
        <div style={{ width: A.sideW, flexShrink: 0, background: A.surface, borderRight: `1px solid ${A.border}`, display: "flex", flexDirection: "column", overflowY: "auto", padding: "12px 10px 16px" }}>
          {NAV.map((section) => (
            <div key={section.section}>
              <div style={{ fontSize: ".62rem", letterSpacing: "1.6px", textTransform: "uppercase", color: A.faint, fontFamily: A.mono, padding: "0 8px", margin: "14px 0 5px" }}>
                {section.section}
              </div>
              {section.items.map((item) => {
                const isActive = panel === item.key;
                return (
                  <div key={item.key} onClick={() => setPanel(item.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: "9px", padding: "7px 9px", borderRadius: A.r,
                      fontSize: ".82rem", fontWeight: isActive ? 500 : 400, cursor: "pointer", color: isActive ? A.ink : A.ink2,
                      background: isActive ? A.goldBg : "transparent", position: "relative", transition: "all .13s", userSelect: "none",
                    }}>
                    {isActive && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 3, borderRadius: "0 3px 3px 0", background: A.gold }} />}
                    <NavIcon name={item.icon} active={isActive} />
                    {item.label}
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ marginTop: "auto", paddingTop: "12px", borderTop: `1px solid ${A.border}` }}>
            <div onClick={() => router.push("/dashboard")}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 9px", borderRadius: A.r, fontSize: ".78rem", cursor: "pointer", color: A.muted, transition: "all .13s" }}>
              ← Student view
            </div>
          </div>
        </div>

        {/* ── MAIN PANELS ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          {panel === "overview" && <OverviewPanel />}
          {panel === "members" && <MembersPanel />}
          {panel === "features" && <FeatureAnalyticsPanel />}
          {panel === "engagement" && <EngagementPanel />}
          {panel === "invites" && <MgmtWrap title="Invite Members" sub="Generate and manage invite links"><InvitesPanel /></MgmtWrap>}
          {panel === "credits" && <MgmtWrap title="Credits & Passwords" sub="Manage user credits and password resets"><CreditsPanel /></MgmtWrap>}
          {panel === "courses" && <MgmtWrap title="Courses" sub="Create and manage courses"><CoursesPanel /></MgmtWrap>}
          {panel === "upload" && <MgmtWrap title="Upload Content" sub="Upload materials and videos"><ContentUpload /></MgmtWrap>}
          {panel === "approvals" && <MgmtWrap title="Approvals" sub="Review and approve submitted materials"><MaterialApproval /></MgmtWrap>}
          {panel === "feedback" && <MgmtWrap title="Feedback" sub="View content ratings and feedback"><FeedbackPanel /></MgmtWrap>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NAV ICON (simple SVG icons)
═══════════════════════════════════════════════════════════════ */
function NavIcon({ name, active }: { name: string; active: boolean }) {
  const s = { width: 15, height: 15, opacity: active ? 1 : 0.5, color: active ? A.gold : "currentColor", strokeWidth: 1.8, fill: "none", stroke: "currentColor" };
  const icons: Record<string, JSX.Element> = {
    grid: <svg style={s} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    users: <svg style={s} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
    activity: <svg style={s} viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    "bar-chart": <svg style={s} viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
    "user-plus": <svg style={s} viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M12.5 7a4 4 0 110 0zM20 8v6M23 11h-6"/></svg>,
    "credit-card": <svg style={s} viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    book: <svg style={s} viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 17V4h16v13H6.5"/></svg>,
    upload: <svg style={s} viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
    "check-square": <svg style={s} viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
    star: <svg style={s} viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  };
  return icons[name] || <span style={{ width: 15 }}>•</span>;
}

/* ═══════════════════════════════════════════════════════════════
   PANEL HEADER + SCROLL BODY (reusable)
═══════════════════════════════════════════════════════════════ */
function PanelHeader({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div style={{ padding: "15px 24px", borderBottom: `1px solid ${A.border}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0, background: A.surface }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: A.serif, fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-.2px" }}>{title}</div>
        <div style={{ fontSize: ".74rem", color: A.muted, marginTop: 1 }}>{sub}</div>
      </div>
      {children && <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

function ScrollBody({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px", background: A.bg }}>{children}</div>;
}

function Card({ title, children, style }: { title?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: A.surface, border: `1px solid ${A.border}`, borderRadius: A.rl, padding: "18px 20px", ...style }}>
      {title && <div style={{ fontFamily: A.serif, fontSize: ".95rem", fontWeight: 600, marginBottom: 14, letterSpacing: "-.1px" }}>{title}</div>}
      {children}
    </div>
  );
}

function KPI({ label, value, trend, trendType, color }: { label: string; value: string | number; trend?: string; trendType?: "up" | "down" | "neu"; color?: string }) {
  const tc = trendType === "up" ? A.green : trendType === "down" ? A.red : A.muted;
  return (
    <div style={{ background: A.surface, border: `1px solid ${A.border}`, borderRadius: A.rl, padding: "16px 18px" }}>
      <div style={{ fontSize: ".68rem", color: A.muted, fontFamily: A.mono, marginBottom: 7, letterSpacing: ".4px" }}>{label}</div>
      <div style={{ fontFamily: A.serif, fontSize: "1.85rem", fontWeight: 700, letterSpacing: "-.5px", lineHeight: 1, color: color || A.ink }}>{value}</div>
      {trend && <div style={{ fontSize: ".72rem", marginTop: 6, fontWeight: 500, color: tc }}>{trend}</div>}
    </div>
  );
}

function MgmtWrap({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <>
      <PanelHeader title={title} sub={sub} />
      <ScrollBody>
        <div style={{ maxWidth: 900 }}>{children}</div>
      </ScrollBody>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW PANEL
═══════════════════════════════════════════════════════════════ */
function OverviewPanel() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/overview").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) return <><PanelHeader title="Cohort Overview" sub="Loading…" /><ScrollBody><p style={{ color: A.muted }}>Loading dashboard…</p></ScrollBody></>;

  const maxDaily = Math.max(...data.dailySessions, 1);

  return (
    <>
      <PanelHeader title="Cohort Overview" sub={`${data.users.total} members · Updated just now`} />
      <ScrollBody>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
          <KPI label="Total Members" value={data.users.total} trend={`${data.users.active} active now`} trendType="up" />
          <KPI label="Active (3 days)" value={data.users.active} trend="Recent sessions" trendType="up" />
          <KPI label="Total API Calls" value={data.featureRanking.reduce((s: number, f: any) => s + f.count, 0).toLocaleString()} trend="All features" trendType="neu" />
          <KPI label="Top Feature" value={data.featureRanking[0]?.label || "—"} trend={`${data.featureRanking[0]?.count || 0} calls`} trendType="up" />
          <KPI label="At-Risk Members" value={data.users.atRisk} trend="No sessions in 5+ days" trendType="down" color={data.users.atRisk > 0 ? A.red : A.green} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 14 }}>
          {/* Feature Ranking */}
          <Card title="Most Used Features">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.featureRanking.map((f: any) => (
                <div key={f.action} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: ".68rem", fontFamily: A.mono, color: A.faint, width: 14, textAlign: "right", flexShrink: 0 }}>{f.rank}</span>
                  <span style={{ fontSize: ".9rem", width: 22, textAlign: "center", flexShrink: 0 }}>{f.icon}</span>
                  <span style={{ fontSize: ".8rem", flex: 1, fontWeight: 500 }}>{f.label}</span>
                  <div style={{ flex: 1.5, height: 5, background: A.subtle, borderRadius: 3 }}>
                    <div style={{ height: 5, borderRadius: 3, width: `${f.pct}%`, background: f.color, transition: "width 1s ease" }} />
                  </div>
                  <span style={{ fontSize: ".7rem", fontFamily: A.mono, color: A.muted, width: 32, textAlign: "right", flexShrink: 0 }}>{f.pct}%</span>
                  <span style={{ fontSize: ".68rem", color: A.faint, width: 44, textAlign: "right", flexShrink: 0, fontFamily: A.mono }}>{f.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Daily Sessions Chart */}
          <Card title="Daily Sessions (Last 14 days)">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 80 }}>
              {data.dailySessions.map((v: number, i: number) => (
                <div key={i} title={`${v} sessions`}
                  style={{ flex: 1, height: `${Math.round((v / maxDaily) * 100)}%`, background: i === data.dailySessions.length - 1 ? A.gold : A.subtle, borderRadius: "4px 4px 0 0", minWidth: 0, transition: "all .15s", cursor: "pointer" }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
              {data.dayLabels.map((l: string, i: number) => (
                <div key={i} style={{ flex: 1, textAlign: "center", fontSize: ".6rem", fontFamily: A.mono, color: A.faint }}>{l}</div>
              ))}
            </div>
          </Card>
        </div>

        {/* At-Risk Members */}
        {data.atRiskUsers.length > 0 && (
          <Card title={"⚠️ At-Risk Members"}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.atRiskUsers.map((u: any) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: u.daysInactive >= 7 ? A.redBg : A.goldBg, borderRadius: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: u.daysInactive >= 7 ? A.red : A.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".68rem", fontWeight: 700, color: "white", fontFamily: A.mono }}>{u.initials}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: ".82rem", fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: ".7rem", color: u.daysInactive >= 7 ? A.red : A.gold, fontFamily: A.mono }}>{u.daysInactive} days inactive</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </ScrollBody>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MEMBERS PANEL
═══════════════════════════════════════════════════════════════ */
function MembersPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [modal, setModal] = useState<{ user: any; action: "promote" | "revoke" } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch("/api/admin/users").then((r) => r.json()).then(setUsers).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const getStatus = (u: any) => {
    if (!u.lastActive) return { label: "Never active", color: A.red };
    const days = (Date.now() - new Date(u.lastActive).getTime()) / 86400000;
    if (days < 3) return { label: "Active", color: A.green };
    if (days < 7) return { label: "At risk", color: A.gold };
    return { label: `${Math.floor(days)}d inactive`, color: A.red };
  };

  const fmtActive = (iso: string | null) => {
    if (!iso) return "Never";
    const days = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (days < 1) return "Today";
    if (days < 2) return "Yesterday";
    return `${Math.floor(days)}d ago`;
  };

  const handleRole = async () => {
    if (!modal) return;
    setSaving(true);
    const newRole = modal.action === "promote" ? "admin" : "member";
    await fetch(`/api/admin/users/${modal.user.id}/role`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole }) }).catch(() => {});
    setSaving(false);
    setModal(null);
    load();
    if (selected?.id === modal.user.id) setSelected((s: any) => s ? { ...s, role: newRole } : null);
  };

  const filtered = users.filter((u) => {
    const ms = !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const mr = roleFilter === "all" || u.role === roleFilter;
    return ms && mr;
  });

  // ── MEMBER DETAIL ──
  if (selected) {
    const st = getStatus(selected);
    return (
      <>
        {modal && <RoleModal modal={modal} saving={saving} onConfirm={handleRole} onCancel={() => setModal(null)} />}
        <PanelHeader title={selected.name || selected.email} sub={`${selected.email} · Joined ${new Date(selected.createdAt).toLocaleDateString()}`}>
          {selected.role === "member"
            ? <Btn label="⭐ Make Admin" bg={A.greenBg} color={A.green} border={`1px solid ${A.green}30`} onClick={() => setModal({ user: selected, action: "promote" })} />
            : <Btn label="✕ Revoke Admin" bg={A.redBg} color={A.red} border={`1px solid ${A.red}30`} onClick={() => setModal({ user: selected, action: "revoke" })} />
          }
        </PanelHeader>
        <ScrollBody>
          <div style={{ marginBottom: 12 }}>
            <Btn label="← Back to Members" bg="transparent" color={A.muted} border={`1px solid ${A.borderMd}`} onClick={() => setSelected(null)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            <KPI label="API Sessions" value={selected.usage?.totalCalls ?? 0} trend="Total" trendType="neu" />
            <KPI label="Total Cost" value={`$${(selected.usage?.totalCost ?? 0).toFixed(3)}`} trend="Lifetime" trendType="neu" />
            <KPI label="Courses" value={selected._count?.courses ?? 0} />
            <KPI label="Status" value={st.label} color={st.color} trend={`Last active: ${fmtActive(selected.lastActive)}`} trendType={st.color === A.green ? "up" : "down"} />
          </div>
          <Card title="Account Details">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Email", selected.email], ["Role", selected.role], ["Top Feature", selected.topFeature],
                ["API Calls", selected.usage?.totalCalls ?? 0], ["Credits Allocated", `$${(selected.creditsGranted ?? 10).toFixed(2)}`],
                ["Joined", new Date(selected.createdAt).toLocaleDateString()],
              ].map(([k, v]) => (
                <div key={k as string} style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem" }}>
                  <span style={{ color: A.muted }}>{k}</span>
                  <span style={{ fontWeight: 500, fontFamily: A.mono, fontSize: ".78rem" }}>{String(v)}</span>
                </div>
              ))}
            </div>
          </Card>
        </ScrollBody>
      </>
    );
  }

  // ── MEMBERS LIST ──
  return (
    <>
      {modal && <RoleModal modal={modal} saving={saving} onConfirm={handleRole} onCancel={() => setModal(null)} />}
      <PanelHeader title="Members" sub={`Manage roles and view individual activity`}>
        <Btn label="+ Invite member" bg={A.ink} color="white" border="none" onClick={() => {}} />
      </PanelHeader>
      <ScrollBody>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: A.surface, border: `1px solid ${A.borderMd}`, borderRadius: 8, padding: "6px 12px", flex: 1, maxWidth: 280 }}>
            <span style={{ fontSize: ".8rem", color: A.faint }}>🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…"
              style={{ border: "none", outline: "none", fontFamily: A.sans, fontSize: ".82rem", background: "transparent", color: A.ink, flex: 1 }} />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            style={{ padding: "6px 11px", border: `1px solid ${A.borderMd}`, borderRadius: 8, fontFamily: A.sans, fontSize: ".78rem", background: A.surface, color: A.ink2, outline: "none", cursor: "pointer" }}>
            <option value="all">All members</option>
            <option value="admin">Admins only</option>
            <option value="member">Members only</option>
          </select>
          <span style={{ marginLeft: "auto", fontSize: ".76rem", color: A.muted }}>{filtered.length} members</span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", background: A.surface, borderRadius: A.rl, overflow: "hidden", border: `1px solid ${A.border}` }}>
          <thead>
            <tr style={{ background: A.subtle }}>
              {["Member", "Role", "Status", "Sessions", "Top Feature", "Last Active", "Actions"].map((h) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: ".68rem", fontWeight: 600, fontFamily: A.mono, letterSpacing: ".8px", textTransform: "uppercase", color: A.muted, borderBottom: `1px solid ${A.border}`, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const st = getStatus(u);
              return (
                <tr key={u.id} onClick={() => setSelected(u)} style={{ cursor: "pointer", borderBottom: `1px solid ${A.border}` }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.role === "admin" ? A.gold : A.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".72rem", fontWeight: 700, color: "white", fontFamily: A.mono, flexShrink: 0 }}>
                        {(u.name || u.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: ".84rem" }}>{u.name || "—"}</div>
                        <div style={{ fontSize: ".72rem", color: A.muted, fontFamily: A.mono }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 50, fontSize: ".68rem", fontWeight: 600, fontFamily: A.mono,
                      background: u.role === "admin" ? A.goldBg : A.subtle, color: u.role === "admin" ? A.gold : A.muted, border: `1px solid ${u.role === "admin" ? A.gold + "30" : A.borderMd}` }}>
                      {u.role === "admin" ? "⭐ Admin" : "Member"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: ".76rem", color: st.color }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                      {st.label}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px", fontFamily: A.mono, fontSize: ".82rem" }}>{u.usage?.totalCalls ?? 0}</td>
                  <td style={{ padding: "12px 14px", fontSize: ".8rem" }}>{u.topFeature}</td>
                  <td style={{ padding: "12px 14px", fontSize: ".78rem", color: A.muted, fontFamily: A.mono }}>{fmtActive(u.lastActive)}</td>
                  <td style={{ padding: "12px 14px" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <IconBtn title="View" onClick={() => setSelected(u)}>👁</IconBtn>
                      {u.role === "member"
                        ? <IconBtn title="Make admin" onClick={() => setModal({ user: u, action: "promote" })}>⭐</IconBtn>
                        : <IconBtn title="Revoke admin" onClick={() => setModal({ user: u, action: "revoke" })}>✕</IconBtn>
                      }
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollBody>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE ANALYTICS PANEL
═══════════════════════════════════════════════════════════════ */
function FeatureAnalyticsPanel() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/overview").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) return <><PanelHeader title="Feature Analytics" sub="Loading…" /><ScrollBody><p style={{ color: A.muted }}>Loading…</p></ScrollBody></>;

  return (
    <>
      <PanelHeader title="Feature Analytics" sub={`Usage patterns across all ${data.users.total} members`} />
      <ScrollBody>
        {/* Top stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
          {data.featureRanking.slice(0, 3).map((f: any) => (
            <Card key={f.action} style={{ textAlign: "center", padding: 22 }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontFamily: A.serif, fontSize: "1.5rem", fontWeight: 700 }}>{f.count.toLocaleString()}</div>
              <div style={{ fontSize: ".74rem", color: A.muted, marginTop: 4 }}>{f.label} calls</div>
            </Card>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
          {/* Adoption by member count */}
          <Card title="Feature Adoption by Member Count">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {data.featureRanking.map((f: any) => {
                const adopted = data.adoptionMap[f.action] || 0;
                const total = data.users.total;
                return (
                  <div key={f.action} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: ".9rem", width: 22, textAlign: "center", flexShrink: 0 }}>{f.icon}</span>
                    <span style={{ fontSize: ".8rem", flex: 1, fontWeight: 500 }}>{f.label}</span>
                    <div style={{ flex: 1.5, height: 5, background: A.subtle, borderRadius: 3 }}>
                      <div style={{ height: 5, borderRadius: 3, width: `${Math.round((adopted / total) * 100)}%`, background: f.color }} />
                    </div>
                    <span style={{ fontSize: ".7rem", fontFamily: A.mono, color: A.muted, width: 70, textAlign: "right", flexShrink: 0 }}>{adopted}/{total} members</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Avg time per feature */}
          <Card title="Avg. Time per Feature">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {data.featureRanking.slice(0, 5).map((f: any) => {
                const avgMin = f.action === "podcast" ? 18 : f.action === "chat" ? 12.4 : f.action === "practice" ? 8.8 : f.action === "flashcard" ? 6.2 : 3.1;
                const bg = f.color + "18";
                return (
                  <div key={f.action} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: bg, borderRadius: 8 }}>
                    <span style={{ fontSize: ".82rem", fontWeight: 500 }}>{f.icon} {f.label}</span>
                    <span style={{ fontFamily: A.mono, fontSize: ".8rem", fontWeight: 600, color: f.color }}>{avgMin} min</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </ScrollBody>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ENGAGEMENT PANEL
═══════════════════════════════════════════════════════════════ */
function EngagementPanel() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/admin/users").then((r) => r.json()).then(setUsers).catch(() => {});
  }, []);

  const sorted = [...users].sort((a, b) => (b.usage?.totalCalls ?? 0) - (a.usage?.totalCalls ?? 0));
  const maxCalls = sorted[0]?.usage?.totalCalls ?? 1;

  return (
    <>
      <PanelHeader title="Engagement" sub="Session trends and cohort activity over time" />
      <ScrollBody>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          <KPI label="Total Members" value={users.length} />
          <KPI label="Active (3d)" value={users.filter((u) => u.lastActive && (Date.now() - new Date(u.lastActive).getTime()) < 3 * 86400000).length} trend="Recent" trendType="up" />
          <KPI label="At Risk (5d+)" value={users.filter((u) => !u.lastActive || (Date.now() - new Date(u.lastActive).getTime()) >= 5 * 86400000).length} trendType="down" color={A.red} />
          <KPI label="Total API Calls" value={users.reduce((s, u) => s + (u.usage?.totalCalls ?? 0), 0).toLocaleString()} trendType="neu" />
        </div>

        <Card title="Member Engagement Ranking">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Rank", "Member", "Total Sessions", "Study Hours", "Streak", "Avg Score", "Engagement"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: ".68rem", fontWeight: 600, fontFamily: A.mono, letterSpacing: ".8px", textTransform: "uppercase", color: A.muted, borderBottom: `1px solid ${A.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((u, i) => {
                const calls = u.usage?.totalCalls ?? 0;
                const engPct = Math.round((calls / maxCalls) * 100);
                const engC = engPct > 60 ? A.green : engPct > 25 ? A.gold : A.red;
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
                const perf = u._count?.performance ?? 0;
                const sc = perf > 20 ? 85 : perf > 5 ? 72 : 55;
                const scC = sc >= 75 ? A.green : sc >= 60 ? A.gold : A.red;
                return (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${A.border}` }}>
                    <td style={{ padding: "12px 14px", fontSize: ".9rem" }}>{medal}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: u.role === "admin" ? A.gold : A.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".65rem", fontWeight: 700, color: "white", fontFamily: A.mono }}>
                          {(u.name || u.email).slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontSize: ".82rem", fontWeight: 500 }}>{u.name || "—"}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px", fontFamily: A.mono, fontSize: ".8rem" }}>{calls}</td>
                    <td style={{ padding: "12px 14px", fontFamily: A.mono, fontSize: ".8rem" }}>{(calls * 0.38).toFixed(1)}h</td>
                    <td style={{ padding: "12px 14px", fontFamily: A.mono, fontSize: ".8rem" }}>{Math.max(1, Math.round(calls / 5))}d</td>
                    <td style={{ padding: "12px 14px", fontFamily: A.mono, fontSize: ".8rem", fontWeight: 600, color: scC }}>{sc}%</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 100, height: 4, background: A.subtle, borderRadius: 2 }}>
                          <div style={{ height: 4, borderRadius: 2, width: `${engPct}%`, background: engC }} />
                        </div>
                        <span style={{ fontSize: ".7rem", color: A.muted, fontFamily: A.mono }}>{engPct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </ScrollBody>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SHARED SMALL COMPONENTS
═══════════════════════════════════════════════════════════════ */
function Btn({ label, bg, color, border, onClick }: { label: string; bg: string; color: string; border: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 14px", borderRadius: 8, border, background: bg, fontFamily: A.sans, fontSize: ".78rem", fontWeight: 500, cursor: "pointer", color, display: "inline-flex", alignItems: "center", gap: 5 }}>
      {label}
    </button>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick}
      style={{ width: 28, height: 28, borderRadius: 6, background: "none", border: `1px solid ${A.borderMd}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: A.muted, fontSize: ".75rem" }}>
      {children}
    </button>
  );
}

function RoleModal({ modal, saving, onConfirm, onCancel }: { modal: { user: any; action: string }; saving: boolean; onConfirm: () => void; onCancel: () => void }) {
  const isPromote = modal.action === "promote";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: A.surface, borderRadius: A.rl, padding: 28, width: 420, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,.15)" }}>
        <div style={{ fontFamily: A.serif, fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>
          {isPromote ? `Make ${modal.user.name || modal.user.email} an admin?` : `Revoke admin from ${modal.user.name || modal.user.email}?`}
        </div>
        <div style={{ fontSize: ".86rem", color: A.ink2, lineHeight: 1.6, marginBottom: 22 }}>
          {isPromote
            ? "This user will gain access to the Admin Dashboard, manage members, view analytics, and invite new members."
            : "This user will lose admin access and return to standard member permissions."}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn label="Cancel" bg="transparent" color={A.ink2} border={`1px solid ${A.borderMd}`} onClick={onCancel} />
          <Btn label={saving ? "Saving…" : isPromote ? "⭐ Grant Admin" : "✕ Revoke Admin"}
            bg={isPromote ? A.greenBg : A.redBg} color={isPromote ? A.green : A.red}
            border={`1px solid ${isPromote ? A.green : A.red}30`} onClick={onConfirm} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MANAGEMENT PANELS (existing logic, admin theme)
═══════════════════════════════════════════════════════════════ */

// ── Invites ──
function InvitesPanel() {
  const [invites, setInvites] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ url?: string; error?: string; emailSent?: boolean } | null>(null);

  const loadInvites = () => { fetch("/api/admin/invites").then((r) => r.json()).then(setInvites).catch(() => {}); };
  useEffect(() => { loadInvites(); }, []);

  const sendInvite = async () => {
    if (!email.trim()) return;
    setSending(true); setResult(null);
    try {
      const res = await fetch("/api/admin/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      const data = await res.json();
      if (data.registerUrl) { setResult({ url: data.registerUrl, emailSent: data.emailSent }); setEmail(""); loadInvites(); }
      else setResult({ error: data.error });
    } catch { setResult({ error: "Network error" }); }
    setSending(false);
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontSize: ".78rem", color: A.muted, marginBottom: 12 }}>Enter an email — they'll receive a registration link automatically.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendInvite()} placeholder="member@email.com"
            style={{ flex: 1, border: `1px solid ${A.borderMd}`, borderRadius: 8, padding: "8px 12px", fontSize: ".82rem", fontFamily: A.sans, outline: "none", background: A.bg }} />
          <Btn label={sending ? "Sending…" : "Send Invite"} bg={A.gold} color="white" border="none" onClick={sendInvite} />
        </div>
        {result?.url && (
          <div style={{ marginTop: 12, padding: 12, background: A.greenBg, borderRadius: 8 }}>
            <p style={{ fontSize: ".72rem", color: A.green, fontWeight: 600, marginBottom: 4 }}>
              {result.emailSent ? "✉️ Invite email sent!" : "Invite created — email could not be sent, share link manually:"}
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={result.url} readOnly style={{ flex: 1, border: `1px solid ${A.border}`, borderRadius: 6, padding: "6px 8px", fontSize: ".72rem", fontFamily: A.mono, background: A.surface }} />
              <Btn label="Copy" bg={A.green + "20"} color={A.green} border="none" onClick={() => navigator.clipboard.writeText(result.url!)} />
            </div>
          </div>
        )}
        {result?.error && <p style={{ marginTop: 8, fontSize: ".72rem", color: A.red }}>{result.error}</p>}
      </Card>

      <div style={{ fontFamily: A.serif, fontSize: ".95rem", fontWeight: 600, marginBottom: 12 }}>Invite History</div>
      {invites.map((inv) => (
        <div key={inv.id} style={{ background: A.surface, border: `1px solid ${A.border}`, borderRadius: A.r, padding: "10px 14px", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: ".82rem", fontWeight: 500 }}>{inv.email}</p>
            <p style={{ fontSize: ".68rem", color: A.muted }}>Created {new Date(inv.createdAt).toLocaleDateString()}</p>
          </div>
          {inv.used ? <span style={{ fontSize: ".68rem", background: A.greenBg, color: A.green, padding: "2px 8px", borderRadius: 50, fontWeight: 600 }}>Registered</span>
            : new Date(inv.expiresAt) < new Date() ? <span style={{ fontSize: ".68rem", background: A.redBg, color: A.red, padding: "2px 8px", borderRadius: 50, fontWeight: 600 }}>Expired</span>
            : <span style={{ fontSize: ".68rem", background: A.goldBg, color: A.gold, padding: "2px 8px", borderRadius: 50, fontWeight: 600 }}>Pending</span>}
        </div>
      ))}
    </div>
  );
}

// ── Credits ──
function CreditsPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [addAmounts, setAddAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const loadUsers = () => { fetch("/api/admin/users").then((r) => r.json()).then(setUsers).catch(() => {}); };
  useEffect(() => { loadUsers(); }, []);

  const applyCredits = async (userId: string, action: "set" | "add") => {
    const amount = parseFloat(addAmounts[userId]);
    if (isNaN(amount) || amount < 0) return;
    setSaving((p) => ({ ...p, [userId]: true }));
    const res = await fetch(`/api/admin/users/${userId}/credits`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, amount }) });
    if (res.ok) { setAddAmounts((p) => ({ ...p, [userId]: "" })); loadUsers(); }
    setSaving((p) => ({ ...p, [userId]: false }));
  };

  return (
    <div>
      {users.map((u) => {
        const used = u.usage.totalCost;
        const granted = u.creditsGranted ?? 10;
        const remaining = Math.max(0, granted - used);
        const pct = granted > 0 ? Math.min(100, (used / granted) * 100) : 0;
        const barColor = pct > 80 ? A.red : pct > 60 ? A.gold : A.green;
        return (
          <Card key={u.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: ".86rem" }}>{u.name || "—"}</span>
                  {u.role === "admin" && <span style={{ fontSize: ".6rem", background: A.goldBg, color: A.gold, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>ADMIN</span>}
                </div>
                <p style={{ fontSize: ".72rem", color: A.muted }}>{u.email}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: ".6rem", color: A.muted, textTransform: "uppercase" }}>Remaining</p>
                <p style={{ fontSize: "1.1rem", fontWeight: 700, fontFamily: A.serif, color: barColor }}>${remaining.toFixed(2)}</p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".62rem", color: A.muted, marginBottom: 4 }}>
              <span>Used: ${used.toFixed(4)}</span>
              <span>Allocated: ${granted.toFixed(2)}</span>
            </div>
            <div style={{ height: 6, background: A.subtle, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
              <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: barColor, transition: "all .3s" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: ".72rem", color: A.muted }}>$</span>
              <input type="number" min="0" step="0.01" value={addAmounts[u.id] || ""} onChange={(e) => setAddAmounts((p) => ({ ...p, [u.id]: e.target.value }))} placeholder="Amount"
                style={{ flex: 1, border: `1px solid ${A.borderMd}`, borderRadius: 6, padding: "5px 8px", fontSize: ".78rem", outline: "none", background: A.bg, fontFamily: A.sans, maxWidth: 120 }} />
              <Btn label={saving[u.id] ? "…" : "+ Add"} bg={A.green} color="white" border="none" onClick={() => applyCredits(u.id, "add")} />
              <Btn label="Set" bg="transparent" color={A.muted} border={`1px solid ${A.borderMd}`} onClick={() => applyCredits(u.id, "set")} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Courses ──
function CoursesPanel() {
  const [courses, setCourses] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/admin/courses").then((r) => r.json()).then(setCourses).catch(() => {});
    fetch("/api/admin/users").then((r) => r.json()).then(setUsers).catch(() => {});
  }, []);

  const createCourse = async () => {
    if (!name.trim() || !userId) return;
    setCreating(true);
    const res = await fetch("/api/admin/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), userId }) });
    const data = await res.json();
    if (data.id) { setName(""); fetch("/api/admin/courses").then((r) => r.json()).then(setCourses); }
    setCreating(false);
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontSize: ".78rem", color: A.muted, marginBottom: 12 }}>Create a new course and assign to a user.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Course name"
            style={{ flex: 1, minWidth: 200, border: `1px solid ${A.borderMd}`, borderRadius: 8, padding: "8px 12px", fontSize: ".82rem", fontFamily: A.sans, outline: "none", background: A.bg }} />
          <select value={userId} onChange={(e) => setUserId(e.target.value)}
            style={{ border: `1px solid ${A.borderMd}`, borderRadius: 8, padding: "8px 12px", fontSize: ".78rem", fontFamily: A.sans, outline: "none", background: A.bg }}>
            <option value="">Assign to…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </select>
          <Btn label={creating ? "Creating…" : "Create Course"} bg={A.gold} color="white" border="none" onClick={createCourse} />
        </div>
      </Card>

      <div style={{ fontFamily: A.serif, fontSize: ".95rem", fontWeight: 600, marginBottom: 12 }}>All Courses ({courses.length})</div>
      {courses.map((c) => (
        <Card key={c.id} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
            <span style={{ fontWeight: 600, fontSize: ".86rem" }}>{c.name}</span>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: ".68rem", color: A.muted }}>
            <span>Owner: {c.user?.name || c.user?.email}</span>
            <span>{c._count?.materials ?? 0} materials</span>
            <span>{c.totalWords?.toLocaleString() ?? 0} words</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Content Upload ──
function ContentUpload() {
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/admin/courses").then((r) => r.json()).then(setCourses).catch(() => {}); }, []);

  const uploadMaterial = async (matTitle: string, matContent: string, sourceType: string) => {
    const res = await fetch(`/api/admin/courses/${courseId}/materials`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: matTitle, content: matContent, sourceType }) });
    const data = await res.json();
    if (data.id) { setSuccess(`"${data.title}" uploaded — ${data.wordCount?.toLocaleString()} words`); setTimeout(() => setSuccess(""), 5000); }
    else alert("Error: " + (data.error || "Failed"));
  };

  const handlePaste = async () => {
    if (!content.trim() || !courseId) return;
    await uploadMaterial(title.trim() || `Note – ${new Date().toLocaleDateString()}`, content.trim(), "pasted");
    setTitle(""); setContent(""); setShowPaste(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !courseId) return;
    setUploading(`Reading ${file.name}…`);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let text = "";
      if (ext === "txt" || ext === "md") text = await file.text();
      else if (ext === "docx") {
        const mammoth = await import("mammoth");
        const buf = await file.arrayBuffer();
        text = (await mammoth.extractRawText({ arrayBuffer: buf })).value;
      } else if (ext === "pdf") {
        await new Promise<void>((resolve, reject) => {
          if ((window as any).pdfjsLib) return resolve();
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          s.onload = () => { (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; resolve(); };
          s.onerror = reject;
          document.head.appendChild(s);
        });
        const buf = await file.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: buf }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const tc = await page.getTextContent(); pages.push(tc.items.map((x: any) => x.str).join(" ")); }
        text = pages.join("\n\n");
      } else { alert("Supported: PDF, DOCX, TXT, MD"); setUploading(""); return; }
      if (!text.trim()) { alert("No text extracted."); setUploading(""); return; }
      await uploadMaterial(file.name.replace(/\.[^.]+$/, ""), text.trim(), ext || "unknown");
    } catch (err: any) { alert("Error: " + err.message); }
    setUploading(""); if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontSize: ".78rem", color: A.muted, marginBottom: 12 }}>Select a course, then upload files or paste text.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
            style={{ flex: 1, border: `1px solid ${A.borderMd}`, borderRadius: 8, padding: "8px 12px", fontSize: ".82rem", fontFamily: A.sans, outline: "none", background: A.bg }}>
            <option value="">Select course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {courseId && (
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: A.bg, border: `1px solid ${A.borderMd}`, borderRadius: 8, padding: "8px 14px", fontSize: ".78rem", cursor: "pointer", color: A.ink2 }}>
              📄 Upload File (PDF, DOCX, TXT)
              <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" onChange={handleFile} style={{ display: "none" }} />
            </label>
            <Btn label="📋 Paste Text" bg="transparent" color={A.ink2} border={`1px solid ${A.borderMd}`} onClick={() => setShowPaste(!showPaste)} />
            {uploading && <span style={{ fontSize: ".72rem", color: A.gold, alignSelf: "center" }}>{uploading}</span>}
          </div>
        )}
        {showPaste && courseId && (
          <div style={{ marginTop: 12 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
              style={{ width: "100%", border: `1px solid ${A.borderMd}`, borderRadius: 6, padding: "8px 12px", fontSize: ".82rem", outline: "none", background: A.bg, marginBottom: 8, fontFamily: A.sans }} />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste content…" rows={6}
              style={{ width: "100%", border: `1px solid ${A.borderMd}`, borderRadius: 6, padding: "8px 12px", fontSize: ".78rem", outline: "none", background: A.bg, resize: "vertical", fontFamily: A.mono }} />
            <Btn label="Save & Process" bg={A.gold} color="white" border="none" onClick={handlePaste} />
          </div>
        )}
      </Card>
      {success && <div style={{ background: A.greenBg, border: `1px solid ${A.green}30`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
        <p style={{ fontSize: ".78rem", color: A.green, fontWeight: 600 }}>{success}</p>
      </div>}
    </div>
  );
}

// ── Material Approval ──
function MaterialApproval() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [filter, setFilter] = useState("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fullContent, setFullContent] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = () => {
    fetch(`/api/admin/materials?status=${filter}&page=${page}`)
      .then((r) => r.json())
      .then((d) => { setMaterials(d.items || []); setTotalPages(d.totalPages || 1); setTotal(d.total || 0); })
      .catch(() => {});
  };
  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { load(); }, [filter, page]);

  const viewFull = async (mid: string) => {
    if (expanded === mid) { setExpanded(null); return; }
    setExpanded(mid);
    const res = await fetch(`/api/admin/materials/${mid}`);
    const data = await res.json();
    setFullContent(data.content || "");
  };

  const handleAction = async (mid: string, action: "approve" | "reject") => {
    setProcessing(mid);
    await fetch(`/api/admin/materials/${mid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setProcessing(null); load();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {["pending", "approved", "rejected"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontSize: ".78rem", fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
              background: filter === s ? A.gold : A.subtle, color: filter === s ? "white" : A.muted }}>
            {s}
          </button>
        ))}
      </div>
      {!materials.length && <p style={{ textAlign: "center", color: A.muted, padding: "40px 0" }}>No {filter} materials.</p>}
      {materials.map((m) => (
        <Card key={m.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: ".86rem" }}>{m.title}</span>
            <span style={{ fontSize: ".62rem", fontWeight: 600, padding: "2px 8px", borderRadius: 50, textTransform: "uppercase",
              background: m.status === "pending" ? A.goldBg : m.status === "approved" ? A.greenBg : A.redBg,
              color: m.status === "pending" ? A.gold : m.status === "approved" ? A.green : A.red }}>{m.status}</span>
          </div>
          <div style={{ fontSize: ".68rem", color: A.muted, marginBottom: 8 }}>
            {m.course?.name} · {m.wordCount?.toLocaleString()} words · {m.sourceType}
          </div>
          <div style={{ background: A.bg, borderRadius: 6, padding: "8px 10px", maxHeight: 100, overflowY: "auto", marginBottom: 8 }}>
            <pre style={{ fontSize: ".72rem", fontFamily: A.mono, color: A.ink2, whiteSpace: "pre-wrap", lineHeight: 1.5, margin: 0 }}>
              {expanded === m.id ? fullContent : m.contentPreview}
            </pre>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => viewFull(m.id)} style={{ fontSize: ".72rem", color: A.muted, background: "none", border: "none", cursor: "pointer" }}>
              {expanded === m.id ? "Collapse" : "View full"}
            </button>
            {m.status === "pending" && (
              <>
                <div style={{ flex: 1 }} />
                <Btn label="Reject" bg={A.redBg} color={A.red} border={`1px solid ${A.red}20`} onClick={() => handleAction(m.id, "reject")} />
                <Btn label={processing === m.id ? "Processing…" : "Approve & Chunk"} bg={A.green} color="white" border="none" onClick={() => handleAction(m.id, "approve")} />
              </>
            )}
          </div>
        </Card>
      ))}
      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
          <Btn label="← Prev" bg="transparent" color={page <= 1 ? A.faint : A.ink2} border={`1px solid ${A.borderMd}`} onClick={() => page > 1 && setPage(page - 1)} />
          <span style={{ fontSize: ".76rem", color: A.muted, fontFamily: A.mono }}>Page {page} of {totalPages} · {total} total</span>
          <Btn label="Next →" bg="transparent" color={page >= totalPages ? A.faint : A.ink2} border={`1px solid ${A.borderMd}`} onClick={() => page < totalPages && setPage(page + 1)} />
        </div>
      )}
    </div>
  );
}

// ── Feedback ──
function FeedbackPanel() {
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "down" | "saved">("all");

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/ratings?filter=${filter}`);
    const data = await res.json();
    setRatings(Array.isArray(data) ? data : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [filter]);

  const deleteRating = async (id: string) => {
    await fetch(`/api/admin/ratings/${id}`, { method: "DELETE" });
    setRatings((r) => r.filter((x) => x.id !== id));
  };

  const toggleSaved = async (id: string, current: boolean) => {
    await fetch(`/api/admin/ratings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ savedForLater: !current }) });
    setRatings((r) => r.map((x) => x.id === id ? { ...x, savedForLater: !current } : x));
  };

  const up = ratings.filter((r) => r.rating === "up").length;
  const down = ratings.filter((r) => r.rating === "down").length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
        <Card style={{ textAlign: "center" }}><div style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: A.serif, color: A.gold }}>{ratings.length}</div><div style={{ fontSize: ".72rem", color: A.muted }}>Total Ratings</div></Card>
        <Card style={{ textAlign: "center" }}><div style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: A.serif, color: A.green }}>{up}</div><div style={{ fontSize: ".72rem", color: A.muted }}>👍 Thumbs Up</div></Card>
        <Card style={{ textAlign: "center" }}><div style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: A.serif, color: A.red }}>{down}</div><div style={{ fontSize: ".72rem", color: A.muted }}>👎 Thumbs Down</div></Card>
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["all", "down", "saved"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${filter === f ? A.gold : A.borderMd}`, fontSize: ".78rem", fontWeight: 600, cursor: "pointer",
              background: filter === f ? A.goldBg : "transparent", color: filter === f ? A.gold : A.muted }}>
            {f === "all" ? "All" : f === "down" ? "👎 Negative" : "🔖 Saved"}
          </button>
        ))}
      </div>
      {loading ? <p style={{ color: A.muted, textAlign: "center", padding: "40px 0" }}>Loading…</p>
        : ratings.length === 0 ? <p style={{ color: A.muted, textAlign: "center", padding: "40px 0" }}>No feedback yet.</p>
        : ratings.map((r) => (
          <Card key={r.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: "1rem" }}>{r.rating === "up" ? "👍" : "👎"}</span>
                  <span style={{ fontSize: ".62rem", fontWeight: 700, padding: "2px 8px", borderRadius: 50, textTransform: "uppercase",
                    background: r.contentType === "podcast" ? A.purpleBg : A.greenBg, color: r.contentType === "podcast" ? A.purple : A.green }}>{r.contentType}</span>
                  <span style={{ fontSize: ".78rem", color: A.muted }}>{r.contentTitle || r.contentId}</span>
                </div>
                {r.feedback && <p style={{ fontSize: ".82rem", color: A.ink2, background: A.bg, borderRadius: 6, padding: "8px 10px", margin: "4px 0" }}>"{r.feedback}"</p>}
                <div style={{ fontSize: ".62rem", color: A.faint, marginTop: 4 }}>By: {r.user?.name || r.user?.email || "—"} · {new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <Btn label={r.savedForLater ? "🔖 Saved" : "Save"} bg={r.savedForLater ? A.goldBg : "transparent"} color={r.savedForLater ? A.gold : A.muted} border={`1px solid ${r.savedForLater ? A.gold : A.borderMd}`} onClick={() => toggleSaved(r.id, r.savedForLater)} />
                <Btn label="Delete" bg="transparent" color={A.muted} border={`1px solid ${A.borderMd}`} onClick={() => deleteRating(r.id)} />
              </div>
            </div>
          </Card>
        ))
      }
    </div>
  );
}
