import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/app/components/navbar";

export const metadata: Metadata = {
  title: "About Sama",
  description:
    "Learn about Sama, the Philippine outdoor adventure marketplace connecting people to trusted organizers.",
  openGraph: {
    title: "About Sama",
    description:
      "Learn about Sama, the Philippine outdoor adventure marketplace connecting people to trusted organizers.",
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
        <section className="relative bg-trailhead px-4 pb-24 pt-32 text-center sm:pb-32 sm:pt-40">
          {/* Dot grid texture */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <svg className="h-full w-full opacity-10" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="hero-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="1.5" fill="white" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#hero-dots)" />
            </svg>
          </div>
          {/* Content */}
          <div className="relative">
            <img src="/sama-mark.svg" alt="Sama" className="h-16 w-auto mx-auto mb-6 brightness-0 invert" />
            <h1 className="mt-6 text-5xl font-bold tracking-tight text-white sm:text-7xl">
              Adventure, together.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              A booking platform built exclusively for Philippine outdoor adventures. We connect people to trusted organizers, protect the places they love, and build the professional backbone of the outdoor industry.
            </p>
            <div className="mt-8">
              <Link
                href="/trips"
                className="inline-flex items-center justify-center rounded-xl bg-white px-8 py-3 text-sm font-semibold text-trailhead shadow-sm transition hover:bg-stone-100"
              >
                Browse trips
              </Link>
            </div>
          </div>
        </section>

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
          <p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
            The name is not just a word. It is a standard we hold ourselves to.
          </p>
        </section>

        {/* Mission */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
              Mission
            </h2>
            <h3 className="mt-3 text-2xl font-bold text-stone-900 sm:text-3xl">
              What we are building
            </h3>
            <p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
              We are not just a booking platform. We are building the professional backbone of
              the Philippine outdoor adventure industry.
            </p>
            <p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
              That means accountable organizers. Responsible trails. Local guides who are valued,
              not invisible. And adventures that leave every destination better than they were found.
            </p>
            <p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
              A Philippines where the outdoors is for everyone who loves it.
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="bg-trailhead/5">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
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

              <div className="border-t border-stone-200 pt-10">
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

              <div className="border-t border-stone-200 pt-10">
                <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                  Malasakit
                </p>
                <h3 className="mt-1.5 text-xl font-bold text-stone-900">Care</h3>
                <p className="mt-3 text-base leading-relaxed text-stone-500">
                  We care about everyone the adventure touches: joiners, organizers, local guides,
                  and the communities behind every trail.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Who we are for */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
            Who we are for
          </h2>
          <div className="mt-8 space-y-8">
            <p className="text-base leading-relaxed text-stone-500 sm:text-lg">
              For first-time hikers who want to experience the outdoors without feeling lost or
              intimidated. Sama makes it easy to find the right trip, the right organizer, and the
              right experience for where you are right now.
            </p>
            <p className="text-base leading-relaxed text-stone-500 sm:text-lg">
              For experienced adventurers who want to explore more of the Philippines with
              organizers who know what they are doing. Every organizer on Sama is vetted, named,
              and accountable.
            </p>
            <p className="text-base leading-relaxed text-stone-500 sm:text-lg">
              For organizers who care about doing this right. Sama is not for everyone. It is for
              the ones who take safety seriously, respect the environment, and want to build
              something lasting.
            </p>
          </div>
        </section>

        {/* Mission quote */}
        <section className="bg-trailhead px-4 py-20 text-center sm:py-24">
          <blockquote className="mx-auto max-w-2xl">
            <p className="text-2xl font-bold leading-snug text-white sm:text-3xl">
              &ldquo;The outdoors of the Philippines is one of the most extraordinary in the
              world. Sama exists to make sure it stays that way, and that every Filipino can
              access it.&rdquo;
            </p>
          </blockquote>
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
              Sama is built and run personally by its founder. If you have a question, an idea,
              or just want to say hello, I'd love to hear from you.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <a
                href="mailto:hello@sama.com.ph"
                className="inline-flex items-center justify-center rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark"
              >
                hello@sama.com.ph
              </a>
              <Link
                href="/apply"
                className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white px-6 py-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead"
              >
                Become an organizer
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-400">
        <p>Sama is built for the Philippine outdoor community, by people who love it.</p>
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
          <a href="/terms#refund-policy" className="underline-offset-4 hover:text-trailhead hover:underline">
            Refund Policy
          </a>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="underline-offset-4 hover:text-trailhead hover:underline">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
