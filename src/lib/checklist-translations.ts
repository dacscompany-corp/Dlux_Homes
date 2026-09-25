// Tagalog translations for the cleaning checklist's default template text
// (category names + task descriptions) — the fixed set every new checklist
// starts from (see DEFAULT_CHECKLIST_TEMPLATE in
// src/backend/controller/cleaningChecklistController.ts). Checklist text is
// otherwise free-form (admin can add custom per-assignment tasks), so this
// only covers what's actually translatable ahead of time; anything not in
// here falls back to whatever text was actually typed.

export const CATEGORY_TRANSLATIONS_TL: Record<string, string> = {
  "Bedroom": "Kwarto",
  "Bathroom": "Banyo",
  "Kitchen": "Kusina",
  "Living Room": "Sala",
  "General": "Pangkalahatan",
};

export const TASK_TRANSLATIONS_TL: Record<string, string> = {
  // Bedroom
  "Make bed and change linens": "Ayusin ang kama at palitan ang kumot/kobre-kama",
  "Dust furniture and surfaces": "Punasan ng alikabok ang mga muwebles at ibabaw",
  "Vacuum floor and rugs": "I-vacuum ang sahig at mga rug",
  "Clean mirrors and windows": "Linisin ang mga salamin at bintana",
  "Empty trash bin": "Ibuhos ang basura",
  // Bathroom
  "Clean toilet, sink, and shower": "Linisin ang inodoro, lababo, at shower",
  "Replace towels and toiletries": "Palitan ang mga tuwalya at toiletries",
  "Mop floor": "Magmop ng sahig",
  "Clean mirror": "Linisin ang salamin",
  "Restock supplies": "Dagdagan ang mga suplay",
  // Kitchen
  "Clean countertops and sink": "Linisin ang counter at lababo",
  "Wipe down appliances": "Punasan ang mga appliances",
  "Clean microwave inside and out": "Linisin ang loob at labas ng microwave",
  "Take out trash and recycling": "Ilabas ang basura at recyclables",
  // Living Room
  "Vacuum sofa and cushions": "I-vacuum ang sofa at mga unan",
  "Dust all surfaces": "Punasan ng alikabok ang lahat ng ibabaw",
  "Clean TV and entertainment center": "Linisin ang TV at entertainment center",
  "Vacuum or mop floor": "I-vacuum o magmop ng sahig",
  "Arrange furniture and decor": "Ayusin ang mga muwebles at dekorasyon",
  // General
  "Check all light bulbs": "Tingnan ang lahat ng bumbilya",
  "Wipe down door handles": "Punasan ang mga hawakan ng pinto",
  "Check smoke detector": "Tingnan ang smoke detector",
  "Air out the unit": "Pahanginin ang unit",
  "Final walkthrough inspection": "Huling pagsusuri sa buong unit",
};

export type ChecklistLanguage = "en" | "tl";

export function translateCategory(category: string, lang: ChecklistLanguage): string {
  if (lang === "en") return category;
  return CATEGORY_TRANSLATIONS_TL[category] ?? category;
}

export function translateTask(task: string, lang: ChecklistLanguage): string {
  if (lang === "en") return task;
  return TASK_TRANSLATIONS_TL[task] ?? task;
}
