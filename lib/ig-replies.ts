export type IgFrom = { id?: string; username?: string };

export type IgCommentNode = {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  parent_id?: string;
  from?: IgFrom;
  replies?: {
    data?: IgCommentNode[];
    paging?: { cursors?: { after?: string }; next?: string };
  };
};

export function commentAuthor(comment: IgCommentNode): { id: string; username: string } {
  const username = (comment.username || comment.from?.username || "").replace(/^@/, "");
  const id = comment.from?.id || "";
  return { id, username };
}

/** Top-level media comments have no parent_id; replies to comments do. */
export function isTopLevelComment(comment: { parent_id?: string | null }): boolean {
  return !comment.parent_id;
}

export function isOwnAuthor(
  author: { id?: string; username?: string },
  ownUsernames: Iterable<string>,
  ownIds: Iterable<string> = [],
): boolean {
  const names = new Set(
    [...ownUsernames].map((name) => name.replace(/^@/, "").toLowerCase()).filter(Boolean),
  );
  const ids = new Set([...ownIds].map(String).filter(Boolean));
  const username = (author.username || "").replace(/^@/, "").toLowerCase();
  if (username && names.has(username)) return true;
  if (author.id && ids.has(String(author.id))) return true;
  return false;
}

/**
 * First nested reply authored by the shop account (e.g. iordani925).
 * Replies from other users are ignored — those comments stay unanswered for us.
 */
export function findBusinessReply(
  comment: IgCommentNode,
  ownUsernames: Iterable<string>,
  ownIds: Iterable<string> = [],
): IgCommentNode | null {
  for (const reply of comment.replies?.data ?? []) {
    if (isOwnAuthor(commentAuthor(reply), ownUsernames, ownIds)) return reply;
  }
  return null;
}

/** True when any nested reply was written by the professional account we manage. */
export function hasBusinessReply(
  comment: IgCommentNode,
  ownUsernames: Iterable<string>,
  ownIds: Iterable<string> = [],
): boolean {
  return findBusinessReply(comment, ownUsernames, ownIds) != null;
}
