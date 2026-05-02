import { LogOut } from "lucide-react";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AuthShell } from "../components/AuthShell";
import { useAppData } from "../hooks/useAppData";
import { useAuth } from "../hooks/useAuth";
import { PlaceholderPage } from "../pages/PlaceholderPage";
import { SplashPage } from "../pages/SplashPage";
import { ForgotPasswordPage } from "../pages/auth/ForgotPasswordPage";
import { LoginPage } from "../pages/auth/LoginPage";
import { AddBroadcastPage } from "../pages/user/AddBroadcastPage";
import { AddCustomerServicePage } from "../pages/user/AddCustomerServicePage";
import { BroadcastsPage } from "../pages/user/BroadcastsPage";
import { CustomerServicePage } from "../pages/user/CustomerServicePage";
import { DashboardPage } from "../pages/user/DashboardPage";
import { GroupsPage } from "../pages/user/GroupsPage";
import { ManageBotsPage } from "../pages/user/ManageBotsPage";
import { PushContactsPage } from "../pages/user/PushContactsPage";
import { SettingsPage } from "../pages/user/SettingsPage";
import { StockPage } from "../pages/user/StockPage";
import { TransactionsPage } from "../pages/user/TransactionsPage";

const navItems = [
  { to: "/dashboard", label: "Dashboard", end: true },
  {
    label: "Fitur",
    children: [
      { to: "/broadcasts", label: "Broadcast" },
      { to: "/push-kontak", label: "Push Kontak", end: true },
      { to: "/customer-service", label: "Customer Service", end: true },
    ],
  },
  { to: "/stock", label: "Stock", end: true },
  { to: "/transactions", label: "Transaksi", end: true },
  { to: "/groups", label: "Kelola Group", end: true },
  { to: "/settings", label: "Settings", end: true },
];

function AuthLayout() {
  const auth = useAuth();

  if (auth.restoringSession) {
    return null;
  }

  if (auth.user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AuthShell>
      <Outlet />
    </AuthShell>
  );
}

function ProtectedShell() {
  const auth = useAuth();
  const appData = useAppData();
  const navigate = useNavigate();

  if (auth.restoringSession) {
    return null;
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  async function handleLogout() {
    const confirmed = window.confirm("Yakin ingin keluar dari akun ini?");
    if (!confirmed) return;
    await auth.logout();
    appData.clear();
    navigate("/login", { replace: true });
  }

  return (
    <AppShell
      items={navItems}
      footerAction={{
        label: "Keluar",
        icon: LogOut,
        onClick: handleLogout,
      }}
    >
      <Outlet />
    </AppShell>
  );
}

function NotFoundPage() {
  return <PlaceholderPage title="Page Not Found" description="Route ini belum tersedia." />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<SplashPage />} />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      <Route element={<ProtectedShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/broadcasts" element={<BroadcastsPage />} />
        <Route path="/broadcasts/add" element={<AddBroadcastPage />} />
        <Route path="/push-kontak" element={<PushContactsPage />} />
        <Route path="/customer-service" element={<CustomerServicePage />} />
        <Route path="/customer-service/add" element={<AddCustomerServicePage />} />
        <Route path="/customer-service/:id" element={<AddCustomerServicePage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/bot/manage" element={<ManageBotsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
