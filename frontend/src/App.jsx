import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { DawnProvider } from './auth/DawnContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppSky } from './components/AppSky';
import { DawnBackdrop } from './components/DawnBackdrop';
import { Navbar } from './components/Navbar';
import { PinGate } from './components/PinGate';
import { StandaloneScene } from './components/StandaloneScene';
import { StarField } from './components/StarField';
import { SunsetOverlay } from './components/SunsetOverlay';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { VerifyOtpPage } from './pages/VerifyOtpPage';
import { PushLoginPage } from './pages/PushLoginPage';
import { ElegirMetodoPage } from './pages/ElegirMetodoPage';
import { ConfigurarAppPage } from './pages/ConfigurarAppPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { UsuarioDetallePage } from './pages/UsuarioDetallePage';
import { ActividadPage } from './pages/ActividadPage';
import { CuentasRegistradasPage } from './pages/CuentasRegistradasPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DawnProvider>
          <AppSky />
          <StarField />
          <StandaloneScene />
          <DawnBackdrop />
          <SunsetOverlay />
          <Navbar />
          <PinGate />
          <main className="container">
            <Routes>
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/verify-otp" element={<VerifyOtpPage />} />
              <Route path="/aprobar-celular" element={<PushLoginPage />} />
              <Route path="/elegir-metodo" element={<ElegirMetodoPage />} />
              <Route path="/configurar-app" element={<ConfigurarAppPage />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/usuarios"
                element={
                  <ProtectedRoute roles={['superadmin']} skeleton="list">
                    <UsuariosPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/usuarios/:authUserId"
                element={
                  <ProtectedRoute roles={['superadmin']}>
                    <UsuarioDetallePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/actividad"
                element={
                  <ProtectedRoute roles={['superadmin']} skeleton="list">
                    <ActividadPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cuentas-registradas"
                element={
                  <ProtectedRoute roles={['superadmin']} skeleton="list">
                    <CuentasRegistradasPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </DawnProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
