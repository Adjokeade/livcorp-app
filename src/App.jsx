import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import useAuthStore from './store/useAuthStore';

import PublicLayout from './components/layouts/PublicLayout';
import DashboardLayout from './components/layouts/DashboardLayout';
import ProtectedRoute from './routes/ProtectedRoute';

import Home from './pages/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import RegisterDeliverer from './pages/auth/RegisterDeliverer';

import OrderTunnel from './pages/client/OrderTunnel';
import OrderTracking from './pages/client/OrderTracking';
import OrderHistory from './pages/client/OrderHistory';

import DelivererDashboard from './pages/deliverer/DelivererDashboard';
import MerchantDashboard from './pages/merchant/MerchantDashboard';
import AdminBackOffice from './pages/admin/AdminBackOffice';

// Cartographie des routes par rôle — cf. architecture_structure_technique.md §2
// et prompt frontend §2 "Routing".
export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // Restaure la session (GET /auth/me) au chargement si un token est déjà stocké.
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      {/* --- Public --- */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/connexion" element={<Login />} />
        <Route path="/inscription" element={<Register />} />
        <Route path="/inscription/livreur" element={<RegisterDeliverer />} />
      </Route>

      {/* --- Client --- */}
      <Route element={<DashboardLayout />}>
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

        {/* --- Administrateur --- */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminBackOffice />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  );
}
