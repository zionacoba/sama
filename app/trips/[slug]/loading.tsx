export default function Loading() {
  return (
    <div className="min-h-full animate-pulse bg-stone-50 text-stone-900">
      {/* Nav skeleton */}
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <div className="h-7 w-24 rounded-lg bg-stone-200" />
          <div className="h-5 w-20 rounded-lg bg-stone-200" />
        </div>
      </header>

      <main>
        {/* Hero / title area */}
        <section className="border-b border-stone-200 bg-gradient-to-b from-trailhead-muted/60 to-stone-50 px-4 pt-4 pb-5">
          <div className="mx-auto max-w-6xl space-y-3">
            <div className="flex gap-2">
              <div className="h-6 w-20 rounded-full bg-stone-200" />
              <div className="h-6 w-24 rounded-full bg-stone-200" />
            </div>
            <div className="h-8 w-3/4 rounded-xl bg-stone-200" />
            <div className="h-5 w-1/2 rounded-lg bg-stone-200" />
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
          {/* Photo gallery banner */}
          <div className="mb-8 h-60 rounded-2xl bg-stone-200 sm:h-[400px]" />

          {/* Content + sidebar grid */}
          <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
            {/* Main content */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm space-y-3">
                <div className="h-5 w-1/4 rounded-lg bg-stone-200" />
                <div className="h-4 w-full rounded-lg bg-stone-200" />
                <div className="h-4 w-5/6 rounded-lg bg-stone-200" />
                <div className="h-4 w-4/6 rounded-lg bg-stone-200" />
                <div className="h-4 w-full rounded-lg bg-stone-200" />
                <div className="h-4 w-3/4 rounded-lg bg-stone-200" />
              </div>
              <div className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm space-y-3">
                <div className="h-5 w-1/3 rounded-lg bg-stone-200" />
                <div className="h-4 w-2/3 rounded-lg bg-stone-200" />
                <div className="h-4 w-1/2 rounded-lg bg-stone-200" />
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm space-y-4">
                <div className="h-6 w-1/2 rounded-lg bg-stone-200" />
                <div className="h-4 w-3/4 rounded-lg bg-stone-200" />
                <div className="h-4 w-2/3 rounded-lg bg-stone-200" />
                <div className="h-12 w-full rounded-xl bg-stone-200 mt-2" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
