import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <Link href="/" className="brand">
            <span className="brand-glyph">O</span>
            <span>orkestria<span className="brand-ai">AI</span></span>
          </Link>
          <p>The trusted control plane for AI-powered operations.</p>
        </div>
        <div>
          <strong>Platform</strong>
          <Link href="/products">Product suite</Link>
          <Link href="/workflows">Workflow studio</Link>
          <Link href="/security">Security</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <div>
          <strong>Company</strong>
          <Link href="/#suite">About</Link>
          <Link href="/#suite">Customers</Link>
          <Link href="/security">Trust center</Link>
          <a href="mailto:hello@orkestria.ai">Contact</a>
        </div>
        <div>
          <strong>Resources</strong>
          <Link href="/workflows">Documentation</Link>
          <Link href="/security">Responsible AI</Link>
          <Link href="/products">Changelog</Link>
          <Link href="/security">Status</Link>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 OrkestriaAI, Inc.</span>
        <div><Link href="/security">Privacy</Link><Link href="/security">Terms</Link></div>
        <span className="footer-status"><i /> All systems operational</span>
      </div>
    </footer>
  );
}
