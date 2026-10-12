// Content and rules for the cleaner "Guide & Assessment" (User Guide):
//
//   1. read the cleaning guide for each area,
//   2. answer a short quiz,
//   3. see corrections and retry only the questions that were missed,
//   4. tick the preparation checklist (supplies, equipment, safety),
//   5. "Assessment Completed — Ready for Cleaning".
//
// The quiz only has to be passed once. The preparation checklist is about the
// shift in front of the cleaner, so it resets each day — "ready" means passed
// AND today's checklist done.
//
// Every cleaner-facing text is English + Tagalog, matching the portal's
// language switch. Pure (no React, no storage) so the grading/readiness rules
// are unit-tested. Guide areas mirror the default cleaning checklist
// categories (see DEFAULT_CHECKLIST_TEMPLATE in cleaningChecklistController.ts)
// so the guide and the per-booking checklist read the same.

import type { CleanerLanguage } from "@/lib/cleaner-portal-strings";

/** One piece of text in both portal languages. */
export type Bilingual = Record<CleanerLanguage, string>;

export type GuideArea = {
  id: string;
  title: Bilingual;
  summary: Bilingual;
  steps: Bilingual[];
  tips: Bilingual[];
  /** Optional instruction photos/videos — add URLs here when the owner supplies them. */
  media?: { kind: "image" | "video"; url: string; caption?: Bilingual }[];
};

export type QuizQuestion = {
  id: string;
  area: Bilingual;
  question: Bilingual;
  options: Bilingual[];
  /** Index into `options`. */
  answer: number;
  /** Shown as the correction when the question is missed. */
  explanation: Bilingual;
};

export type PrepGroup = "Supplies" | "Equipment" | "Safety";
export type PrepItem = { id: string; group: PrepGroup; label: Bilingual };

export const PREP_GROUP_LABELS: Record<PrepGroup, Bilingual> = {
  Supplies: { en: "Supplies", tl: "Mga Suplay" },
  Equipment: { en: "Equipment", tl: "Kagamitan" },
  Safety: { en: "Safety", tl: "Kaligtasan" },
};

const GENERAL: Bilingual = { en: "General", tl: "Pangkalahatan" };
const BEDROOM: Bilingual = { en: "Bedroom", tl: "Kwarto" };
const BATHROOM: Bilingual = { en: "Bathroom", tl: "Banyo" };
const SAFETY: Bilingual = { en: "Safety", tl: "Kaligtasan" };

