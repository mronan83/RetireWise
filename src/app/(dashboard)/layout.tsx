import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { DashboardHeader } from "@/components/dashboard/header";
import { ChatPanel } from "@/components/ai/chat-panel";
import { DemoBanner } from "@/components/dashboard/demo-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get("demo")?.value === "1";
  const user = isDemo ? null : await currentUser();

  return (
    <div className="flex min-h-screen flex-col">
      {isDemo && <DemoBanner />}
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
          <div className="sticky top-0 overflow-y-auto h-screen">
            <SidebarNav />
          </div>
        </aside>
        <div className="flex flex-1 flex-col">
          <DashboardHeader isDemo={isDemo} email={user?.email ?? null} />
          <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden">{children}</main>
        </div>
        {!isDemo && <ChatPanel />}
      </div>
    </div>
  );
}
