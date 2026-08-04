import type { MetadataRoute } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const admin = createSupabaseAdminClient();

  const [{ data: trips }, { data: organizers }] = await Promise.all([
    admin
      .from("trips")
      .select("slug")
      .eq("status", "active")
      .or("is_template.is.null,is_template.eq.false")
      .not("slug", "is", null),
    admin
      .from("organizers")
      .select("id")
      .eq("status", "approved"),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/trips`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
  ];

  const tripRoutes: MetadataRoute.Sitemap = (trips ?? []).map((t) => ({
    url: `${BASE_URL}/trips/${t.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const organizerRoutes: MetadataRoute.Sitemap = (organizers ?? []).map((o) => ({
    url: `${BASE_URL}/organizers/${o.id}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...tripRoutes, ...organizerRoutes];
}
