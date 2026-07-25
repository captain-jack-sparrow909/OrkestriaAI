"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function SignInPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

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
        <form className="auth-form" onSubmit={handleSubmit}>
          <span className="kicker">WELCOME TO ORKESTRIA</span>
          <h1>Continue to your workspace</h1>
          <p>Start orchestrating safe, useful AI work in minutes.</p>
          {submitted ? (
            <div className="auth-success" role="status">
              Your workspace access request is ready. Appwrite authentication will complete this flow when your project keys are connected.
            </div>
          ) : (
            <>
              <button type="button" className="oauth-button"><span>G</span> Continue with Google</button>
              <div className="divider">or use email</div>
              <label className="field">
                <span>Work email</span>
                <input type="email" placeholder="you@company.com" required />
              </label>
              <label className="field">
                <span>Password</span>
                <input type="password" placeholder="At least 8 characters" minLength={8} required />
              </label>
              <button className="button button-primary auth-submit" type="submit">Continue <span>↗</span></button>
            </>
          )}
          <p className="auth-note">New to OrkestriaAI? <Link href="/pricing">Create a workspace</Link></p>
        </form>
      </section>
    </main>
  );
}
