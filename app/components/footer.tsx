import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function Footer({ hideBecomeOrganizer = false }: { hideBecomeOrganizer?: boolean }) {
  let showBecomeOrganizer = !hideBecomeOrganizer;

  if (showBecomeOrganizer) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: organizer } = await supabase
        .from("organizers")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (organizer?.status === "approved") {
        showBecomeOrganizer = false;
      }
    }
  }

  return (
    <footer className="mt-auto border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
      © {new Date().getFullYear()} Sama.
      {showBecomeOrganizer && (
        <>
          {" · "}
          <Link href="/organizers" className="underline-offset-4 hover:text-trailhead hover:underline">
            Become an Organizer
          </Link>
        </>
      )}
      {" · "}
      <Link href="/about" className="underline-offset-4 hover:text-trailhead hover:underline">
        About
      </Link>
      {" · "}
      <Link href="/terms" className="underline-offset-4 hover:text-trailhead hover:underline">
        Terms of Service
      </Link>
      {" · "}
      <Link href="/terms#refund-policy" className="underline-offset-4 hover:text-trailhead hover:underline">
        Refund Policy
      </Link>
      {" · "}
      <Link href="/privacy" className="underline-offset-4 hover:text-trailhead hover:underline">
        Privacy Policy
      </Link>
      {" · "}
      <Link href="/contact" className="underline-offset-4 hover:text-trailhead hover:underline">
        Contact
      </Link>
      {" · "}
      <a
        href="https://www.bir.gov.ph"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="/bir-seal.png"
          alt="BIR Registered Business"
          className="h-5 w-auto inline-block"
        />
      </a>
    </footer>
  );
}
