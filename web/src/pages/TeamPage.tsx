import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { api, type Team, type TeamMember } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TasksBarChart, type TasksChartCounts } from "../components/TasksBarChart";

type OutletCtx = { reloadTree: () => Promise<void> };

const ROLE_LABELS: Record<TeamMember["role"], string> = {
  lead: "Trưởng nhóm",
  member: "Thành viên",
  viewer: "Chỉ xem",
};

type Panel =
  | null
  | "personnel"
  | "invite"
  | "service-google"
  | "service-github";

export function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reloadTree } = useOutletContext<OutletCtx>();
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [chart, setChart] = useState<TasksChartCounts | null>(null);
  const [githubSummary, setGithubSummary] = useState({
    linked: 0,
    repoCount: 0,
  });
  const menuRef = useRef<HTMLDivElement>(null);

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

      // Layer 1: chart empty + CTA; số liệu Google Tasks thật ở Layer 3
      setChart({ todo: 0, doing: 0, done: 0, connected: false });
      try {
        const dash = await api<{
          github?: { connected?: boolean; repoCount?: number };
        }>(`/teams/${teamId}/dashboard`);
        setGithubSummary({
          linked: dash.github?.connected ? 1 : 0,
          repoCount: dash.github?.repoCount ?? 0,
        });
      } catch {
        setGithubSummary({ linked: 0, repoCount: 0 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được");
      setTeam(null);
    }
  }

  useEffect(() => {
    void load();
    setPanel(null);
    setMenuOpen(false);
  }, [teamId, user?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const canManage = myRole === "lead";
  const googleLinkedCount = members.filter((m) => m.user.email).length;

  async function saveTeam(e: FormEvent) {
    e.preventDefault();
    if (!teamId || !canManage) return;
    try {
      const t = await api<Team>(`/teams/${teamId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description }),
      });
      setTeam(t);
      setMessage("Đã cập nhật nhóm");
      await reloadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật thất bại");
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
      setMessage("Đã thêm thành viên");
      setPanel(null);
      await load();
      await reloadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mời thất bại");
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
      setError(err instanceof Error ? err.message : "Đổi vai trò thất bại");
    }
  }

  async function remove(userId: string) {
    if (!teamId || !canManage) return;
    try {
      await api(`/teams/${teamId}/members/${userId}`, { method: "DELETE" });
      await load();
      await reloadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  async function removeTeam() {
    if (!teamId || !canManage) return;
    if (!confirm("Xóa nhóm này?")) return;
    try {
      await api(`/teams/${teamId}`, { method: "DELETE" });
      navigate("/");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xóa nhóm thất bại");
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
        <p className="muted">Đang tải nhóm…</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <div>
          <h1>{team.name}</h1>
          <p className="muted">
            Vai trò của bạn:{" "}
            {myRole
              ? (ROLE_LABELS[myRole as TeamMember["role"]] ?? myRole)
              : "—"}
          </p>
        </div>
        <div className="title-menu" ref={menuRef}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Menu nhóm"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="dropdown-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setPanel("personnel");
                }}
              >
                Quản lý nhân sự
              </button>
              {canManage && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setPanel("invite");
                  }}
                >
                  Thêm người vào nhóm
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  role="menuitem"
                  className="danger-item"
                  onClick={() => {
                    setMenuOpen(false);
                    void removeTeam();
                  }}
                >
                  Xóa nhóm
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}

      <TasksBarChart counts={chart} />

      <div className="service-cards">
        <button
          type="button"
          className="service-card"
          onClick={() => setPanel("service-google")}
        >
          <strong>Google</strong>
          <span className="muted small">
            {members.length} thành viên · xem liên kết
          </span>
          <span className="service-card-cta">Xem thành viên ›</span>
        </button>
        <button
          type="button"
          className="service-card"
          onClick={() => setPanel("service-github")}
        >
          <strong>GitHub</strong>
          <span className="muted small">
            {githubSummary.repoCount} repos · {githubSummary.linked || "—"}{" "}
            linked
          </span>
          <span className="service-card-cta">Xem thành viên ›</span>
        </button>
      </div>

      {canManage && (
        <details className="section team-details">
          <summary>Chi tiết nhóm</summary>
          <form className="stack narrow" onSubmit={saveTeam}>
            <label>
              Tên
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Mô tả
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </label>
            <button type="submit">Lưu</button>
          </form>
        </details>
      )}

      {!canManage && team.description && (
        <p className="muted">{team.description}</p>
      )}

      {panel && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onClick={() => setPanel(null)}
        >
          <aside
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>
                {panel === "personnel" && "Quản lý nhân sự"}
                {panel === "invite" && "Thêm người vào nhóm"}
                {panel === "service-google" && "Google · thành viên"}
                {panel === "service-github" && "GitHub · thành viên"}
              </h2>
              <button
                type="button"
                className="linkish"
                onClick={() => setPanel(null)}
              >
                Đóng
              </button>
            </div>

            {(panel === "personnel" ||
              panel === "service-google" ||
              panel === "service-github") && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>
                      {panel === "service-github" ? "GitHub" : "Email"}
                    </th>
                    {panel === "personnel" && <th>Vai trò</th>}
                    {panel === "personnel" && canManage && <th />}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>{m.user.fullName}</td>
                      <td>
                        {panel === "service-github" ? (
                          <span className="muted">chưa liên kết</span>
                        ) : (
                          m.user.email
                        )}
                      </td>
                      {panel === "personnel" && (
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
                              <option value="lead">{ROLE_LABELS.lead}</option>
                              <option value="member">
                                {ROLE_LABELS.member}
                              </option>
                              <option value="viewer">
                                {ROLE_LABELS.viewer}
                              </option>
                            </select>
                          ) : (
                            ROLE_LABELS[m.role]
                          )}
                        </td>
                      )}
                      {panel === "personnel" && canManage && (
                        <td>
                          <button
                            type="button"
                            className="linkish"
                            onClick={() => void remove(m.userId)}
                          >
                            Xóa
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {panel === "service-google" && (
              <p className="muted small">
                Liên kết Google theo tài khoản đăng nhập / Workspace (chi tiết
                sync ở lớp sau). Hiện có {googleLinkedCount} thành viên trong
                nhóm.
              </p>
            )}

            {panel === "invite" && canManage && (
              <form className="stack narrow" onSubmit={invite}>
                <p className="muted small">
                  Người dùng phải đã thuộc cùng tổ chức.
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
                  Vai trò
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as typeof inviteRole)
                    }
                  >
                    <option value="member">{ROLE_LABELS.member}</option>
                    <option value="viewer">{ROLE_LABELS.viewer}</option>
                    <option value="lead">{ROLE_LABELS.lead}</option>
                  </select>
                </label>
                <button type="submit">Thêm thành viên</button>
              </form>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
