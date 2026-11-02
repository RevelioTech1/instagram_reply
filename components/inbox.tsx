"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CommentDTO, ProductDTO } from "@/lib/dto";
import { formatPrice } from "@/lib/format";
import { INTENT_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/labels";

const FILTERS = [
  { id: "", label: "Все" },
  { id: "draft", label: "Ждут" },
  { id: "needs_review", label: "Проверка" },
  { id: "replied", label: "Ответы" },
  { id: "skipped", label: "Без ответа" },
  { id: "failed", label: "Ошибки" },
];

export function Inbox() {
  const [filter, setFilter] = useState("");
  const [comments, setComments] = useState<CommentDTO[] | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load(prefer?: string) {
    const response = await fetch(filter ? `/api/comments?status=${filter}` : "/api/comments");
    if (!response.ok) {
      setError("Не удалось открыть входящие.");
      return;
    }
    const data = (await response.json()) as { comments: CommentDTO[] };
    setComments(data.comments);
    setError("");
    setSelectedId((current) => {
      if (prefer && data.comments.some((comment) => comment.id === prefer)) return prefer;
      if (current && data.comments.some((comment) => comment.id === current)) return current;
      return data.comments.find((comment) => comment.status === "draft")?.id ?? data.comments[0]?.id ?? null;
    });
  }

  useEffect(() => {
    let stop = false;
    void (async () => {
      if (stop) return;
      await load();
    })();
    const timer = window.setInterval(() => void load(), 12000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
    // load closes over filter; the interval should follow it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const selected = useMemo(
    () => comments?.find((comment) => comment.id === selectedId) ?? null,
    [comments, selectedId],
  );

  return (
    <div className="grid min-w-0 gap-6 lg:h-[calc(100dvh-8.5rem)] lg:grid-cols-[340px_minmax(0,1fr)] lg:items-stretch">
      <section
        className={`flex min-h-0 min-w-0 flex-col gap-4 ${selected ? "hidden lg:flex" : "flex"}`}
      >
        <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${
                filter === item.id ? "bg-[#24382c] text-[#f6f3ea]" : "bg-white text-[#3d342b]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1 lg:pb-2">
          {comments === null ? <p className="text-sm text-muted-foreground">Открываем входящие…</p> : null}
          {comments?.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#e4d8c4] p-4 text-sm text-muted-foreground">
              Таких комментариев нет. Заберите их в разделе «Подключение».
            </p>
          ) : null}
          {comments?.map((comment) => (
            <button
              key={comment.id}
              type="button"
              onClick={() => setSelectedId(comment.id)}
              className={`w-full rounded-2xl border p-3 text-left ${
                selectedId === comment.id ? "border-[#6d2e32] bg-[#fffdf8]" : "border-transparent bg-white/70"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#8c6a32]">{SOURCE_LABEL[comment.source] ?? comment.source}</span>
                <span className="text-xs text-muted-foreground">{STATUS_LABEL[comment.status]}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm">{comment.text}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {INTENT_LABEL[comment.primaryIntent]}
                {comment.products[0] ? ` · ${comment.products[0].code}` : ""}
              </p>
            </button>
          ))}
        </div>
      </section>
      <section className={`min-h-0 min-w-0 overflow-auto ${selected ? "block" : "hidden lg:block"}`}>
        {selected ? (
          <button type="button" className="mb-3 text-sm text-[#6d2e32] lg:hidden" onClick={() => setSelectedId(null)}>
            ← К списку
          </button>
        ) : null}
        {error ? <p className="mb-3 text-sm text-[#9b2c2c]">{error}</p> : null}
        {selected ? (
          <CommentDetail
            comment={selected}
            onChange={(comment) => {
              setComments((current) => current?.map((item) => (item.id === comment.id ? comment : item)) ?? [comment]);
            }}
          />
        ) : (
          <div className="rounded-3xl border border-dashed border-[#e4d8c4] bg-[#fffdf8] p-8 text-sm text-muted-foreground">
            Выберите комментарий слева.
          </div>
        )}
      </section>
    </div>
  );
}

function CommentDetail({
  comment,
  onChange,
}: {
  comment: CommentDTO;
  onChange: (comment: CommentDTO) => void;
}) {
  const [replyPublic, setReplyPublic] = useState(comment.replyPublic);
  const [replyPrivate, setReplyPrivate] = useState(comment.replyPrivate);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setReplyPublic(comment.replyPublic);
    setReplyPrivate(comment.replyPrivate);
    setManualCode("");
  }, [comment.id, comment.replyPublic, comment.replyPrivate]);

  async function act(path: string, body?: unknown) {
    setBusy(path);
    const response = await fetch(path, {
      method: path.endsWith("/skip") ? "POST" : "PATCH",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await response.json()) as { comment?: CommentDTO; error?: string };
    setBusy("");
    if (data.comment) onChange(data.comment);
  }

  async function send() {
    setBusy("send");
    await fetch(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyPublic, replyPrivate }),
    });
    const response = await fetch(`/api/comments/${comment.id}/send`, { method: "POST" });
    const data = (await response.json()) as { comment?: CommentDTO };
    setBusy("");
    if (data.comment) onChange(data.comment);
  }

  const local = comment.delivery === "local";
  const canSend = comment.status !== "skipped" && (replyPublic.trim() || replyPrivate.trim());

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-[#e4d8c4] bg-[#fffdf8] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{INTENT_LABEL[comment.primaryIntent]}</Badge>
          <Badge variant="outline">{STATUS_LABEL[comment.status]}</Badge>
          <span className="text-xs text-muted-foreground">{Math.round(comment.confidence * 100)}% уверенности</span>
        </div>
        <p className="mt-4 font-display text-3xl leading-tight text-[#2a211c]">{comment.text}</p>
        <p className="mt-3 text-sm text-[#5c5348]">{comment.reason}</p>
        <p className="mt-4 text-xs tracking-[0.14em] text-[#8c6a32] uppercase">Подпись поста</p>
        <p className="mt-1 text-sm whitespace-pre-wrap text-[#3d342b]">
          {comment.post.caption || "Подписи нет. Добавьте артикул в пост или привяжите изделие вручную."}
        </p>
        {comment.post.permalink ? (
          <a className="mt-2 inline-block text-sm text-[#6d2e32] underline" href={comment.post.permalink} target="_blank" rel="noreferrer">
            Открыть пост
          </a>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {comment.products.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#e4d8c4] bg-white/60 p-4 text-sm text-muted-foreground md:col-span-2">
            {comment.primaryIntent === "none"
              ? "Без карточки: это реакция. В ответ только короткая благодарность, без цены и ссылки."
              : "Карточка не выбрана: бот не называет цену наугад и просит артикул."}
          </div>
        ) : (
          comment.products.map((product) => <ProductCard key={product.url} product={product} />)
        )}
      </div>

      {comment.status !== "skipped" ? (
        <div className="rounded-3xl border border-[#e4d8c4] bg-[#fffdf8] p-5">
          <p className="text-xs tracking-[0.14em] text-[#8c6a32] uppercase">Как это выглядит в комментарии</p>
          <Textarea className="mt-3 min-h-32 bg-white" value={replyPublic} onChange={(event) => setReplyPublic(event.target.value)} />
          {comment.primaryIntent === "none" ? null : (
            <>
              <p className="mt-4 text-xs tracking-[0.14em] text-[#8c6a32] uppercase">Личное сообщение со ссылкой</p>
              <p className="mt-1 text-xs text-muted-foreground">
                В комментарии ссылка часто не нажимается. В директ она приходит рабочей, одно сообщение на комментарий.
              </p>
              <Textarea className="mt-2 min-h-32 bg-white" value={replyPrivate} onChange={(event) => setReplyPrivate(event.target.value)} />
            </>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button className="h-9" disabled={!canSend || busy !== ""} onClick={() => void send()}>
              {comment.source === "demo" || comment.source === "simulator" ? "Сохранить как ответ" : "Отправить в Instagram"}
            </Button>
            <Button variant="outline" className="h-9" disabled={busy !== ""} onClick={() => void act(`/api/comments/${comment.id}/skip`)}>
              Не отвечать
            </Button>
            <Button
              variant="secondary"
              className="h-9"
              disabled={busy !== ""}
              onClick={() => void act(`/api/comments/${comment.id}`, { replyPublic, replyPrivate })}
            >
              Запомнить правку
            </Button>
          </div>
          {local ? (
            <p className="mt-3 text-sm text-[#1c3b2c]">
              Ответ сохранён локально. В Instagram он не ушёл: это учебный комментарий, живого id у него нет.
            </p>
          ) : null}
          {comment.delivery === "instagram" ? (
            <p className="mt-3 text-sm text-[#1c3b2c]">Ответ ушёл в Instagram.</p>
          ) : null}
          {comment.replyError ? <p className="mt-3 text-sm text-[#9b2c2c]">{comment.replyError}</p> : null}
          <form
            className="mt-4 flex flex-col gap-2 border-t border-[#efe6d4] pt-4 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void act(`/api/comments/${comment.id}`, { manualCode });
            }}
          >
            <input
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="Другой артикул, если бот промахнулся"
              className="h-9 flex-1 rounded-lg border border-[#e4d8c4] bg-white px-3 text-sm"
            />
            <Button type="submit" variant="outline" className="h-9" disabled={!manualCode.trim() || busy !== ""}>
              Привязать
            </Button>
          </form>
        </div>
      ) : (
        <div className="rounded-3xl bg-[#24382c] p-5 text-[#f6f3ea]">
          <p className="font-display text-2xl">Ответ не нужен</p>
          <p className="mt-2 text-sm text-[#d7e3da]">
            Комплименты и реакции бот не комментирует, чтобы лента не заполнялась одинаковыми «спасибо».
          </p>
        </div>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: ProductDTO }) {
  return (
    <a
      href={product.url}
      target="_blank"
      rel="noreferrer"
      className="flex gap-3 rounded-3xl border border-[#e4d8c4] bg-white p-3 hover:border-[#8c6a32]"
    >
      {product.image ? (
        // Catalog photos are served by the shop; next/image would require a remote allowlist for every upload path.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image} alt="" className="h-24 w-20 rounded-2xl object-cover" />
      ) : (
        <div className="h-24 w-20 rounded-2xl bg-[#efe6d4]" />
      )}
      <div>
        <p className="text-xs text-[#8c6a32]">{product.category}</p>
        <p className="font-medium text-[#2a211c]">{product.title}</p>
        <p className="mt-1 text-sm">{formatPrice(product.price) ?? "цену смотрите в карточке"}</p>
        <p className="text-xs text-muted-foreground">
          {[product.metal, product.size ? `размер ${product.size.toLowerCase()}` : ""].filter(Boolean).join(" · ")}
        </p>
      </div>
    </a>
  );
}
