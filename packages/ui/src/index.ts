/** ألوان «ساحة» للتطبيق (React Native لا يقرأ CSS). مطابقة لـ tokens.css. */
export const colors = {
  light: {
    primary: '#0B6E4F', accent: '#F2B705', ink: '#0E1A24', bg: '#F6F3EC', surface: '#FFFFFF',
    muted: '#6B7780', border: '#E3DED2', danger: '#D7263D', info: '#2D7FF9',
  },
  dark: {
    primary: '#2FA37A', accent: '#F2B705', ink: '#F6F3EC', bg: '#0E1A24', surface: '#16252F',
    muted: '#9AA6AE', border: '#24343F', danger: '#FF5A6E', info: '#5C9DFF',
  },
} as const;

export const fonts = { display: 'Cairo', body: 'IBM Plex Sans Arabic' } as const;
export const radius = { sm: 8, md: 16, pill: 999 } as const;
export const space = [4, 8, 12, 16, 24, 32, 48] as const;
export const fontSizes = [12, 14, 16, 20, 24, 32, 40] as const;

export const brand = {
  name: 'ساحة',
  nameLatin: 'Saha',
  tagline: 'كل جمهور يستحق بطولته',
} as const;
