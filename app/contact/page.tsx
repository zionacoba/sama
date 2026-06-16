import type { Metadata } from "next";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";

export const metadata: Metadata = {
  title: "Contact Sama",
  description: "Get in touch with Sama. Reach the team by email or book a call, and view our registered business details.",
};

const BOOKING_LINK = "https://calendar.app.google/1dBzwm2bX957oQ8C9";

export default function ContactPage() {
  return (
    <div className="flex min-h-full flex-col bg-stone-50 font-sans text-stone-900">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">
            Contact Sama
          </h1>
          <p className="mt-4 leading-relaxed text-stone-600">
            Sama is a one-person operation, so whether you are an organizer or a joiner, your message reaches a real
            person and gets a real reply. We would love to hear from you.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
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

          <div className="mt-10 space-y-8 text-stone-600">
            <section>
              <h2 className="text-lg font-bold text-stone-900">Business details</h2>
              <dl className="mt-3 space-y-3 leading-relaxed">
                <div>
                  <dt className="text-sm font-semibold text-stone-700">Registered name</dt>
                  <dd className="mt-0.5">ACPAM Web Portal Services (operating as Sama)</dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-stone-700">Email</dt>
                  <dd className="mt-0.5">
                    <a href="mailto:hello@sama.com.ph" className="text-trailhead hover:underline">
                      hello@sama.com.ph
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-stone-700">Address</dt>
                  <dd className="mt-0.5">
                    2F SpaceMD, 489 Shaw Blvd., Addition Hills, City of Mandaluyong, NCR 1550, Philippines
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-stone-700">TIN</dt>
                  <dd className="mt-0.5">327-559-715-00000</dd>
                </div>
              </dl>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">Registered with the BIR</h2>
              <p className="mt-3 leading-relaxed">
                Sama is operated by ACPAM Web Portal Services, a business registered with the Bureau of Internal
                Revenue (BIR) of the Philippines.
              </p>
              <a
                href="https://www.bir.gov.ph"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block"
              >
                <img
                  src="/bir-seal.png"
                  alt="BIR Registered Business"
                  className="h-10 w-auto"
                />
              </a>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
