import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/app/components/navbar";

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
          <p className="text-sm text-stone-400">Last updated: —</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
            Privacy Policy
          </h1>

          <div className="prose prose-stone mt-8 max-w-none text-stone-600">
            <p className="text-stone-500 italic">Content coming soon.</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
        {" · "}
        <Link href="/organizer/apply" className="underline-offset-4 hover:text-trailhead hover:underline">
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
