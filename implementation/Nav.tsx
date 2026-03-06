"use client";
// frontend/components/Nav.tsx
// Clean top nav — logo left, actions right. Collapses on mobile.

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logOut, getCurrentUser } from "@/lib/firebase";

const NAV_LINKS = [
  { href: "/dashboard",  label: "Dashboard"  },
  { href: "/scan",       label: "Scan Card"  },
  { href: "/map",        label: "Centers"    },
  { href: "/community",  label: "Community"  },
  { href: "/glossary",   label: "Glossary"   },
];

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "hi", label: "हि" },
  { code: "mr", label: "म" },
  { code: "ta", label: "த" },
  { code: "bn", label: "বা" },
  { code: "te", label: "తె" },
];

interface Props {
  language?: string;
  onLanguageChange?: (lang: string) => void;
}

export default function Nav({ language = "en", onLanguageChange }: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const user = getCurrentUser();

  return (
    <header style={{ borderBottom: "1px solid var(--border)", background: "#fff" }}>
      <div
        className="page-content"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "56px",
        }}
      >
        {/* Logo */}
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
          <span style={{
            width: "24px", height: "24px", background: "var(--ink)", borderRadius: "6px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L9.5 4.5H11.5L12.5 7L11.5 9.5H9.5L7 13L4.5 9.5H2.5L1.5 7L2.5 4.5H4.5L7 1Z"
                fill="white" fillOpacity="0.9" />
            </svg>
          </span>
          <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
            VaxGuard
          </span>
        </Link>

        {/* Desktop nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: "2px" }} className="hidden md:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: active ? 500 : 400,
                  color: active ? "var(--ink)" : "var(--ink-3)",
                  padding: "0.375rem 0.75rem",
                  borderRadius: "6px",
                  textDecoration: "none",
                  background: active ? "var(--surface)" : "transparent",
                  transition: "all 0.12s",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Language picker */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="btn-ghost"
              style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.04em" }}
            >
              {LANGUAGES.find(l => l.code === language)?.label || "EN"}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {langOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
                background: "#fff", border: "1px solid var(--border)", borderRadius: "10px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.08)", padding: "4px", minWidth: "80px",
              }}>
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => { onLanguageChange?.(l.code); setLangOpen(false); }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "6px 10px", fontSize: "0.8125rem",
                      color: l.code === language ? "var(--ink)" : "var(--ink-3)",
                      fontWeight: l.code === language ? 500 : 400,
                      background: l.code === language ? "var(--surface)" : "transparent",
                      borderRadius: "6px", border: "none", cursor: "pointer",
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User */}
          {user && (
            <button
              onClick={logOut}
              className="btn-ghost"
              style={{ fontSize: "0.75rem" }}
            >
              Sign out
            </button>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="btn-ghost md:hidden"
            aria-label="Menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              {menuOpen
                ? <path d="M3 3L15 15M3 15L15 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                : <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "8px var(--page-pad) 12px" }} className="md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                display: "block", padding: "10px 8px",
                fontSize: "0.9375rem", color: pathname === link.href ? "var(--ink)" : "var(--ink-3)",
                fontWeight: pathname === link.href ? 500 : 400, textDecoration: "none",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
