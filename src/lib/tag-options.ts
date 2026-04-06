export const TAG_OPTIONS = [
  "fresh",
  "citrus",
  "aquatic",
  "floral",
  "green",
  "woody",
  "amber",
  "gourmand",
  "spicy",
  "musk",
] as const;

export type FragranceTag = (typeof TAG_OPTIONS)[number];
