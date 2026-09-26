import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from './store/useAuthStore';

import PublicLayout from './components/layouts/PublicLayout';
import DashboardLayout from './components/layouts/DashboardLayout';
import ProtectedRoute from './routes/ProtectedRoute';

import Home from './pages/Home';
import Contact from './pages/Contact';
import About from './pages/About';
import Marketplace from './pages/Marketplace';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import RegisterDeliverer from './pages/auth/RegisterDeliverer';

import OrderTunnel from './pages/client/OrderTunnel';
import OrderTracking from './pages/client/OrderTracking';
import OrderHistory from './pages/client/OrderHistory';

import DelivererDashboard from './pages/deliverer/DelivererDashboard';
import MerchantDashboard from './pages/merchant/MerchantDashboard';
import AdminBackOffice from './pages/admin/AdminBackOffice';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './components/layouts/AdminLayout';

// Cartographie des routes par rôle — cf. architecture_structure_technique.md §2
// et prompt frontend §2 "Routing".
// Ancienne adresse de la page des annonces (elle s'appelait "Marché") : les liens déjà partagés continuent
// de fonctionner, avec leurs paramètres (ex. ?annonce=12).
function LegacyMarketRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/annonces', search }} replace />;
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const navigate = useNavigate();

  // Restaure la session (GET /auth/me) au chargement si un token est déjà stocké.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Toucher une notification alors que l'app est ouverte : le service worker demande le changement
  // de page, ce qui évite de recharger l'application.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type === 'PUSH_NAVIGATE' && typeof event.data.path === 'string') navigate(event.data.path);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  return (
    <Routes>
      {/* --- Public --- */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/annonces" element={<Marketplace />} />
        <Route path="/marche" element={<LegacyMarketRedirect />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/a-propos" element={<About />} />
        <Route path="/connexion" element={<Login />} />
        <Route path="/inscription" element={<Register />} />
        <Route path="/inscription/livreur" element={<RegisterDeliverer />} />
      </Route>

      <Route element={<DashboardLayout />}>
        {/* --- Client --- */}
        <Route
          path="/client/commander"
          element={
            <ProtectedRoute roles={['client']}>
              <OrderTunnel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/commandes"
          element={
            <ProtectedRoute roles={['client']}>
              <OrderHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/suivi/:orderId"
          element={
            <ProtectedRoute roles={['client']}>
              <OrderTracking />
            </ProtectedRoute>
          }
        />

        {/* --- Livreur --- */}
        <Route
          path="/deliverer/tableau-de-bord"
          element={
            <ProtectedRoute roles={['livreur']}>
              <DelivererDashboard />
            </ProtectedRoute>
          }
        />

        {/* --- Commerçant --- */}
        <Route
          path="/merchant/tableau-de-bord"
          element={
            <ProtectedRoute roles={['commercant']}>
              <MerchantDashboard />
            </ProtectedRoute>
          }
        />

      </Route>

      {/* --- Administrateur : connexion et cadre à part, sans le site public --- */}
      <Route path="/admin/connexion" element={<AdminLogin />} />
      <Route
        element={
          <ProtectedRoute roles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminBackOffice />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  );
}
