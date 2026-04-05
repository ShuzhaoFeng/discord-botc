import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "BotC Admin" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-900 text-slate-100 font-sans antialiased flex flex-col">
        <header className="shrink-0 bg-slate-800 border-b border-slate-700 px-6 py-3.5 flex items-center gap-3">
          <span className="text-xl">🧛</span>
          <h1 className="font-semibold tracking-wide">BotC Admin</h1>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
