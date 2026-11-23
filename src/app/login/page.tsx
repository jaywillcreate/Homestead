import { redirect } from "next/navigation";
import { qOne, run } from "@/lib/db";
import { getCurrentUser, createSession, setSessionCookie } from "@/lib/auth";
import { verifyPassword, hashPassword, passwordProblem, DUMMY_HASH, MIN_PASSWORD } from "@/lib/password";
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

/**
 * First-run setup, offered on this page only while NO account has a password.
 * Sets the existing owner's password — or, on an empty database, creates the
 * owner and a starter property. The "nobody has a password" condition is
 * re-checked inside the write itself, so the form closes for good the moment
 * the first password exists and two people can't both claim it.
 */
async function setUp(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) redirect("/login?error=mismatch");
  if (passwordProblem(password)) redirect("/login?error=weak");
  const hash = hashPassword(password);

  const owner = await qOne<{ id: number }>(
    "SELECT id FROM users WHERE role = 'owner' AND status != 'disabled' ORDER BY id LIMIT 1"
  );
  let userId: number | null = null;
  if (owner) {
    userId = await run(
      `UPDATE users SET password_hash = $1, status = 'active', invite_token_hash = NULL, invite_expires = NULL
       WHERE id = $2 AND NOT EXISTS (SELECT 1 FROM users WHERE password_hash IS NOT NULL)
       RETURNING id`,
      [hash, owner.id]
    );
  } else {
    const name = String(formData.get("name") ?? "").trim().slice(0, 120);
    const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 200);
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/login?error=details");
    userId = await run(
      `INSERT INTO users (name, email, role, status, password_hash)
       SELECT $1, $2, 'owner', 'active', $3 WHERE NOT EXISTS (SELECT 1 FROM users)
       RETURNING id`,
      [name, email, hash]
    );
    if (userId) {
      const propertyId =
        (await qOne<{ id: number }>("SELECT id FROM properties ORDER BY id LIMIT 1"))?.id ??
        (await run("INSERT INTO properties (label, owner_id) VALUES ('Primary residence', $1) RETURNING id", [userId]));
      await run(
        "INSERT INTO user_properties (user_id, property_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, propertyId]
      );
    }
  }
  if (!userId) redirect("/login?error=closed");

  await setSessionCookie(await createSession(userId));
  redirect("/");
}

const ERRORS: Record<string, string> = {
  mismatch: "The two passwords don't match.",
  weak: `Use at least ${MIN_PASSWORD} characters, and not one repeated character.`,
  details: "Enter your name and a valid email address.",
  closed: "Setup is already finished — sign in with the owner's email and password.",
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
  const owner = needsSetup
    ? await qOne<{ name: string; email: string }>(
        "SELECT name, email FROM users WHERE role = 'owner' AND status != 'disabled' ORDER BY id LIMIT 1"
      )
    : null;
  // Accounts exist but none is an enabled owner: the form can't help, so say what will.
  const stuck = needsSetup && !owner && (counts?.users ?? 0) > 0;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "min(420px, 100%)", gap: "var(--space-6)" }}>
        <div>
          <div className="kicker">{brand.name}</div>
          <h3 style={{ marginTop: 4 }}>{needsSetup ? "Set up Homestead" : "Sign in"}</h3>
        </div>
        {stuck ? (
          <p className="card-body" style={{ margin: 0 }}>
            No enabled owner account exists. Run <code>npm run user:link -- you@example.com</code> for
            an existing person, or fix the accounts in the database.
          </p>
        ) : needsSetup ? (
          <form action={setUp} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <p className="card-body" style={{ margin: 0 }}>
              {owner ? (
                <>Finish setting up: choose the password for <strong>{owner.name}</strong>. You&apos;ll sign in
                with <strong>{owner.email}</strong> and this password from now on.</>
              ) : (
                <>Welcome. Create the owner account for this household to get started.</>
              )}
            </p>
            {owner ? (
              <input type="email" name="username" value={owner.email} autoComplete="username" readOnly hidden />
            ) : (
              <>
                <div className="field">
                  <label htmlFor="name">Your name</label>
                  <input className="input" id="name" name="name" autoComplete="name" required autoFocus />
                </div>
                <div className="field">
                  <label htmlFor="email">Email — you&apos;ll sign in with this</label>
                  <input className="input" id="email" name="email" type="email" autoComplete="username" required />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="password">Password — at least {MIN_PASSWORD} characters</label>
              <input className="input" id="password" name="password" type="password"
                autoComplete="new-password" minLength={MIN_PASSWORD} required autoFocus={Boolean(owner)} />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input className="input" id="confirm" name="confirm" type="password"
                autoComplete="new-password" minLength={MIN_PASSWORD} required />
            </div>
            {error && <div className="field-error" role="alert">{ERRORS[error] ?? "Setup failed."}</div>}
            <button className="btn btn-primary btn-block">Save password &amp; sign in</button>
            <p className="card-body" style={{ margin: 0, fontSize: 12.5 }}>
              This setup step appears only until the first password is saved.
            </p>
          </form>
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
