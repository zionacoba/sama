import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";

export const metadata: Metadata = {
  title: "Founding Partner Invitation | Sama",
  description:
    "You've been personally invited to join Sama as a Founding Partner. 20 spots. 5% for life. Closes July 31, 2026.",
  openGraph: {
    title: "Founding Partner Invitation | Sama",
    description:
      "You've been personally invited to join Sama as a Founding Partner. 20 spots. 5% for life. Closes July 31, 2026.",
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/founding-partners`,
    type: "website",
  },
};

const terms = [
  { label: "Platform fee", value: "5% per booking, locked in for life" },
  { label: "Spots available", value: "20 only" },
  { label: "Deadline", value: "July 31, 2026" },
  { label: "Lock-in", value: "None. Stop anytime." },
];

const benefits = [
  "Founding Partner badge on your organizer profile, permanent, only for the first 20",
  "Direct line to Zion, your feedback shapes how Sama develops",
  "Featured visibility as Sama grows its audience",
  "Access to the Sama Organizer Community (private Facebook group)",
];

export default function FoundingPartnersPage() {
  return (
    <div className="flex min-h-full flex-col bg-white font-sans text-stone-900">
      <Navbar />

      <main className="flex-1">
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
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
              Founding Partner Invitation
            </p>
            <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-tight text-white! sm:text-4xl">
              You&apos;re invited to join Sama as a Founding Partner.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/80">
              20 spots. 5% platform fee, locked in for life. Closes July 31, 2026.
            </p>
          </div>
        </section>

        {/* Key terms */}
        <section className="mx-auto max-w-3xl px-6 py-10 sm:px-4 sm:py-16">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
            Key terms
          </h2>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            {terms.map((term) => (
              <div
                key={term.label}
                className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <dt className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                  {term.label}
                </dt>
                <dd className="mt-1.5 text-base font-semibold text-stone-900">{term.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Benefits */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-3xl px-6 py-10 sm:px-4 sm:py-16">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
              Founding Partner benefits
            </h2>
            <ul className="mt-6 space-y-2 sm:space-y-3">
              {benefits.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-base leading-relaxed text-stone-600 sm:text-lg"
                >
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-trailhead"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 111.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* A founder's note */}
        <section className="bg-trailhead/5">
          <div className="mx-auto max-w-3xl px-6 py-10 sm:px-4 sm:py-16">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
              A founder&apos;s note
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-700 sm:text-xl">
              I&apos;m personally inviting a small group of organizers I trust and respect to help
              build what Sama becomes. If you&apos;re reading this, it&apos;s because I believe
              you&apos;re one of them. I&apos;m excited to work with you.
            </p>
          </div>
        </section>

        {/* How to apply */}
        <section className="mx-auto max-w-3xl px-6 py-10 text-center sm:px-4 sm:py-16">
          <h2 className="text-2xl font-bold text-stone-900 sm:text-3xl">Ready to apply?</h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-stone-500 sm:text-lg">
            The application takes about 5 minutes. For the best experience, complete it on a desktop
            or laptop.
          </p>
          <div className="mt-8">
            <Link
              href="/apply"
              className="inline-flex w-full items-center justify-center rounded-xl bg-trailhead px-10 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-trailhead-dark sm:w-auto"
            >
              Apply now
            </Link>
          </div>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-stone-400">
            You&apos;ll need to create a Sama account first if you haven&apos;t already.
            Applications are personally reviewed. You&apos;ll hear back within a few days.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
