// The printed House Rules sheet that lives inside the unit — content and unit
// access details, shared by the printable page (/admin/house-rules) and the PDF
// download (/api/admin/house-rules/pdf) so the two can never disagree.
//
// Transcribed from the owner's physical sheet and grouped into the four numbered
// sections of the "House Rules Sheet" design.
//
// NOTE ON WORDING: backend/utils/selfCheckinEmail.ts exports a separate, flat
// HOUSE_RULES list used by the Collect email. Its phrasing differs slightly from
// the printed sheet's (e.g. "use the range hood" vs "use a range hood"), because
// the two artefacts were written at different times by the owner. They are kept
// apart deliberately rather than force-merged — changing one would silently
// reword the other.

export interface RuleSection {
  n: number;
  title: string;
  bullets: string[];
}

export const RULE_SECTIONS: RuleSection[] = [
  {
    n: 1,
    title: "Cleanliness",
    bullets: [
      "Throw your own garbage.",
      "In the living area and bedroom, no food or drink is permitted.",
      "We only deliver fresh linens, bedsheet, towel and rugs.",
      "We only clean upon your check-out.",
    ],
  },
  {
    n: 2,
    title: "Bathroom",
    bullets: [
      "Instead of throwing used tissue paper down the toilet, please use the provided toilet trash can.",
      "Please, make use of the bidets. In addition, do not throw away food in the toilet, as it may lead to blockage.",
    ],
  },
  {
    n: 3,
    title: "Kitchen & appliances",
    bullets: [
      "When cooking, use a range hood ventilation fan to circulate air and prevent odors from spreading. If you are not using the appliances, please turn it off.",
    ],
  },
  {
    n: 4,
    title: "Smoking",
    bullets: [
      "Smoking is not permitted within the unit.",
      "There is a designated smoking area next to the guard house at Gates 2 and 3.",
    ],
  },
];

export const DUTY_HEADLINE = "It is your duty to maintain the unit’s cleanliness and order.";
export const DUTY_SUB =
  "Please give time to read and follow all the house rules that we have placed inside the unit.";
export const QUIET_TIME = "10 p.m. – 7 a.m.";
export const POOL_NOTE =
  "The Olympic-sized pool in Tower 1 is private to owners only, therefore guests are not permitted to use it.";
export const WELCOME = "Mabuhay! Welcome.";
export const TAGLINE = "your place to stay";
export const SIGN_OFF = "Thank you & God bless!";

export interface SheetAccess {
  building: string;
  unitLine: string;
  wifiName: string;
  wifiPassword: string;
  netflixPin: string;
  contact: string;
}

/**
 * Unit + access details. SERVER ONLY — the Wi-Fi password and Netflix PIN are
 * secrets, so they are read from unprefixed env vars that never reach the
 * browser bundle and are never committed. A value left unset simply omits its
 * row from the sheet rather than printing a blank.
 */
export function houseRulesAccess(): SheetAccess {
  return {
    building: process.env.DLUX_BUILDING || "Fern at Grass Residences (Tower 4)",
    // "unit 1240" is the full unit number (floor 12 + door 40). The owner's
    // printed sheet abbreviates it to "unit 40"; the emails have always used
    // the full form, so the sheet follows them rather than the other way round.
    unitLine: process.env.DLUX_UNIT_LINE || "12th floor, unit 1240",
    wifiName: process.env.DLUX_WIFI_NAME || "",
    wifiPassword: process.env.DLUX_WIFI_PASSWORD || "",
    netflixPin: process.env.DLUX_NETFLIX_PIN || "",
    contact: process.env.DLUX_CONTACT_EMAIL || "homesdlux@gmail.com",
  };
}
