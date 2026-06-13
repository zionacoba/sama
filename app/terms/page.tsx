import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/app/components/navbar";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for Sama — the Philippine outdoor adventure marketplace.",
};

export default function TermsPage() {
  return (
    <div className="flex min-h-full flex-col bg-stone-50 font-sans text-stone-900">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm text-stone-400">Last updated: June 2026</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
            Terms of Service
          </h1>
          <div className="mt-2 space-y-0.5 text-sm text-stone-500">
            <p>Operated by: Paul Zion Acoba</p>
            <p>Contact: <a href="mailto:hello@sama.com.ph" className="text-trailhead hover:underline">hello@sama.com.ph</a></p>
          </div>

          <div className="mt-8 space-y-8 text-stone-600">

            <section>
              <h2 className="text-lg font-bold text-stone-900">1. Acceptance of Terms</h2>
              <p className="mt-2 leading-relaxed">
                By accessing or using Sama (sama.com.ph), you agree to be bound by these Terms of Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">2. What Sama Is</h2>
              <p className="mt-2 leading-relaxed">
                Sama is a technology marketplace that connects independent outdoor trip organizers with participants ("joiners") in the Philippines. Sama does not organize, operate, guide, or take responsibility for any trip listed on the platform. All trips are independently organized and operated by third-party organizers.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">3. User Accounts</h2>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>You must be at least 18 years old to create an account.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>You are responsible for maintaining the confidentiality of your account credentials.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>You agree to provide accurate and complete information when registering.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>You are responsible for all activity that occurs under your account.</span></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">4. Organizer Accounts</h2>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Organizers must apply and be approved by Sama before listing trips.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Organizers are independent operators and are solely responsible for their trips, participants, safety, permits, and compliance with applicable laws.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Organizers must hold all required permits (DENR, LGU, etc.) for restricted trails and sites.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Organizers can create recurring trip templates with multiple dated runs, allowing participants to book specific departure dates.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Sama reserves the right to suspend or remove any organizer who violates platform policies.</span></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">5. Booking and Payments</h2>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Bookings are made directly through the platform.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Payments are processed via PayMongo (GCash and QR Ph).</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Sama charges a platform commission on each booking as agreed with the organizer.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>No hidden fees are charged to participants — the price shown is the price you pay.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Sama absorbs all payment processing fees on behalf of organizers.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Advanced difficulty trips require manual review and approval by the organizer before your booking is confirmed.</span></li>
              </ul>
            </section>

            <section id="refund-policy">
              <h2 className="text-lg font-bold text-stone-900">6. Cancellation and Refunds</h2>
              <p className="mt-2 leading-relaxed">
                Refunds are processed automatically based on the cancellation policy selected by the trip organizer. The policy that applies to your booking is shown on the trip page before you book and in your booking confirmation email.
              </p>

              <h3 className="mt-5 text-base font-semibold text-stone-800">Cancellation by participant</h3>

              <p className="mt-3 font-medium text-stone-700">Flexible Policy</p>
              <ul className="mt-1.5 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>7 or more days before trip: Full refund</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>3 to 7 days before trip: 50% refund</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Less than 3 days before trip: No refund</span></li>
              </ul>

              <p className="mt-3 font-medium text-stone-700">Moderate Policy</p>
              <ul className="mt-1.5 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>14 or more days before trip: Full refund</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>7 to 14 days before trip: 50% refund</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Less than 7 days before trip: No refund</span></li>
              </ul>

              <p className="mt-3 font-medium text-stone-700">Strict Policy</p>
              <ul className="mt-1.5 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>30 or more days before trip: Full refund</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>7 to 30 days before trip: 50% refund</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Less than 7 days before trip: No refund</span></li>
              </ul>

              <h3 className="mt-5 text-base font-semibold text-stone-800">Cancellation by organizer</h3>
              <p className="mt-2 leading-relaxed">
                If the organizer cancels a trip, all participants receive a full refund regardless of timing or policy.
              </p>

              <h3 className="mt-5 text-base font-semibold text-stone-800">Refund processing</h3>
              <p className="mt-2 leading-relaxed">
                Refunds are returned to the original payment method. GCash refunds typically reflect within 24 hours. QR Ph payments cannot be refunded automatically and will be processed manually. Our team will contact you at{" "}
                <a href="mailto:hello@sama.com.ph" className="text-trailhead hover:underline">hello@sama.com.ph</a>{" "}
                within 3 to 5 business days to arrange the refund.
              </p>

              <h3 className="mt-5 text-base font-semibold text-stone-800">Contact</h3>
              <p className="mt-2 leading-relaxed">
                For refund questions, email{" "}
                <a href="mailto:hello@sama.com.ph" className="text-trailhead hover:underline">hello@sama.com.ph</a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">7. Waivers and Assumption of Risk</h2>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>All participants must agree to the organizer's trip waiver before booking is confirmed.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Participants acknowledge the inherent risks of outdoor activities including physical injury, accidents, and unpredictable weather.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>By booking a trip, you voluntarily assume all risks associated with participation.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Sama is not liable for any injury, loss, or damage arising from participation in any trip listed on the platform.</span></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">8. Participant Responsibilities</h2>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>You are responsible for ensuring you are physically fit to participate in any trip you book.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>You must disclose relevant medical conditions to the organizer.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>You are responsible for bringing appropriate gear and following organizer instructions.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>If booking on behalf of others, you confirm that all participants are aware of and agree to the trip risks and cancellation policy.</span></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">9. Prohibited Conduct</h2>
              <p className="mt-2 leading-relaxed">You agree not to:</p>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Post false, misleading, or fraudulent information.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Impersonate any person or organization.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Use the platform for any unlawful purpose.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Attempt to circumvent platform fees by taking transactions off-platform after initial contact.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Harass, threaten, or harm other users or organizers.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Attempt to book trips with false medical or fitness information.</span></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">10. Intellectual Property</h2>
              <p className="mt-2 leading-relaxed">
                All content on Sama — including the platform design, logo, and features — is owned by Paul Zion Acoba. You may not reproduce, distribute, or create derivative works without written permission.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">11. Limitation of Liability</h2>
              <p className="mt-2 leading-relaxed">
                To the maximum extent permitted by Philippine law, Sama and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform or participation in any trip listed on it.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">12. Changes to Terms</h2>
              <p className="mt-2 leading-relaxed">
                Sama reserves the right to update these Terms at any time. Continued use of the platform after changes constitutes acceptance of the new Terms. Material changes will be communicated via email.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">13. Governing Law</h2>
              <p className="mt-2 leading-relaxed">
                These Terms are governed by the laws of the Republic of the Philippines. Any disputes shall be resolved exclusively in the courts of Mandaluyong City, Philippines.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">14. Contact</h2>
              <p className="mt-2 leading-relaxed">
                For questions about these Terms, contact:{" "}
                <a href="mailto:hello@sama.com.ph" className="text-trailhead hover:underline">hello@sama.com.ph</a>
              </p>
            </section>

          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama.
        {" · "}
        <Link href="/organizers" className="underline-offset-4 hover:text-trailhead hover:underline">
          Become an Organizer
        </Link>
        {" · "}
        <Link href="/terms" className="underline-offset-4 hover:text-trailhead hover:underline">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/privacy" className="underline-offset-4 hover:text-trailhead hover:underline">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
