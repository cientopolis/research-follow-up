/**
 * Diverse avatar presets for DiceBear avataaars.
 * Each seed produces a deterministic, unique face — varied skin tones,
 * hairstyles, hair colours, accessories and gender presentations.
 */

export interface AvatarPreset {
  seed: string;   // passed to DiceBear as-is
  label: string;  // shown below the preview tile
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  // ── Personas femeninas ──────────────────────────────────────────
  { seed: 'Valentina-curly-dark',    label: 'Valentina'  },
  { seed: 'Amara-afro-black',        label: 'Amara'      },
  { seed: 'Priya-long-brown',        label: 'Priya'      },
  { seed: 'Hana-bob-light',          label: 'Hana'       },
  { seed: 'Fatima-hijab-olive',      label: 'Fatima'     },
  { seed: 'Rania-wavy-tan',          label: 'Rania'      },
  { seed: 'Mei-straight-black',      label: 'Mei'        },
  { seed: 'Elena-bun-blonde',        label: 'Elena'      },
  { seed: 'Wanjiru-natural-dark',    label: 'Wanjiru'    },
  { seed: 'Xiomara-long-auburn',     label: 'Xiomara'    },

  // ── Personas masculinas ─────────────────────────────────────────
  { seed: 'Gabriel-short-dark',      label: 'Gabriel'    },
  { seed: 'Kwame-buzz-black',        label: 'Kwame'      },
  { seed: 'Mateo-curly-brown',       label: 'Mateo'      },
  { seed: 'Björn-long-blonde',       label: 'Björn'      },
  { seed: 'Emeka-fade-dark',         label: 'Emeka'      },
  { seed: 'Samuel-beard-tan',        label: 'Samuel'     },
  { seed: 'Igor-short-light',        label: 'Igor'       },
  { seed: 'Chen-straight-black',     label: 'Chen'       },
  { seed: 'Omar-wavy-brown',         label: 'Omar'       },
  { seed: 'Lucas-messy-auburn',      label: 'Lucas'      },

  // ── Presentación neutra / diversa ───────────────────────────────
  { seed: 'River-pixie-lavender',    label: 'River'      },
  { seed: 'Nour-short-dark-glasses', label: 'Nour'       },
  { seed: 'Jamie-curly-red',         label: 'Jamie'      },
  { seed: 'Quinn-undercut-blonde',   label: 'Quinn'      },
];
