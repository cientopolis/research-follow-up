/**
 * Diverse avatar presets for DiceBear avataaars.
 * Expanded collection of deterministic seeds producing varied skin tones,
 * facial features, hairstyles, hair colors, hats, and glasses/accessories.
 */

export interface AvatarPreset {
  seed: string;   // passed to DiceBear as-is
  label: string;  // shown below the preview tile
  category?: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  // ── Pelo Corto / Estilos Masculinos ─────────────────────────────
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
  { seed: 'Diego-classic-fade',      label: 'Diego'      },
  { seed: 'Alejandro-curly-beard',   label: 'Alejandro'  },
  { seed: 'Tariq-short-glasses',     label: 'Tariq'      },
  { seed: 'Siddharth-side-part',     label: 'Siddharth'  },
  { seed: 'Kenji-short-crop',        label: 'Kenji'      },
  { seed: 'Arthur-wavy-grey',        label: 'Arthur'     },
  { seed: 'Felipe-mustache-brown',   label: 'Felipe'     },
  { seed: 'Dante-afro-taper',        label: 'Dante'      },
  { seed: 'Noah-shaved-sides',       label: 'Noah'       },
  { seed: 'Carlos-caesar-dark',      label: 'Carlos'     },
  { seed: 'Hiroshi-textured-top',    label: 'Hiroshi'    },
  { seed: 'Viktor-stubble-blonde',   label: 'Viktor'     },
  { seed: 'Zaid-neat-beard',         label: 'Zaid'       },
  { seed: 'Malcolm-dreads-short',    label: 'Malcolm'    },

  // ── Pelo Largo / Estilos Femeninos ──────────────────────────────
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
  { seed: 'Sofia-ponytail-brunette', label: 'Sofía'      },
  { seed: 'Camila-bangs-dark',       label: 'Camila'     },
  { seed: 'Amina-braids-long',       label: 'Amina'      },
  { seed: 'Aoi-pixie-black',         label: 'Aoi'        },
  { seed: 'Lucia-wavy-blonde',       label: 'Lucía'      },
  { seed: 'Zara-curly-high-bun',     label: 'Zara'       },
  { seed: 'Chloe-bob-pink',          label: 'Chloe'      },
  { seed: 'Keiko-straight-bangs',    label: 'Keiko'      },
  { seed: 'Isabella-layer-brown',    label: 'Isabella'   },
  { seed: 'Nia-locs-medium',         label: 'Nia'        },
  { seed: 'Ingrid-silver-wavy',      label: 'Ingrid'     },
  { seed: 'Yuki-short-bob',          label: 'Yuki'       },
  { seed: 'Mariana-voluminous-curl', label: 'Mariana'    },
  { seed: 'Khadija-headscarf-dark',  label: 'Khadija'    },

  // ── Accesorios / Estilos Únicos ────────────────────────────────
  { seed: 'River-pixie-lavender',    label: 'River'      },
  { seed: 'Nour-short-dark-glasses', label: 'Nour'       },
  { seed: 'Jamie-curly-red',         label: 'Jamie'      },
  { seed: 'Quinn-undercut-blonde',   label: 'Quinn'      },
  { seed: 'Taylor-beanie-glasses',   label: 'Taylor'     },
  { seed: 'Alex-round-specs',        label: 'Alex'       },
  { seed: 'Morgan-hat-cool',         label: 'Morgan'     },
  { seed: 'Sam-sunglasses-afro',     label: 'Sam'        },
  { seed: 'Dakota-beret-artistic',   label: 'Dakota'     },
  { seed: 'Riley-headphones-vibe',   label: 'Riley'      },
  { seed: 'Jordan-academic-glasses', label: 'Jordan'     },
  { seed: 'Avery-turban-chic',       label: 'Avery'      },
];
