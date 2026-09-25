import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage";
import {
  AppLayout,
  CreateTeamPage,
  HomePage,
} from "./pages/AppLayout";
import { TeamPage } from "./pages/TeamPage";

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <RegisterPage />
            </PublicOnly>
          }
        />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="/" element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="teams/new" element={<CreateTeamPage />} />
          <Route path="teams/:teamId" element={<TeamPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
