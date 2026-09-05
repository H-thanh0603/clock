import type { Metadata } from "next";
import { headers } from "next/headers";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CartProvider } from "@/components/CartProvider";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { WishlistProvider } from "@/components/WishlistProvider";
import { AuthProvider } from "@/components/AuthProvider";

const playfair = Playfair_Display({
  subsets: ["latin", "vietnamese"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-jakarta",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Aurel & Co. — Haute Horlogerie | Genève 1892",
  description:
    "Manufacture de Haute Horlogerie tại Genève từ 1892. Đồng hồ cơ cao cấp, tourbillon và bộ sưu tập cá nhân hóa (bespoke).",
  icons: { icon: "/images/logo.png" },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Khu /admin dùng shell riêng (sidebar) — bỏ header/footer + padding của shop.
  const isAdmin =
    (await headers()).get("x-pathname")?.startsWith("/admin") ?? false;
  return (
    <html lang="vi" className={`dark ${playfair.variable} ${jakarta.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-screen bg-surface font-body-md text-body-md text-on-surface antialiased selection:bg-primary selection:text-on-primary">
        <CurrencyProvider>
          <AuthProvider>
            <CartProvider>
              <WishlistProvider>
                {isAdmin ? (
                  <main className="min-h-screen w-full bg-surface">{children}</main>
                ) : (
                  <>
                    <Header />
                    <main className="min-h-[calc(100vh-200px)] w-full bg-surface pt-20">
                      {children}
                    </main>
                    <Footer />
                  </>
                )}
              </WishlistProvider>
            </CartProvider>
          </AuthProvider>
        </CurrencyProvider>
      </body>
    </html>
  );
}
