import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, type Team } from "../api/client";
import { useCallback, useEffect, useState, type FormEvent } from "react";

function TeamTree({
  nodes,
  activeId,
}: {
  nodes: Team[];
  activeId?: string;
}) {
  return (
    <ul className="tree">
      {nodes.map((n) => (
        <li key={n.id}>
          <Link
            to={`/teams/${n.id}`}
            className={n.id === activeId ? "active" : undefined}
          >
            {n.name}
          </Link>
          {n.children && n.children.length > 0 && (
            <TeamTree nodes={n.children} activeId={activeId} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function AppLayout() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [tree, setTree] = useState<Team[]>([]);

  const loadTree = useCallback(async () => {
    const data = await api<Team[]>("/teams?as=tree");
    setTree(data);
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) void loadTree();
  }, [user, loadTree]);

  if (loading || !user) {
    return (
      <div className="auth-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <p className="brand">Manage Teams</p>
          <p className="muted small">{user.org.name}</p>
        </div>
        <div className="sidebar-actions">
          <Link className="btn-secondary compact" to="/teams/new">
            New team
          </Link>
        </div>
        <nav>
          {tree.length === 0 ? (
            <p className="muted small">No teams yet</p>
          ) : (
            <TeamTree nodes={tree} activeId={teamId} />
          )}
        </nav>
        <div className="sidebar-foot">
          <p className="small">{user.fullName}</p>
          <button
            type="button"
            className="linkish"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet context={{ reloadTree: loadTree }} />
      </main>
    </div>
  );
}

export function HomePage() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      await api("/orgs/me/users", {
        method: "POST",
        body: JSON.stringify({ email, fullName, password }),
      });
      setMsg(`Created ${email} — you can now invite them to a team.`);
      setEmail("");
      setFullName("");
      setPassword("");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="panel">
      <h1>Teams</h1>
      <p className="muted">
        Select a team in the sidebar or{" "}
        <Link to="/teams/new">create a new one</Link>.
      </p>

      <section className="section">
        <h2>Add organization user</h2>
        <p className="muted small">
          Team invite looks up users already in your org. Create them here first.
        </p>
        <form className="stack narrow" onSubmit={addUser}>
          <label>
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {err && <p className="error">{err}</p>}
          {msg && <p className="ok">{msg}</p>}
          <button type="submit">Create user</button>
        </form>
      </section>
    </div>
  );
}

export function CreateTeamPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentTeamId, setParentTeamId] = useState("");
  const [flat, setFlat] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Team[]>("/teams").then(setFlat);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const team = await api<Team>("/teams", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description || undefined,
          parentTeamId: parentTeamId || undefined,
        }),
      });
      navigate(`/teams/${team.id}`);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="panel">
      <h1>Create team</h1>
      <form className="stack narrow" onSubmit={onSubmit}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>
        <label>
          Parent team (optional)
          <select
            value={parentTeamId}
            onChange={(e) => setParentTeamId(e.target.value)}
          >
            <option value="">— None —</option>
            {flat.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Create</button>
      </form>
    </div>
  );
}