export const GUIDE_AREAS: GuideArea[] = [
  {
    id: "bedroom",
    title: BEDROOM,
    summary: {
      en: "Fresh linens, dust-free surfaces and a floor with nothing left behind.",
      tl: "Bagong kobre-kama, walang alikabok sa mga ibabaw, at walang naiwang gamit sa sahig.",
    },
    steps: [
      { en: "Strip the bed and put used linens straight into the laundry bag — never on the floor.",
        tl: "Tanggalin ang kobre-kama at ilagay agad ang gamit na linen sa laundry bag — huwag sa sahig." },
      { en: "Make the bed with fresh, inspected linens: fitted sheet tight, top sheet and duvet even, pillows fluffed and placed.",
        tl: "Ayusin ang kama gamit ang bago at nasuring linen: banat ang fitted sheet, pantay ang top sheet at duvet, at maayos ang mga unan." },
      { en: "Dust headboard, side tables, lamps and shelves from top to bottom.",
        tl: "Punasan ng alikabok ang headboard, side table, lampara at mga estante mula itaas pababa." },
      { en: "Clean mirrors and windows streak-free.",
        tl: "Linisin ang mga salamin at bintana nang walang guhit o mantsa." },
      { en: "Check under the bed, drawers and closet for items left by the guest.",
        tl: "Tingnan ang ilalim ng kama, mga drawer at aparador kung may naiwang gamit ang guest." },
      { en: "Empty the trash bin and put in a new liner.",
        tl: "Itapon ang laman ng basurahan at lagyan ng bagong supot." },
      { en: "Vacuum the floor and rugs last, working toward the door.",
        tl: "Huling i-vacuum ang sahig at mga rug, papunta sa pinto." },
    ],
    tips: [
      { en: "Hold linens up to the light — any stain or hair means it goes back to laundry.",
        tl: "Itapat sa ilaw ang linen — kapag may mantsa o buhok, ibalik sa laundry." },
      { en: "Report guest items left behind to the office through Messages.",
        tl: "I-report sa office sa Messages ang mga gamit na naiwan ng guest." },
    ],
  },
  {
    id: "bathroom",
    title: BATHROOM,
    summary: {
      en: "Disinfected surfaces, fresh towels and fully restocked toiletries.",
      tl: "Na-disinfect na mga ibabaw, bagong tuwalya at kumpletong toiletries.",
    },
    steps: [
      { en: "Put on gloves and open the window or turn on the exhaust fan.",
        tl: "Magsuot ng gloves at buksan ang bintana o ang exhaust fan." },
      { en: "Apply cleaner to toilet, sink and shower and let it sit while you do other tasks.",
        tl: "Lagyan ng panlinis ang inodoro, lababo at shower at hayaan muna habang gumagawa ng ibang gawain." },
      { en: "Scrub the shower and sink, then the toilet last — inside the bowl, seat, base and behind.",
        tl: "Kuskusin ang shower at lababo, at huli ang inodoro — loob ng bowl, upuan, paanan at likod." },
      { en: "Use a separate cloth for the toilet; never reuse it on the sink or mirror.",
        tl: "Gumamit ng hiwalay na basahan para sa inodoro; huwag itong gamitin sa lababo o salamin." },
      { en: "Clean the mirror and polish faucets and fixtures.",
        tl: "Linisin ang salamin at pakintabin ang gripo at mga fixture." },
      { en: "Replace towels and restock toilet paper, soap, shampoo and other toiletries.",
        tl: "Palitan ang mga tuwalya at dagdagan ang tissue, sabon, shampoo at iba pang toiletries." },
      { en: "Mop the floor, working from the far corner to the door.",
        tl: "Magmop ng sahig, mula sa pinakamalayong sulok papunta sa pinto." },
    ],
    tips: [
      { en: "Check the drain for hair and the grout for mold — photograph and report anything you can't fix.",
        tl: "Tingnan kung may buhok sa drain at amag sa grout — kunan ng litrato at i-report ang hindi mo maayos." },
      { en: "Never mix bleach with other cleaning products.",
        tl: "Huwag kailanman ihalo ang bleach sa ibang panlinis." },
    ],
  },
  {
    id: "kitchen",
    title: { en: "Kitchen", tl: "Kusina" },
    summary: {
      en: "Clean, dry surfaces and appliances, with no food or trash left.",
      tl: "Malinis at tuyong mga ibabaw at appliances, walang naiwang pagkain o basura.",
    },
    steps: [
      { en: "Wash, dry and put away any dishes and utensils.",
        tl: "Hugasan, patuyuin at itabi ang mga pinggan at kubyertos." },
      { en: "Remove any leftover guest food from the fridge and cabinets.",
        tl: "Alisin ang mga naiwang pagkain ng guest sa ref at mga cabinet." },
      { en: "Clean the microwave inside and out.",
        tl: "Linisin ang loob at labas ng microwave." },
      { en: "Wipe down the stove, fridge doors and other appliances.",
        tl: "Punasan ang kalan, pinto ng ref at iba pang appliances." },
      { en: "Clean countertops and sink, then dry them so there are no water spots.",
        tl: "Linisin ang counter at lababo, saka patuyuin para walang marka ng tubig." },
      { en: "Take out trash and recycling and put in new liners.",
        tl: "Ilabas ang basura at recyclables at lagyan ng bagong supot." },
    ],
    tips: [
      { en: "Use the kitchen cloth only in the kitchen.",
        tl: "Gamitin lang sa kusina ang basahan ng kusina." },
      { en: "If an appliance doesn't work, report it under Report an Issue.",
        tl: "Kung may sirang appliance, i-report sa Report an Issue." },
    ],
  },
  {
    id: "living",
    title: { en: "Living Room", tl: "Sala" },
    summary: {
      en: "A tidy, guest-ready space that matches the listing photos.",
      tl: "Maayos at handang sala para sa guest, kamukha ng mga litrato sa listing.",
    },
    steps: [
      { en: "Collect trash and anything left behind.",
        tl: "Pulutin ang basura at anumang naiwang gamit." },
      { en: "Vacuum the sofa, under the cushions and the pillows.",
        tl: "I-vacuum ang sofa, ilalim ng mga cushion at ang mga unan." },
      { en: "Dust all surfaces, including the TV and entertainment center (dry cloth on screens).",
        tl: "Punasan ng alikabok ang lahat ng ibabaw, kasama ang TV at entertainment center (tuyong basahan sa screen)." },
      { en: "Arrange furniture, pillows and decor back to their standard places.",
        tl: "Ibalik sa tamang puwesto ang mga muwebles, unan at dekorasyon." },
      { en: "Vacuum or mop the floor.",
        tl: "I-vacuum o magmop ng sahig." },
    ],
    tips: [
      { en: "The room should look like the listing photos when you finish.",
        tl: "Pagkatapos mo, dapat kamukha ng sala ang mga litrato sa listing." },
    ],
  },
  {
    id: "general",
    title: { en: "General & Final Check", tl: "Pangkalahatan at Huling Pagsusuri" },
    summary: {
      en: "The walkthrough that makes the unit ready for the next guest.",
      tl: "Ang huling pag-ikot para maging handa ang unit sa susunod na guest.",
    },
    steps: [
      { en: "Work top to bottom and dry to wet in every room.",
        tl: "Sa bawat kwarto, maglinis mula itaas pababa at mula tuyo bago basa." },
      { en: "Wipe door handles, light switches and remote controls.",
        tl: "Punasan ang mga hawakan ng pinto, switch ng ilaw at mga remote control." },
      { en: "Check that all light bulbs work and test the smoke detector.",
        tl: "Tingnan kung gumagana ang lahat ng bumbilya at i-test ang smoke detector." },
      { en: "Air out the unit.",
        tl: "Pahanginin ang unit." },
      { en: "Do a final walkthrough of every room against the checklist and take the required photos.",
        tl: "Ikutin ang bawat kwarto gamit ang checklist at kunan ang mga kailangang litrato." },
      { en: "Submit the checklist so the office can inspect.",
        tl: "I-submit ang checklist para ma-inspect ng office." },
    ],
    tips: [
      { en: "Any damage, broken item or missing inventory: take a photo and report it before you leave.",
        tl: "Kapag may sira, basag o nawawalang gamit: kunan ng litrato at i-report bago umalis." },
    ],
  },
];

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "order",
    area: GENERAL,
    question: { en: "In which order should you clean a room?", tl: "Sa anong pagkakasunod dapat linisin ang isang kwarto?" },
    options: [
      { en: "Bottom to top, wet to dry", tl: "Mula ibaba pataas, basa bago tuyo" },
      { en: "Top to bottom, dry to wet", tl: "Mula itaas pababa, tuyo bago basa" },
      { en: "Floors first, then surfaces", tl: "Sahig muna, saka ang mga ibabaw" },
      { en: "Any order is fine", tl: "Kahit anong pagkakasunod" },
    ],
    answer: 1,
    explanation: {
      en: "Work top to bottom and dry to wet, so dust and drips fall onto areas you haven't cleaned yet.",
      tl: "Mula itaas pababa at tuyo bago basa, para ang alikabok at tulo ay mahulog sa bahaging hindi pa nalilinis.",
    },
  },
  {
    id: "linens",
    area: BEDROOM,
    question: { en: "Where should used linens go when you strip the bed?", tl: "Saan dapat ilagay ang gamit na linen kapag tinanggal mo sa kama?" },
    options: [
      { en: "On the floor until you're done", tl: "Sa sahig hanggang matapos ka" },
      { en: "On the sofa", tl: "Sa sofa" },
      { en: "Straight into the laundry bag", tl: "Diretso sa laundry bag" },
      { en: "Back on the bed, folded", tl: "Ibalik sa kama, nakatupi" },
    ],
    answer: 2,
    explanation: {
      en: "Used linens go straight into the laundry bag so they never touch clean surfaces or the floor.",
      tl: "Diretso sa laundry bag ang gamit na linen para hindi ito dumikit sa malinis na ibabaw o sa sahig.",
    },
  },
  {
    id: "toilet-cloth",
    area: BATHROOM,
    question: { en: "Can you use the cloth from the toilet to wipe the sink or mirror?", tl: "Puwede mo bang gamitin ang basahan ng inodoro sa lababo o salamin?" },
    options: [
      { en: "Yes, if you rinse it first", tl: "Oo, kung babanlawan muna" },
      { en: "No — use a separate cloth for the toilet", tl: "Hindi — hiwalay ang basahan ng inodoro" },
      { en: "Yes, it saves time", tl: "Oo, para mas mabilis" },
      { en: "Only for the mirror", tl: "Sa salamin lang" },
    ],
    answer: 1,
    explanation: {
      en: "The toilet cloth stays with the toilet only, to avoid spreading germs.",
      tl: "Para lang sa inodoro ang basahan nito, para hindi kumalat ang mikrobyo.",
    },
  },
  {
    id: "bleach",
    area: SAFETY,
    question: { en: "Which is safe to do with bleach?", tl: "Alin ang ligtas gawin sa bleach?" },
    options: [
      { en: "Mix it with other cleaners for a stronger clean", tl: "Ihalo sa ibang panlinis para mas malakas" },
      { en: "Use it in a closed room without ventilation", tl: "Gamitin sa saradong kwarto na walang hangin" },
      { en: "Use it alone, with gloves and good airflow", tl: "Gamitin nang mag-isa, may gloves at maayos na hangin" },
      { en: "Mix it with vinegar", tl: "Ihalo sa suka" },
    ],
    answer: 2,
    explanation: {
      en: "Never mix bleach with other products — it can release toxic gas. Use it alone, with gloves and ventilation.",
      tl: "Huwag ihalo ang bleach sa ibang produkto — puwede itong maglabas ng nakalalasong usok. Gamitin nang mag-isa, may gloves at bentilasyon.",
    },
  },
  {
    id: "left-items",
    area: GENERAL,
    question: { en: "You find a guest's item left in the unit. What do you do?", tl: "May nakita kang gamit ng guest na naiwan sa unit. Ano ang gagawin mo?" },
    options: [
      { en: "Throw it away", tl: "Itapon" },
      { en: "Keep it", tl: "Itago para sa sarili" },
      { en: "Leave it where it was", tl: "Iwanan kung nasaan" },
      { en: "Report it to the office through Messages", tl: "I-report sa office sa Messages" },
    ],
    answer: 3,
    explanation: {
      en: "Report items left behind to the office so they can contact the guest.",
      tl: "I-report sa office ang naiwang gamit para makontak nila ang guest.",
    },
  },
  {
    id: "damage",
    area: GENERAL,
    question: { en: "You notice a broken appliance. What should you do?", tl: "May napansin kang sirang appliance. Ano ang dapat gawin?" },
    options: [
      { en: "Ignore it if it's small", tl: "Balewalain kung maliit lang" },
      { en: "Take a photo and report it under Report an Issue", tl: "Kunan ng litrato at i-report sa Report an Issue" },
      { en: "Try to repair it yourself", tl: "Subukang ayusin mag-isa" },
      { en: "Tell the next guest", tl: "Sabihin sa susunod na guest" },
    ],
    answer: 1,
    explanation: {
      en: "Photograph it and file it under Report an Issue so the office can arrange maintenance.",
      tl: "Kunan ng litrato at i-report sa Report an Issue para maipaayos ng office.",
    },
  },
  {
    id: "stain",
    area: BEDROOM,
    question: { en: "A fresh sheet has a small stain. What do you do?", tl: "May maliit na mantsa ang bagong kumot. Ano ang gagawin mo?" },
    options: [
      { en: "Use it — the guest won't notice", tl: "Gamitin pa rin — hindi mapapansin ng guest" },
      { en: "Flip it over", tl: "Baliktarin" },
      { en: "Send it back to laundry and use another sheet", tl: "Ibalik sa laundry at gumamit ng iba" },
      { en: "Cover it with a pillow", tl: "Takpan ng unan" },
    ],
    answer: 2,
    explanation: {
      en: "Any stain or hair means the linen goes back to laundry. Only use spotless linens.",
      tl: "Kapag may mantsa o buhok, ibalik sa laundry. Malinis na linen lang ang gamitin.",
    },
  },
];

