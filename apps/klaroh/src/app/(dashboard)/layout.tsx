import { cookies } from 'next/headers';
import DashboardLayout from '@/components/DashboardLayout';
import { SidebarProvider } from '@/components/SidebarContext';

export default async function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  // Read here (not in the root layout) so public pages such as the landing page can be static.
  const collapsed = (await cookies()).get('klaroh_sidebar_collapsed')?.value === 'true';
  return (
    <SidebarProvider initialCollapsed={collapsed}>
      <DashboardLayout>{children}</DashboardLayout>
    </SidebarProvider>
  );
}
