# Chainframe — Website Background Prompts

Current branding is CHAINFRAME. Existing background scenes remain valid without lettering changes; do not introduce former branding, new handles or domains. Final wordmark, coin and social-preview edit prompts and saved master dimensions are recorded in [ASSET_PROMPTS.md](ASSET_PROMPTS.md#chainframe-brand-artwork). Their dark computer-hardware palette continues to match these scenes.

These prompts are designed for **full-page website backgrounds** displayed beneath a dark overlay (`bg-black/60` to `bg-black/80`).
The goal is atmosphere — not detail. Images should be **dark, moody, and low-contrast** so UI elements remain readable on top.

---

## Output Specifications

| Property       | Value                        |
|----------------|------------------------------|
| Resolution     | 1920x1080 (or 2560x1440 for retina) |
| Format         | PNG or JPG                   |
| Orientation    | Landscape, horizontal        |
| Tone           | Very dark, 70–85% of image should be near-black |
| Style          | 16-bit pixel art OR dark cinematic illustration |
| Safe area      | Keep center region clear — UI will sit on top |

---

## Style Suffix

Append this to every prompt for consistency:

> `pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center`

---

## Recommended Overlay in Code

```css
/* globals.css or Tailwind */
background-image: url('/backgrounds/bg-01.jpg');
background-size: cover;
background-position: center;
background-attachment: fixed;
```

```tsx
/* layout.tsx or AppShell */
<div className="fixed inset-0 -z-10">
  <img src="/backgrounds/bg-01.jpg" className="h-full w-full object-cover" />
  <div className="absolute inset-0 bg-black/70" />
</div>
```

Adjust opacity between `bg-black/60` (more image visible) and `bg-black/85` (subtler) per page.

---

## 25 Background Prompts

---

### 01 — The Deep Mine
```
Deep underground pixel art mine tunnel stretching into darkness, faint amber glow from distant lanterns, server rack walls embedded with ore veins, dripping cave ceiling, far vanishing point, very dark overall with just a hint of warm light deep in the tunnel. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 02 — Circuit Horizon
```
Endless dark circuit board landscape stretching to a glowing horizon, faint green and red trace lines running across a near-black ground plane, small data pulses of light travelling along traces, deep night sky above, very subtle glow on horizon only. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 03 — Server Cathedral
```
Enormous dark cathedral interior where the columns and arches are made of stacked server racks, faint red indicator lights dotting the walls like candles, high vaulted ceiling disappearing into darkness, a single shaft of cold blue light from above, dramatic shadow play. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 04 — The Void Network
```
Abstract deep space scene where glowing node points are connected by thin neon lines forming a vast network, sparse points of red and green light on a pure black void, galaxy-like distribution of nodes fading to darkness at edges, center almost empty. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 05 — Hash Storm
```
Dark turbulent sky filled with slowly falling blockchain block shapes, storm clouds made of binary data, faint lightning in the distance casting brief illumination on the pixel art clouds, ground level completely black, majority of image in deep shadow. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 06 — The Cold Vault
```
Enormous dark vault door embedded in a black rock wall, frost and ice forming around the edges, faint red keypad glow on the far left, deep shadow filling the rest of the scene, minimal detail in center, eerie and cold atmosphere. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 07 — Protocol Rain
```
Dark city street at night with neon rain falling, reflections of red and green neon signs in rain puddles on black asphalt, most of the image in shadow, only the puddle reflections carry color, tall dark buildings with minimal lit windows at top edge. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 08 — Genesis Crater
```
A massive dark crater viewed from inside looking up, glowing amber molten cracks running along the crater walls, the crater rim silhouetted against a dark starless sky, center of crater floor in complete shadow, dramatic rim lighting only. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 09 — The Rig Room
```
Dark industrial warehouse interior packed with rows of mining rigs, each rig emitting a very faint red indicator glow, heavy shadows between rows, concrete floor reflecting minimal light, ceiling completely dark, wide symmetrical perspective down the central aisle. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 10 — Exploit Horizon
```
Dark dystopian skyline silhouetted in total black against a deep crimson and dark purple horizon glow, city towers as pure black cutout shapes, no windows lit, a faint pulse of red on the horizon as if something massive is powering up below. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 11 — Deep Protocol Sea
```
Dark bioluminescent ocean with faint circuit trace patterns glowing on the seabed far below the surface, water surface dark and still, deep black water column in center, small neon plankton dots scattered sparsely, overwhelming darkness with only faint traces of light. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 12 — Firewall Dusk
```
Ancient dark fortress walls at dusk, walls completely in shadow, a line of blue-green fire burning along the top of the wall battlements as the only light source, sky behind in deep indigo darkness, gate closed, dramatic and ominous. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 13 — Binary Forest
```
Dark forest where the trees are made of stacked binary digits, tree trunks of zeros and ones rising into pure black canopy, faint green phosphor glow emanating from some trees, forest floor in total shadow, center gap between trees completely dark. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 14 — The Mempool
```
Abstract dark space filled with floating translucent transaction hexagons slowly drifting, most hexagons dark and unlit, only a few glowing faint amber as they get confirmed, deep black background, sparse and meditative atmosphere. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 15 — Overclocked Night
```
Dark rooftop scene with rows of cooling fans spinning on server units, each fan casting a faint circular glow, dark sky above with faint data-stream clouds, city lights barely visible on the far horizon as a thin strip of purple, rooftop mostly in shadow. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 16 — Notoriety Alley
```
Dark narrow alley between tall black buildings, walls covered in faint glitched graffiti patterns just barely visible in shadow, a single red overhead lamp at the far end of the alley, wet ground reflecting the red glow, alley opening in center completely dark. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 17 — Block Graveyard
```
Dark foggy graveyard at midnight, tombstones shaped as obsolete blockchain blocks with faded hash inscriptions, dead pixel art trees silhouetted against a dark grey sky, low ground fog catching faint moonlight, center path between tombstones in deep shadow. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 18 — Cold Storage Facility
```
Industrial dark freezer corridor with frosted metal walls and ceiling, faint blue cryo-light strips at floor level only, vapor mist floating at ankle height, heavy vault doors on either side sealed shut, long dark perspective down the center of the corridor. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 19 — The Hash Abyss
```
Looking down into an infinite dark abyss, walls of the shaft lined with glowing circuit traces descending forever, only the very top rim lit by faint red emergency lighting, center of the abyss is pure black, vertigo-inducing perspective. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 20 — Syndicate Tower
```
Single enormous black skyscraper dominating the frame, most windows dark, only a few high floors lit in red, storm clouds surrounding the upper floors, ground level in total shadow, oppressive and corporate atmosphere, sky nearly as dark as the building. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 21 — Liquidity Pool
```
Dark underground chamber with a perfectly still black liquid pool in the center, faint amber symbols floating on the surface like oil, cave walls in shadow, a single stalactite dripping into the pool creating tiny ripples, otherworldly and silent atmosphere. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 22 — Zero Day Sky
```
Dark apocalyptic sky with massive cracks of red light spreading across it like a broken screen, landscape below in total silhouette blackness, the cracked sky dominates the upper two thirds, ground line barely visible at bottom, terrifying and dramatic. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 23 — The Dark Pool Exchange
```
Dark marble-floored trading floor completely empty and abandoned, ticker screens on walls dark except for one flickering with red numbers, chairs overturned, only the emergency lighting on the floor casting a faint path, eerie post-collapse atmosphere. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 24 — Proof of Work
```
Dark abstract forge interior, a single enormous anvil glowing red-hot in the center, sparks floating upward into darkness, blacksmith tools as shadows on the walls, ceiling invisible in darkness, heat shimmer effect around the glowing anvil center. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

### 25 — The Final Block
```
An enormous stone altar in a dark void, a single glowing amber blockchain block descending slowly from pure black sky toward it, thousands of dark silhouetted figures watching from below in total shadow, dramatic single-point lighting from the descending block only, everything else in darkness. pixel art, 16-bit retro style, very dark background, near-black with subtle neon accents, low contrast overall, wide landscape format, atmospheric, moody, game wallpaper, no text, no UI elements, seamless darkness in center
```

---

## File Naming Convention

```
public/backgrounds/
  bg-01-deep-mine.jpg
  bg-02-circuit-horizon.jpg
  bg-03-server-cathedral.jpg
  ...
  bg-25-final-block.jpg
```

## Recommended Overlay Values by Page

| Page        | Overlay Class      | Effect                        |
|-------------|--------------------|-------------------------------|
| Landing     | `bg-black/60`      | More visible, dramatic        |
| Dashboard   | `bg-black/80`      | Subtle, UI-first              |
| Profile     | `bg-black/75`      | Balanced                      |
| Marketplace | `bg-black/80`      | Subtle, product-first         |
| Chests      | `bg-black/65`      | More dramatic for reveals     |
