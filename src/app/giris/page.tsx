import { loginAction } from "./actions";

export default async function GirisPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect ?? "/genel-bakis";

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">ManiCepte</h1>
          <p className="mt-1 text-sm text-slate-500">Gider ve borç takibi</p>
        </div>

        <form action={loginAction} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <input type="hidden" name="redirect" value={redirectTo} />

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              E-posta
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="yonetici@ornek.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Şifre
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          {params.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Giriş Yap
          </button>

          <p className="text-center text-xs text-slate-400">
            Bu uygulama tek yöneticiye özeldir. Herkese açık kayıt yoktur.
          </p>
        </form>
      </div>
    </main>
  );
}