export const PREP_ITEMS: PrepItem[] = [
  { id: "linens", group: "Supplies", label: { en: "Fresh bed linens and pillowcases", tl: "Bagong kobre-kama at punda" } },
  { id: "towels", group: "Supplies", label: { en: "Clean towels (bath, hand, face)", tl: "Malinis na tuwalya (pampaligo, pangkamay, pangmukha)" } },
  { id: "toiletries", group: "Supplies", label: { en: "Toiletries and toilet paper for restocking", tl: "Toiletries at tissue na pandagdag" } },
  { id: "chemicals", group: "Supplies", label: { en: "Cleaning solutions and disinfectant", tl: "Mga panlinis at disinfectant" } },
  { id: "liners", group: "Supplies", label: { en: "Trash bags and bin liners", tl: "Mga supot ng basura" } },
  { id: "vacuum", group: "Equipment", label: { en: "Vacuum cleaner charged / working", tl: "Vacuum na naka-charge / gumagana" } },
  { id: "mop", group: "Equipment", label: { en: "Mop and bucket", tl: "Mop at timba" } },
  { id: "cloths", group: "Equipment", label: { en: "Separate cloths for bathroom, kitchen and surfaces", tl: "Hiwalay na basahan para sa banyo, kusina at mga ibabaw" } },
  { id: "phone", group: "Equipment", label: { en: "Phone charged for checklist photos", tl: "Naka-charge na phone para sa mga litrato ng checklist" } },
  { id: "gloves", group: "Safety", label: { en: "Gloves on before touching chemicals or trash", tl: "Naka-gloves bago humawak ng kemikal o basura" } },
  { id: "ventilation", group: "Safety", label: { en: "Windows or exhaust fan open while using chemicals", tl: "Bukas ang bintana o exhaust fan habang gumagamit ng kemikal" } },
  { id: "no-mixing", group: "Safety", label: { en: "I will not mix bleach with other products", tl: "Hindi ko ihahalo ang bleach sa ibang produkto" } },
];

