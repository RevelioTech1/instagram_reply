import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Иордань — ответы на комментарии",
  description: "Бот мастерской «Иордань» отвечает на вопросы о цене и ведёт в карточку изделия на iordani.com.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
