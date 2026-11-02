"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductDTO } from "@/lib/dto";
import { formatPrice } from "@/lib/format";

type Category = { slug: string; name: string; count: number };

const PAGE_SIZE = 24;

export function CatalogView() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductDTO[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [query, category]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("category", category);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      fetch(`/api/catalog?${params.toString()}`)
        .then((response) => response.json())
        .then(
          (data: {
            products: ProductDTO[];
            categories: Category[];
            total: number;
            pageCount: number;
            page: number;
          }) => {
            setProducts(data.products);
            setCategories(data.categories);
            setTotal(data.total);
            setPageCount(Math.max(1, data.pageCount || 1));
            if (data.page && data.page !== page) setPage(data.page);
            setError("");
          },
        )
        .catch(() => setError("Каталог не открылся."));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, category, page]);

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <div className="max-w-2xl">
        <h1 className="font-display text-5xl text-[#2a211c]">Каталог, из которого бот берёт цены</h1>
        <p className="mt-2 text-sm text-[#5c5348]">
          Цены и ссылки сняты с карточек iordani.com. Бот не называет сумму, которой нет в этой базе.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Артикул или название: Б-КО-338, Матрона, хризма"
          className="h-10 bg-white md:max-w-md"
        />
        <p className="text-sm text-muted-foreground">
          {products === null
            ? "Загрузка…"
            : total === 0
              ? "0 товаров"
              : `Показаны ${from}–${to} из ${total}`}
        </p>
      </div>
      <div className="mt-4 flex min-w-0 gap-2 overflow-x-auto pb-1">
        <FilterChip
          active={!category}
          onClick={() => setCategory("")}
          label="Все разделы"
        />
        {categories.map((item) => (
          <FilterChip
            key={item.slug}
            active={category === item.slug}
            onClick={() => setCategory(item.slug)}
            label={`${item.name} ${item.count}`}
          />
        ))}
      </div>
      {error ? <p className="mt-4 text-sm text-[#9b2c2c]">{error}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {products?.map((product) => (
          <a
            key={product.url}
            href={product.url}
            target="_blank"
            rel="noreferrer"
            className="flex gap-3 rounded-3xl border border-[#e4d8c4] bg-[#fffdf8] p-3 hover:border-[#8c6a32]"
          >
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image} alt="" className="h-28 w-24 rounded-2xl object-cover" />
            ) : (
              <div className="h-28 w-24 rounded-2xl bg-[#efe6d4]" />
            )}
            <div>
              <p className="text-xs text-[#8c6a32]">{product.code}</p>
              <p className="mt-1 text-sm font-medium">{product.title}</p>
              <p className="mt-2 text-sm">{formatPrice(product.price) ?? "цена в карточке"}</p>
            </div>
          </a>
        ))}
      </div>
      {products?.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Ничего не нашлось. Проверьте артикул: буквы могут быть и русскими, и латинскими.
        </p>
      ) : null}
      {products && total > PAGE_SIZE ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          onChange={(next) => {
            setPage(next);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const pages = visiblePages(page, pageCount);
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-9 bg-white"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Назад
      </Button>
      {pages.map((item, index) =>
        item === "…" ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Button
            key={item}
            type="button"
            variant={item === page ? "default" : "outline"}
            className={`h-9 min-w-9 ${item === page ? "bg-[#6d2e32] text-[#fbf7f0] hover:bg-[#6d2e32]/90" : "bg-white"}`}
            onClick={() => onChange(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button
        type="button"
        variant="outline"
        className="h-9 bg-white"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        Вперёд
      </Button>
    </div>
  );
}

function visiblePages(page: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const items: Array<number | "…"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) items.push("…");
  for (let value = start; value <= end; value += 1) items.push(value);
  if (end < pageCount - 1) items.push("…");
  items.push(pageCount);
  return items;
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${active ? "bg-[#6d2e32] text-[#fbf7f0]" : "bg-white text-[#3d342b]"}`}
    >
      {label}
    </button>
  );
}