/** Ids of the questions answered wrong (or not answered) among `questionIds`. */
export function gradeQuiz(
  questionIds: string[],
  answers: Record<string, number | undefined>,
  questions: QuizQuestion[] = QUIZ_QUESTIONS,
): { correct: string[]; missed: string[] } {
  const correct: string[] = [];
  const missed: string[] = [];
  for (const id of questionIds) {
    const q = questions.find((x) => x.id === id);
    if (!q) continue;
    (answers[id] === q.answer ? correct : missed).push(id);
  }
  return { correct, missed };
}

export type GuideProgress = {
  /** Every quiz question has been answered correctly (across retries). */
  quizPassed: boolean;
  /** Local day (YYYY-MM-DD) the preparation checklist below belongs to. */
  prepDate: string | null;
  prepChecked: string[];
  /** When the assessment was last completed (ISO). */
  completedAt: string | null;
};

export const EMPTY_PROGRESS: GuideProgress = { quizPassed: false, prepDate: null, prepChecked: [], completedAt: null };

export function localDayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today's ticked prep items — yesterday's ticks don't count for today's shift. */
export function prepCheckedToday(progress: GuideProgress, today: string = localDayKey()): string[] {
  return progress.prepDate === today ? progress.prepChecked : [];
}

/** "Assessment Completed — Ready for Cleaning": quiz passed and today's checklist complete. */
export function isReadyForCleaning(progress: GuideProgress, today: string = localDayKey(), items: PrepItem[] = PREP_ITEMS): boolean {
  if (!progress.quizPassed) return false;
  const ticked = new Set(prepCheckedToday(progress, today));
  return items.every((i) => ticked.has(i.id));
}
