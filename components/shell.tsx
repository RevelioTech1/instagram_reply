"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { StatsDTO } from "@/lib/dto";
import { cn } from "cn";

const LINKS = [
  { href: "/", label: "Входящие" },
  { href: "/catalog", label: "Каталог" },
  { href: "/posts", label: "Посты" },
  { href: "/settings", label: "Подключение" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stats, setStats] = useState<StatsDTO | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () => {
      fetch("/api/stats")
        .then((response) => response.json())
        .then((data: StatsDTO) => {
          if (!stop) setStats(data);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fbf7ef,_#f3eee4_42%,_#ebe3d4)] text-foreground">
      <header className="sticky top-0 z-20 border-b border-[#e4d8c4]/80 bg-[#f7f2e8]/90 backdrop-blur">
        <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-end md:justify-between md:px-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="font-display text-[2.1rem] leading-none tracking-tight text-[#6d2e32]">Иордань</p>
              <p className="mt-1 text-sm text-muted-foreground">
                ответы под постами @{stats?.username ?? "iordani925"} → карточка на iordani.com
              </p>
            </div>
            <Connection stats={stats} />
          </div>
          <nav className="flex w-full min-w-0 flex-wrap gap-1 md:w-auto md:flex-nowrap">
            {LINKS.map((link) => {
              const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
                    active ? "bg-[#6d2e32] text-[#fbf7f0]" : "text-[#3d342b] hover:bg-[#efe6d4]",
                  )}
                >
                  {link.label}
                  {link.href === "/" && stats ? (
                    <span className={cn("ml-2 text-xs", active ? "text-[#f3d7c8]" : "text-[#8c6a32]")}>
                      {stats.waiting + stats.review}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}

function Connection({ stats }: { stats: StatsDTO | null }) {
  if (!stats) return null;
  return (
    <div className="mb-1 hidden text-right text-xs sm:block">
      <p className={stats.connected ? "text-[#1c3b2c]" : "text-[#8c6a32]"}>
        {stats.connected ? "Instagram подключён" : "Instagram не подключён"}
      </p>
      <p className="text-muted-foreground">
        {stats.autoReply ? "автоответ включён" : "сначала черновик"} · {stats.products.toLocaleString("ru-RU")} изделий
      </p>
    </div>
  );
}
