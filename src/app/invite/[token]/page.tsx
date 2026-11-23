import { redirect } from "next/navigation";
import { qOne, run } from "@/lib/db";
import { createSession, setSessionCookie, destroyUserSessions } from "@/lib/auth";
import { hashPassword, passwordProblem, sha256, MIN_PASSWORD } from "@/lib/password";
import { getAppBrand } from "@/lib/queries";

export const dynamic = "force-dynamic";

const NOW = `to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`;

interface LinkUser {
  id: number;
  name: string;
  email: string;
  status: string;
  has_password: boolean;
}

/** A link is good when its token matches, it hasn't expired, and the account isn't disabled. */
async function userForToken(token: string): Promise<LinkUser | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return qOne<LinkUser>(
    `SELECT id, name, email, status, (password_hash IS NOT NULL) AS has_password FROM users
     WHERE invite_token_hash = $1 AND invite_expires > ${NOW} AND status != 'disabled'`,
    [sha256(token)]
  );
}

async function setPassword(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const here = `/invite/${encodeURIComponent(token)}`;
  const user = await userForToken(token);
  if (!user) redirect(here);
  if (password !== confirm) redirect(`${here}?error=mismatch`);
  if (passwordProblem(password)) redirect(`${here}?error=weak`);

  await run(
    `UPDATE users SET password_hash = $1, status = 'active', invite_token_hash = NULL, invite_expires = NULL
     WHERE id = $2`,
    [hashPassword(password), user.id]
  );
  await run("DELETE FROM login_attempts WHERE email = $1", [user.email.toLowerCase()]);
  await destroyUserSessions(user.id); // a reset signs out every other device
  await setSessionCookie(await createSession(user.id));
  redirect("/");
}

export default async function InvitePage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const [user, brand] = await Promise.all([userForToken(token), getAppBrand()]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "min(440px, 100%)", gap: "var(--space-6)" }}>
        <div>
          <div className="kicker">{brand.name}</div>
          <h3 style={{ marginTop: 4 }}>
            {!user ? "This link isn't valid" : user.has_password ? "Reset your password" : `Welcome, ${user.name.split(" ")[0]}`}
          </h3>
        </div>
        {!user ? (
          <p className="card-body" style={{ margin: 0 }}>
            The link has expired, was already used, or was replaced by a newer one. Ask a household
            owner to send a fresh link from Users &amp; roles. <a href="/login">Go to sign in</a>
          </p>
        ) : (
          <form action={setPassword} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <p className="card-body" style={{ margin: 0 }}>
              Choose a password for <strong>{user.email}</strong>. You&apos;ll use this email and
              password to sign in from now on.
            </p>
            <input type="hidden" name="token" value={token} />
            {/* Lets password managers save the right username. */}
            <input type="email" name="username" value={user.email} autoComplete="username" readOnly hidden />
            <div className="field">
              <label htmlFor="password">New password</label>
              <input className="input" id="password" name="password" type="password"
                autoComplete="new-password" minLength={MIN_PASSWORD} required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input className="input" id="confirm" name="confirm" type="password"
                autoComplete="new-password" minLength={MIN_PASSWORD} required />
            </div>
            {error && (
              <div className="field-error" role="alert">
                {error === "mismatch"
                  ? "The two passwords don't match."
                  : `Use at least ${MIN_PASSWORD} characters, and not one repeated character.`}
              </div>
            )}
            <button className="btn btn-primary btn-block">Save password &amp; sign in</button>
          </form>
        )}
      </div>
    </div>
  );
}
