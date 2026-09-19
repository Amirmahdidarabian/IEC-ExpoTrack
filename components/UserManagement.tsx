"use client";

import { FormEvent, useState } from "react";
import { Check, KeyRound, UserPlus } from "lucide-react";

const permissions = [
  ["VIEW_EXHIBITIONS", "View exhibitions"], ["CREATE_EXHIBITIONS", "Create exhibitions"], ["UPDATE_EXHIBITIONS", "Update exhibitions and email status"], ["DELETE_EXHIBITIONS", "Delete exhibitions"],
  ["VIEW_ADMIN_DASHBOARD", "View admin dashboard"], ["MANAGE_USERS", "Manage users"], ["VIEW_AUDIT_LOGS", "View activity logs"],
] as const;

type ManagedUser = { id: string; username: string; role: "ADMIN" | "USER"; isActive: boolean; mustChangePassword: boolean; createdAt: string; updatedAt: string; lastLoginAt: string | null; permissions: string[] };

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options); const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed."); return payload;
}

export function UserManagement({ initialUsers, currentUserId }: { initialUsers: ManagedUser[]; currentUserId: string }) {
  const [users, setUsers] = useState(initialUsers); const [creating, setCreating] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  function replace(user: ManagedUser) { setUsers((items) => items.map((item) => item.id === user.id ? { ...user, permissions: (user.permissions as unknown as { permission: string }[]).map?.((value) => typeof value === "string" ? value : value.permission) ?? [] } : item)); }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreating(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      const selected = permissions.filter(([value]) => data.getAll("permissions").includes(value)).map(([value]) => value);
      const payload = await request("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), temporaryPassword: data.get("temporaryPassword"), role: data.get("role"), isActive: true, permissions: selected }) });
      setUsers((items) => [{ ...payload, createdAt: payload.createdAt, updatedAt: payload.updatedAt, lastLoginAt: payload.lastLoginAt, permissions: payload.permissions.map((entry: { permission: string }) => entry.permission) }, ...items]);
      event.currentTarget.reset(); setNotice("User created successfully.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create user."); } finally { setCreating(false); }
  }
  return <><section className="panel create-user"><div className="section-heading"><div><p className="eyebrow">New employee</p><h2>Create User</h2></div><UserPlus /></div><form onSubmit={create}><label>Username<input name="username" required minLength={3} /></label><label>Temporary Password<input name="temporaryPassword" type="password" required minLength={12} autoComplete="new-password" /></label><label>Role<select name="role"><option value="USER">User</option><option value="ADMIN">Administrator</option></select></label><fieldset><legend>Initial permissions</legend>{permissions.map(([value, label]) => <label key={value}><input type="checkbox" name="permissions" value={value} defaultChecked={value === "VIEW_EXHIBITIONS"} /> {label}</label>)}</fieldset><button className="button primary" disabled={creating}>{creating ? "Creating…" : "Create User"}</button></form>{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="success-note" role="status"><Check /> {notice}</p>}</section><section className="user-list">{users.map((user) => <UserRow key={user.id} user={user} isSelf={user.id === currentUserId} onChange={replace} />)}</section></>;
}

function UserRow({ user, isSelf, onChange }: { user: ManagedUser; isSelf: boolean; onChange: (user: ManagedUser) => void }) {
  const [username, setUsername] = useState(user.username); const [role, setRole] = useState(user.role); const [selected, setSelected] = useState(user.permissions); const [resetOpen, setResetOpen] = useState(false); const [busy, setBusy] = useState(""); const [message, setMessage] = useState("");
  async function save() {
    setBusy("save"); setMessage("");
    try { const payload = await request(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, role, permissions: selected }) }); onChange({ ...payload, createdAt: String(payload.createdAt), updatedAt: String(payload.updatedAt), lastLoginAt: payload.lastLoginAt ? String(payload.lastLoginAt) : null, permissions: payload.permissions }); setMessage("User access updated."); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "Update failed."); } finally { setBusy(""); }
  }
  async function toggleActive() {
    setBusy("status"); setMessage("");
    try { const payload = await request(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !user.isActive }) }); onChange({ ...payload, createdAt: String(payload.createdAt), updatedAt: String(payload.updatedAt), lastLoginAt: payload.lastLoginAt ? String(payload.lastLoginAt) : null, permissions: payload.permissions }); setMessage(payload.isActive ? "User enabled." : "User disabled and sessions revoked."); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "Status update failed."); } finally { setBusy(""); }
  }
  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("password"); setMessage(""); const data = new FormData(event.currentTarget);
    try { await request(`/api/admin/users/${user.id}/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ temporaryPassword: data.get("temporaryPassword") }) }); setResetOpen(false); setMessage("Temporary password set; existing sessions were revoked."); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "Password reset failed."); } finally { setBusy(""); }
  }
  function toggle(permission: string) { setSelected((values) => values.includes(permission) ? values.filter((value) => value !== permission) : [...values, permission]); }
  return <article className={`panel user-card ${user.isActive ? "" : "inactive"}`}><header><div><input aria-label={`Username for ${user.username}`} value={username} onChange={(event) => setUsername(event.target.value)} /><span className={`status-pill ${user.isActive ? "active" : ""}`}>{user.isActive ? "Active" : "Disabled"}</span>{isSelf && <small>You</small>}</div><select aria-label={`Role for ${user.username}`} value={role} onChange={(event) => setRole(event.target.value as "ADMIN" | "USER")}><option value="USER">User</option><option value="ADMIN">Administrator</option></select></header><div className="user-dates"><span>Created <b>{new Date(user.createdAt).toLocaleString("en-GB")}</b></span><span>Last login <b>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-GB") : "Never"}</b></span></div><fieldset className="permission-grid" disabled={role === "ADMIN"}><legend>Permissions {role === "ADMIN" && <small>Administrators have all permissions</small>}</legend>{permissions.map(([value, label]) => <label key={value}><input type="checkbox" checked={role === "ADMIN" || selected.includes(value)} onChange={() => toggle(value)} /> {label}</label>)}</fieldset><footer><button className="button primary" onClick={save} disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save User"}</button><button className="button outline" onClick={() => setResetOpen((value) => !value)} disabled={Boolean(busy)}><KeyRound /> Reset Password</button><button className={`button ${user.isActive ? "destructive" : "outline"}`} onClick={toggleActive} disabled={Boolean(busy) || isSelf}>{busy === "status" ? "Updating…" : user.isActive ? "Disable" : "Enable"}</button></footer>{resetOpen && <form className="reset-password" onSubmit={reset}><label>New temporary password<input type="password" name="temporaryPassword" minLength={12} required autoComplete="new-password" /></label><button className="button primary" disabled={Boolean(busy)}>{busy === "password" ? "Resetting…" : "Set Temporary Password"}</button></form>}{message && <p className="inline-message" role="status">{message}</p>}</article>;
}
