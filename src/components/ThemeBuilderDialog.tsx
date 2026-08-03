"use client";

import { useState } from "react";
import { useTheme } from "./ThemeProvider";
import type { Ground } from "@/lib/themes";

export function ThemeBuilderDialog({ onClose }: { onClose: () => void }) {
  const { addCustomTheme } = useTheme();
  const [name, setName] = useState("");
  const [colors, setColors] = useState<[string, string, string]>(["#7c4dff", "#00e5c0", "#ff5252"]);
  const [ground, setGround] = useState<Ground>("dark");

  const setColor = (i: number, v: string) =>
    setColors((c) => c.map((x, j) => (j === i ? v : x)) as [string, string, string]);

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="New color theme">
        <div className="dialog-title">New color theme</div>
        <p className="card-body" style={{ opacity: 0.75 }}>
          Pick three harmonious colors over a dark or light ground. Surfaces are derived from your
          primary automatically.
        </p>
        <div
          style={{
            height: 44,
            borderRadius: 10,
            background: `linear-gradient(100deg, ${colors[0]} 0 40%, ${colors[1]} 0 72%, ${colors[2]} 0)`,
          }}
        />
        <div className="field">
          <label>Theme name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sagebrush"
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)" }}>
          {(["Primary", "Support", "Signal"] as const).map((label, i) => (
            <div className="field" key={label}>
              <label>{label}</label>
              <input
                type="color"
                value={colors[i]}
                onChange={(e) => setColor(i, e.target.value)}
                style={{
                  width: "100%", height: 44, border: "none", borderRadius: 8,
                  background: "var(--surface-variant)", cursor: "pointer", padding: 6,
                }}
              />
            </div>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Ground">
          {(["dark", "light"] as const).map((g) => (
            <button key={g} className="seg-opt" aria-pressed={ground === g} onClick={() => setGround(g)}>
              {g === "dark" ? "Dark ground" : "Light ground"}
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={() => {
              addCustomTheme({ name: name.trim(), ground, colors });
              onClose();
            }}
          >
            Add theme
          </button>
        </div>
      </div>
    </div>
  );
}
