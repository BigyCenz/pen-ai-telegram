// Design tokens condivisi. Vedi docs/DESIGN.md per le scelte dietro.
export const colors = {
  // superfici (dal fondo verso l'alto)
  bg: '#0B0D12',
  surface: '#141821',
  surfaceAlt: '#1B2029',
  surfaceHigh: '#232A36',
  border: '#262D3A',
  borderSoft: '#1E2430',

  // marchio
  primary: '#6C8CFF',
  primaryDim: '#2A3763',
  primarySoft: 'rgba(108,140,255,0.14)',

  // semantici
  success: '#34D399',
  successSoft: 'rgba(52,211,153,0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.13)',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.14)',

  // accenti per area funzionale (icone nelle sezioni)
  accentAi: '#A78BFA',
  accentTelegram: '#38BDF8',
  accentBle: '#60A5FA',
  accentWifi: '#2DD4BF',

  text: '#F3F5F9',
  textDim: '#98A2B3',
  textFaint: '#667085',
};

// Griglia a 4 pt (spacing(1) = 8, spacing(0.5) = 4).
export const spacing = (n) => n * 8;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const typography = {
  display: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, fontWeight: '500', color: colors.textDim, lineHeight: 20 },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textDim, letterSpacing: 0.8 },
  mono: { fontFamily: 'monospace', fontSize: 12.5, color: colors.text },
  caption: { fontSize: 12, color: colors.textDim },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
};

export const gradients = {
  hero: ['#1B2440', '#141821'],
  heroConnected: ['#12362B', '#141821'],
  heroError: ['#3A1B20', '#141821'],
  primary: ['#7C9BFF', '#5B7BF0'],
};

// Ombra leggera per elevare le card principali.
export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.28,
  shadowRadius: 14,
  elevation: 5,
};

// Colore + trasparenza a partire da un esadecimale a 6 cifre.
export const tint = (hex, alpha = 0.16) => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
};
