/*
 * Lumière — diet calculation engine
 * Pure, dependency-free. Works in the browser (attaches to window.DietEngine)
 * and under Node (module.exports) so it can be unit-tested.
 *
 * Science basis (standard, widely validated):
 *   - BMR: Mifflin-St Jeor (default) or Katch-McArdle (when body-fat % given)
 *   - TDEE: BMR x activity PAL multiplier (1.2 .. 1.9)
 *   - Fat loss: modest deficit (10-20%), 7700 kcal per kg of fat
 *   - Macros: protein anchored high for lean-mass retention, fat floor for
 *     hormonal health, carbs deliberately modest to limit glycation pressure
 *   - Skin framework: animal-based, low-PUFA, low-AGE (see FRAMEWORK below)
 *
 * General wellness information only — not medical advice.
 */
(function (root) {
  'use strict';

  var LB_PER_KG = 0.453592;
  var KCAL_PER_KG_FAT = 7700;

  var PAL = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 };
  var CARB_PCT = { sedentary: 0.20, light: 0.225, moderate: 0.25, very: 0.275, extra: 0.30 };

  function round(n) { return Math.round(n); }
  function clamp(n, lo, hi) { return Math.min(Math.max(n, lo), hi); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }

  /**
   * @param {Object} input
   *   sex: 'female' | 'male'
   *   age: number (years)
   *   unitSystem: 'metric' | 'imperial'
   *   height_cm / (heightFt, heightIn)
   *   weight_kg / weight_lb
   *   targetWeight (kg or lb, optional)
   *   bodyFatPct (optional)
   *   activityLevel: sedentary|light|moderate|very|extra
   *   goal: fatLoss|recomposition|maintenance
   *   deficitAggressiveness: modest|moderate|aggressive (fatLoss only)
   *   contextFlags: array of 'pregnant'|'breastfeeding'
   *   healthFlags: array of 'diabetes'|'kidneyDisease'|'onMedication'|'eatingDisorderHistory'
   */
  function computeDietPlan(input) {
    var notes = [];
    var imperial = input.unitSystem === 'imperial';

    // STEP 0 — normalize to metric
    var h = imperial
      ? (Number(input.heightFt || 0) * 30.48 + Number(input.heightIn || 0) * 2.54)
      : Number(input.height_cm);
    var w = imperial ? Number(input.weight_lb) * LB_PER_KG : Number(input.weight_kg);
    var tw = null;
    if (input.targetWeight != null && input.targetWeight !== '' && !isNaN(input.targetWeight)) {
      tw = imperial ? Number(input.targetWeight) * LB_PER_KG : Number(input.targetWeight);
    }
    var age = Number(input.age);
    var sex = input.sex === 'male' ? 'male' : 'female';
    var bf = (input.bodyFatPct != null && input.bodyFatPct !== '' && !isNaN(input.bodyFatPct))
      ? Number(input.bodyFatPct) : null;
    var context = input.contextFlags || [];
    var health = input.healthFlags || [];

    // Validation / guards
    if (!isFinite(h) || !isFinite(w) || !isFinite(age)) {
      return { ok: false, reason: 'INVALID_INPUT', message: 'Please fill in age, height and weight.' };
    }
    if (age < 18) {
      return { ok: false, reason: 'UNDER_18', message: 'This tool is designed for adults 18+. Please talk to a doctor or dietitian for guidance under 18.' };
    }
    if (h < 120 || h > 250) return { ok: false, reason: 'HEIGHT_RANGE', message: 'Height looks out of range — please check it.' };
    if (w < 30 || w > 300) return { ok: false, reason: 'WEIGHT_RANGE', message: 'Weight looks out of range — please check it.' };

    var bmi = w / Math.pow(h / 100, 2);

    // Implausible body fat -> ignore, fall back to Mifflin
    if (bf != null) {
      var floorBf = sex === 'male' ? 3 : 10;
      if (bf < floorBf || bf > 60) { notes.push('BODYFAT_IGNORED'); bf = null; }
    }

    var pregnant = context.indexOf('pregnant') >= 0;
    var breastfeeding = context.indexOf('breastfeeding') >= 0;
    var edHistory = health.indexOf('eatingDisorderHistory') >= 0;

    // STEP 1 — lean body mass
    var lbm = bf != null ? w * (1 - bf / 100) : null;

    // STEP 2 — BMR
    var bmr, bmrModel;
    if (lbm != null) {
      bmr = 370 + 21.6 * lbm;
      bmrModel = 'Katch-McArdle';
    } else {
      var s = sex === 'male' ? 5 : -161;
      bmr = 10 * w + 6.25 * h - 5 * age + s;
      bmrModel = 'Mifflin-St Jeor';
    }
    bmr = round(bmr);

    // STEP 3 — TDEE
    var pal = PAL[input.activityLevel] || PAL.moderate;
    var tdee = round(bmr * pal);

    // STEP 4 — deficit fraction
    var deficit;
    if (input.goal === 'maintenance') deficit = 0;
    else if (input.goal === 'recomposition') deficit = 0.075;
    else deficit = ({ modest: 0.10, moderate: 0.15, aggressive: 0.20 })[input.deficitAggressiveness || 'modest'];

    if (pregnant || breastfeeding) { deficit = 0; notes.push('DEFICIT_SUPPRESSED_PREGNANCY'); }
    if (edHistory && deficit > 0.10) { deficit = 0.10; notes.push('DEFICIT_CAPPED_ED_HISTORY'); }
    if (bmi < 18.5 && deficit > 0) { deficit = 0; notes.push('DEFICIT_BLOCKED_UNDERWEIGHT'); }

    // STEP 5-6 — calories + safety floor
    var caloriesRaw = round(tdee * (1 - deficit));
    var sexFloor = sex === 'male' ? 1500 : 1200;
    var calorieFloor = Math.max(bmr, sexFloor);
    var calories = Math.max(caloriesRaw, calorieFloor);
    if (calories > caloriesRaw) notes.push('CALORIE_FLOOR_APPLIED');
    var dailyDeficit = tdee - calories;

    // STEP 7 — reference weight for protein
    var refWeight, refLabel;
    if (lbm != null) { refWeight = lbm; refLabel = 'lean body mass'; }
    else if (tw != null && tw > 0) { refWeight = tw; refLabel = 'goal weight'; }
    else if (bmi > 30) {
      var idealBW = 22.5 * Math.pow(h / 100, 2);
      refWeight = idealBW + 0.25 * (w - idealBW);
      refLabel = 'adjusted body weight';
    } else { refWeight = w; refLabel = 'current weight'; }

    // STEP 8 — protein
    var proteinPerKg = (input.goal === 'fatLoss' && lbm != null) ? 2.2 : 2.0;
    var proteinG = round(proteinPerKg * refWeight);
    var proteinKcal = 4 * proteinG;
    if (proteinKcal > 0.45 * calories) {
      proteinG = round(0.45 * calories / 4);
      proteinKcal = 4 * proteinG;
      notes.push('PROTEIN_CAPPED_45PCT');
    }

    // STEP 9 — carbs (activity-scaled)
    var carbPct = CARB_PCT[input.activityLevel] || CARB_PCT.moderate;
    var carbKcal = carbPct * calories;

    // STEP 10 — fat by remainder, with hormonal floor + ceiling
    var fatKcal = calories - proteinKcal - carbKcal;
    var fatFloorG = 0.6 * refWeight;
    if (fatKcal / 9 < fatFloorG) {
      fatKcal = 9 * fatFloorG;
      carbKcal = calories - proteinKcal - fatKcal;
      var minCarbKcal = 0.20 * calories;
      if (carbKcal < minCarbKcal) {
        // trim protein toward 1.6 g/kg to make room
        var minProteinG = round(1.6 * refWeight);
        proteinG = Math.max(minProteinG, round((calories - fatKcal - minCarbKcal) / 4));
        proteinG = Math.min(proteinG, round((calories - fatKcal - minCarbKcal) / 4));
        if (proteinG < minProteinG) proteinG = minProteinG;
        proteinKcal = 4 * proteinG;
        carbKcal = calories - proteinKcal - fatKcal;
      }
      notes.push('FAT_FLOOR_APPLIED');
    }
    var fatCeilKcal = 0.45 * calories;
    if (fatKcal > fatCeilKcal) {
      var spill = fatKcal - fatCeilKcal;
      fatKcal = fatCeilKcal;
      carbKcal = Math.min(carbKcal + spill, 0.30 * calories);
    }
    if (carbKcal < 0) carbKcal = 0;

    // STEP 11 — round + percentages
    proteinG = round(proteinG);
    var fatG = round(fatKcal / 9);
    var carbG = round(carbKcal / 4);
    var pctP = round(400 * proteinG / calories);
    var pctF = round(900 * fatG / calories);
    var pctC = round(400 * carbG / calories);

    // STEP 12 — weekly fat-loss estimate
    var weeklyLossKg = r2(dailyDeficit * 7 / KCAL_PER_KG_FAT);
    if (weeklyLossKg > 1.0) notes.push('LOSS_RATE_FAST');

    // STEP 13 — framework plate proportions
    var proteinServings = Math.max(1, round(proteinG / 30));

    // STEP 13b — free-sugar sub-budget (fruit + honey), inside carbs
    var sugarCap = round(25 + (pal - 1.2) / (1.9 - 1.2) * 15);
    sugarCap = clamp(sugarCap, 25, 40);
    if (input.goal === 'fatLoss') sugarCap = round(sugarCap * 0.8);
    sugarCap = Math.max(sugarCap, 18); // keep whole-fruit vitamin C feasible

    // STEP 14 — micro / behavioural strive-for targets
    var zincMg = sex === 'male' ? 11 : 8;
    var waterL = r1(clamp(w * 0.035, 2.0, 3.0));
    if (input.activityLevel === 'very' || input.activityLevel === 'extra') {
      waterL = r1(Math.min(waterL + 0.3, 3.5));
    }

    return {
      ok: true,
      bmr: bmr,
      bmrModel: bmrModel,
      tdee: tdee,
      pal: pal,
      bmi: r1(bmi),
      calories: calories,
      dailyDeficit: dailyDeficit,
      deficitPct: round(100 * dailyDeficit / tdee),
      weeklyLossKg: weeklyLossKg,
      weeklyLossLb: r2(weeklyLossKg / LB_PER_KG),
      macros: {
        protein_g: proteinG, fat_g: fatG, carb_g: carbG,
        pctP: pctP, pctF: pctF, pctC: pctC,
        proteinPerKg: r1(proteinG / refWeight), refLabel: refLabel
      },
      plate: {
        proteinServings: proteinServings,
        collagenPerWeek: 3,
        fattyFishPerWeek: '2-4',
        liverPerWeek: '1-2'
      },
      striveFor: {
        glycine_g: 10,
        collagenPeptides_g: '2.5-10',
        vitC_mg: '250-500',
        zinc_mg: zincMg,
        copper_mg: '0.9-2',
        omega3_g: '1-2',
        vitaminA: 'liver 1-2x/wk (retinol UL 3000 mcg RAE/day)',
        sugarCap_g: sugarCap,
        honeyCap: '1-2 tsp (7-14 g), paired with protein/fat',
        water_L: waterL,
        omegaRatioGoal: '1:1 to 4:1'
      },
      cooking: 'Default to moist / low-temperature methods (steam, poach, braise, slow-cook, stew). Reserve searing, grilling and roasting for occasional use. Acidic marinades (lemon, vinegar) cut AGE formation.',
      notes: notes
    };
  }

  // Human-readable note messages for the UI
  var NOTE_MESSAGES = {
    BODYFAT_IGNORED: 'Body-fat % looked out of range, so BMR was estimated from height/weight instead.',
    DEFICIT_SUPPRESSED_PREGNANCY: 'Because you selected pregnant / breastfeeding, no calorie deficit is applied — this is a maintenance plan.',
    DEFICIT_CAPPED_ED_HISTORY: 'Given a history of disordered eating, the deficit is kept gentle (10%). Please work with a professional.',
    DEFICIT_BLOCKED_UNDERWEIGHT: 'Your BMI is in the underweight range, so no fat-loss deficit is applied.',
    CALORIE_FLOOR_APPLIED: 'The target was raised to a safe minimum, so the real deficit is smaller than requested.',
    PROTEIN_CAPPED_45PCT: 'Protein was capped at 45% of calories to keep the plan balanced.',
    FAT_FLOOR_APPLIED: 'Fat was raised to a healthy hormonal minimum (~0.6 g/kg).',
    LOSS_RATE_FAST: 'This pace is faster than ~1 kg (2.2 lb)/week — slower loss better preserves collagen and skin elasticity.'
  };

  // The animal-based, low-PUFA, low-AGE framework content (from research)
  var FRAMEWORK = {
    eat: [
      { name: 'Fatty fish', freq: '2-4x/week', why: 'Wild salmon, sardines, mackerel, herring, anchovies — preformed DHA/EPA omega-3 lowers the omega-6:3 ratio, strengthens the skin barrier and calms inflammation.' },
      { name: 'Ruminant meat', freq: 'daily', why: 'Beef, lamb, bison — complete protein for collagen substrate and lean-mass retention; low in PUFA, rich in stable fat and zinc.' },
      { name: 'Liver', freq: '1-2x/week', why: 'The densest whole-food source of preformed vitamin A (retinol) for skin turnover, plus copper, zinc, B12 and folate.' },
      { name: 'Bone broth & connective cuts', freq: '3+/week', why: 'Oxtail, shank, chuck, skin-on cuts — richest whole-food glycine/proline, the amino acids that make up ~a third of collagen.' },
      { name: 'Eggs', freq: 'daily', why: 'Whole, yolk included — retinol, biotin, choline, sulfur amino acids and complete protein. Soft/poached to limit AGEs.' },
      { name: 'Shellfish & oysters', freq: '1-2x/week', why: 'Exceptional zinc and copper (cofactors for collagen/elastin cross-linking) plus selenium and DHA.' },
      { name: 'Fresh & fermented dairy', freq: 'as tolerated', why: 'Kefir, yogurt, cheese, whole milk — protein, calcium, retinol and probiotics. Whole-fat, low added sugar.' },
      { name: 'Collagen peptides / gelatin', freq: '2.5-10 g/day', why: 'RCTs show improved skin hydration, elasticity and fewer wrinkles — a reliable low-AGE way to hit glycine/proline.' },
      { name: 'Low-fructose whole fruit', freq: 'in season', why: 'Berries, kiwi, citrus, melon — the main vitamin C for collagen synthesis plus polyphenol antioxidants, with the least sugar per gram and no antinutrient load.' },
      { name: 'Bell peppers', freq: 'optional', why: 'A low-antinutrient produce option (botanically a fruit) packing vitamin C — one red pepper ~190 mg — without the oxalates or goitrogens of leafy greens.' },
      { name: 'Fish roe', freq: 'optional', why: 'DHA plus fat-soluble vitamins A and D.' }
    ],
    limit: [
      { name: 'Honey', freq: '1-2 tsp/day', why: 'Allowed, but a concentrated fructose/glucose dose. Keep it raw, paired with a protein/fat meal — fructose glycates proteins ~10x faster than glucose.' },
      { name: 'High-sugar & dried fruit', freq: 'small portions', why: 'Very ripe bananas, mango, grapes, dates, dried fruit, juice — bigger, faster sugar load feeds collagen glycation. Prefer whole over juiced, pair with protein.' },
      { name: 'Total fruit + honey sugar', freq: 'stay under your cap', why: 'Keep free-sugar-equivalent modest so you stay in a low-glycation, fat-losing state.' },
      { name: 'Charred / high-heat meats', freq: 'occasional', why: 'Grilling, broiling, frying and browned crispy surfaces are the highest dietary AGE sources. Enjoy occasionally, not by default.' },
      { name: 'Aged cheese & butter', freq: 'moderate', why: 'Nutritious but among the more AGE-dense dairy — keep portions moderate.' },
      { name: 'Cruciferous & high-oxalate greens', freq: 'go easy', why: 'Kale, spinach, chard, broccoli, raw brassicas — goitrogens and oxalates can bind minerals and blunt absorption of the very nutrients you eat for your skin. Lean on low-fructose fruit and bell peppers for vitamin C instead; if you do eat greens, cook them well and keep portions small.' },
      { name: 'Alcohol', freq: 'minimal', why: 'Dehydrating, pro-inflammatory and it impairs the sleep your skin repairs during.' }
    ],
    avoid: [
      { name: 'Seed & vegetable oils', why: 'Soybean, corn, sunflower, safflower, grapeseed, canola, cottonseed — high omega-6 PUFA that peroxidizes, drives inflammation and generates aldehydes that damage skin lipids and proteins.' },
      { name: 'Deep-fried & fast food', why: 'Combines oxidized PUFA from reused oils with very high AGE loads.' },
      { name: 'Ultra-processed packaged foods', why: 'Deliver seed oils, refined sugar/fructose and preformed AGEs all at once.' },
      { name: 'HFCS, sodas & candy', why: 'Concentrated fructose is the most glycation-prone sugar and drives AGE cross-linking of collagen and elastin.' },
      { name: 'High-PUFA nuts in bulk', why: 'Walnuts (and to a lesser degree almonds, peanuts, peanut oil) carry significant omega-6. Small amounts are fine; bulk snacking is not.' },
      { name: 'Margarine & hydrogenated spreads', why: 'Oxidized, trans-fat-adjacent PUFA products.' }
    ]
  };

  var api = {
    computeDietPlan: computeDietPlan,
    NOTE_MESSAGES: NOTE_MESSAGES,
    FRAMEWORK: FRAMEWORK,
    PAL: PAL
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DietEngine = api;
})(typeof window !== 'undefined' ? window : this);
