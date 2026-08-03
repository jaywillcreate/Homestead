"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { BUILT_IN_THEMES, computeThemeVars, applyThemeVars, type Theme } from "@/lib/themes";

interface ThemeCtx {
  active: string;
  themes: Theme[];
  setTheme: (name: string) => void;
  addCustomTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
export const useTheme = () => useContext(Ctx)!;

export function ThemeProvider({
  initialActive,
  initialCustoms,
  children,
}: {
  initialActive: string;
  initialCustoms: Theme[];
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(initialActive);
  const [customs, setCustoms] = useState<Theme[]>(initialCustoms);
  const themes = [...BUILT_IN_THEMES, ...customs];

  const apply = useCallback(
    (name: string, list: Theme[]) => {
      const theme = list.find((t) => t.name === name) ?? BUILT_IN_THEMES[0];
      const vars = computeThemeVars(theme);
      applyThemeVars(vars);
      try {
        localStorage.setItem("homestead-theme-vars", JSON.stringify(vars));
      } catch {}
    },
    []
  );

  useEffect(() => {
    apply(active, themes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (nextActive: string, nextCustoms: Theme[]) => {
    fetch("/api/prefs/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: nextActive, customs: nextCustoms }),
    }).catch(() => {});
  };

  const setTheme = (name: string) => {
    setActive(name);
    apply(name, themes);
    persist(name, customs);
  };

  const addCustomTheme = (t: Theme) => {
    const nextCustoms = [...customs.filter((c) => c.name !== t.name), t];
    setCustoms(nextCustoms);
    setActive(t.name);
    apply(t.name, [...BUILT_IN_THEMES, ...nextCustoms]);
    persist(t.name, nextCustoms);
  };

  return (
    <Ctx.Provider value={{ active, themes, setTheme, addCustomTheme }}>{children}</Ctx.Provider>
  );
}
