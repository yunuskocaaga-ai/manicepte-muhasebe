import Link from "next/link";
import { logoutAction } from "./actions";

// Bu bölümdeki tüm sayfalar kimlik doğrulamalı, kişiye özel canlı finansal
// veri gösterir; build zamanında statik olarak önbelleğe alınmamalıdır.
export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { href: "/genel-bakis", label: "Genel Bakış", icon: "🏠" },
  { href: "/giderler", label: "Giderler", icon: "🧾" },
  { href: "/borclar", label: "Borçlar", icon: "🤝" },
  { href: "/kisiler", label: "Kişiler", icon: "👥" },
  { href: "/raporlar", label: "Raporlar", icon: "📊" },
  { href: "/cop-kutusu", label: "Çöp Kutusu", icon: "🗑️" },
  { href: "/ayarlar", label: "Ayarlar", icon: "⚙️" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <Link href="/genel-bakis" className="text-base font-semibold text-slate-900">
          ManiCepte
        </Link>
        <nav className="hidden items-center gap-4 text-sm text-slate-600 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-slate-900">
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
            Çıkış
          </button>
        </form>
      </header>

      <main className="flex-1 pb-20 md:pb-8">
        <div className="mx-auto w-full max-w-4xl px-4 py-6">{children}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-between border-t border-slate-200 bg-white px-1 py-1 md:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] text-slate-600 active:bg-slate-100"
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
