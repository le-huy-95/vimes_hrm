import { AppError } from "../lib/errors.js";

const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

export type GoogleTaskList = { id: string; title: string };
export type GoogleTaskItem = {
  id: string;
  title?: string;
  status?: string;
  updated?: string;
  deleted?: boolean;
};

export async function listGoogleTaskLists(
  accessToken: string,
): Promise<GoogleTaskList[]> {
  const res = await fetch(`${TASKS_API}/users/@me/lists`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new AppError(502, `Google Tasks lists failed: ${res.status}`);
  }
  const data = (await res.json()) as { items?: GoogleTaskList[] };
  return data.items ?? [];
}

export async function listGoogleTasksInList(
  accessToken: string,
  listId: string,
): Promise<GoogleTaskItem[]> {
  const items: GoogleTaskItem[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`);
    url.searchParams.set("showCompleted", "true");
    url.searchParams.set("showHidden", "true");
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new AppError(502, `Google Tasks fetch failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      items?: GoogleTaskItem[];
      nextPageToken?: string;
    };
    for (const t of data.items ?? []) {
      if (!t.deleted) items.push(t);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}
