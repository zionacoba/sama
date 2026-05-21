import type { MetadataRoute } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const BASE_URL = "https://landas-zeta.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const admin = createSupabaseAdminClient();

  const [{ data: trips }, { data: organizers }] = await Promise.all([
    admin
      .from("trips")
      .select("slug, updated_at")
      .eq("status", "active")
      .or("is_template.is.null,is_template.eq.false"),
    admin
      .from("organizers")
      .select("id, updated_at")
      .eq("status", "approved"),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/trips`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
  ];

  const tripRoutes: MetadataRoute.Sitemap = (trips ?? []).map((t) => ({
    url: `${BASE_URL}/trips/${t.slug}`,
    lastModified: t.updated_at ? new Date(t.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const organizerRoutes: MetadataRoute.Sitemap = (organizers ?? []).map((o) => ({
    url: `${BASE_URL}/organizers/${o.id}`,
    lastModified: o.updated_at ? new Date(o.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...tripRoutes, ...organizerRoutes];
}
