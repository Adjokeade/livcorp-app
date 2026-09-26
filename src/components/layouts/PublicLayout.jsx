import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import InstallBanner from '../pwa/InstallBanner';
import OfflineBanner from '../pwa/OfflineBanner';

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <OfflineBanner />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <InstallBanner />
    </div>
  );
}
