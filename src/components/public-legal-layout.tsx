import Link from "next/link";
import type { ReactNode } from "react";
import {
  COMPANY_WEBSITE_URL,
  LEGAL_EFFECTIVE_DATE,
} from "@/lib/legal";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/data-deletion", label: "Data Deletion" },
] as const;

type PublicLegalFooterProps = {
  compact?: boolean;
};

export function PublicLegalFooter({ compact = false }: PublicLegalFooterProps) {
  return (
    <footer className={`public-legal-footer${compact ? " is-compact" : ""}`}>
      <nav className="public-legal-footer-links" aria-label="Legal documents">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      {!compact ? (
        <div className="public-legal-footer-meta">
          <Link href="/login">Return to sign in</Link>
          <a href={COMPANY_WEBSITE_URL} target="_blank" rel="noopener noreferrer">
            NC Tile Pros LLC
          </a>
        </div>
      ) : null}
    </footer>
  );
}

type PublicLegalPageProps = {
  title: string;
  summary: ReactNode;
  children: ReactNode;
};

export function PublicLegalPage({
  title,
  summary,
  children,
}: PublicLegalPageProps) {
  return (
    <main className="public-legal-shell">
      <header className="public-legal-header">
        <Link href="/login" className="public-legal-brand" aria-label="Social Media Manager sign in">
          <span className="public-legal-brand-mark" aria-hidden="true">
            SMM
          </span>
          <span>
            <strong>Social Media Manager</strong>
            <small>NC Tile Pros LLC</small>
          </span>
        </Link>
        <Link href="/login" className="ghost-link-button public-legal-login-link">
          Application sign in
        </Link>
      </header>

      <article className="panel public-legal-document">
        <div className="public-legal-hero">
          <span className="public-legal-eyebrow">Internal business application</span>
          <h1>{title}</h1>
          <p className="public-legal-effective-date">
            <strong>Effective date:</strong> {LEGAL_EFFECTIVE_DATE}
          </p>
          <div className="public-legal-summary">{summary}</div>
        </div>

        <div className="public-legal-content">{children}</div>
      </article>

      <PublicLegalFooter />
    </main>
  );
}
