import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import appCss from "../styles.css?url";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 2, retry: 1 },
  },
});

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "הכרם — ניהול פיננסי לבתי ספר" },
      // Open Graph — WhatsApp / Telegram / social previews
      { property: "og:type",        content: "website" },
      { property: "og:url",         content: "https://www.hakerem.app" },
      { property: "og:title",       content: "הכרם — ניהול פיננסי לבתי ספר" },
      { property: "og:description", content: "פלטפורמה חכמה לניהול תקציב, הורים וגביה בבתי ספר" },
      { property: "og:image",       content: "https://www.hakerem.app/og-image.png" },
      { property: "og:image:width",  content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:locale",      content: "he_IL" },
      // Twitter / X card
      { name: "twitter:card",        content: "summary_large_image" },
      { name: "twitter:title",       content: "הכרם — ניהול פיננסי לבתי ספר" },
      { name: "twitter:description", content: "פלטפורמה חכמה לניהול תקציב, הורים וגביה בבתי ספר" },
      { name: "twitter:image",       content: "https://www.hakerem.app/og-image.png" },
    ],
    links: [
      // Favicon
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <html lang="he" dir="rtl">
        <head>
          <HeadContent />
        </head>
        <body>
          <Outlet />
          <Toaster position="top-center" richColors />
          <Scripts />
        </body>
      </html>
    </QueryClientProvider>
  );
}
