/**
 * Per-country phone number formatting.
 * Each entry is an array of digit group sizes joined with spaces.
 * e.g. US: [3,3,4] → "555 123 4567"
 */
export const PHONE_FORMAT = {
  US:[3,3,4], CA:[3,3,4], AG:[3,4], BS:[3,4], BB:[3,4],
  DM:[3,4],   GD:[3,4],   JM:[3,4], KN:[3,4], LC:[3,4],
  TT:[3,4],   VC:[3,4],   DO:[3,3,4],

  GB:[4,3,4],     IE:[2,3,4],     FR:[2,2,2,2,2], DE:[4,7],
  AT:[4,4],       CH:[2,3,2,2],   NL:[3,3,3],     BE:[3,2,2,2],
  LU:[3,3,3],     PT:[3,3,3],     ES:[3,3,3],     IT:[3,3,4],
  MC:[3,3,3],     SM:[3,3,3],     MT:[4,4],       CY:[2,6],
  GR:[3,3,4],     IS:[3,4],       LI:[3,4],

  DK:[2,2,2,2],   NO:[3,2,3],     SE:[2,3,2,2],   FI:[3,3,3],

  PL:[3,3,3],     CZ:[3,3,3],     SK:[3,3,3],     HU:[2,3,4],
  RO:[3,3,3],     BG:[3,3,3],     HR:[2,3,4],     BA:[2,3,3],
  RS:[2,3,3],     ME:[2,3,3],     MK:[2,3,3],     SI:[2,3,3],
  AL:[2,3,4],

  RU:[3,3,2,2],   UA:[2,3,2,2],   BY:[2,3,2,2],   KZ:[3,3,2,2],
  UZ:[2,3,2,2],   AZ:[2,3,2,2],   GE:[3,2,2,2],   AM:[2,2,2,2],
  TM:[2,3,3],     TJ:[2,3,4],     KG:[3,3,3],     MD:[2,3,2,2],
  LT:[3,2,3],     LV:[2,3,3],     EE:[3,4],       MN:[4,4],

  SA:[2,3,4],     AE:[2,3,4],     KW:[4,4],       QA:[4,4],
  BH:[4,4],       OM:[4,4],       JO:[2,3,4],     IQ:[3,3,4],
  IR:[3,3,4],     LB:[2,6],       SY:[2,3,4],     YE:[3,3,3],
  IL:[2,3,4],     PS:[3,3,3],     TR:[3,3,2,2],

  IN:[5,5],       PK:[3,7],       BD:[4,6],       LK:[2,3,4],
  NP:[2,3,4],     AF:[2,3,4],     BT:[2,5],       MV:[3,4],

  TH:[2,3,4],     VN:[3,3,3],     PH:[3,3,4],     ID:[4,4,4],
  MY:[2,4,4],     SG:[4,4],       MM:[2,3,4],     KH:[2,3,4],
  LA:[2,3,3],     TL:[3,4],       BN:[3,4],

  CN:[3,4,4],     JP:[3,4,4],     KR:[3,4,4],     TW:[4,3,3],
  HK:[4,4],

  ZA:[2,3,4],     NG:[3,3,4],     KE:[3,3,3],     GH:[2,3,4],
  ET:[2,3,4],     TZ:[3,3,3],     EG:[3,3,4],     MA:[3,2,4],
  DZ:[3,3,3],     TN:[2,3,3],     LY:[3,3,3],     SD:[2,3,4],
  SS:[2,3,4],     SN:[2,3,2,2],   CM:[3,3,3],     AO:[3,3,3],
  MZ:[2,3,4],     RW:[3,3,3],     UG:[3,3,3],     ZW:[2,3,4],
  ZM:[2,3,4],

  MX:[3,3,4],     BR:[5,4],       AR:[2,4,4],     CO:[3,3,4],
  PE:[3,3,3],     VE:[3,3,4],     CL:[1,4,4],     EC:[3,3,3],
  BO:[4,4],       UY:[2,3,4],     PY:[3,3,3],     CR:[4,4],
  PA:[4,4],       GT:[4,4],       HN:[4,4],       SV:[4,4],
  NI:[4,4],       CU:[4,4],       HT:[4,4],       BZ:[3,4],
  GY:[3,4],       SR:[3,4],

  AU:[4,3,3],     NZ:[3,3,3],     FJ:[3,4],       PG:[4,4],
};

/**
 * Format raw digits according to the country's local grouping pattern.
 * Handles partial input: "555" stays "555", "5551" becomes "555 1".
 * Falls back to raw digits for countries without a defined format.
 *
 * @param {string} countryCode  ISO 3166-1 alpha-2 code e.g. "US"
 * @param {string} digits       Digit-only string e.g. "5551234567"
 * @returns {string}            Formatted display string e.g. "555 123 4567"
 */
export function formatPhoneDigits(countryCode, digits) {
  if (!digits) return '';
  const groups = PHONE_FORMAT[countryCode];
  if (!groups) return digits;

  let result = '';
  let pos = 0;
  for (let i = 0; i < groups.length; i++) {
    if (pos >= digits.length) break;
    if (i > 0) result += ' ';
    result += digits.slice(pos, pos + groups[i]);
    pos += groups[i];
  }
  if (pos < digits.length) {
    result += ' ' + digits.slice(pos);
  }
  return result;
}
