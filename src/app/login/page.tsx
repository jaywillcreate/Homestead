import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getCurrentUser, createSession, SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

async function signIn(formData: FormData) {
  "use server";
  const userId = Number(formData.get("userId"));
  if (!userId) return;
  const token = createSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

export default async function LoginPage() {
  const current = await getCurrentUser();
  if (current) redirect("/");
  const users = getDb()
    .prepare("SELECT * FROM users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END")
    .all() as User[];

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "min(420px, 100%)", gap: "var(--space-6)" }}>
        <div>
          <div className="kicker">Homestead</div>
          <h3 style={{ marginTop: 4 }}>Who&apos;s signing in?</h3>
          <p className="card-body" style={{ marginTop: 6 }}>
            This household install uses profile-based sign-in. Roles gate what each person can
            change — the permissions matrix lives in Users &amp; roles.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {users.map((u) => (
            <form action={signIn} key={u.id}>
              <input type="hidden" name="userId" value={u.id} />
              <button
                className="btn btn-secondary btn-block"
                style={{ justifyContent: "space-between", padding: "0 18px" }}
              >
                <span>{u.name}</span>
                <span style={{ fontSize: 11, textTransform: "capitalize", opacity: 0.75 }}>{u.role}</span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
