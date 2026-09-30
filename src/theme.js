// Palette e stili condivisi per un'interfaccia coerente e moderna
export const colors = {
  bg: '#0F1115',
  surface: '#1A1D23',
  surfaceAlt: '#22262E',
  border: '#2C313A',
  primary: '#5B8CFF',
  primaryDim: '#2E3E63',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  text: '#F4F6F9',
  textDim: '#9AA3B2',
};

export const spacing = (n) => n * 8;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
};

export const typography = {
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 15, fontWeight: '500', color: colors.textDim },
  body: { fontSize: 15, color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.textDim, letterSpacing: 0.4 },
  mono: { fontFamily: 'monospace', fontSize: 13, color: colors.text },
  caption: { fontSize: 12, color: colors.textDim },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
};

// Ombra leggera coerente per elevare le card principali sopra lo sfondo,
// invece di affidarsi solo al border (più moderno, meno "flat casuale").
export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 10,
  elevation: 4,
};
