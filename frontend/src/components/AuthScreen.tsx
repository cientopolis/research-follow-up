import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth } from '../firebase';

export const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          throw new Error('Las contraseñas no coinciden.');
        }
        await createUserWithEmailAndPassword(auth, email, password);
        setSuccess('¡Cuenta creada con éxito! Iniciando sesión...');
      } else if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setSuccess('Se ha enviado un enlace de recuperación a tu correo electrónico.');
      }
    } catch (err: any) {
      console.error(err);
      let message = err.message;
      if (err.code === 'auth/invalid-credential') {
        message = 'Credenciales inválidas. Revisa tu email y contraseña.';
      } else if (err.code === 'auth/weak-password') {
        message = 'La contraseña debe tener al menos 6 caracteres.';
      } else if (err.code === 'auth/email-already-in-use') {
        message = 'El correo electrónico ya se encuentra registrado.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'El correo electrónico ingresado no es válido.';
      } else if (err.code === 'auth/user-not-found') {
        message = 'No se encontró ninguna cuenta asociada a este correo.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(circle at 50% 50%, #eff1f5 0%, #dce0e8 100%)',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '40px 32px',
        borderRadius: '16px',
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.05)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '2.5rem', margin: '0 auto' }}>🍅</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4c4f69', margin: 0 }}>
            Research Follow-up
          </h1>
          <p style={{ fontSize: '0.8rem', color: '#7c7f93', margin: 0 }}>
            Spatial Semantic Canvas & Pomodoro Tracker
          </p>
        </div>

        {/* Action Title */}
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#4c4f69', margin: 0, textAlign: 'center' }}>
          {mode === 'signin' && 'Iniciar Sesión'}
          {mode === 'signup' && 'Crear Cuenta'}
          {mode === 'reset' && 'Recuperar Contraseña'}
        </h2>

        {/* Feedback Messages */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(210, 15, 57, 0.1)',
            border: '1px solid #d20f39',
            color: '#d20f39',
            fontSize: '0.75rem',
            lineHeight: '1.4'
          }}>
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(64, 160, 43, 0.1)',
            border: '1px solid #40a02b',
            color: '#40a02b',
            fontSize: '0.75rem',
            lineHeight: '1.4'
          }}>
            ✓ {success}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleAction} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#5c5f77' }}>Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
              disabled={loading}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #ccd0da',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'border-color 0.2s',
                background: '#ffffff',
                boxSizing: 'border-box',
                width: '100%'
              }}
            />
          </div>

          {mode !== 'reset' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#5c5f77' }}>Contraseña</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #ccd0da',
                  fontSize: '0.85rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
              />
            </div>
          )}

          {mode === 'signup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#5c5f77' }}>Confirmar Contraseña</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #ccd0da',
                  fontSize: '0.85rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
              />
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              background: loading ? '#bcc0cc' : '#fe640b',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
              marginTop: '8px',
              width: '100%'
            }}
          >
            {loading ? 'Procesando...' : (
              <>
                {mode === 'signin' && 'Iniciar Sesión'}
                {mode === 'signup' && 'Registrarse'}
                {mode === 'reset' && 'Enviar Correo'}
              </>
            )}
          </button>
        </form>

        {/* Footer Navigation Links */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          marginTop: '8px',
          fontSize: '0.75rem',
          color: '#7c7f93'
        }}>
          {mode === 'signin' && (
            <>
              <div 
                onClick={() => setMode('signup')}
                style={{ cursor: 'pointer', color: '#1e66f5', fontWeight: 500 }}
              >
                ¿No tienes cuenta? Regístrate aquí
              </div>
              <div 
                onClick={() => setMode('reset')}
                style={{ cursor: 'pointer', color: '#7c7f93' }}
              >
                ¿Olvidaste tu contraseña?
              </div>
            </>
          )}

          {mode === 'signup' && (
            <div 
              onClick={() => setMode('signin')}
              style={{ cursor: 'pointer', color: '#1e66f5', fontWeight: 500 }}
            >
              ¿Ya tienes cuenta? Inicia sesión
            </div>
          )}

          {mode === 'reset' && (
            <div 
              onClick={() => setMode('signin')}
              style={{ cursor: 'pointer', color: '#1e66f5', fontWeight: 500 }}
            >
              Volver al Inicio de Sesión
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
