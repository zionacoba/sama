import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { approveOrganizer, rejectOrganizer } from "@/app/actions/admin";

type OrganizerApplication = {
  id: string;
  full_name: string;
  display_name: string | null;
  email: string;
  phone: string;
  bio: string;
  status: string;
  created_at: string;
};

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "approved"
      ? "bg-emerald-100 text-emerald-800"
      : status === "rejected"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-900";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${styles}`}>
      {status}
    </span>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default async function AdminOrganizersPage() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("organizers")
    .select("id, full_name, display_name, email, phone, bio, status, created_at")
    .order("created_at", { ascending: false });

  const applications = (data ?? []) as OrganizerApplication[];
  const pending = applications.filter((a) => a.status === "pending");
  const reviewed = applications.filter((a) => a.status !== "pending");

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-90">
              ⛰ Sama
            </Link>
            <p className="mt-0.5 text-sm text-trailhead-muted">Admin</p>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-trailhead-muted">
            <Link href="/admin" className="transition hover:text-white">Bookings</Link>
            <Link href="/admin/organizers" className="text-white">Organizers</Link>
            <Link href="/" className="transition hover:text-white">← Back to site</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Organizer Applications
          </h1>
          <p className="mt-1 text-stone-600">
            {pending.length} pending · {reviewed.length} reviewed
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Failed to load applications: {error.message}
          </p>
        )}

        {/* Pending */}
        {pending.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">Pending review</h2>
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-trailhead/20 bg-trailhead text-white">
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Bio</th>
                      <th className="px-4 py-3 font-semibold">Applied on</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((app) => (
                      <tr key={app.id} className="border-b border-stone-100 last:border-0 hover:bg-trailhead-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-medium text-stone-900">{app.full_name}</p>
                          {app.display_name && (
                            <p className="text-xs text-stone-400">{app.display_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-stone-600">{app.email}</td>
                        <td className="px-4 py-3 text-stone-600">{app.phone}</td>
                        <td className="max-w-xs px-4 py-3 text-stone-600">
                          <p className="line-clamp-2">{app.bio}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                          {formatDate(app.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <form action={approveOrganizer.bind(null, app.id)}>
                              <button
                                type="submit"
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                              >
                                Approve
                              </button>
                            </form>
                            <form action={rejectOrganizer.bind(null, app.id)}>
                              <button
                                type="submit"
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                              >
                                Reject
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Reviewed */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-stone-900">Reviewed</h2>
          {reviewed.length === 0 ? (
            <p className="text-stone-500">No reviewed applications yet.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-700">
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Bio</th>
                      <th className="px-4 py-3 font-semibold">Applied on</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewed.map((app) => (
                      <tr key={app.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-stone-900">{app.full_name}</p>
                          {app.display_name && (
                            <p className="text-xs text-stone-400">{app.display_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-stone-600">{app.email}</td>
                        <td className="px-4 py-3 text-stone-600">{app.phone}</td>
                        <td className="max-w-xs px-4 py-3 text-stone-600">
                          <p className="line-clamp-2">{app.bio}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                          {formatDate(app.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={app.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
