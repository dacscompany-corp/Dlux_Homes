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
  accountDeactivated: "This account has been deactivated. Please contact the office.",

  // Status chips
  sPending: "To clean",
  sProgress: "Cleaning now",
  sWaiting: "Sent · office is checking",
  sReady: "Done",

  // Room / checklist
  back: "Back",
  problem: "Problem?",
  tapHint: "Tick each task when it's done, then take one photo of each finished area.",
  finish: "I'm done — send for checking",
  sending: "Sending…",
  sentBack: "The office asked you to fix:",
  noChecklist: "This room has no checklist yet.",
  loadingChecklist: "Loading checklist…",
  addPhoto: "Add photo",
  replacePhoto: "Replace photo",
  uploadingPhoto: "Uploading…",
  photoFailed: "Upload failed — tap to retry",
  areaPhoto: "Photo of the finished area",
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
  noMessages: "No messages yet. Write to the office below — anyone there can answer.",
  typeMessage: "Write a message…",
  sendMsg: "Send",
  seen: "Seen",
  notifications: "Notifications",
  markAllRead: "Mark all read",
  noNotifications: "No notifications yet. New rooms and messages from the office will show up here.",
  noThread: "The office hasn't started a chat with you yet. Call them if you need something now.",

  // Help
  helpTitle: "Need help?",
  callOffice: "Call the office",
  messageOffice: "Message the office",
  report: "Report a problem",
  how: "How it works",
  signOut: "Sign out",

  // My account (profile + password)
  accTitle: "My account",
  accEdit: "Edit profile & password",
  accDetails: "Profile details",
  accFirst: "First name",
  accLast: "Last name",
  accPhone: "Phone",
  accStreet: "Address",
  accCity: "City",
  accZip: "ZIP code",
  accEmail: "Email (used to sign in)",
  accManaged: "Your email and role are set by the office. Ask them if these need to change.",
  accSave: "Save changes",
  accSaving: "Saving…",
  accSaved: "Profile saved.",
  accLoadFailed: "Couldn't load your profile.",
  accPassword: "Change password",
  accPasswordHint: "Replace the starting password from your welcome email with one only you know.",
  accCurrent: "Current password",
  accNew: "New password",
  accConfirm: "Confirm new password",
  accMismatch: "The new passwords don't match.",
  accChange: "Change password",
  accChanging: "Changing…",
  accChanged: "Password changed.",
  accFailed: "Something went wrong. Try again.",

  // Google Calendar
  calTitle: "Google Calendar",
  calIntro: "Your cleaning schedule, in your own Google Calendar. It updates by itself when rooms are added, moved or cancelled.",
  calSetUp: "Add to my Google Calendar",
  calOpen: "Open in Google Calendar",
  calResend: "Resend invite",
  calWorking: "Setting up…",
  calTip: "Turn on reminders once: in Google Calendar, open this calendar's settings → Event notifications → add \"1 hour before\".",
  calOff: "Google Calendar isn't available right now.",
  calLoadFailed: "Couldn't load your Google Calendar status.",
  calResent: "Invite sent — check your email.",

  // Nav
  tabToday: "Today",
  tabTasks: "Tasks",
  howDoI: "How do I…?",
  howDoIHint: "Tap a question to see the steps.",
  showMe: "Show me",
  guide: [
    { title: "Start cleaning a room", go: "home", steps: [
      "Open Menu → Tasks. Your rooms are listed by day.",
      "Wait until the guest has left — the button shows the time you can start.",
      "Tap Start cleaning on the room. Its task list opens.",
    ] },
    { title: "Tick tasks and take the photos", go: "home", steps: [
      "In the room, tap Show tasks if the list is hidden.",
      "Tap each task when it's done — a ✓ appears.",
      "Under each area (Bedroom, Bathroom…) tap the camera and take 1 photo of the finished area.",
      "When all tasks are ticked and every area has a photo, the room is sent to the office by itself.",
    ] },
    { title: "Fix a room the office sent back", go: "home", steps: [
      "The room shows Cleaning now again with a purple note.",
      "Read the note — it says what to fix.",
      "Tap Fix & continue, fix it, and replace the photo of that area if needed.",
    ] },
    { title: "Ask for supplies", go: "stock", steps: [
      "Open Menu → Room supplies (or tap Need supplies? while cleaning).",
      "Count what's left with − and +, then tap Save counts.",
      "Pick what's low or type any item you need, then tap Send request.",
      "Check My requests: Pending → Processing → Completed.",
    ] },
    { title: "Report something broken or missing", go: "problem", steps: [
      "Open Menu → Report a problem (or tap Problem? in a room).",
      "Pick what's wrong and add a photo if you can.",
      "Send it — the office is told straight away.",
    ] },
    { title: "Message the office", go: "messages", steps: [
      "Open Menu → Messages.",
      "Type your message, or tap a quick reply like \"I need supplies\".",
      "The Owner and CSR both see it and reply in the same chat.",
    ] },
    { title: "Switch to Tagalog / English", go: null, steps: [
      "Tap EN or TL at the top right of the screen.",
      "The whole app changes language, including the task list.",
    ] },
    { title: "Change my password or sign out", go: "account", steps: [
      "Tap ☰ Menu at the top left.",
      "Tap Edit profile & password to change your details.",
      "Tap Sign out at the bottom of the menu when you're done for the day.",
    ] },
  ] as { title: string; go: "home" | "stock" | "problem" | "messages" | "account" | null; steps: string[] }[],
  labelsTitle: "What the labels mean",
  labelHints: {
    pending: "The room is yours, but not started yet.",
    "in-progress": "You pressed Start cleaning and are working on it.",
    "awaiting-inspection": "You finished — the office is checking your photos.",
    ready: "The office approved it. Nothing more to do.",
  } as Record<"pending" | "in-progress" | "awaiting-inspection" | "ready", string>,
  myTasks: "My tasks",
  filterAll: "All",
  nothingHere: "No rooms here right now.",
  viewRoom: "View room",
  startFrom: (when: string) => `Start cleaning · from ${when}`,
  tabMsg: "Messages",
  tabHelp: "Help",
  tabStock: "Supplies",
  myReports: "My reports",
  noReports: "You haven't reported anything yet.",
  issueStage: { open: "Open", "in-progress": "Being fixed", fixed: "Fixed ✓" } as Record<"open" | "in-progress" | "fixed", string>,
  menu: "Menu",
  closeMenu: "Close menu",
  roomSupplies: "Room supplies",
  suppliesCardTitle: "Room supplies",
  suppliesCardBody: "Count what's left and ask the office for anything you need.",
  needSupplies: "Need supplies? Ask the office",
  checkSupplies: "Check room supplies",

  steps: [
    "Tap Start cleaning on your room once the guest has left.",
    "Tap Show tasks, then tick each task as you finish it.",
    "Take 1 photo of each finished area. The room is then sent to the office by itself.",
  ],
  quick: ["I'm on my way", "I'm done", "I need supplies", "Running late"],

  // Templated copy
  progress: (done: number, total: number) => `${done} of ${total} done`,
  todaySummary: (total: number, done: number) => `Today: ${total} ${total === 1 ? "room" : "rooms"} · ${done} done`,
  stepsTitle: "3 easy steps",
  stepTick: "Tick every task",
  stepPhoto: "Take 1 photo of each area",
  stepSend: "Sent to the office for checking",
  stepSendHint: "Happens by itself when steps 1 and 2 are done",
  showTasks: "Show tasks",
  hideTasks: "Hide tasks",
  left: (n: number) => `${n} ${n === 1 ? "task" : "tasks"} left`,
  doneBody: (room: string) => `The office will check ${room}. We'll message you if anything needs fixing.`,
  forRoom: (room: string) => `For ${room}`,
  roomsLeft: (n: number) => `${n} ${n === 1 ? "room" : "rooms"} to clean`,
  opensAt: (when: string) => `Guest still checked in. You can start once they're checked out, or at checkout time — ${when}.`,
  photosLeft: (n: number) => `${n} ${n === 1 ? "photo" : "photos"} still needed`,
  stayOvernight: (nights: number) => (nights <= 1 ? "Overnight" : `${nights} nights`),
  guestOf: (name: string) => `Guest: ${name}`,
  calSharedTo: (email: string) => `Shared to ${email}. Open the email from Google and tap "Add this calendar".`,
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
  accountDeactivated: "Na-deactivate na ang account na ito. Makipag-ugnayan sa office.",

  sPending: "Lilinisin",
  sProgress: "Nililinis",
  sWaiting: "Naipadala · sinusuri ng opisina",
  sReady: "Tapos na",

  back: "Bumalik",
  problem: "May problema?",
  tapHint: "I-tsek ang bawat gawain kapag tapos na, tapos kunan ng isang litrato ang bawat natapos na bahagi.",
  finish: "Tapos na — ipasuri na",
  sending: "Ipinapadala…",
  sentBack: "Pinapaayos ng opisina:",
  noChecklist: "Wala pang checklist ang kwartong ito.",
  loadingChecklist: "Kinukuha ang checklist…",
  addPhoto: "Magdagdag ng litrato",
  replacePhoto: "Palitan ang litrato",
  uploadingPhoto: "Ina-upload…",
  photoFailed: "Hindi na-upload — pindutin para ulitin",
  areaPhoto: "Litrato ng natapos na bahagi",
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
  noMessages: "Wala pang mensahe. Sumulat sa opisina sa ibaba — puwedeng sumagot ang kahit sino roon.",
  typeMessage: "Magsulat ng mensahe…",
  sendMsg: "Ipadala",
  seen: "Nakita na",
  notifications: "Mga abiso",
  markAllRead: "Nabasa lahat",
  noNotifications: "Wala pang abiso. Dito lalabas ang mga bagong kwarto at mensahe mula sa opisina.",
  noThread: "Wala pang chat na sinimulan ang opisina. Tawagan mo sila kung may kailangan ka ngayon.",

  helpTitle: "Kailangan ng tulong?",
  callOffice: "Tawagan ang opisina",
  messageOffice: "Mag-message sa opisina",
  report: "Mag-report ng problema",
  how: "Paano gamitin",
  signOut: "Mag-sign out",

  accTitle: "Aking account",
  accEdit: "I-edit ang profile at password",
  accDetails: "Detalye ng profile",
  accFirst: "Pangalan",
  accLast: "Apelyido",
  accPhone: "Telepono",
  accStreet: "Address",
  accCity: "Lungsod",
  accZip: "ZIP code",
  accEmail: "Email (pang-sign in)",
  accManaged: "Ang opisina ang nagtatakda ng email at role mo. Sabihan sila kung kailangang baguhin.",
  accSave: "I-save",
  accSaving: "Sine-save…",
  accSaved: "Na-save ang profile.",
  accLoadFailed: "Hindi ma-load ang profile mo.",
  accPassword: "Palitan ang password",
  accPasswordHint: "Palitan ang unang password mula sa welcome email ng password na ikaw lang ang nakakaalam.",
  accCurrent: "Kasalukuyang password",
  accNew: "Bagong password",
  accConfirm: "Ulitin ang bagong password",
  accMismatch: "Hindi magkapareho ang bagong password.",
  accChange: "Palitan ang password",
  accChanging: "Pinapalitan…",
  accChanged: "Napalitan na ang password.",
  accFailed: "May mali. Subukan ulit.",

  calTitle: "Google Calendar",
  calLoadFailed: "Hindi ma-load ang status ng Google Calendar mo.",
  calIntro: "Ang iskedyul ng paglilinis mo, nasa sarili mong Google Calendar. Kusa itong nag-a-update kapag may bagong kwarto, nailipat, o na-cancel.",
  calSetUp: "Idagdag sa Google Calendar ko",
  calOpen: "Buksan sa Google Calendar",
  calResend: "Ipadala ulit ang imbitasyon",
  calWorking: "Inaayos…",
  calTip: "Buksan ang paalala isang beses: sa Google Calendar, pumunta sa settings ng calendar na ito → Event notifications → idagdag ang \"1 hour before\".",
  calOff: "Hindi available ang Google Calendar ngayon.",
  calResent: "Naipadala na — tingnan ang email mo.",

  tabToday: "Ngayon",
  tabTasks: "Gawain",
  howDoI: "Paano ko…?",
  howDoIHint: "Pindutin ang tanong para makita ang mga hakbang.",
  showMe: "Ipakita",
  guide: [
    { title: "Simulan ang paglilinis ng kwarto", go: "home", steps: [
      "Buksan ang Menu → Gawain. Nakalista ang mga kwarto mo ayon sa araw.",
      "Hintaying makaalis ang bisita — nakasulat sa button kung kailan pwedeng magsimula.",
      "Pindutin ang Simulan ang paglilinis sa kwarto. Bubukas ang listahan ng gawain.",
    ] },
    { title: "I-tsek ang gawain at kumuha ng litrato", go: "home", steps: [
      "Sa kwarto, pindutin ang Ipakita ang mga gawain kung nakatago.",
      "Pindutin ang bawat gawaing natapos — lalabas ang ✓.",
      "Sa bawat bahagi (Kwarto, Banyo…) pindutin ang camera at kunan ng 1 litrato ang natapos na bahagi.",
      "Kapag na-tsek lahat at may litrato ang bawat bahagi, kusang ipapadala ang kwarto sa opisina.",
    ] },
    { title: "Ayusin ang kwartong ibinalik ng opisina", go: "home", steps: [
      "Babalik sa Nililinis ang kwarto na may kulay-ube na mensahe.",
      "Basahin ang mensahe — nakasulat kung ano ang aayusin.",
      "Pindutin ang Ayusin at ituloy, ayusin, at palitan ang litrato kung kailangan.",
    ] },
    { title: "Humingi ng supply", go: "stock", steps: [
      "Buksan ang Menu → Supply sa kwarto (o pindutin ang Kailangan ng supply? habang naglilinis).",
      "Bilangin ang natira gamit ang − at +, tapos pindutin ang I-save ang bilang.",
      "Piliin ang kulang o isulat ang kailangan, tapos pindutin ang Ipadala ang hiling.",
      "Tingnan ang Mga hiling ko: Naghihintay → Inaasikaso → Tapos na.",
    ] },
    { title: "Mag-report ng sira o nawawala", go: "problem", steps: [
      "Buksan ang Menu → Mag-report ng problema (o pindutin ang May problema? sa kwarto).",
      "Piliin kung ano ang problema at maglagay ng litrato kung kaya.",
      "Ipadala — malalaman agad ng opisina.",
    ] },
    { title: "Mag-message sa opisina", go: "messages", steps: [
      "Buksan ang Menu → Mensahe.",
      "Isulat ang mensahe, o pindutin ang mabilis na sagot gaya ng \"Kailangan ko ng supplies\".",
      "Makikita ito ng Owner at CSR at sasagot sila sa parehong chat.",
    ] },
    { title: "Lumipat sa Tagalog / English", go: null, steps: [
      "Pindutin ang EN o TL sa kanang itaas ng screen.",
      "Magpapalit ng wika ang buong app, pati ang listahan ng gawain.",
    ] },
    { title: "Palitan ang password o mag-sign out", go: "account", steps: [
      "Pindutin ang ☰ Menu sa kaliwang itaas.",
      "Pindutin ang I-edit ang profile at password para baguhin ang detalye mo.",
      "Pindutin ang Mag-sign out sa ibaba ng menu kapag tapos na ang araw mo.",
    ] },
  ],
  labelsTitle: "Ibig sabihin ng mga label",
  labelHints: {
    pending: "Sa iyo ang kwarto, pero hindi pa nasisimulan.",
    "in-progress": "Pinindot mo na ang Simulan at nililinis mo na.",
    "awaiting-inspection": "Tapos ka na — sinusuri ng opisina ang mga litrato mo.",
    ready: "Inaprubahan na ng opisina. Wala ka nang gagawin.",
  },
  myTasks: "Mga gawain ko",
  filterAll: "Lahat",
  nothingHere: "Walang kwarto rito ngayon.",
  viewRoom: "Tingnan ang kwarto",
  startFrom: (when) => `Simulan · mula ${when}`,
  tabMsg: "Mensahe",
  tabHelp: "Tulong",
  tabStock: "Supply",
  myReports: "Mga report ko",
  noReports: "Wala ka pang nire-report.",
  issueStage: { open: "Bukas", "in-progress": "Inaayos", fixed: "Naayos na ✓" },
  menu: "Menu",
  closeMenu: "Isara ang menu",
  roomSupplies: "Supply sa kwarto",
  suppliesCardTitle: "Supply sa kwarto",
  suppliesCardBody: "Bilangin ang natira at humingi sa opisina ng kailangan mo.",
  needSupplies: "Kailangan ng supply? Humingi sa opisina",
  checkSupplies: "Tingnan ang supply sa kwarto",

  steps: [
    "Pindutin ang Simulan sa iyong kwarto kapag nakaalis na ang bisita.",
    "Pindutin ang Ipakita ang mga gawain, tapos i-tsek ang bawat gawaing natapos.",
    "Kunan ng 1 litrato ang bawat natapos na bahagi. Kusang ipapadala ang kwarto sa opisina.",
  ],
  quick: ["Papunta na ako", "Tapos na ako", "Kailangan ko ng supplies", "Male-late ako"],

  progress: (done, total) => `${done} sa ${total} tapos`,
  todaySummary: (total, done) => `Ngayon: ${total} kwarto · ${done} tapos`,
  stepsTitle: "3 madaling hakbang",
  stepTick: "I-tsek ang lahat ng gawain",
  stepPhoto: "Kunan ng 1 litrato ang bawat bahagi",
  stepSend: "Ipapadala sa opisina para suriin",
  stepSendHint: "Kusang mangyayari kapag tapos ang hakbang 1 at 2",
  showTasks: "Ipakita ang mga gawain",
  hideTasks: "Itago ang mga gawain",
  left: (n) => `${n} pang gawain`,
  doneBody: (room) => `Susuriin ng opisina ang ${room}. Magme-message kami kung may kailangang ayusin.`,
  forRoom: (room) => `Para sa ${room}`,
  roomsLeft: (n) => `${n} kwarto pang lilinisin`,
  opensAt: (when) => `Nandiyan pa ang guest. Puwede kang magsimula kapag naka-check out na sila, o sa oras ng check out — ${when}.`,
  photosLeft: (n) => `${n} litrato pa ang kailangan`,
  stayOvernight: (nights) => (nights <= 1 ? "Overnight" : `${nights} gabi`),
  guestOf: (name) => `Bisita: ${name}`,
  calSharedTo: (email) => `Naipadala sa ${email}. Buksan ang email mula sa Google at pindutin ang "Add this calendar".`,
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
