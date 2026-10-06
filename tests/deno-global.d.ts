// Lets tsc type-check supabase/functions/_shared/email.ts when a test imports it.
// The edge functions themselves run under Deno, which ships the real declaration.
declare const Deno: {
  env: { get(key: string): string | undefined };
};
