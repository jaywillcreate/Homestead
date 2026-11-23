"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Minus, Plus, DeviceMobile, PaperPlaneTilt, SealCheck, Copy, EnvelopeSimple,
  GearSix, Key, Trash, LinkSimple, Prohibit,
} from "@phosphor-icons/react";
import { relativeTime, initials } from "@/lib/format";
import { MATRIX_ROWS, PERMISSIONS, can } from "@/lib/permissions";
import { useUser } from "./UserProvider";
import type { Role, User } from "@/lib/types";

const ROLES: Role[] = ["owner", "manager", "viewer"];
const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including people, properties and branding.",
  manager: "Day-to-day work: contractors, invoices, photos, bids, schedule.",
  viewer: "Read-only access to records and reports.",
};

type Member = User & { properties: number; has_password: boolean; link_pending: boolean };

function roleTag(role: string) {
  if (role === "owner") return <span className="tag tag-accent">Owner</span>;
  if (role === "manager") return <span className="tag tag-accent-2">Manager</span>;
  return <span className="tag tag-neutral">Viewer</span>;
}

function statusTag(u: Member) {
  if (u.status === "disabled") return <span className="tag tag-warn">Disabled</span>;
  if (u.status === "invited") {
    return u.link_pending
      ? <span className="tag tag-outline">Invite sent</span>
      : <span className="tag tag-warn">Invite expired</span>;
  }
  return <span className="tag tag-accent">Active</span>;
}

