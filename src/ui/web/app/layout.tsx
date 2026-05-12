import type { Metadata } from "next";
import { Cinzel, Crimson_Pro } from "next/font/google";
import { TooltipProvider } from "@/components/ui/Tooltip";
import PhaseOrb from "@/components/PhaseOrb";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

const crimson = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-crimson",
  display: "swap",
});

export const metadata: Metadata = { title: "The Storyteller's Workbench" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full ${cinzel.variable} ${crimson.variable}`}
    >
      <body className="h-full font-body text-parchment antialiased flex flex-col">
        <TooltipProvider delayDuration={200}>
          <header className="parchment shrink-0 px-6 py-3 flex items-center gap-3">
            <span className="text-xl leading-none" aria-hidden="true">🕯️</span>
            <h1 className="font-display font-semibold tracking-[0.08em] text-[#2a1f12] text-lg">
              The Storyteller's Workbench
            </h1>
            <PhaseOrb />
          </header>
          <main className="flex-1 overflow-hidden">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}
