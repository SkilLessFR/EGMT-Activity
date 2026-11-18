export type TemplateCategory =
  | "Mega Wheel"
  | "Manual Roulette"
  | "Automatic Roulette";

export interface TemplatePhotoRequirement {
  key: string;
  label: string;
}

export interface TaskTemplateOption {
  id: string;
  category: TemplateCategory;
  name: string;
  requiresComment?: boolean;
  commentLabel?: string;
  commentPlaceholder?: string;
  requiresSerialNumbers?: boolean;
  requiredPhotos?: TemplatePhotoRequirement[];
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Mega Wheel",
  "Manual Roulette",
  "Automatic Roulette",
];

export const TASK_TEMPLATES: TaskTemplateOption[] = [
  // Mega Wheel
  {
    id: "mega-wheel-flapper-change",
    category: "Mega Wheel",
    name: "Flapper Change",
  },
  {
    id: "mega-wheel-pin-change",
    category: "Mega Wheel",
    name: "Pin Change",
  },
  {
    id: "mega-wheel-roulette-calibration",
    category: "Mega Wheel",
    name: "Roulette Calibration",
  },

  // Manual Roulette
  {
    id: "manual-roulette-leveling",
    category: "Manual Roulette",
    name: "Leveling",
    requiredPhotos: [{ key: "leveling", label: "Leveling Picture" }],
  },
  {
    id: "manual-roulette-rotor-check",
    category: "Manual Roulette",
    name: "Rotor Check",
  },
  {
    id: "manual-roulette-roulette-change",
    category: "Manual Roulette",
    name: "Roulette Change",
    requiresSerialNumbers: true,
    requiredPhotos: [
      { key: "old-sn", label: "Old Roulette SN Picture" },
      { key: "new-sn", label: "New Roulette SN Picture" },
    ],
  },
  {
    id: "manual-roulette-setting-change",
    category: "Manual Roulette",
    name: "Setting Change",
    requiresComment: true,
    commentLabel: "What changed?",
    commentPlaceholder: "Describe the setting change...",
  },

  // Automatic Roulette
  {
    id: "auto-roulette-emg-ball-change",
    category: "Automatic Roulette",
    name: "EMG Ball Change",
  },
  {
    id: "auto-roulette-pressure-adjustment",
    category: "Automatic Roulette",
    name: "Pressure Adjustment",
    requiresComment: true,
    commentLabel: "How did you change it?",
    commentPlaceholder: "Describe the pressure adjustment...",
  },
  {
    id: "auto-roulette-setting-adjustment",
    category: "Automatic Roulette",
    name: "Setting Adjustment",
    requiresComment: true,
    commentLabel: "What settings have been changed?",
    commentPlaceholder: "List which settings were adjusted...",
  },
  {
    id: "auto-roulette-compressor-change",
    category: "Automatic Roulette",
    name: "Compressor Change",
  },
  {
    id: "auto-roulette-component-change",
    category: "Automatic Roulette",
    name: "Component Change",
    requiresComment: true,
    commentLabel: "What did you change?",
    commentPlaceholder: "Describe the component that was changed...",
  },
];

export function getTemplatesByCategory(
  category: TemplateCategory
): TaskTemplateOption[] {
  return TASK_TEMPLATES.filter((t) => t.category === category);
}
