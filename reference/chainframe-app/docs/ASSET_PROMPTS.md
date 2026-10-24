# Chainframe — Image Generation Prompts

## Chainframe brand artwork

Final masters were edited with the built-in image-generation tool using the prior wordmark, HASH coin and social preview as reference images. The metallic logo/coin follow their existing material style; the pixel-art guide below applies to the other catalog artwork. Preserve generated alpha for the transparent masters. Prompts used:

### Wordmark

Saved: `/brand/chainframe-logo.png — 1983×793, RGBA`.

> Use case: text-localization. Edit target: existing game wordmark. Replace CRYPTOCORE with exact text "CHAINFRAME" (C H A I N F R A M E). Keep the bold beveled industrial computer-hardware lettering, cracked brushed metal, subtle red edge light, silver CHAIN and red FRAME. Single horizontal wordmark, no other text or symbols. Center with modest transparent padding, wide landscape composition. Actual transparent background, clean alpha edges, legible at navigation-logo sizes. Preserve visual identity and contrast of reference.

### HASH coin

Saved: `/brand/hash-token.png — 1254×1254, RGBA`.

> Use case: text-localization. Edit target: HASH token coin reference. Change only the top outer-ring word CRYPTOCORE to exact "CHAINFRAME" (C H A I N F R A M E), following the same arc with engraved metallic letters. Preserve the large central HASH # symbol, BUILT TO MINE bottom inscription, black metal/red circuit board details, red rim lighting, coin perspective and identity. Square composition, complete coin with transparent padding, genuine transparent background. No old brand lettering.

### Social preview

Saved: `/brand/chainframe-og.png — 1536×1024, RGB`.

> Use case: text-localization. Edit target: existing social preview artwork. Rebrand CRYPTOCORE as exact "CHAINFRAME" (silver CHAIN, red FRAME), retain the tagline verbatim "BUILD. MINE. RAID. EARN." Preserve dark pixel-art computer-mining room, hooded hacker, mining rigs, chests and red/green monitor lighting, original composition and supporting feature descriptions. Change CORE NETWORK sign to "CHAINFRAME" with "24/7 MINING" below. Replace prominent old C chip emblems with stylized # HASH emblems. Ensure no CRYPTOCORE or CORE NETWORK lettering remains. Clean readable title and tagline, landscape 1536 by 1024 social preview, opaque background. No new social handles or domains.

The coin master supplies deterministic Lanczos resizing for favicon PNGs (16/32), Apple (180) and Android (192/512), plus an ICO containing 16/32/48/256 PNG frames. No redesign is applied to derivatives. Lettering, transparent edges and the retained central HASH symbol were visually inspected before integration. Old wordmark/preview paths are removed, without aliases. Metadata uses the social preview's actual dimensions. The current application origin is supplied separately by the browser; artwork contains no assumed domain.

## Catalog artwork style

