import { useEffect, useState } from 'react';
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
import { ConfirmarCorreoPage } from './pages/ConfirmarCorreoPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { PinLoginPage } from './pages/PinLoginPage';
import { VerifyOtpPage } from './pages/VerifyOtpPage';
import { PushLoginPage } from './pages/PushLoginPage';
import { ElegirMetodoPage } from './pages/ElegirMetodoPage';
import { ConfigurarAppPage } from './pages/ConfigurarAppPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { UsuarioDetallePage } from './pages/UsuarioDetallePage';
import { ActividadPage } from './pages/ActividadPage';
import { CuentasRegistradasPage } from './pages/CuentasRegistradasPage';

function ClickFeedback() {
  const [pulses, setPulses] = useState([]);

  useEffect(() => {
    let nextId = 0;
    const timers = new Map();
    const onPointerDown = (event) => {
      if (event.button !== 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const id = nextId++;
      setPulses((current) => [...current.slice(-2), { id, x: event.clientX, y: event.clientY }]);
      timers.set(id, window.setTimeout(() => {
        setPulses((current) => current.filter((pulse) => pulse.id !== id));
        timers.delete(id);
      }, 520));
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <div className="click-feedback-layer" aria-hidden="true">
      {pulses.map((pulse) => (
        <span
          className="click-feedback-ring"
          key={pulse.id}
          style={{ left: pulse.x, top: pulse.y }}
        />
      ))}
    </div>
  );
}

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
          <ClickFeedback />
          <main className="container">
            <Routes>
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/confirmar-correo" element={<ConfirmarCorreoPage />} />
              <Route path="/verify-otp" element={<VerifyOtpPage />} />
              <Route path="/pin-login" element={<PinLoginPage />} />
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
