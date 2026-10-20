"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ProductDTO } from "@/lib/dto";
import { formatPrice } from "@/lib/format";

type Category = { slug: string; name: string; count: number };

export function CatalogView() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductDTO[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("category", category);
      fetch(`/api/catalog?${params.toString()}`)
        .then((response) => response.json())
        .then((data: { products: ProductDTO[]; categories: Category[] }) => {
          setProducts(data.products);
          setCategories(data.categories);
          setError("");
        })
        .catch(() => setError("Каталог не открылся."));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, category]);

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
        <p className="text-sm text-muted-foreground">{products ? `${products.length} на экране` : "Загрузка…"}</p>
      </div>
      <div className="mt-4 flex min-w-0 gap-2 overflow-x-auto pb-1">
        <FilterChip active={!category} onClick={() => setCategory("")} label="Все разделы" />
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
        <p className="mt-6 text-sm text-muted-foreground">Ничего не нашлось. Проверьте артикул: буквы могут быть и русскими, и латинскими.</p>
      ) : null}
    </div>
  );
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
