"use client";

import Link from "next/link";
import { useState } from "react";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="shell nav-shell">
        <Link href="/" className="brand" aria-label="OrkestriaAI home">
          <span className="brand-glyph">O</span>
          <span>orkestria<span className="brand-ai">AI</span></span>
        </Link>
        <button
          className="menu-button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "×" : "☰"}
        </button>
        <nav className={open ? "nav-links open" : "nav-links"} aria-label="Primary navigation">
          <Link href="/products">Products</Link>
          <Link href="/workflows">Workflows</Link>
          <Link href="/security">Trust</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <div className="nav-actions">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up" className="button button-nav">
            Start free <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
