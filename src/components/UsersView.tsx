"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, DeviceMobile, PaperPlaneTilt, SealCheck } from "@phosphor-icons/react";
import { relativeTime, initials } from "@/lib/format";
import { MATRIX_ROWS, PERMISSIONS, can } from "@/lib/permissions";
import { useUser } from "./UserProvider";
import type { Role, User } from "@/lib/types";

const ROLES: Role[] = ["owner", "manager", "viewer"];

function roleTag(role: string) {
  if (role === "owner") return <span className="tag tag-accent">Owner</span>;
  if (role === "manager") return <span className="tag tag-accent-2">Manager</span>;
  return <span className="tag tag-neutral">Viewer</span>;
}

export function UsersView({
  users, currentUserId,
}: {
  users: (User & { properties: number })[];
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
  const [invite, setInvite] = useState({ name: "", email: "", role: "viewer" as Role });
  const [error, setError] = useState<string | null>(null);
  const self = users.find((u) => u.id === currentUserId) ?? null;

  async function sendInvite() {
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invite),
    });
    const body = await res.json();
    if (!res.ok) { setError(body.error ?? "Invite failed"); return; }
    setInviteOpen(false);
    setInvite({ name: "", email: "", role: "viewer" });
    router.refresh();
  }

  async function changeRole(userId: number, role: Role) {
    setError(null);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const body = await res.json();
    if (!res.ok) { setError(body.error ?? "Role change failed"); return; }
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="card-title">People</div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {canNotify && (
              <button className="btn btn-secondary" onClick={() => setNotifyOpen(true)}>
                <PaperPlaneTilt size={15} /> Notify
              </button>
            )}
            {isOwner && (
              <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
                <Plus size={15} /> Invite
              </button>
            )}
          </div>
        </div>
        {error && <div className="field-error">{error}</div>}
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Properties</th><th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
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
                  <td>
                    {isOwner && u.id !== currentUserId ? (
                      <select
                        className="input"
                        style={{ minHeight: 32, padding: "2px 10px", width: 110, fontSize: 12.5 }}
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                      </select>
                    ) : (
                      roleTag(u.role)
                    )}
                  </td>
                  <td className="num">{u.properties}</td>
                  <td className="text-muted" style={{ fontSize: 12.5 }}>
                    {u.last_active ? relativeTime(u.last_active) : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      {inviteOpen && (
        <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && setInviteOpen(false)}>
          <div className="dialog" role="dialog" aria-label="Invite person">
            <div className="dialog-title">Invite to Homestead</div>
            <div className="field">
              <label>Name</label>
              <input className="input" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Role</label>
              <div className="seg">
                {ROLES.map((r) => (
                  <button key={r} className="seg-opt" aria-pressed={invite.role === r}
                    onClick={() => setInvite({ ...invite, role: r })}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {error && <div className="field-error">{error}</div>}
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!invite.name || !invite.email} onClick={sendInvite}>
                Send invite
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
  users: (User & { properties: number })[];
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
