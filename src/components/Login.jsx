import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError('Correo o contraseña incorrectos. Verifica e intenta de nuevo.')
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.iconGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                style={{
                  ...styles.iconDot,
                  background: i % 2 === 0 ? '#40916c' : '#b7e4c7',
                }}
              />
            ))}
          </div>
          <div>
            <div style={styles.brandTitle}>Tejidos y Confecciones</div>
            <div style={styles.brandSub}>LAURA LIZETH</div>
          </div>
        </div>

        <h1 style={styles.heading}>Iniciar sesión</h1>
        <p style={styles.subheading}>Entra con tu correo para ver y anotar los pedidos.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@gmail.com"
              style={styles.input}
              autoComplete="email"
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
              autoComplete="current-password"
            />
          </div>

          {error && <div style={styles.error}>⚠️ {error}</div>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p style={styles.footnote}>
          ¿No tienes acceso? Pídele a la persona administradora que cree tu usuario.
        </p>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f7f5',
    fontFamily: "'Inter', sans-serif",
    padding: 16,
  },
  card: {
    background: '#fff',
    border: '1px solid #d0e8d8',
    borderRadius: 16,
    padding: 36,
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 8px 30px rgba(26,26,46,0.08)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  iconGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 2,
    width: 28,
    height: 28,
    flexShrink: 0,
  },
  iconDot: { display: 'block', borderRadius: 1 },
  brandTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2 },
  brandSub: {
    fontSize: 10,
    fontWeight: 600,
    color: '#2d6a4f',
    letterSpacing: '0.08em',
    fontFamily: "'DM Mono', monospace",
  },
  heading: { fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginBottom: 6 },
  subheading: { fontSize: 13, color: '#6b7c6e', marginBottom: 24, lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7c6e',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontFamily: "'DM Mono', monospace",
  },
  input: {
    padding: '11px 14px',
    border: '1px solid #d0e8d8',
    borderRadius: 9,
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    background: '#f5f7f5',
    outline: 'none',
    color: '#1a1a2e',
  },
  error: {
    background: '#fdf2f2',
    color: '#c0392b',
    fontSize: 13,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #f5c6cb',
  },
  button: {
    marginTop: 6,
    padding: '12px 18px',
    background: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  footnote: {
    marginTop: 22,
    fontSize: 12,
    color: '#6b7c6e',
    textAlign: 'center',
    lineHeight: 1.5,
  },
}
