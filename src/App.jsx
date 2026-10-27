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
import Conciergerie from './pages/Conciergerie';
import Prestataires from './pages/Prestataires';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import RegisterDeliverer from './pages/auth/RegisterDeliverer';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

import OrderTunnel from './pages/client/OrderTunnel';
import OrderTracking from './pages/client/OrderTracking';
import OrderHistory from './pages/client/OrderHistory';
import ClientHome from './pages/client/ClientHome';
import Recipients from './pages/client/Recipients';
import BatchOrder from './pages/client/BatchOrder';
import Team from './pages/client/Team';
import Favorites from './pages/client/Favorites';
import Profile from './pages/Profile';
import SavedAddresses from './pages/SavedAddresses';

import DelivererDashboard from './pages/deliverer/DelivererDashboard';
import MerchantDashboard from './pages/merchant/MerchantDashboard';
import {
  DashboardPage, DelivererDetailPage, DeliverersPage, FinancePage, DisputesPage, MessagesPage, OrdersPage, PricingPage, ProvidersPage, TasksPage, UsersPage,
} from './pages/admin/AdminPages';
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
        <Route path="/conciergerie" element={<Conciergerie />} />
        <Route path="/prestataires" element={<Prestataires />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/a-propos" element={<About />} />
        <Route path="/connexion" element={<Login />} />
        <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
        <Route path="/reinitialiser-mot-de-passe" element={<ResetPassword />} />
        <Route path="/inscription" element={<Register />} />
        <Route path="/inscription/livreur" element={<RegisterDeliverer />} />
      </Route>

      <Route element={<DashboardLayout />}>
        {/* --- Commun à tous les rôles connectés --- */}
        <Route
          path="/profil"
          element={
            <ProtectedRoute roles={['client', 'livreur', 'commercant']}>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/adresses"
          element={
            <ProtectedRoute roles={['client', 'commercant']}>
              <SavedAddresses />
            </ProtectedRoute>
          }
        />

        {/* --- Client --- */}
        <Route
          path="/client/accueil"
          element={
            <ProtectedRoute roles={['client']}>
              <ClientHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/commander"
          element={
            <ProtectedRoute roles={['client']}>
              <OrderTunnel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/destinataires"
          element={
            <ProtectedRoute roles={['client']}>
              <Recipients />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/equipe"
          element={
            <ProtectedRoute roles={['client']}>
              <Team />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/favoris"
          element={
            <ProtectedRoute roles={['client']}>
              <Favorites />
            </ProtectedRoute>
          }
        />
        <Route
          path="/client/lot"
          element={
            <ProtectedRoute roles={['client']}>
              <BatchOrder />
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
        <Route path="/admin" element={<DashboardPage />} />
        <Route path="/admin/livreurs" element={<DeliverersPage />} />
        <Route path="/admin/livreurs/:id" element={<DelivererDetailPage />} />
        <Route path="/admin/utilisateurs" element={<UsersPage />} />
        <Route path="/admin/prestataires" element={<ProvidersPage />} />
        <Route path="/admin/livraisons" element={<OrdersPage />} />
        <Route path="/admin/litiges" element={<DisputesPage />} />
        <Route path="/admin/messages" element={<MessagesPage />} />
        <Route path="/admin/taches" element={<TasksPage />} />
        <Route path="/admin/finances" element={<FinancePage />} />
        <Route path="/admin/tarifs" element={<PricingPage />} />
      </Route>

      <Route path="*" element={<Home />} />
    </Routes>
  );
}
