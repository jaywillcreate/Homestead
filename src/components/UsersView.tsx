"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus } from "@phosphor-icons/react";
import { relativeTime, initials } from "@/lib/format";
import { MATRIX_ROWS, PERMISSIONS } from "@/lib/permissions";
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
  const [preview, setPreview] = useState<Role>(me.role);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "viewer" as Role });
  const [error, setError] = useState<string | null>(null);

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
          {isOwner && (
            <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
              <Plus size={15} /> Invite
            </button>
          )}
        </div>
        {error && <div className="field-error">{error}</div>}
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Properties</th><th>Last active</th>
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
