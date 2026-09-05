import { AdminSidebar } from "./Sidebar";

/** Shell riêng khu admin: sidebar + content, không header/footer shop. */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-surface text-on-surface">
      <AdminSidebar />
      <div className="min-w-0 flex-1 px-6 py-10 md:px-10">{children}</div>
    </div>
  );
}
