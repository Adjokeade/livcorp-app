import { useOutletContext } from 'react-router-dom';
import { Disputes, Messages, Overview, Tasks } from './AdminBackOffice';
import AdminDelivererDetail from './AdminDelivererDetail';
import AdminDeliverers from './AdminDeliverers';
import AdminFinance from './AdminFinance';
import AdminOrders from './AdminOrders';
import AdminPricing from './AdminPricing';
import AdminProviders from './AdminProviders';
import AdminUsers from './AdminUsers';

// Une page par entrée du menu horizontal : titre, puis le contenu de la section.
function Section({ title, children }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export const DashboardPage = () => <Section title="Tableau de bord"><Overview /></Section>;
export const DeliverersPage = () => <Section title="Livreurs"><AdminDeliverers /></Section>;
export const DelivererDetailPage = () => <Section title="Profil du livreur"><AdminDelivererDetail /></Section>;
export const FinancePage = () => <Section title="Finances"><AdminFinance /></Section>;
export const UsersPage = () => <Section title="Utilisateurs"><AdminUsers /></Section>;
export const OrdersPage = () => <Section title="Livraisons"><AdminOrders /></Section>;
export const DisputesPage = () => <Section title="Litiges"><Disputes /></Section>;
export const TasksPage = () => <Section title="Tâches internes"><Tasks /></Section>;
export function ProvidersPage() {
  const { refreshBadges } = useOutletContext();
  return <Section title="Prestataires"><AdminProviders onCountChange={refreshBadges} /></Section>;
}
export const PricingPage = () => <Section title="Tarifs"><AdminPricing /></Section>;

export function MessagesPage() {
  const { refreshBadges } = useOutletContext();
  return <Section title="Messages"><Messages onCountChange={refreshBadges} /></Section>;
}
