import { useState } from 'react'
import { supabase } from '../supabaseClient'
import logo from '../assets/logo.png'

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
      <svg className="lg-hilos" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <path pathLength="1" stroke="#4b8523" d="M-20 120 C 160 20, 260 300, 420 170 S 700 60, 820 190" />
        <path pathLength="1" stroke="#1a3c63" d="M-20 250 C 180 330, 300 90, 470 260 S 680 400, 820 280" />
        <path pathLength="1" stroke="#4b8523" d="M-20 380 C 140 260, 300 480, 450 380 S 700 250, 820 400" />
        <path pathLength="1" stroke="#1a3c63" d="M-20 500 C 200 440, 320 600, 500 510 S 700 430, 820 520" />
      </svg>
      <div style={styles.card}>
        <div style={styles.brand}>
          <img src={logo} alt="L&L" style={styles.logoImg} />
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
    background: '#f5f2e7',
    fontFamily: "'Inter', sans-serif",
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    background: '#fffdf8',
    border: '1px solid #dde3d2',
    borderRadius: 16,
    padding: 36,
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 8px 30px rgba(26,60,99,0.10)',
  },
  brand: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 18,
  },
  logoImg: {
    height: 110,
    objectFit: 'contain',
  },
  heading: { fontSize: 22, fontWeight: 800, color: '#1a3c63', marginBottom: 6, textAlign: 'center', fontFamily: "'Playfair Display', serif" },
  subheading: { fontSize: 13, color: '#6a7d5a', marginBottom: 24, lineHeight: 1.5, textAlign: 'center' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: '#6a7d5a',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontFamily: "'DM Mono', monospace",
  },
  input: {
    padding: '11px 14px',
    border: '1px solid #dde3d2',
    borderRadius: 9,
    fontSize: 14,
    fontFamily: "'Inter', sans-serif",
    background: '#f5f2e7',
    outline: 'none',
    color: '#1a3c63',
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
    background: '#4b8523',
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
    color: '#6a7d5a',
    textAlign: 'center',
    lineHeight: 1.5,
  },
}
