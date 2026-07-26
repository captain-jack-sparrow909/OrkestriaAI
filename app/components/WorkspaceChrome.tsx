import Link from "next/link";
import type { ReactNode } from "react";
import type { ChatGPTUser } from "../chatgpt-auth";

const agents = [
  { key: "vela", name: "Vela", mark: "V", color: "violet", href: "/vela", live: true },
  { key: "loom", name: "Loom", mark: "L", color: "lime", href: "/loom", live: true },
  { key: "tempo", name: "Tempo", mark: "T", color: "orange", href: "/tempo", live: true },
  { key: "helio", name: "Helio", mark: "H", color: "cyan", href: "/helio", live: true },
  { key: "aegis", name: "Aegis", mark: "Æ", color: "pink", href: "/aegis", live: true },
] as const;

export function WorkspaceChrome({
  user,
  active,
  title,
  children,
}: {
  user: ChatGPTUser;
  active: "overview" | "vela" | "loom" | "tempo" | "helio" | "aegis" | "enterprise" | "ecosystem";
  title: string;
  children: ReactNode;
}) {
  const initials = user.displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <Link href="/" className="brand app-brand">
          <span className="brand-glyph">O</span>
          <span>orkestria<span className="brand-ai">AI</span></span>
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-avatar">N</span>
          <span><strong>Northstar Labs</strong><small>Enterprise workspace</small></span>
          <b>⌄</b>
        </div>
        <nav className="app-nav" aria-label="Workspace">
          <span className="app-nav-label">Workspace</span>
          <Link className={active === "overview" ? "active" : ""} href="/dashboard">
            <i>⌂</i><span>Overview</span>
          </Link>
          <Link href="/dashboard#approvals"><i>!</i><span>Approvals</span></Link>
          <Link href="/dashboard#runs"><i>↗</i><span>Runs</span></Link>
          <Link className={active === "enterprise" ? "active" : ""} href="/enterprise">
            <i className="enterprise-nav-mark">◇</i><span>Enterprise</span>
          </Link>
          <Link className={active === "ecosystem" ? "active" : ""} href="/ecosystem">
            <i className="ecosystem-nav-mark">✦</i><span>Ecosystem</span>
          </Link>
          <span className="app-nav-label">Agents</span>
          {agents.map((agent) => agent.live ? (
            <Link
              className={active === agent.key ? "active" : ""}
              href={agent.href}
              key={agent.key}
            >
              <i className={`agent-nav-mark ${agent.color}`}>{agent.mark}</i>
              <span>{agent.name}</span>
              <span className="agent-online" />
            </Link>
          ) : (
            <span className="agent-nav-disabled" key={agent.key}>
              <i className={`agent-nav-mark ${agent.color}`}>{agent.mark}</i>
              <span>{agent.name}</span>
              <small>Soon</small>
            </span>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/enterprise">⌾ <span>Governance</span></Link>
          <Link href="/ecosystem">⚙ <span>Connections</span></Link>
          <a href="/signout-with-chatgpt?return_to=%2F">↪ <span>Sign out</span></a>
        </div>
      </aside>

      <section className="app-main">
        <header className="app-topbar">
          <div>
            <span className="topbar-breadcrumb">Northstar Labs /</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="phase-live"><i />Phase 6 live</span>
            <div className="user-chip">
              <span>{initials}</span>
              <p><strong>{user.displayName}</strong><small>Owner</small></p>
            </div>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
