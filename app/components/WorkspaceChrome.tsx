import Link from "next/link";
import type { ReactNode } from "react";
import type { ChatGPTUser } from "../chatgpt-auth";

const agents = [
  { key: "vela", name: "Vela", mark: "V", color: "violet", href: "/vela", live: true },
  { key: "loom", name: "Loom", mark: "L", color: "lime", href: "/loom", live: true },
  { key: "tempo", name: "Tempo", mark: "T", color: "orange", href: "#", live: false },
  { key: "helio", name: "Helio", mark: "H", color: "cyan", href: "#", live: false },
  { key: "aegis", name: "Aegis", mark: "Æ", color: "pink", href: "#", live: false },
] as const;

export function WorkspaceChrome({
  user,
  active,
  title,
  children,
}: {
  user: ChatGPTUser;
  active: "overview" | "vela" | "loom";
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
          <span><strong>Northstar Labs</strong><small>Phase 2 workspace</small></span>
          <b>⌄</b>
        </div>
        <nav className="app-nav" aria-label="Workspace">
          <span className="app-nav-label">Workspace</span>
          <Link className={active === "overview" ? "active" : ""} href="/dashboard">
            <i>⌂</i><span>Overview</span>
          </Link>
          <Link href="/dashboard#approvals"><i>!</i><span>Approvals</span></Link>
          <Link href="/dashboard#runs"><i>↗</i><span>Runs</span></Link>
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
          <Link href="/security">⌾ <span>Governance</span></Link>
          <Link href="/products">⚙ <span>Connections</span></Link>
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
            <span className="phase-live"><i />Phase 2 live</span>
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
