"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PostDTO } from "@/lib/dto";

export function PostsView() {
  const [posts, setPosts] = useState<PostDTO[] | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function load() {
    fetch("/api/posts")
      .then((response) => response.json())
      .then((data: { posts: PostDTO[] }) => {
        setPosts(data.posts);
        setError("");
      })
      .catch(() => setError("Посты не открылись."));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(post: PostDTO) {
    const response = await fetch(`/api/posts/${encodeURIComponent(post.mediaId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualCode: drafts[post.mediaId] ?? post.manualCode ?? "" }),
    });
    if (!response.ok) {
      setError("Не удалось привязать артикул.");
      return;
    }
    load();
  }

  return (
    <div>
      <h1 className="font-display text-5xl text-[#2a211c]">Посты и привязка к изделию</h1>
      <p className="mt-2 max-w-2xl text-sm text-[#5c5348]">
        Если в подписи есть артикул, бот находит карточку сам. Здесь можно закрепить артикул за постом, когда подпись
        без номера: открытые ответы пересчитаются.
      </p>
      {error ? <p className="mt-4 text-sm text-[#9b2c2c]">{error}</p> : null}
      <div className="mt-6 space-y-3">
        {posts === null ? <p className="text-sm text-muted-foreground">Загрузка…</p> : null}
        {posts?.length === 0 ? <p className="text-sm text-muted-foreground">Постов пока нет.</p> : null}
        {posts?.map((post) => (
          <article key={post.mediaId} className="rounded-3xl border border-[#e4d8c4] bg-[#fffdf8] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{post.source === "demo" ? "Учебный пост" : post.source === "simulator" ? "Проверка" : "Instagram"}</span>
              <span>{post.commentCount} коммент.</span>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">{post.caption || "Без подписи"}</p>
            {post.permalink ? (
              <a className="mt-2 inline-block text-sm text-[#6d2e32] underline" href={post.permalink} target="_blank" rel="noreferrer">
                Открыть пост
              </a>
            ) : null}
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                void save(post);
              }}
            >
              <Input
                className="h-9 bg-white"
                value={drafts[post.mediaId] ?? post.manualCode ?? ""}
                placeholder="Артикул, например Б-П-184"
                onChange={(event) => setDrafts((current) => ({ ...current, [post.mediaId]: event.target.value }))}
              />
              <Button type="submit" variant="outline" className="h-9">
                Закрепить
              </Button>
            </form>
          </article>
        ))}
      </div>
    </div>
  );
}
