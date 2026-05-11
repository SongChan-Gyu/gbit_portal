type FlatComment = {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
  authorId: string;
  author: { id: string; name: string };
};

export function buildImprovementCommentTree(flat: FlatComment[]) {
  const roots = flat.filter((c) => !c.parentId);
  const childMap = new Map<string, FlatComment[]>();
  for (const c of flat) {
    if (c.parentId) {
      const list = childMap.get(c.parentId) ?? [];
      list.push(c);
      childMap.set(c.parentId, list);
    }
  }
  return roots.map((r) => ({
    ...r,
    replies: (childMap.get(r.id) ?? []).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    ),
  }));
}
