# Lumière — Skin Diet 🌸

A personalized **Progressive Web App (PWA)** that calculates a diet tailored to your body, then wraps it in an **animal-based, low-PUFA, low-AGE food framework** designed to clear skin, restore texture and elasticity, and drive gentle fat loss.

Built to install on an **iPhone** straight from Safari — full-screen, offline, no App Store.

---

## What it does

1. **You enter** your details — sex, age, height, current & goal weight, activity level, goal (and optional body-fat % / safety notes).
2. **It calculates**, live:
   - **BMR** — Mifflin-St Jeor, or **Katch-McArdle** if you give body-fat %
   - **TDEE** (maintenance) — BMR × your activity multiplier
   - A safe **fat-loss calorie target** (modest 10–20% deficit, with hard safety floors)
   - Personalized **macros** — protein anchored high for lean-mass + collagen, a hormonal fat floor, deliberately modest carbs
   - A **skin-safe sugar budget**, hydration, and micronutrient targets
   - Estimated **weekly fat-loss rate**
3. **It plans the food** — an Eat / Limit / Avoid framework and a daily "strive-for" ritual checklist scaled to *your* numbers, with a 7-day consistency streak.

---

## The framework

**Animal-based · low-PUFA · low-AGE · anti-inflammatory** — three levers:

- **Build the raw materials.** Collagen and elastin need glycine, proline, retinol, zinc and copper — from meat, fatty fish, eggs, liver, shellfish and bone broth — plus modest vitamin C from fresh animal foods and a little low-fructose fruit (low-carb eating lowers the requirement, so we don't lean on antinutrient-heavy greens). High protein also protects lean mass in a deficit.
- **Stop what ages skin.** Cut the two dermis-degraders: **AGEs** (from excess sugar — especially fructose — and charred, high-heat cooking) and **PUFA seed oils** (which oxidize into inflammatory aldehydes). Cook gentle and moist.
- **Lose fat gently.** A modest deficit with high protein sheds fat while sparing the collagen a crash diet burns through.

**Fruit & honey are allowed** — kept skin-safe by capping the free-sugar load, favoring lower-fructose whole fruit, and always pairing sugar with protein/fat (fructose glycates collagen ~10× faster than glucose).

| Eat | Limit | Avoid |
|-----|-------|-------|
| Fatty fish, ruminant meat, liver, bone broth & connective cuts, eggs, shellfish, dairy, collagen peptides, low-fructose fruit, bell peppers | Honey (1–2 tsp), high-sugar/dried fruit, total sugar load, charred meats, aged cheese & butter, alcohol | Seed & vegetable oils, deep-fried/fast food, ultra-processed foods, HFCS/soda/candy, high-PUFA nuts in bulk, margarine, antinutrient-heavy vegetables (cruciferous & high-oxalate greens) |

---

## Install on iPhone

1. Open the site in **Safari**.
2. Tap the **Share** icon.
3. Choose **Add to Home Screen** → **Add**.

It now opens like a native app — full-screen, offline, with its own icon.

## Deploy (free, HTTPS — required for PWA installs)

This is a fully static site, so **GitHub Pages** is the easiest host:

1. Push this branch (done).
2. In the repo: **Settings → Pages → Build from a branch**, pick this branch and the root (`/`).
3. Open the published `https://<user>.github.io/<repo>/` URL on the iPhone and install as above.

Any static host (Netlify, Vercel, Cloudflare Pages) works too — no build step.

---

## Tech

- **Zero dependencies.** Vanilla HTML/CSS/JS. No framework, no bundler.
- `assets/engine.js` — the pure, testable calculation engine (`DietEngine.computeDietPlan`). Also runs under Node.
- `assets/app.js` — UI, state (localStorage), navigation, theme, daily checklist.
- `assets/styles.css` — the "Lumière" design system (light + dark, iOS safe-area aware).
- `sw.js` + `manifest.webmanifest` — offline app-shell caching and installability.
- `scripts/gen-icons.js` — regenerates the app icons (`node scripts/gen-icons.js`).

Run the engine's sanity checks:

```bash
node -e "const E=require('./assets/engine.js'); console.log(E.computeDietPlan({sex:'female',age:30,unitSystem:'metric',height_cm:165,weight_kg:68,activityLevel:'light',goal:'fatLoss',deficitAggressiveness:'modest'}))"
```

---

## ⚠️ Disclaimer

This app is **general wellness and educational information only** — not medical, nutritional, or diagnostic advice, and no substitute for a clinician or registered dietitian. Calorie and macro figures are estimates (±10%); track how you feel and adjust. If you have diabetes, kidney disease, take medication, are pregnant/breastfeeding, are under 18, or have a history of disordered eating, please consult a professional first. Individual lipid and health responses to a higher-saturated-fat pattern vary. Preformed vitamin A (liver) has an upper limit of ~3000 mcg RAE/day and should be avoided in high doses during pregnancy.
