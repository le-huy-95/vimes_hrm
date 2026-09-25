import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Team, type TeamMember } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"lead" | "member" | "viewer">(
    "member",
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!teamId) return;
    setError(null);
    try {
      const [t, m] = await Promise.all([
        api<Team>(`/teams/${teamId}`),
        api<TeamMember[]>(`/teams/${teamId}/members`),
      ]);
      setTeam(t);
      setName(t.name);
      setDescription(t.description ?? "");
      setMembers(m);
      const mine = m.find((x) => x.userId === user?.id);
      setMyRole(mine?.role ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setTeam(null);
    }
  }

  useEffect(() => {
    void load();
  }, [teamId, user?.id]);

  const canManage = myRole === "lead";

  async function saveTeam(e: FormEvent) {
    e.preventDefault();
    if (!teamId || !canManage) return;
    try {
      const t = await api<Team>(`/teams/${teamId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description }),
      });
      setTeam(t);
      setMessage("Team updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!teamId || !canManage) return;
    try {
      await api(`/teams/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteEmail("");
      setMessage("Member added");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  }

  async function changeRole(userId: string, role: TeamMember["role"]) {
    if (!teamId || !canManage) return;
    try {
      await api(`/teams/${teamId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Role update failed");
    }
  }

  async function remove(userId: string) {
    if (!teamId || !canManage) return;
    try {
      await api(`/teams/${teamId}/members/${userId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function removeTeam() {
    if (!teamId || !canManage) return;
    if (!confirm("Delete this team?")) return;
    try {
      await api(`/teams/${teamId}`, { method: "DELETE" });
      navigate("/");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (error && !team) {
    return (
      <div className="panel">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="panel">
        <p className="muted">Loading team…</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <div>
          <h1>{team.name}</h1>
          <p className="muted">Your role: {myRole ?? "—"}</p>
        </div>
        {canManage && (
          <button type="button" className="danger" onClick={removeTeam}>
            Delete team
          </button>
        )}
      </header>

      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}

      {canManage ? (
        <form className="stack narrow" onSubmit={saveTeam}>
          <h2>Details</h2>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </label>
          <button type="submit">Save</button>
        </form>
      ) : (
        <p>{team.description || "No description"}</p>
      )}

      <section className="section">
        <h2>Members</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.user.fullName}</td>
                <td>{m.user.email}</td>
                <td>
                  {canManage ? (
                    <select
                      value={m.role}
                      onChange={(e) =>
                        void changeRole(
                          m.userId,
                          e.target.value as TeamMember["role"],
                        )
                      }
                    >
                      <option value="lead">lead</option>
                      <option value="member">member</option>
                      <option value="viewer">viewer</option>
                    </select>
                  ) : (
                    m.role
                  )}
                </td>
                {canManage && (
                  <td>
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => void remove(m.userId)}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {canManage && (
          <form className="stack narrow row-form" onSubmit={invite}>
            <h3>Invite by email</h3>
            <p className="muted small">
              User must already belong to the same organization.
            </p>
            <label>
              Email
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Role
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as typeof inviteRole)
                }
              >
                <option value="member">member</option>
                <option value="viewer">viewer</option>
                <option value="lead">lead</option>
              </select>
            </label>
            <button type="submit">Add member</button>
          </form>
        )}
      </section>
    </div>
  );
}