Pixel art style guide for all generated assets:
- Style: 16-bit / 32-bit retro pixel art
- Palette: dark backgrounds, neon red (#e5484d), acid green (#16a34a), purple (#a855f7), amber (#eab308) accents
- No anti-aliasing, hard pixel edges, flat color fills
- Consistent sprite scale across the collection
- Transparent background unless otherwise noted

---

## Avatar Prompts (25)

Use these in ChatGPT / DALL-E 3. Append this suffix to every prompt for consistency:
> `pixel art, 64x64 sprite, retro game icon, dark background, bold pixel outlines, no anti-aliasing, flat colors, cyberpunk mining aesthetic`

---

**1. The Operator**
> Pixel art portrait of a male hacker wearing a black hoodie, face partially hidden by a glowing green terminal screen reflection, neon red eyes, dark background

**2. The Rig Runner**
> Pixel art portrait of a female engineer with short silver hair, AR goggles pushed up on her forehead, wearing a grey tactical jacket with circuit board patterns

**3. The Ghost**
> Pixel art portrait of a faceless figure in a dark cloak, only two glowing red eyes visible, wisps of digital smoke rising, hood up

**4. The Overclocker**
> Pixel art portrait of a sweating male with wild hair and three monitors reflected in his glasses, wearing a red t-shirt, surrounded by flickering neon light

**5. The Vault Keeper**
> Pixel art portrait of a stocky dwarf-like character in heavy armour with a glowing digital padlock symbol on the chest plate, carrying a wrench

**6. The Exploit**
> Pixel art portrait of a slim female figure in a skin-tight dark suit, binary code cascading down her face like war paint, neon purple glow

**7. The Node**
> Pixel art portrait of a robotic head with exposed circuit plating, single red LED eye, copper wire hair, cracked screen on the forehead

**8. The Miner King**
> Pixel art portrait of a tough male character wearing a miner's helmet with a glowing red headlamp, beard made of pixel art electrical sparks

**9. The Phantom**
> Pixel art portrait of a translucent ghost character with a pixelated skull face, faint green glow, floating slightly above ground

**10. The Architect**
> Pixel art portrait of an elderly female scientist with white lab coat, round glasses glowing amber, data tablets floating around her head

**11. The Rogue AI**
> Pixel art portrait of a humanoid robot with half its face torn off revealing wiring, one human eye and one digital glitch eye, dark red background

**12. The Nomad**
> Pixel art portrait of a hooded desert wanderer with wrapped face, cracked goggles, carrying a solar-powered mining rig on their back

**13. The Cryptobro**
> Pixel art portrait of a young male with a backwards cap, Lambo keychain, laser eyes glowing, green neon jacket, dollar sign earring

**14. The Scavenger**
> Pixel art portrait of a young female with patched-up jacket covered in circuit board badges, pigtails made of cables, wrench in hand

**15. The Warlord**
> Pixel art portrait of a large intimidating male with a glowing digital axe over one shoulder, red war paint made of hash symbols on his face

**16. The Shadow Broker**
> Pixel art portrait of a mysterious figure in a suit and tie, face replaced by a rotating holographic coin, dark smoky background

**17. The Zero-Day**
> Pixel art portrait of a teenage hacker in a dark room, face lit only by the screen glow, hoodie with a skull made of code, green terminal text reflected

**18. The Blockchain Monk**
> Pixel art portrait of a bald monk in dark robes, meditating, surrounded by a halo of rotating blockchain rings, glowing red sigils

**19. The Ice Queen**
> Pixel art portrait of a cold female character with pale blue pixel art skin, white hair with static, frost-cracked dark armour, ice shard earrings

**20. The Payload**
> Pixel art portrait of a stocky male with a glowing cybernetic arm, one organic eye and one targeting reticle eye, military vest with USB ports

**21. The Ferret**
> Pixel art portrait of an anthropomorphic ferret in a hacker hoodie, tiny glasses, claws on a keyboard, neon green eyes, brown and white fur

**22. The Sentry**
> Pixel art portrait of a heavily armoured female guard, visor down, red shoulder pauldrons, one hand resting on a digital shield

**23. The Drain**
> Pixel art portrait of a thin male figure in a torn black jacket, veins glowing purple under skin, eyes glowing white, street graffiti in background

**24. The Oracle**
> Pixel art portrait of an elderly female with flowing white robes, eyes replaced by spinning data discs, holding a glowing crystal hash node

**25. The Syndicate Boss**
> Pixel art portrait of a powerful male in an expensive dark suit, face half obscured by shadow, red pocket square, single glowing monocle, dragon tattoo on neck

---

## Banner Prompts (25)

Use these for wide profile banner images (16:9 or 3:1 ratio recommended, e.g. 1200x400).
Append this suffix to every prompt for consistency:
> `pixel art, wide banner format, 16-bit retro aesthetic, dark background, neon accent lighting, no anti-aliasing, flat colors, landscape orientation, game UI banner`

---

**1. The Data Mine**
> Wide pixel art banner of a vast underground mine filled with glowing server racks instead of ore veins, miners with headlamps traversing dark tunnels, red and green neon light

**2. Hash Canyon**
> Wide pixel art banner of a desert canyon at night with giant hash symbol monoliths rising from the ground, moon reflected in a pool of liquid data below

**3. The Vault District**
> Wide pixel art banner of a cyberpunk city district where every building is shaped like a bank vault, red neon signs, rain-slicked streets, data streams in the sky

**4. Exploit City**
> Wide pixel art banner of a sprawling dark metropolis at night, purple lightning, buildings with glitching textures, binary code raining like neon confetti

**5. The Rig Farm**
> Wide pixel art banner of a warehouse filled wall-to-wall with glowing mining rigs stacked to the ceiling, heat shimmer rising, single worker silhouette

**6. Genesis Block**
> Wide pixel art banner of a lone floating island in a dark void, a giant glowing block of amber crystal sitting at its centre, chains of light connecting it to smaller islands

**7. Circuit Wasteland**
> Wide pixel art banner of a post-apocalyptic desert with rusted server towers as ruins, cactus-like motherboard structures, blood-red sky at dusk

**8. The Network**
> Wide pixel art banner of an abstract glowing web of nodes and edges in deep space, each node a tiny blinking server, purple and green gradient

**9. Raid Night**
> Wide pixel art banner of a dark raiding party of pixel art hackers descending on a glowing fortress vault from above, neon red spotlights

**10. The Overclocked Sky**
> Wide pixel art banner of a dramatic stormy sky with lightning strikes that look like circuit traces, silhouettes of cooling towers on the horizon

**11. Deep Protocol**
> Wide pixel art banner of an underwater scene where server farms sit on the ocean floor, cables running to the surface, bioluminescent data fish swimming by

**12. Hash Horizon**
> Wide pixel art banner of a lone miner standing on a hill at sunrise looking at a golden horizon shaped like a blockchain ledger stretching to infinity

**13. The Dark Pool**
> Wide pixel art banner of a still black reflective surface with glowing data symbols rippling across it like water, a single figure standing at the edge

**14. Firewall Fortress**
> Wide pixel art banner of a medieval-style castle constructed entirely from server blades and cooling fans, a glowing red moat of fire surrounds it

**15. The Syndicate Lounge**
> Wide pixel art banner of a luxurious dark lounge with neon strip lighting, pixel art characters in suits around a holographic roulette table made of block data

**16. Zero Day Dawn**
> Wide pixel art banner of a sunrise over a pixel art skyline, but the sun is a glowing exploit shell icon, casting red and gold light across city buildings

**17. Block Storm**
> Wide pixel art banner of a massive storm front made of tumbling blockchain blocks, lightning within the blocks, silhouette of a rig farm below

**18. The Cold Storage**
> Wide pixel art banner of a cryogenic facility deep underground, rows of frosted capsules each containing a glowing HASH crystal, icy blue lighting

**19. Notoriety Row**
> Wide pixel art banner of a dark street covered in wanted posters showing pixel art hacker portraits, red neon bar signs, one character walking in shadows

**20. The Patch**
> Wide pixel art banner of a green glowing meadow made of circuit traces, binary trees growing from the ground, satellites orbiting above

**21. Liquidation Event**
> Wide pixel art banner of a chaotic market floor with traders running, red candle charts crashing behind them, pixelated coin rain from the ceiling

**22. Genesis Crater**
> Wide pixel art banner of a giant meteor impact crater at night where the crater glows amber from a molten HASH core, silhouettes at the rim looking down

**23. The Leaderboard Tower**
> Wide pixel art banner of a monolithic leaderboard tower rising from a dark cityscape, names scrolling in neon green, spotlights at its base

**24. Protocol Graveyard**
> Wide pixel art banner of a dark graveyard with tombstones shaped like old dead blockchains, a lone figure with a lantern walking between them, purple fog

**25. The Final Hash**
> Wide pixel art banner of a dramatic scene of the last block being mined, a massive glowing cube descending from the sky onto an altar, thousands of pixel art characters watching in silence, red and gold light flooding the scene
