import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const ADMIN_EMAIL = "acobapaulzion@gmail.com";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) redirect("/");

  return <>{children}</>;
}
