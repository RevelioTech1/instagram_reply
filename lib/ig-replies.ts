export type IgFrom = { id?: string; username?: string };

export type IgCommentNode = {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
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

/** True when any nested reply was written by the professional account we manage. */
export function hasBusinessReply(
  comment: IgCommentNode,
  ownUsernames: Iterable<string>,
  ownIds: Iterable<string> = [],
): boolean {
  const names = new Set(
    [...ownUsernames].map((name) => name.replace(/^@/, "").toLowerCase()).filter(Boolean),
  );
  const ids = new Set([...ownIds].map(String).filter(Boolean));
  for (const reply of comment.replies?.data ?? []) {
    const author = commentAuthor(reply);
    if (author.id && ids.has(author.id)) return true;
    if (author.username && names.has(author.username.toLowerCase())) return true;
  }
  return false;
}
