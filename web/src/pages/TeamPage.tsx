import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  api,
  type GithubCommitPage,
  type MemberIntegration,
  type Team,
  type TeamMember,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  TasksBarChart,
  type TasksChartCounts,
} from "../components/TasksBarChart";

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
  | "service-github"
  | "commits";

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
  const [googleLinked, setGoogleLinked] = useState(0);
  const [serviceMembers, setServiceMembers] = useState<MemberIntegration[]>(
    [],
  );
  const [commitUser, setCommitUser] = useState<MemberIntegration | null>(null);
  const [commits, setCommits] = useState<GithubCommitPage | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(false);
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

      try {
        const [dash, integ] = await Promise.all([
          api<{
            googleTasks?: TasksChartCounts;
            github?: { connected?: boolean; repoCount?: number };
          }>(`/teams/${teamId}/dashboard`),
          api<{
            summary: {
              googleLinked: number;
              githubLinked: number;
              repoCount: number;
            };
          }>(`/teams/${teamId}/integrations`),
        ]);
        setChart(
          dash.googleTasks ?? {
            todo: 0,
            doing: 0,
            done: 0,
            connected: false,
          },
        );
        setGithubSummary({
          linked: integ.summary.githubLinked,
          repoCount: integ.summary.repoCount,
        });
        setGoogleLinked(integ.summary.googleLinked);
      } catch {
        setChart({ todo: 0, doing: 0, done: 0, connected: false });
        setGithubSummary({
          linked: m.filter((x) => x.githubLogin).length,
          repoCount: 0,
        });
        setGoogleLinked(m.filter((x) => x.user.googleUserId).length);
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
    setCommits(null);
    setCommitUser(null);
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

  useEffect(() => {
    if (!teamId || (panel !== "service-google" && panel !== "service-github")) {
      return;
    }
    const service = panel === "service-google" ? "google" : "github";
    let cancelled = false;
    void api<MemberIntegration[]>(
      `/teams/${teamId}/members/integrations?service=${service}`,
    )
      .then((rows) => {
        if (!cancelled) setServiceMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setServiceMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [panel, teamId]);

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

  async function saveGithubLogin(userId: string, value: string) {
    if (!teamId || !canManage) return;
    const trimmed = value.trim().replace(/^@/, "");
    try {
      await api(`/teams/${teamId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ githubLogin: trimmed || null }),
      });
      setMessage("Đã cập nhật GitHub login");
      await load();
      if (panel === "service-github") {
        const rows = await api<MemberIntegration[]>(
          `/teams/${teamId}/members/integrations?service=github`,
        );
        setServiceMembers(rows);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cập nhật GitHub thất bại");
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

  async function openCommits(row: MemberIntegration) {
    if (!teamId || !row.linked) return;
    setCommitUser(row);
    setPanel("commits");
    setCommitsLoading(true);
    try {
      const page = await api<GithubCommitPage>(
        `/teams/${teamId}/members/${row.userId}/github-commits`,
      );
      setCommits(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải commits");
      setCommits(null);
    } finally {
      setCommitsLoading(false);
    }
  }

  async function loadMoreCommits() {
    if (!teamId || !commitUser || !commits?.nextCursor) return;
    setCommitsLoading(true);
    try {
      const page = await api<GithubCommitPage>(
        `/teams/${teamId}/members/${commitUser.userId}/github-commits?cursor=${commits.nextCursor}`,
      );
      setCommits({
        ...page,
        items: [...commits.items, ...page.items],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải thêm commits");
    } finally {
      setCommitsLoading(false);
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
            {members.length} thành viên · {googleLinked} đã liên kết
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
            {githubSummary.repoCount} repos · {githubSummary.linked} linked
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
                {panel === "commits" &&
                  `Commits · ${commitUser?.handle ?? ""}`}
              </h2>
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  if (panel === "commits") {
                    setPanel("service-github");
                    setCommits(null);
                    setCommitUser(null);
                  } else {
                    setPanel(null);
                  }
                }}
              >
                {panel === "commits" ? "← Quay lại" : "Đóng"}
              </button>
            </div>

            {panel === "personnel" && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                    <th>GitHub</th>
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
                            <option value="lead">{ROLE_LABELS.lead}</option>
                            <option value="member">{ROLE_LABELS.member}</option>
                            <option value="viewer">{ROLE_LABELS.viewer}</option>
                          </select>
                        ) : (
                          ROLE_LABELS[m.role]
                        )}
                      </td>
                      <td>
                        {canManage ? (
                          <input
                            className="inline-input"
                            defaultValue={m.githubLogin ?? ""}
                            placeholder="@login"
                            onBlur={(e) => {
                              const next = e.target.value.trim().replace(/^@/, "");
                              const prev = m.githubLogin ?? "";
                              if (next !== prev) {
                                void saveGithubLogin(m.userId, e.target.value);
                              }
                            }}
                          />
                        ) : m.githubLogin ? (
                          `@${m.githubLogin}`
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      {canManage && (
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

            {(panel === "service-google" || panel === "service-github") && (
              <ul className="integration-member-list">
                {serviceMembers.map((row) => (
                  <li key={row.userId}>
                    <div>
                      <strong>{row.fullName}</strong>
                      <div className="muted small">
                        {row.linked ? row.handle : "chưa liên kết"}
                      </div>
                    </div>
                    {panel === "service-github" && row.linked ? (
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => void openCommits(row)}
                      >
                        Xem commits ›
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {panel === "commits" && (
              <div className="commits-panel">
                {commitsLoading && !commits ? (
                  <p className="muted">Đang tải…</p>
                ) : commits && commits.items.length > 0 ? (
                  <>
                    <ul className="commit-list">
                      {commits.items.map((c) => (
                        <li key={c.id}>
                          {c.externalUrl ? (
                            <a
                              href={c.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {c.title}
                            </a>
                          ) : (
                            <span>{c.title}</span>
                          )}
                          <div className="muted small">
                            {c.repoFullName ? `${c.repoFullName} · ` : ""}
                            {new Date(c.occurredAt).toLocaleString()}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {commits.nextCursor && (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={commitsLoading}
                        onClick={() => void loadMoreCommits()}
                      >
                        {commitsLoading ? "Đang tải…" : "Tải thêm"}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="muted small">Chưa có commit nào cho login này.</p>
                )}
              </div>
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
