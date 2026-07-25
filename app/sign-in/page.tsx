import Link from "next/link";
import { chatGPTSignInPath, getChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
  description: "Continue securely to your OrkestriaAI workspace.",
};

export default async function SignInPage() {
  const user = await getChatGPTUser();

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <Link href="/" className="brand">
          <span className="brand-glyph">O</span>
          <span>orkestria<span className="brand-ai">AI</span></span>
        </Link>
        <div className="auth-quote">
          <span>“</span>
          <blockquote>Our AI agents move fast. Orkestria makes sure they move in the right direction.</blockquote>
          <p>MAYA CHEN · VP OPERATIONS, NORTHSTAR</p>
        </div>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="kicker">SECURE WORKSPACE ACCESS</span>
          <h1>{user ? "Your command center is ready" : "Continue to your workspace"}</h1>
          <p>
            {user
              ? `Signed in as ${user.email}.`
              : "Use your verified ChatGPT identity to enter the protected OrkestriaAI preview."}
          </p>
          <Link
            className="button button-primary auth-submit"
            href={user ? "/dashboard" : chatGPTSignInPath("/dashboard")}
          >
            {user ? "Open command center" : "Sign in securely"} <span>↗</span>
          </Link>
          <div className="auth-security-note">
            <span>✓</span>
            <p><strong>Protected by default</strong><small>Authentication is handled by the hosting platform. Workspace roles and durable records are enforced through Appwrite.</small></p>
          </div>
          <p className="auth-note">Need a workspace? <Link href="/pricing">Compare plans</Link></p>
        </div>
      </section>
    </main>
  );
}
