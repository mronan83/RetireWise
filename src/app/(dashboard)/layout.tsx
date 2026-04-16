import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { DashboardHeader } from "@/components/dashboard/header";
import { ChatPanel } from "@/components/ai/chat-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
        <div className="sticky top-0 overflow-y-auto h-screen">
          <SidebarNav />
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <DashboardHeader />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
      <ChatPanel />
    </div>
  );
}
