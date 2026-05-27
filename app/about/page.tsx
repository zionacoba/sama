import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/app/components/navbar";

export const metadata: Metadata = {
  title: "About Sama",
  description:
    "Learn about Sama -- the Philippine outdoor adventure marketplace connecting people to trusted organizers.",
  openGraph: {
    title: "About Sama",
    description:
      "Learn about Sama -- the Philippine outdoor adventure marketplace connecting people to trusted organizers.",
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/about`,
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-full bg-white font-sans text-stone-900">
      <Navbar />

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:py-28">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
            Adventure, together.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-stone-500">
            Sama is a Philippine outdoor adventure marketplace -- connecting people to trusted
            organizers, protecting the places they love, and building the professional backbone
            of the outdoor industry.
          </p>
        </section>

        {/* Divider */}
        <div className="mx-auto max-w-3xl px-4">
          <hr className="border-stone-100" />
        </div>

        {/* Our Name */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
            Our name
          </h2>
          <h3 className="mt-3 text-2xl font-bold text-stone-900 sm:text-3xl">
            What Sama means
          </h3>
          <p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
            Sama means together in Filipino. Every trip on this platform happens because people
            chose to go together. Every organizer is part of a community going somewhere
            together. Every decision we make asks: does this bring people closer, or push them
            apart?
          </p>
        </section>

        {/* Mission */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
              Mission
            </h2>
            <h3 className="mt-3 text-2xl font-bold text-stone-900 sm:text-3xl">
              What we&apos;re building
            </h3>
            <p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
              A Philippines where outdoor adventures are led by accountable, professional
              organizers -- where every trail is respected, every local guide is valued, and
              every adventure leaves the destination better than it was found.
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
            Values
          </h2>
          <div className="mt-8 space-y-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                Sama
              </p>
              <h3 className="mt-1.5 text-xl font-bold text-stone-900">Together</h3>
              <p className="mt-3 text-base leading-relaxed text-stone-500">
                We believe outdoor adventures are better when shared. Sama exists to strengthen
                connections between joiners, organizers, and the places they visit.
              </p>
            </div>

            <div className="border-t border-stone-100 pt-10">
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                Responsibilidad
              </p>
              <h3 className="mt-1.5 text-xl font-bold text-stone-900">Responsibility</h3>
              <p className="mt-3 text-base leading-relaxed text-stone-500">
                The trails and mountains of the Philippines are not ours to use carelessly. We
                promote responsible outdoor activity that respects nature and leaves every
                destination better than we found it.
              </p>
            </div>

            <div className="border-t border-stone-100 pt-10">
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                Malasakit
              </p>
              <h3 className="mt-1.5 text-xl font-bold text-stone-900">Care</h3>
              <p className="mt-3 text-base leading-relaxed text-stone-500">
                We care about everyone the adventure touches -- the joiners, the organizers, the
                local guides, and the communities behind every trail.
              </p>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
              Contact
            </h2>
            <h3 className="mt-3 text-2xl font-bold text-stone-900 sm:text-3xl">
              Get in touch
            </h3>
            <p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
              Have a question, a concern, or want to partner with us? We would love to hear
              from you.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <a
                href="mailto:hello@sama.com.ph"
                className="inline-flex items-center justify-center rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark"
              >
                hello@sama.com.ph
              </a>
              <Link
                href="/organizer/apply"
                className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white px-6 py-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead"
              >
                Become an organizer
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-400">
        <p>Sama is built for the Philippine outdoor community -- by people who love it.</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Link href="/" className="underline-offset-4 hover:text-trailhead hover:underline">
            Home
          </Link>
          <span aria-hidden>·</span>
          <Link href="/trips" className="underline-offset-4 hover:text-trailhead hover:underline">
            Browse trips
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="underline-offset-4 hover:text-trailhead hover:underline">
            Terms
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="underline-offset-4 hover:text-trailhead hover:underline">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
