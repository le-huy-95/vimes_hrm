import type { Team } from "../api/client";

function flattenOrTree(
  nodes: Team[],
  depth = 0,
): Array<{ team: Team; depth: number }> {
  const out: Array<{ team: Team; depth: number }> = [];
  for (const n of nodes) {
    out.push({ team: n, depth });
    if (n.children?.length) {
      out.push(...flattenOrTree(n.children, depth + 1));
    }
  }
  return out;
}

export function TeamsModal({
  tree,
  activeId,
  onClose,
  onSelect,
}: {
  tree: Team[];
  activeId?: string;
  onClose: () => void;
  onSelect: (teamId: string) => void;
}) {
  const rows = flattenOrTree(tree);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teams-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="teams-modal-title">Tất cả nhóm</h2>
          <button type="button" className="linkish" onClick={onClose}>
            Đóng
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="muted small">Chưa có nhóm nào</p>
        ) : (
          <ul className="teams-modal-list">
            {rows.map(({ team, depth }) => (
              <li key={team.id} style={{ paddingLeft: depth * 12 }}>
                <button
                  type="button"
                  className={
                    team.id === activeId
                      ? "teams-modal-item active"
                      : "teams-modal-item"
                  }
                  onClick={() => onSelect(team.id)}
                >
                  {team.name}
                  {team.id === activeId ? (
                    <span className="muted small"> · đang xem</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
