import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { UserProvider } from "@/components/UserProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NavRail } from "@/components/NavRail";
import { AppBar } from "@/components/AppBar";
import type { Role } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let prefs: { active?: string; customs?: never[] } = {};
  try {
    prefs = JSON.parse(user.theme_prefs || "{}");
  } catch {}

  return (
    <UserProvider
      user={{ id: user.id, name: user.name, email: user.email, role: user.role as Role }}
    >
      <ThemeProvider initialActive={prefs.active ?? "Nocturne"} initialCustoms={prefs.customs ?? []}>
        <div className="shell">
          <NavRail />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <AppBar />
            <main className="canvas" style={{ flex: 1 }}>{children}</main>
          </div>
        </div>
      </ThemeProvider>
    </UserProvider>
  );
}
