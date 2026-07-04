import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Sama — the Philippine outdoor adventure marketplace.",
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-full flex-col bg-stone-50 font-sans text-stone-900">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm text-stone-500">Last updated: July 2026</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
            Privacy Policy
          </h1>
          <div className="mt-2 space-y-0.5 text-sm text-stone-500">
            <p>Operated by: Paul Zion Acoba</p>
            <p>Contact: <a href="mailto:hello@sama.com.ph" className="text-trailhead hover:underline">hello@sama.com.ph</a></p>
          </div>

          <div className="mt-8 space-y-8 text-stone-600">

            <section>
              <h2 className="text-lg font-bold text-stone-900">1. Introduction</h2>
              <p className="mt-2 leading-relaxed">
                Sama (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is committed to protecting your personal information in accordance with Republic Act 10173, the Data Privacy Act of 2012 of the Philippines. This Privacy Policy explains what data we collect, how we use it, and your rights.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">2. Information We Collect</h2>
              <p className="mt-2 font-medium text-stone-700">When you create an account:</p>
              <ul className="mt-1.5 space-y-1 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Full name</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Email address</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Phone number</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Facebook profile URL (optional) — shared with organizers of trips you book to facilitate group chat invitations.</span></li>
              </ul>
              <p className="mt-3 font-medium text-stone-700">In your profile (optional):</p>
              <ul className="mt-1.5 space-y-1 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Date of birth - shown to trip organizers for safety and registration records.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>A default emergency contact (name and phone) that is reused to pre-fill your bookings. Unlike a booking-specific emergency contact, this profile copy persists with your account until you change or remove it.</span></li>
              </ul>
              <p className="mt-3 font-medium text-stone-700">When you make a booking:</p>
              <ul className="mt-1.5 space-y-1 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Number of slots booked</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Emergency contact name and phone number</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Medical notes or allergies (optional)</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Selected pickup point</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Payment information (processed by PayMongo — we do not store card details)</span></li>
              </ul>
              <p className="mt-3 font-medium text-stone-700">When you confirm as a participant:</p>
              <ul className="mt-1.5 space-y-1 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Full name</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Emergency contact details</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Medical notes</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Waiver acceptance and timestamp</span></li>
              </ul>
              <p className="mt-3 font-medium text-stone-700">When you apply as an organizer:</p>
              <ul className="mt-1.5 space-y-1 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Full name, display name, phone, bio</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Social media profile URLs (Facebook, Instagram, TikTok) — displayed publicly on your organizer profile.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Evidence of past trips</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Activity types and years of experience</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Emergency certification status</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Payout details (bank account or GCash number) used to remit your earnings from completed trips.</span></li>
              </ul>
              <p className="mt-3 font-medium text-stone-700">Automatically collected:</p>
              <ul className="mt-1.5 space-y-1 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Browser type and device information</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Pages visited and time spent</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>IP address</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>IP address at the time of waiver acceptance, for legal record-keeping purposes</span></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">3. How We Use Your Information</h2>
              <p className="mt-2 leading-relaxed">We use your information to:</p>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Create and manage your account</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Process bookings and payments</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Send booking confirmations and trip reminders</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Allow organizers to contact confirmed participants</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Review and approve organizer applications</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Improve the platform and user experience</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Comply with legal obligations</span></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">4. How We Share Your Information</h2>
              <p className="mt-2 leading-relaxed">We do not sell your personal data. We share your information only with:</p>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Organizers</strong> — your name, email, phone, emergency contact, pickup point, and medical notes are shared with the organizer of trips you book</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">PayMongo</strong> — payment processing. Their privacy policy applies to payment data</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Resend</strong> — transactional email delivery</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Supabase</strong> — database and authentication infrastructure</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Vercel</strong> — hosting infrastructure</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Sentry</strong> — error monitoring and diagnostics; receives technical information such as IP address and device/browser details to help us detect and fix problems</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Legal authorities</strong> — if required by Philippine law</span></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">5. Data Retention</h2>
              <p className="mt-2 leading-relaxed">
                We retain your personal data for as long as your account is active or as required by law. Personal data associated with cancelled bookings is retained for record-keeping purposes. You may request deletion of your personal data at any time by deleting your account or contacting <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>. Booking and payment records, including consent and waiver records, are retained for a minimum of 10 years for legal, financial, and dispute resolution purposes.
              </p>
              <p className="mt-3 leading-relaxed">
                Health information (medical notes and allergies) and emergency-contact information attached to a specific booking are used only to support participant safety for that booked trip. This sensitive data is kept for a shorter retention period than the rest of the booking record: it is automatically deleted 90 days after the trip ends. The surrounding booking, payment, consent, and waiver records are retained for the longer legal and financial period described above, but the health and emergency-contact fields within them are permanently stripped once the 90-day window passes. This is why a booking record may persist for up to 10 years while its medical notes and emergency-contact details do not.
              </p>
              <p className="mt-3 leading-relaxed">
                Separately, if you save a default emergency contact in your profile, that profile copy persists with your account until you remove it or delete your account, because it is reused to pre-fill your future bookings. You can edit or clear your profile emergency contact at any time in your profile settings.
              </p>
              <p className="mt-3 leading-relaxed">
                Profile photos and trip photos uploaded to Sama are permanently deleted from our storage when you delete your account.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">6. Your Rights Under the Data Privacy Act</h2>
              <p className="mt-2 leading-relaxed">As a data subject under RA 10173, you have the right to:</p>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Access</strong> — request a copy of your personal data we hold</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Correction</strong> — request correction of inaccurate data</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Erasure</strong> — delete your account from your <Link href="/profile?tab=profile" className="text-trailhead hover:underline">profile settings</Link>, or contact us to request deletion of specific data. Note that booking, payment, consent, and waiver records are retained for the legal periods described in Data Retention above (up to 10 years), so some records may be kept, in limited form, even after an erasure request, where the law requires it.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Object</strong> — object to the processing of your personal data</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">Portability</strong> — request your data in a portable format</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span><strong className="font-semibold text-stone-800">File a complaint</strong> — with the National Privacy Commission (NPC)</span></li>
              </ul>
              <p className="mt-3 leading-relaxed">
                You can delete your account at any time from your{" "}
                <Link href="/profile?tab=profile" className="text-trailhead hover:underline">profile settings</Link>.
                {" "}To exercise any other rights, contact us at{" "}
                <a href="mailto:hello@sama.com.ph" className="text-trailhead hover:underline">hello@sama.com.ph</a>.
                {" "}We will respond within 15 business days.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">7. Data Security</h2>
              <p className="mt-2 leading-relaxed">We implement appropriate technical and organizational measures to protect your personal data including:</p>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Encrypted data storage via Supabase</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Secure HTTPS connections</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Strict access controls that limit administrative access to authorized personnel only.</span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Regular security reviews</span></li>
              </ul>
              <p className="mt-3 leading-relaxed">
                In the event of a data breach affecting your rights, we will notify you and the National Privacy Commission within 72 hours of discovery.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">8. Cookies</h2>
              <p className="mt-2 leading-relaxed">
                Sama uses cookies and similar technologies to maintain your session and improve your experience. You can disable cookies in your browser settings, though this may affect platform functionality.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">9. Children&apos;s Privacy</h2>
              <p className="mt-2 leading-relaxed">
                Sama is not intended for users under 18 years of age. We do not knowingly collect personal data from minors.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">10. Changes to This Policy</h2>
              <p className="mt-2 leading-relaxed">
                We may update this Privacy Policy from time to time. Material changes will be communicated via email. Continued use of the platform after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-stone-900">11. Contact and Complaints</h2>
              <p className="mt-2 leading-relaxed">For privacy concerns or to exercise your rights:</p>
              <ul className="mt-2 space-y-1.5 leading-relaxed">
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>Email: <a href="mailto:hello@sama.com.ph" className="text-trailhead hover:underline">hello@sama.com.ph</a></span></li>
                <li className="flex gap-2"><span className="mt-1 shrink-0 text-stone-400">•</span><span>You may also file a complaint with the National Privacy Commission at <a href="https://www.privacy.gov.ph" target="_blank" rel="noopener noreferrer" className="text-trailhead hover:underline">www.privacy.gov.ph</a></span></li>
              </ul>
            </section>

            <p className="border-t border-stone-100 pt-6 text-sm text-stone-500">
              Sama is operated as a sole proprietorship by Paul Zion Acoba, Philippines.
            </p>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
