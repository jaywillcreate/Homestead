import { redirect } from "next/navigation";
import { qOne, run } from "@/lib/db";
import { getCurrentUser, createSession, setSessionCookie } from "@/lib/auth";
import { verifyPassword, DUMMY_HASH } from "@/lib/password";
import { getAppBrand } from "@/lib/queries";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 8; // per email, per 15 minutes
const WINDOW = `to_char(now() at time zone 'utc' - interval '15 minutes', 'YYYY-MM-DD HH24:MI:SS')`;

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=missing");

  const recent = await qOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM login_attempts WHERE email = $1 AND created_at > ${WINDOW}`,
    [email]
  );
  if ((recent?.n ?? 0) >= MAX_ATTEMPTS) redirect("/login?error=locked");

  const user = await qOne<{ id: number; password_hash: string | null; status: string }>(
    "SELECT id, password_hash, status FROM users WHERE lower(email) = $1",
    [email]
  );
  // Always run one hash comparison so a missing account takes as long as a wrong password.
  const matches = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.password_hash || user.status !== "active" || !matches) {
    await run("INSERT INTO login_attempts (email) VALUES ($1)", [email]);
    redirect("/login?error=invalid");
  }

  await run(`DELETE FROM login_attempts WHERE email = $1 OR created_at <= ${WINDOW}`, [email]);
  await setSessionCookie(await createSession(user.id));
  redirect("/");
}

const ERRORS: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "That email and password don't match an active account.",
  locked: "Too many attempts. Wait 15 minutes and try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const current = await getCurrentUser();
  if (current) redirect("/");
  const { error } = await searchParams;
  const brand = await getAppBrand();
  const counts = await qOne<{ users: number; with_password: number }>(
    `SELECT COUNT(*)::int AS users,
            (COUNT(*) FILTER (WHERE password_hash IS NOT NULL))::int AS with_password FROM users`
  );
  const needsSetup = (counts?.with_password ?? 0) === 0;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "min(420px, 100%)", gap: "var(--space-6)" }}>
        <div>
          <div className="kicker">{brand.name}</div>
          <h3 style={{ marginTop: 4 }}>Sign in</h3>
        </div>
        {needsSetup ? (
          <p className="card-body" style={{ margin: 0 }}>
            {(counts?.users ?? 0) === 0 ? (
              <>No accounts exist yet. Run <code>npm run db:seed</code> to create the owner account — it
              prints a one-time link for setting the password.</>
            ) : (
              <>Nobody has set a password yet. Run <code>npm run user:link -- you@example.com</code> to
              print a one-time set-password link for the owner account.</>
            )}
          </p>
        ) : (
          <form action={signIn} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" autoComplete="username" required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && <div className="field-error" role="alert">{ERRORS[error] ?? "Sign-in failed."}</div>}
            <button className="btn btn-primary btn-block">Sign in</button>
            <p className="card-body" style={{ margin: 0, fontSize: 12.5 }}>
              Forgot your password? Ask a household owner for a reset link (Users &amp; roles → Manage).
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
