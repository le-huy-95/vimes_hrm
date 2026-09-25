import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, type Team } from "../api/client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { TeamsModal } from "../components/TeamsModal";

type ServiceItem = { id: string; label: string; linked: boolean };

const GOOGLE_SERVICES: ServiceItem[] = [
  { id: "google-login", label: "Đăng nhập Google", linked: false },
  { id: "google-tasks", label: "Google Tasks", linked: false },
  { id: "workspace", label: "Workspace Directory", linked: false },
  { id: "gchat", label: "Google Chat", linked: false },
];

const GITHUB_SERVICES: ServiceItem[] = [
  { id: "github-app", label: "GitHub App", linked: false },
  { id: "github-repos", label: "Repos nhóm", linked: false },
];

export function AppLayout() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const { teamId } = useParams();
  const [tree, setTree] = useState<Team[]>([]);
  const [teamsOpen, setTeamsOpen] = useState(false);
  // Layer 1: danh sách cố định; “đã liên kết” gắn API ở Layer 2
  const googleServices = GOOGLE_SERVICES;
  const githubServices = GITHUB_SERVICES;

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

  useEffect(() => {
    if (!teamsOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTeamsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [teamsOpen]);

  if (loading || !user) {
    return (
      <div className="auth-page">
        <p className="muted">Đang tải…</p>
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
            Tạo nhóm
          </Link>
        </div>
        <nav className="sidebar-nav">
          <button
            type="button"
            className="sidebar-nav-item"
            onClick={() => setTeamsOpen(true)}
          >
            <span className="sidebar-nav-label">Nhóm của bạn</span>
            <span className="muted small">Mở danh sách nhóm</span>
          </button>

          <div className="sidebar-section">
            <p className="sidebar-section-title">Google</p>
            <ul className="service-list">
              {googleServices.map((s) => (
                <li key={s.id}>
                  <span>{s.label}</span>
                  {s.linked ? (
                    <span className="linked-tag">đã liên kết</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="sidebar-section">
            <p className="sidebar-section-title">GitHub</p>
            <ul className="service-list">
              {githubServices.map((s) => (
                <li key={s.id}>
                  <span>{s.label}</span>
                  {s.linked ? (
                    <span className="linked-tag">đã liên kết</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
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
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet context={{ reloadTree: loadTree }} />
      </main>
      {teamsOpen && (
        <TeamsModal
          tree={tree}
          activeId={teamId}
          onClose={() => setTeamsOpen(false)}
          onSelect={(id) => {
            setTeamsOpen(false);
            navigate(`/teams/${id}`);
          }}
        />
      )}
    </div>
  );
}

export function HomePage() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      await api("/orgs/me/users", {
        method: "POST",
        body: JSON.stringify({ email, fullName }),
      });
      setMsg(`Đã thêm ${email} — bạn có thể mời họ vào nhóm.`);
      setEmail("");
      setFullName("");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Thất bại");
    }
  }

  return (
    <div className="panel">
      <h1>Nhóm</h1>
      <p className="muted">
        Mở <strong>Nhóm của bạn</strong> ở thanh bên hoặc{" "}
        <Link to="/teams/new">tạo nhóm mới</Link>.
      </p>

      <section className="section">
        <h2>Thêm người dùng tổ chức</h2>
        <p className="muted small">
          Khi mời vào nhóm, hệ thống tìm người đã thuộc tổ chức. Thêm họ ở đây
          trước.
        </p>
        <form className="stack narrow" onSubmit={addUser}>
          <label>
            Họ và tên
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
          {err && <p className="error">{err}</p>}
          {msg && <p className="ok">{msg}</p>}
          <button type="submit">Thêm người dùng</button>
        </form>
      </section>
    </div>
  );
}

export function CreateTeamPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const team = await api<Team>("/teams", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      navigate(`/teams/${team.id}`);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h1>Tạo nhóm</h1>
      <form className="stack narrow" onSubmit={onSubmit}>
        <label>
          Tên nhóm
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ví dụ: Kỹ thuật"
            required
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Đang tạo…" : "Tạo nhóm"}
        </button>
      </form>
    </div>
  );
}
