import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";

export const metadata: Metadata = {
  title: "Become an Organizer | Sama",
  description:
    "Sama is looking for serious, accountable Philippine outdoor organizers who care about doing this right.",
  openGraph: {
    title: "Become an Organizer | Sama",
    description:
      "Sama is looking for serious, accountable Philippine outdoor organizers who care about doing this right.",
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/organizers`,
    type: "website",
  },
};

// Scheduling link for booking a call.
const BOOKING_LINK = "https://calendar.app.google/1dBzwm2bX957oQ8C9";

const lookingFor = [
  "Have a track record of running safe, well-organized trips",
  "Actively practice and promote Leave No Trace and responsible outdoor behavior",
  "Treat their joiners, local guides, and host communities with respect",
  "Are honest about difficulty levels and set realistic expectations",
  "Care about the advocacy, not just the business",
  "Want to be part of raising the standard of the Philippine outdoor industry",
];

const handles = [
  "Online booking and payment collection (GCash and QR Ph)",
  "Automatic booking confirmations and reminders sent to joiners",
  "Digital waivers signed and recorded at every booking",
  "Emergency contact and medical info collected at booking",
  "Waitlist management with automatic notifications when slots open",
  "A public organizer profile where joiners can find and trust you",
];

export default function OrganizersPage() {
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
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Become a Sama Organizer
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/80">
              We&apos;re building the professional backbone of the Philippine outdoor adventure
              industry. We&apos;re looking for serious, accountable organizers who care about doing
              this right.
            </p>
          </div>
        </section>

        {/* Who we're looking for */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
            Who we&apos;re looking for
          </h2>
          <p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
            Sama is not open to everyone. We personally vet every organizer on the platform.
            We&apos;re looking for organizers who:
          </p>
          <ul className="mt-6 space-y-3">
            {lookingFor.map((item) => (
              <li key={item} className="flex gap-3 text-base leading-relaxed text-stone-600 sm:text-lg">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-trailhead" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-base font-medium leading-relaxed text-stone-700 sm:text-lg">
            If this sounds like you, we&apos;d love to hear from you.
          </p>
        </section>

        {/* What Sama handles */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
              What Sama handles for you
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {handles.map((item) => (
                <div
                  key={item}
                  className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
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
                  <span className="text-base leading-relaxed text-stone-600">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What Sama stands for */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-trailhead">
            What Sama stands for
          </h2>
          <p className="mt-4 text-base leading-relaxed text-stone-500 sm:text-lg">
            Sama means together. It is built for the Philippine outdoor community, by people who love
            it. We stand for safety, responsibility, and care for the communities behind every trail.
            Sama is not just a booking platform. It is a community with standards.
          </p>
        </section>

        {/* CTA */}
        <section className="bg-stone-50">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
            <h2 className="text-2xl font-bold text-stone-900 sm:text-3xl">
              Interested in becoming an organizer?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-stone-500 sm:text-lg">
              Email us or book a call if you&apos;re interested or have questions.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <a
                href="mailto:hello@sama.com.ph"
                className="inline-flex w-full items-center justify-center rounded-xl bg-trailhead px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark sm:w-auto"
              >
                Email hello@sama.com.ph
              </a>
              <a
                href={BOOKING_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-xl border border-stone-200 bg-white px-8 py-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead sm:w-auto"
              >
                Book a call
              </a>
            </div>
            <p className="mx-auto mt-8 max-w-xl text-sm leading-relaxed text-stone-400">
              Sama is a one-person operation. Every application is reviewed personally. Every message
              gets a real reply. Zion, Founder
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
