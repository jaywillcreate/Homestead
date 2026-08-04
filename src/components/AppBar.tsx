"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MagnifyingGlass, Bell, Plus } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";
import { useCan } from "./UserProvider";
import { ThemeBuilderDialog } from "./ThemeBuilderDialog";

const TITLES: [RegExp, string, string][] = [
  [/^\/$/, "Overview", "Dashboard"],
  [/^\/schedule/, "Overview", "Maintenance schedule"],
  [/^\/discover/, "Overview", "Find local pros"],
  [/^\/materials/, "Overview", "Materials estimator"],
  [/^\/contractors\/new/, "Admin", "Add contractor"],
  [/^\/contractors\/\d+\/edit/, "Admin", "Edit contractor"],
  [/^\/contractors\/\d+/, "Contractors", "Contractor profile"],
  [/^\/contractors/, "Contractors", "Directory"],
  [/^\/invoices/, "Records", "Invoices"],
  [/^\/photos/, "Records", "Job photos"],
  [/^\/reports/, "Records", "Maintenance reports"],
  [/^\/users/, "Admin", "Users & permissions"],
];

export function AppBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { active, themes, setTheme } = useTheme();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [query, setQuery] = useState("");
  const canEdit = useCan("edit_contractors");

  const [crumb, title] = (() => {
    for (const [re, c, t] of TITLES) if (re.test(pathname)) return [c, t];
    return ["Overview", "Homestead"];
  })();

  return (
    <header className="appbar">
      <div className="appbar-title">
        <div className="appbar-crumb">{crumb}</div>
        <h4>{title}</h4>
      </div>
      <form
        className="appbar-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) router.push(`/contractors?q=${encodeURIComponent(query.trim())}`);
        }}
      >
        <MagnifyingGlass size={15} />
        <input
          className="input"
          placeholder="Search contractors, invoices, jobs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search"
        />
      </form>
      <div className="swatch-row" role="group" aria-label="Theme">
        {themes.map((t) => (
          <button
            key={t.name}
            className="swatch"
            title={t.name}
            aria-pressed={active === t.name}
            style={{
              background: `conic-gradient(${t.colors[0]} 0 33%, ${t.colors[1]} 0 66%, ${t.colors[2]} 0)`,
              boxShadow:
                active === t.name
                  ? `0 0 0 2px var(--color-bg), 0 0 0 3.5px ${t.colors[0]}, 0 0 12px ${t.colors[0]}`
                  : undefined,
            }}
            onClick={() => setTheme(t.name)}
          />
        ))}
        <button className="swatch-add" title="New color theme" onClick={() => setBuilderOpen(true)}>
          <Plus size={10} />
        </button>
      </div>
      <button className="btn btn-icon" title="Notifications">
        <Bell size={18} />
      </button>
      {canEdit && (
        <button className="btn btn-primary" onClick={() => router.push("/contractors/new")}>
          <Plus size={15} /> New
        </button>
      )}
      {builderOpen && <ThemeBuilderDialog onClose={() => setBuilderOpen(false)} />}
    </header>
  );
}
