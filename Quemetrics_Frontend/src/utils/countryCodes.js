// Country dial codes + national-number digit-length rules used by the
// registration forms (player & organization) for the phone-number field.
//
// `min`/`max` = acceptable length of the NATIONAL number (digits the user
// types, excluding the dial code). On submit the form sends
// `dial + nationalNumber` as a digits-only string, which the backend
// validates with /^\d{7,15}$/.

export const COUNTRY_CODES = [
  { name: 'Pakistan', iso: 'PK', dial: '92', flag: '🇵🇰', min: 10, max: 11 },
  { name: 'India', iso: 'IN', dial: '91', flag: '🇮🇳', min: 10, max: 10 },
  { name: 'United States', iso: 'US', dial: '1', flag: '🇺🇸', min: 10, max: 10 },
  { name: 'Canada', iso: 'CA', dial: '1', flag: '🇨🇦', min: 10, max: 10 },
  { name: 'United Kingdom', iso: 'GB', dial: '44', flag: '🇬🇧', min: 9, max: 10 },
  { name: 'United Arab Emirates', iso: 'AE', dial: '971', flag: '🇦🇪', min: 8, max: 9 },
  { name: 'Saudi Arabia', iso: 'SA', dial: '966', flag: '🇸🇦', min: 9, max: 9 },
  { name: 'Australia', iso: 'AU', dial: '61', flag: '🇦🇺', min: 9, max: 9 },
  { name: 'Bangladesh', iso: 'BD', dial: '880', flag: '🇧🇩', min: 10, max: 10 },
  { name: 'China', iso: 'CN', dial: '86', flag: '🇨🇳', min: 11, max: 11 },
  { name: 'Germany', iso: 'DE', dial: '49', flag: '🇩🇪', min: 10, max: 11 },
  { name: 'France', iso: 'FR', dial: '33', flag: '🇫🇷', min: 9, max: 9 },
  { name: 'Italy', iso: 'IT', dial: '39', flag: '🇮🇹', min: 9, max: 10 },
  { name: 'Spain', iso: 'ES', dial: '34', flag: '🇪🇸', min: 9, max: 9 },
  { name: 'Netherlands', iso: 'NL', dial: '31', flag: '🇳🇱', min: 9, max: 9 },
  { name: 'Ireland', iso: 'IE', dial: '353', flag: '🇮🇪', min: 9, max: 9 },
  { name: 'South Africa', iso: 'ZA', dial: '27', flag: '🇿🇦', min: 9, max: 9 },
  { name: 'Nigeria', iso: 'NG', dial: '234', flag: '🇳🇬', min: 10, max: 10 },
  { name: 'Egypt', iso: 'EG', dial: '20', flag: '🇪🇬', min: 10, max: 10 },
  { name: 'Turkey', iso: 'TR', dial: '90', flag: '🇹🇷', min: 10, max: 10 },
  { name: 'Qatar', iso: 'QA', dial: '974', flag: '🇶🇦', min: 8, max: 8 },
  { name: 'Kuwait', iso: 'KW', dial: '965', flag: '🇰🇼', min: 8, max: 8 },
  { name: 'Oman', iso: 'OM', dial: '968', flag: '🇴🇲', min: 8, max: 8 },
  { name: 'Bahrain', iso: 'BH', dial: '973', flag: '🇧🇭', min: 8, max: 8 },
  { name: 'Malaysia', iso: 'MY', dial: '60', flag: '🇲🇾', min: 9, max: 10 },
  { name: 'Singapore', iso: 'SG', dial: '65', flag: '🇸🇬', min: 8, max: 8 },
  { name: 'Indonesia', iso: 'ID', dial: '62', flag: '🇮🇩', min: 9, max: 11 },
  { name: 'Sri Lanka', iso: 'LK', dial: '94', flag: '🇱🇰', min: 9, max: 9 },
  { name: 'Nepal', iso: 'NP', dial: '977', flag: '🇳🇵', min: 10, max: 10 },
  { name: 'New Zealand', iso: 'NZ', dial: '64', flag: '🇳🇿', min: 8, max: 10 },
  { name: 'Brazil', iso: 'BR', dial: '55', flag: '🇧🇷', min: 10, max: 11 },
  { name: 'Mexico', iso: 'MX', dial: '52', flag: '🇲🇽', min: 10, max: 10 },
];

// Generous fallback if a dial code is somehow not found.
const DEFAULT_RULE = { min: 6, max: 14 };

export const DEFAULT_DIAL = '92'; // Pakistan (matches the app's existing default)

export function getCountryByDial(dial) {
  return COUNTRY_CODES.find((c) => c.dial === String(dial)) || null;
}

export function getPhoneRule(dial) {
  const c = getCountryByDial(dial);
  return c ? { min: c.min, max: c.max } : DEFAULT_RULE;
}
