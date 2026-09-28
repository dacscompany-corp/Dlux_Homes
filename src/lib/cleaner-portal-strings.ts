// UI copy for the cleaner portal, in English and Tagalog.
//
// The portal is a phone-first app used mid-shift by housekeeping staff, and the
// EN/TL switch on its home screen flips the WHOLE interface — not just the
// checklist text. Checklist category/task wording still comes from
// src/lib/checklist-translations.ts (that text lives in the database and is
// translated by lookup); everything here is the app's own chrome.
//
// Keep both dictionaries the same shape — `CleanerStrings` is derived from the
// English one, so a key added to `en` and forgotten in `tl` is a type error.

export type CleanerLanguage = "en" | "tl";

const en = {
  // Home
  hello: "Good day,",
  nextUp: "Your next room",
  checkoutAt: "Guest checked out",
  checksOutAt: "Guest checks out",
  stayDay: "Daycation",
  stayNight: "Nightcation",
  directions: "Directions",
  start: "Start cleaning",
  cont: "Continue cleaning",
  fixCont: "Fix & continue",
  preview: "Preview room",
  alsoToday: "Also today",
  comingUp: "Coming up",
  allDoneToday: "All rooms are done for today.",
  noRoomsToday: "No rooms assigned to you today.",
  nothingUpcoming: "Nothing scheduled yet.",
  loading: "Loading your rooms…",
  loadFailed: "Couldn't load your rooms. Check your connection.",
  retry: "Try again",

  // Status chips
  sPending: "To clean",
  sProgress: "Cleaning now",
  sWaiting: "Done · office is checking",
  sReady: "Approved",

  // Room / checklist
  back: "Back",
  problem: "Problem?",
  tapHint: "Take a photo of each task — that ticks it off.",
  finish: "I'm done — send for checking",
  sending: "Sending…",
  sentBack: "The office asked you to fix:",
  noChecklist: "This room has no checklist yet.",
  loadingChecklist: "Loading checklist…",
  addPhoto: "Add photo",
  replacePhoto: "Replace photo",
  uploadingPhoto: "Uploading…",
  photoFailed: "Upload failed — tap to retry",
  needsPhoto: "Photo needed",
  checklistFailed: "Couldn't load the checklist.",
  notStarted: "Tap Start cleaning to open the checklist.",
  lockedWaiting: "Sent for checking — the checklist is locked.",

  // Done
  doneTitle: "Great job!",
  backToday: "Back to today",

  // Report a problem
  problemTitle: "What's the problem?",
  tBroken: "Something is broken",
  tDirty: "Stain or damage",
  tMissing: "Something is missing",
  tOther: "Something else",
  photo: "Take a photo (optional)",
  photoAdded: "Photo added ✓",
  note: "Write a note (optional)",
  send: "Send to office",
  pickFirst: "Choose one above",
  sentTitle: "Sent to the office",
  sentBody: "They will take care of it. You can keep cleaning.",
  okay: "Okay",

  // Messages
  office: "D'Lux Office",
  officeSub: "Messages from the office show up here",
  call: "Call",
  fromOffice: "From the office",
  noMessages: "No messages yet.",
  noThread: "The office hasn't started a chat with you yet. Call them if you need something now.",

  // Help
  helpTitle: "Need help?",
  callOffice: "Call the office",
  messageOffice: "Message the office",
  report: "Report a problem",
  how: "How it works",
  signOut: "Sign out",

  // Nav
  tabToday: "Today",
  tabMsg: "Messages",
  tabHelp: "Help",

  steps: [
    "Tap Start cleaning on your room.",
    "Take a photo of each task — that ticks it off.",
    "Tap I'm done. The office will check.",
  ],
  quick: ["I'm on my way", "I'm done", "I need supplies", "Running late"],

  // Templated copy
  progress: (done: number, total: number) => `${done} of ${total} done`,
  left: (n: number) => `${n} ${n === 1 ? "task" : "tasks"} left`,
  doneBody: (room: string) => `The office will check ${room}. We'll message you if anything needs fixing.`,
  forRoom: (room: string) => `For ${room}`,
  roomsLeft: (n: number) => `${n} ${n === 1 ? "room" : "rooms"} to clean`,
  opensAt: (when: string) => `Guest still checked in. You can start once they're checked out, or at checkout time — ${when}.`,
  photosLeft: (n: number) => `${n} ${n === 1 ? "photo" : "photos"} still needed`,
  stayOvernight: (nights: number) => (nights <= 1 ? "Overnight" : `${nights} nights`),
  guestOf: (name: string) => `Guest: ${name}`,
  guests: (adults: number, children: number) =>
    `${adults} ${adults === 1 ? "adult" : "adults"}${children > 0 ? `, ${children} ${children === 1 ? "child" : "children"}` : ""}`,
};

export type CleanerStrings = typeof en;

