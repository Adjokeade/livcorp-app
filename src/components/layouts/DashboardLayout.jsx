import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <Header />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-10 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