export function UsersView({
  users, currentUserId,
}: {
  users: Member[];
  currentUserId: number;
}) {
  const router = useRouter();
  const me = useUser();
  const isOwner = me.role === "owner";
  const canNotify = can(me.role, "send_notifications");
  const [preview, setPreview] = useState<Role>(me.role);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [manageId, setManageId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const self = users.find((u) => u.id === currentUserId) ?? null;
  const managed = users.find((u) => u.id === manageId) ?? null;
  const activeOwners = users.filter((u) => u.role === "owner" && u.status === "active").length;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <div className="card-title">People</div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={() => setPasswordOpen(true)}>
              <Key size={15} /> Change my password
            </button>
            {canNotify && (
              <button className="btn btn-secondary" onClick={() => setNotifyOpen(true)}>
                <PaperPlaneTilt size={15} /> Notify
              </button>
            )}
            {isOwner && (
              <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
                <Plus size={15} /> Add person
              </button>
            )}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last active</th>
                {isOwner && <th aria-label="Manage" />}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.status === "disabled" ? 0.6 : 1 }}>
                  <td>
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(u.name)}</span>
                      {u.name}
                      {u.id === currentUserId && <span className="text-muted" style={{ fontSize: 11 }}>(you)</span>}
                    </span>
                  </td>
                  <td className="text-muted" style={{ fontSize: 13 }}>{u.email}</td>
                  <td style={{ fontSize: 13 }}>
                    <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {u.phone ? (
                        <>
                          <span className="num">{u.phone}</span>
                          {u.phone_verified ? (
                            <span className="tag tag-accent" title="Authenticated with an SMS code">
                              <SealCheck size={11} /> Verified
                            </span>
                          ) : (
                            <span className="tag tag-neutral">Unverified</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {u.id === currentUserId && (
                        <button className="btn btn-ghost" style={{ minHeight: 26, padding: "2px 8px", fontSize: 11.5 }}
                          onClick={() => setPhoneOpen(true)}>
                          <DeviceMobile size={13} />
                          {u.phone ? (u.phone_verified ? "Change" : "Verify") : "Add phone"}
                        </button>
                      )}
                    </span>
                  </td>
                  <td>{roleTag(u.role)}</td>
                  <td>{statusTag(u)}</td>
                  <td className="text-muted" style={{ fontSize: 12.5 }}>
                    {u.last_active ? relativeTime(u.last_active) : "Never"}
                  </td>
                  {isOwner && (
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-ghost" style={{ minHeight: 30, padding: "2px 10px", fontSize: 12.5 }}
                        onClick={() => setManageId(u.id)}>
                        <GearSix size={14} /> Manage
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isOwner && (
          <p className="card-body" style={{ margin: 0, fontSize: 12.5 }}>
            Adding a person creates a one-time link you send them; they choose their own password
            from it. Nobody can sign in as them before that, and links expire after 7 days.
          </p>
        )}
      </div>

      <div className="split-2" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <div className="card">
          <div className="card-title">Permissions matrix</div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Capability</th>
                  {ROLES.map((r) => (
                    <th key={r} style={{ textAlign: "center" }}>{r[0].toUpperCase() + r.slice(1)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX_ROWS.map((row) => (
                  <tr key={row.capability}>
                    <td style={{ fontSize: 13 }}>{row.label}</td>
                    {ROLES.map((r) => (
                      <td key={r} style={{ textAlign: "center" }}>
                        {PERMISSIONS[row.capability].includes(r) ? (
                          <Check size={15} style={{ color: "var(--color-accent-text)" }} />
                        ) : (
                          <Minus size={15} style={{ opacity: 0.35 }} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="card-body" style={{ margin: 0 }}>
            The matrix is enforced server-side on every API call — the UI hides what a role can’t do,
            and the backend rejects it regardless.
          </p>
        </div>

        <div className="card">
          <div className="card-title">Role preview</div>
          <p className="card-body" style={{ margin: 0 }}>
            Preview what each tier can do. Your own session stays{" "}
            <strong style={{ textTransform: "capitalize" }}>{me.role}</strong>.
          </p>
          <div className="seg" role="group" aria-label="Role preview">
            {ROLES.map((r) => (
              <button key={r} className="seg-opt" aria-pressed={preview === r} onClick={() => setPreview(r)}>
                {r[0].toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {MATRIX_ROWS.map((row) => {
              const allowed = PERMISSIONS[row.capability].includes(preview);
              return (
                <div key={row.capability} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, opacity: allowed ? 1 : 0.45 }}>
                  {allowed
                    ? <Check size={13} style={{ color: "var(--color-accent-text)", flex: "none" }} />
                    : <Minus size={13} style={{ flex: "none" }} />}
                  {row.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {phoneOpen && self && (
        <PhoneDialog
          currentPhone={self.phone}
          verified={Boolean(self.phone_verified)}
          onClose={() => setPhoneOpen(false)}
          onDone={() => { setPhoneOpen(false); router.refresh(); }}
        />
      )}
      {notifyOpen && (
        <NotifyDialog
          users={users}
          currentUserId={currentUserId}
          onClose={() => setNotifyOpen(false)}
        />
      )}
      {passwordOpen && (
        <PasswordDialog
          onClose={() => setPasswordOpen(false)}
          onDone={() => { setPasswordOpen(false); showToast("Password changed. Other devices were signed out."); }}
        />
      )}
      {inviteOpen && (
        <InviteDialog
          onClose={() => { setInviteOpen(false); router.refresh(); }}
        />
      )}
      {managed && (
        <ManageDialog
          user={managed}
          isSelf={managed.id === currentUserId}
          isOnlyOwner={managed.role === "owner" && managed.status === "active" && activeOwners <= 1}
          onClose={() => setManageId(null)}
          onChanged={(msg, close) => {
            if (close) setManageId(null);
            if (msg) showToast(msg);
            router.refresh();
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ————— one-time link: shown once, copied or emailed by the owner ————— */

function LinkBox({ path, name, email, kind }: { path: string; name: string; email: string; kind: "invite" | "reset" }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const subject = kind === "invite" ? "Your Homestead invite" : "Reset your Homestead password";
  const body =
    kind === "invite"
      ? `Hi ${name.split(" ")[0]},\n\nI've added you to our Homestead household. Open this link to choose your password (it works once and expires in 7 days):\n\n${url}\n`
      : `Hi ${name.split(" ")[0]},\n\nUse this link to set a new Homestead password (it works once and expires in 7 days):\n\n${url}\n`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <div className="field">
        <label>{kind === "invite" ? "Invite link" : "Password reset link"} for {name}</label>
        <input className="input num" readOnly value={url} style={{ fontSize: 12 }}
          onFocus={(e) => e.currentTarget.select()} aria-label="One-time link" />
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={copy}>
          <Copy size={14} /> {copied ? "Copied" : "Copy link"}
        </button>
        <a className="btn btn-secondary"
          href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
          <EnvelopeSimple size={14} /> Email it
        </a>
      </div>
      <p className="card-body" style={{ margin: 0, fontSize: 12.5 }}>
        This link is shown only now. It works once, expires in 7 days, and lets whoever opens it
        set the password for {email} — send it to them directly.
      </p>
    </div>
  );
}

/* ————— add a person ————— */

function InviteDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", role: "viewer" as Role });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Could not add this person"); return; }
      setLink(body.invite_path);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Add person">
        <div className="dialog-title">{link ? `${form.name} was added` : "Add a person"}</div>
        {link ? (
          <>
            <LinkBox path={link} name={form.name} email={form.email} kind="invite" />
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => { setLink(null); setForm({ name: "", email: "", role: "viewer" }); }}>
                Add another
              </button>
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label>Name</label>
              <input className="input" value={form.name} autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Email — they sign in with this</label>
              <input className="input" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Role</label>
              <div className="seg">
                {ROLES.map((r) => (
                  <button key={r} className="seg-opt" aria-pressed={form.role === r}
                    onClick={() => setForm({ ...form, role: r })}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
              <span className="text-muted" style={{ fontSize: 12 }}>{ROLE_HELP[form.role]}</span>
            </div>
            {error && <div className="field-error">{error}</div>}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !form.name.trim() || !form.email.trim()} onClick={send}>
                {busy ? "Adding…" : "Add & create invite link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ————— manage one person: details, role, link, disable, remove ————— */

function ManageDialog({
  user, isSelf, isOnlyOwner, onClose, onChanged,
}: {
  user: Member;
  isSelf: boolean;
  isOnlyOwner: boolean;
  onClose: () => void;
  onChanged: (msg: string | null, close: boolean) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [link, setLink] = useState<{ path: string; kind: "invite" | "reset" } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== user.name || email.trim().toLowerCase() !== user.email.toLowerCase() || role !== user.role;

  async function call(url: string, method: string, payload?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        ...(payload ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "That didn't work — try again"); return null; }
      return body as Record<string, unknown>;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const ok = await call(`/api/users/${user.id}`, "PATCH", { name: name.trim(), email: email.trim(), role });
    if (ok) onChanged("Saved.", true);
  }
  async function setStatus(status: "active" | "disabled") {
    const ok = await call(`/api/users/${user.id}`, "PATCH", { status });
    if (ok) onChanged(status === "disabled" ? `${user.name} can no longer sign in.` : `${user.name}'s access was restored.`, true);
  }
  async function makeLink() {
    const body = await call(`/api/users/${user.id}/invite`, "POST");
    if (body) {
      setLink({ path: String(body.invite_path), kind: body.kind === "reset" ? "reset" : "invite" });
      onChanged(null, false);
    }
  }
  async function remove() {
    const ok = await call(`/api/users/${user.id}`, "DELETE");
    if (ok) onChanged(`${user.name} was removed.`, true);
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={`Manage ${user.name}`}
        style={{ width: "min(520px, 100%)", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="dialog-title">Manage {user.name}{isSelf ? " (you)" : ""}</div>
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email — used to sign in</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Role</label>
          <div className="seg">
            {ROLES.map((r) => (
              <button key={r} className="seg-opt" aria-pressed={role === r}
                disabled={isOnlyOwner && r !== "owner"} onClick={() => setRole(r)}>
                {r[0].toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {isOnlyOwner ? "The only owner can't be demoted — make someone else an owner first." : ROLE_HELP[role]}
          </span>
        </div>

        <div className="hr" />
        {link ? (
          <LinkBox path={link.path} name={user.name} email={user.email} kind={link.kind} />
        ) : (
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {user.status !== "disabled" && (
              <button className="btn btn-secondary" disabled={busy} onClick={makeLink}>
                <LinkSimple size={14} />
                {user.has_password ? "Create password reset link" : user.link_pending ? "Create a new invite link" : "Create invite link"}
              </button>
            )}
            {!isSelf && !isOnlyOwner && (
              user.status === "disabled" ? (
                <button className="btn btn-secondary" disabled={busy} onClick={() => setStatus("active")}>
                  <Check size={14} /> Restore access
                </button>
              ) : (
                <button className="btn btn-secondary" disabled={busy} onClick={() => setStatus("disabled")}
                  title="Blocks sign-in and signs them out; nothing is deleted">
                  <Prohibit size={14} /> Disable sign-in
                </button>
              )
            )}
          </div>
        )}

        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions" style={{ justifyContent: "space-between" }}>
          {isSelf || isOnlyOwner ? <span /> : confirmRemove ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5 }}>Remove {user.name} for good?</span>
              <button className="btn btn-danger" disabled={busy} onClick={remove}>
                <Trash size={14} /> Remove
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmRemove(false)}>Keep</button>
            </div>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirmRemove(true)}>
              <Trash size={14} /> Remove person
            </button>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
            <button className="btn btn-primary" disabled={busy || !dirty || !name.trim() || !email.trim()} onClick={save}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ————— change your own password ————— */

function PasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (next !== confirm) { setError("The two new passwords don't match"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/users/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Could not change the password"); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Change password">
        <div className="dialog-title">Change my password</div>
        <div className="field">
          <label>Current password</label>
          <input className="input" type="password" autoComplete="current-password" value={current}
            onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>New password — at least 10 characters</label>
          <input className="input" type="password" autoComplete="new-password" value={next}
            onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input className="input" type="password" autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !current || !next || !confirm} onClick={save}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ————— phone: add & authenticate your own number ————— */

function PhoneDialog({
  currentPhone, verified, onClose, onDone,
}: {
  currentPhone: string | null;
  verified: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"enter" | "code">(currentPhone && !verified ? "code" : "enter");
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/users/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Could not send the code"); return; }
      setDevCode(body.dev_code ?? null);
      setStep("code");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/users/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Verification failed"); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  async function removePhone() {
    setBusy(true);
    try {
      await fetch("/api/users/phone", { method: "DELETE" });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Phone number">
        <div className="dialog-title">Phone notifications</div>
        {step === "enter" ? (
          <>
            <p className="card-body" style={{ margin: 0 }}>
              Add your mobile number and authenticate it with a texted code. Only verified numbers
              can receive Homestead notifications.
            </p>
            <div className="field">
              <label>Mobile number</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="(210) 555-0147" autoFocus />
            </div>
            {error && <div className="field-error">{error}</div>}
            <div className="dialog-actions" style={{ justifyContent: currentPhone ? "space-between" : "flex-end" }}>
              {currentPhone && (
                <button className="btn btn-danger" disabled={busy} onClick={removePhone}>Remove phone</button>
              )}
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" disabled={busy || !phone.trim()} onClick={sendCode}>
                  {busy ? "Sending…" : "Text me a code"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="card-body" style={{ margin: 0 }}>
              Enter the 6-digit code we texted to <strong className="num">{phone || currentPhone}</strong>.
            </p>
            {devCode && (
              <p className="card-body" style={{ margin: 0, fontSize: 12.5 }}>
                SMS isn&apos;t configured on this server, so the code is shown here for testing:{" "}
                <strong className="num">{devCode}</strong>
              </p>
            )}
            <div className="field">
              <label>Verification code</label>
              <input className="input num" inputMode="numeric" maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" autoFocus />
            </div>
            {error && <div className="field-error">{error}</div>}
            <div className="dialog-actions" style={{ justifyContent: "space-between" }}>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setStep("enter")}>
                Change number
              </button>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={verify}>
                  {busy ? "Checking…" : "Verify"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ————— notify: push a message to members with authenticated phones ————— */

function NotifyDialog({
  users, currentUserId, onClose,
}: {
  users: User[];
  currentUserId: number;
  onClose: () => void;
}) {
  const eligible = users.filter((u) => u.phone && u.phone_verified);
  const [selected, setSelected] = useState<number[]>(
    eligible.filter((u) => u.id !== currentUserId).map((u) => u.id)
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ name: string; status: string; error?: string }[] | null>(null);

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_ids: selected, message: message.trim() }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Send failed"); return; }
      setResults(body.results);
    } finally {
      setBusy(false);
    }
  }

  const STATUS_TEXT: Record<string, string> = {
    sent: "Sent", simulated: "Sent (simulated — SMS not configured)", failed: "Failed", skipped: "Skipped",
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Send notification">
        <div className="dialog-title">Send notification</div>
        {results ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  {r.status === "sent" || r.status === "simulated"
                    ? <Check size={14} style={{ color: "var(--color-accent-text)", flex: "none" }} />
                    : <Minus size={14} style={{ opacity: 0.5, flex: "none" }} />}
                  <span style={{ flex: 1 }}>{r.name}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {STATUS_TEXT[r.status] ?? r.status}{r.status === "failed" && r.error ? ` — ${r.error}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p className="card-body" style={{ margin: 0 }}>
              Texts go only to members with an authenticated phone number.
            </p>
            {eligible.length === 0 ? (
              <p className="card-body" style={{ margin: 0 }}>
                Nobody has a verified phone yet — members can add one from the People table.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {eligible.map((u) => (
                  <label key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                    <span style={{ flex: 1 }}>
                      {u.name}{u.id === currentUserId ? " (you)" : ""}
                    </span>
                    <span className="text-muted num" style={{ fontSize: 12 }}>{u.phone}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="field">
              <label>Message</label>
              <textarea className="input" rows={3} maxLength={480} value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Plumber arrives tomorrow 8–10 AM — please leave the side gate unlocked." />
            </div>
            {error && <div className="field-error">{error}</div>}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !message.trim() || selected.length === 0} onClick={send}>
                <PaperPlaneTilt size={15} /> {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
