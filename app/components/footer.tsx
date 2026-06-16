import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
      © {new Date().getFullYear()} Sama.
      {" · "}
      <Link href="/organizers" className="underline-offset-4 hover:text-trailhead hover:underline">
        Become an Organizer
      </Link>
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
      <a href="mailto:hello@sama.com.ph" className="underline-offset-4 hover:text-trailhead hover:underline">
        Email
      </a>
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
      <p className="mt-3 text-xs text-stone-400">
        ACPAM Web Portal Services (operating as Sama)
        <br />
        2F SpaceMD, 489 Shaw Blvd., Addition Hills, City of Mandaluyong, NCR 1550, Philippines
      </p>
    </footer>
  );
}
