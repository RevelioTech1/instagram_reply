import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { Shell } from "@/components/shell";
import "./globals.css";

const sans = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
});

const display = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-display-family",
});

export const metadata: Metadata = {
  title: "Иордань — ответы на комментарии",
  description: "Бот мастерской «Иордань» отвечает на вопросы о цене и ведёт в карточку изделия на iordani.com.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${sans.variable} ${display.variable}`}>
      <body className="antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
