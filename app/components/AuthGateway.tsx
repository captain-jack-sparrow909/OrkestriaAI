import Link from "next/link";
import {
  chatGPTSignInPath,
  type ChatGPTUser,
} from "../chatgpt-auth";

type AuthGatewayProps = {
  mode: "sign-in" | "sign-up";
  user: ChatGPTUser | null;
};

export function AuthGateway({ mode, user }: AuthGatewayProps) {
  const creatingAccount = mode === "sign-up";
  const authenticationPath = chatGPTSignInPath("/dashboard");

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <Link href="/" className="brand">
          <span className="brand-glyph">O</span>
          <span>
            orkestria<span className="brand-ai">AI</span>
          </span>
        </Link>
        <div className="auth-orbit" aria-hidden="true">
          <span>IDENTITY</span>
          <i />
          <i />
          <i />
          <b>VERIFIED</b>
        </div>
        <div className="auth-quote">
          <span>“</span>
          <blockquote>
            One verified identity. Every agent, approval, and decision held
            accountable.
          </blockquote>
          <p>ORKestriaAI · TRUSTED AUTONOMY</p>
        </div>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-form">
          <div className="auth-switcher" aria-label="Authentication options">
            <Link
              href="/sign-in"
              className={!creatingAccount ? "active" : undefined}
              aria-current={!creatingAccount ? "page" : undefined}
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className={creatingAccount ? "active" : undefined}
              aria-current={creatingAccount ? "page" : undefined}
            >
              Create account
            </Link>
          </div>

          <span className="kicker">
            {user
              ? "IDENTITY VERIFIED"
              : creatingAccount
                ? "CREATE YOUR WORKSPACE"
                : "WELCOME BACK"}
          </span>
          <h1>
            {user
              ? "Your command center is ready"
              : creatingAccount
                ? "Start orchestrating with confidence"
                : "Continue to your workspace"}
          </h1>
          <p>
            {user
              ? `Signed in as ${user.email}.`
              : creatingAccount
                ? "Use your ChatGPT identity to create secure access to OrkestriaAI. New ChatGPT users can create an account during the next step."
                : "Use the ChatGPT identity connected to your OrkestriaAI workspace. You will return here automatically after verification."}
          </p>

          {user ? (
            <Link className="button button-primary auth-submit" href="/dashboard">
              Open command center <span aria-hidden="true">↗</span>
            </Link>
          ) : (
            <a
              className="button button-primary auth-submit"
              href={authenticationPath}
            >
              {creatingAccount
                ? "Continue to create account"
                : "Continue with ChatGPT"}{" "}
              <span aria-hidden="true">↗</span>
            </a>
          )}

          <div className="auth-journey" aria-label="Secure access journey">
            <div>
              <span>01</span>
              <p>
                <strong>Verify with ChatGPT</strong>
                <small>Sign in or create an account securely.</small>
              </p>
            </div>
            <i aria-hidden="true">→</i>
            <div>
              <span>02</span>
              <p>
                <strong>Enter OrkestriaAI</strong>
                <small>Workspace access and roles are checked.</small>
              </p>
            </div>
          </div>

          <div className="auth-security-note">
            <span>✓</span>
            <p>
              <strong>No separate OrkestriaAI password</strong>
              <small>
                Authentication is handled by ChatGPT. Appwrite enforces
                workspace roles and protects durable records after sign-in.
              </small>
            </p>
          </div>
          <p className="auth-note">
            {creatingAccount ? "Already have access? " : "New to OrkestriaAI? "}
            <Link href={creatingAccount ? "/sign-in" : "/sign-up"}>
              {creatingAccount ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
