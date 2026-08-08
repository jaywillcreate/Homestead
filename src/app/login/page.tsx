import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { getCurrentUser, createSession, SESSION_COOKIE } from "@/lib/auth";
import { getAppBrand } from "@/lib/queries";
import type { User } from "@/lib/types";

export const dynamic = "force-dynamic";

async function signIn(formData: FormData) {
  "use server";
  const userId = Number(formData.get("userId"));
  if (!userId) return;
  const token = await createSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/");
}

export default async function LoginPage() {
  const current = await getCurrentUser();
  if (current) redirect("/");
  const users = await q<User>(
    "SELECT * FROM users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END"
  );
  const brand = await getAppBrand();

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "min(420px, 100%)", gap: "var(--space-6)" }}>
        <div>
          <div className="kicker">{brand.name}</div>
          <h3 style={{ marginTop: 4 }}>Who&apos;s signing in?</h3>
          <p className="card-body" style={{ marginTop: 6 }}>
            This household install uses profile-based sign-in. Roles gate what each person can
            change — the permissions matrix lives in Users &amp; roles.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {users.length === 0 && (
            <p className="card-body">
              No users yet — run <code>npm run db:seed</code> against this database to create the
              household profiles and demo data.
            </p>
          )}
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