const tl: CleanerStrings = {
  hello: "Magandang araw,",
  nextUp: "Susunod mong kwarto",
  checkoutAt: "Nag-check out ang guest",
  checksOutAt: "Magche-check out ang guest",
  stayDay: "Daycation",
  stayNight: "Nightcation",
  directions: "Direksyon",
  start: "Simulan ang paglilinis",
  cont: "Ituloy ang paglilinis",
  fixCont: "Ayusin at ituloy",
  preview: "Silipin ang kwarto",
  alsoToday: "Ngayong araw din",
  comingUp: "Mga susunod",
  allDoneToday: "Tapos na lahat ng kwarto ngayon.",
  noRoomsToday: "Wala kang kwartong nakatoka ngayong araw.",
  nothingUpcoming: "Wala pang nakaskedyul.",
  loading: "Kinukuha ang mga kwarto mo…",
  loadFailed: "Hindi makuha ang mga kwarto mo. Tingnan ang koneksyon.",
  retry: "Subukan ulit",

  sPending: "Lilinisin",
  sProgress: "Nililinis",
  sWaiting: "Tapos · sinusuri ng opisina",
  sReady: "Aprubado",

  back: "Bumalik",
  problem: "May problema?",
  tapHint: "Kunan ng litrato ang bawat gawain — matsetsek na ito.",
  finish: "Tapos na — ipasuri na",
  sending: "Ipinapadala…",
  sentBack: "Pinapaayos ng opisina:",
  noChecklist: "Wala pang checklist ang kwartong ito.",
  loadingChecklist: "Kinukuha ang checklist…",
  addPhoto: "Magdagdag ng litrato",
  replacePhoto: "Palitan ang litrato",
  uploadingPhoto: "Ina-upload…",
  photoFailed: "Hindi na-upload — pindutin para ulitin",
  needsPhoto: "Kailangan ng litrato",
  checklistFailed: "Hindi makuha ang checklist.",
  notStarted: "Pindutin ang Simulan para buksan ang checklist.",
  lockedWaiting: "Naipasuri na — naka-lock ang checklist.",

  doneTitle: "Magaling!",
  backToday: "Bumalik sa Ngayon",

  problemTitle: "Ano ang problema?",
  tBroken: "May sira",
  tDirty: "May mantsa o pinsala",
  tMissing: "May nawawala",
  tOther: "Iba pa",
  photo: "Kumuha ng litrato (opsyonal)",
  photoAdded: "May litrato na ✓",
  note: "Magsulat ng tala (opsyonal)",
  send: "Ipadala sa opisina",
  pickFirst: "Pumili muna sa itaas",
  sentTitle: "Naipadala na",
  sentBody: "Aasikasuhin ito ng opisina. Puwede mo nang ituloy ang paglilinis.",
  okay: "Sige",

  office: "D'Lux Office",
  officeSub: "Dito lalabas ang mensahe ng opisina",
  call: "Tawag",
  fromOffice: "Mula sa opisina",
  noMessages: "Wala pang mensahe.",
  noThread: "Wala pang chat na sinimulan ang opisina. Tawagan mo sila kung may kailangan ka ngayon.",

  helpTitle: "Kailangan ng tulong?",
  callOffice: "Tawagan ang opisina",
  messageOffice: "Mag-message sa opisina",
  report: "Mag-report ng problema",
  how: "Paano gamitin",
  signOut: "Mag-sign out",

  tabToday: "Ngayon",
  tabMsg: "Mensahe",
  tabHelp: "Tulong",

  steps: [
    "Pindutin ang Simulan sa iyong kwarto.",
    "Kunan ng litrato ang bawat gawain — matsetsek na ito.",
    "Pindutin ang Tapos na. Susuriin ng opisina.",
  ],
  quick: ["Papunta na ako", "Tapos na ako", "Kailangan ko ng supplies", "Male-late ako"],

  progress: (done, total) => `${done} sa ${total} tapos`,
  left: (n) => `${n} pang gawain`,
  doneBody: (room) => `Susuriin ng opisina ang ${room}. Magme-message kami kung may kailangang ayusin.`,
  forRoom: (room) => `Para sa ${room}`,
  roomsLeft: (n) => `${n} kwarto pang lilinisin`,
  opensAt: (when) => `Nandiyan pa ang guest. Puwede kang magsimula kapag naka-check out na sila, o sa oras ng check out — ${when}.`,
  photosLeft: (n) => `${n} litrato pa ang kailangan`,
  stayOvernight: (nights) => (nights <= 1 ? "Overnight" : `${nights} gabi`),
  guestOf: (name) => `Bisita: ${name}`,
  guests: (adults, children) => `${adults} matanda${children > 0 ? `, ${children} bata` : ""}`,
};

export const CLEANER_STRINGS: Record<CleanerLanguage, CleanerStrings> = { en, tl };

// Tagalog weekday/month names for the home screen's date line. Intl's "fil"
// locale isn't reliably present in every runtime this ships to, so the two
// short lists are spelled out instead of relying on toLocaleDateString.
const TL_DAYS = ["Linggo", "Lunes", "Martes", "Miyerkules", "Huwebes", "Biyernes", "Sabado"];
const TL_MONTHS = ["Ene", "Peb", "Mar", "Abr", "May", "Hun", "Hul", "Ago", "Set", "Okt", "Nob", "Dis"];

/** "Sunday, Sep 27" / "Linggo, Set 27" */
export function formatDateLine(date: Date, lang: CleanerLanguage): string {
  if (lang === "tl") {
    return `${TL_DAYS[date.getDay()]}, ${TL_MONTHS[date.getMonth()]} ${date.getDate()}`;
  }
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/**
 * Day label for the "Coming up" list — "Tomorrow · Mon, Sep 28" for the next
 * day, otherwise just the short date.
 */
export function formatDayLabel(date: Date, today: Date, lang: CleanerLanguage): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(date) - startOf(today)) / dayMs);
  const short =
    lang === "tl"
      ? `${TL_DAYS[date.getDay()].slice(0, 3)}, ${TL_MONTHS[date.getMonth()]} ${date.getDate()}`
      : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (diffDays === 1) return `${lang === "tl" ? "Bukas" : "Tomorrow"} · ${short}`;
  return short;
}
