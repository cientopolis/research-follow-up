import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
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

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Se cerró la ventana de inicio de sesión antes de completar.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Este dominio o IP aún no está autorizado en Firebase Console → Authentication → Settings → Dominios autorizados.');
      } else {
        setError(err.message || 'Error al iniciar sesión con Google.');
      }
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
          <h1 style={{ fontSize: '1.75rem', margin: 0, letterSpacing: '-0.02em' }}>
            <span style={{ fontWeight: 700, color: 'var(--color-investigador, #1A2B48)' }}>Dire</span>
            <span style={{ fontWeight: 400, color: 'var(--accent, #C17F59)' }}>Atento</span>
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-sub, #4A5568)', margin: 0, lineHeight: 1.4 }}>
            Acompañe el progreso de sus tesistas y realice un seguimiento atento de sus investigaciones
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

        {mode !== 'reset' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1, height: '1px', background: '#ccd0da' }} />
              <span style={{ fontSize: '0.72rem', color: '#7c7f93', fontWeight: 500 }}>o bien</span>
              <div style={{ flex: 1, height: '1px', background: '#ccd0da' }} />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              style={{
                padding: '11px 14px',
                borderRadius: '8px',
                border: '1px solid #ccd0da',
                background: '#ffffff',
                color: '#4c4f69',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                transition: 'background-color 0.2s, border-color 0.2s',
                width: '100%'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continuar con Google
            </button>
          </>
        )}

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
