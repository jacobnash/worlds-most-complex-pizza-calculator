import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Slider from '@react-native-community/slider';

export const NASH_ENGINEERING_URL = 'https://pizza.nash.engineering';

// Baker's percentages: flour is always 100%. Every other ingredient is
// expressed as a percentage of the total flour weight. Hydration is just the
// water as a percentage of flour. Pizza dough is simply one style of bread
// dough, so the classic pizza recipes below are expressed the same way.
//
// Each preset is a starting point. All values stay editable so you can tweak a
// recipe (or dial in your own) after picking a preset.

// Leavening types: sourdough starter, poolish, biga, and commercial yeasts.
// Poolish and biga are flour+water preferments with a pinch of yeast in the
// preferment itself, plus additional instant yeast in the final dough mix
// (dosed on the remaining flour, not total flour).
// Commercial yeasts are dosed as a tiny percentage of flour; the defaults below
// power (fresh/cake yeast is ~3x instant, active dry ~1.25x). A sourdough
// starter is dosed much higher and, because it is itself flour + water, it
// contributes both back to the dough — so we track that to report the *true*
// hydration.
// `powerPerPercent` is the leavening power of each type relative to instant
// yeast, per 1% of flour. Cake (fresh) yeast is ~1/3 as strong by weight, which
// is why its default dose is ~3x. This drives the fermentation-time estimate.
export const LEAVENINGS = {
    'Sourdough Starter': {
        defaultPercent: 20,
        contributesToDough: true,
        starterHydration: 100,
        isSourdough: true,
        sliderMin: 5,
        sliderMax: 40,
        sliderStep: 1,
    },
    Poolish: {
        defaultPercent: 20,
        contributesToDough: true,
        isPreferment: true,
        starterHydration: 100,
        prefermentYeastPercent: 0.1, // IDY % of preferment flour
        targetBulkHours: 3,
        sliderMin: 10,
        sliderMax: 50,
        sliderStep: 1,
    },
    Biga: {
        defaultPercent: 30,
        contributesToDough: true,
        isPreferment: true,
        starterHydration: 50,
        prefermentYeastPercent: 0.3, // IDY % of preferment flour
        targetBulkHours: 2.5,
        sliderMin: 10,
        sliderMax: 50,
        sliderStep: 1,
    },
    'Instant Yeast': {
        defaultPercent: 0.5,
        contributesToDough: false,
        powerPerPercent: 1,
        sliderMin: 0.1,
        sliderMax: 2,
        sliderStep: 0.1,
    },
    'Cake Yeast': {
        defaultPercent: 1.5,
        contributesToDough: false,
        powerPerPercent: 1 / 3,
        sliderMin: 0.3,
        sliderMax: 5,
        sliderStep: 0.1,
    },
};

export const AUTO_LYSE_HOURS = 20 / 60;
const REFERENCE_POOLISH_PERCENT = 20;
const REFERENCE_POOLISH_PEAK_HOURS = 12;
const REFERENCE_BIGA_PERCENT = 30;
const REFERENCE_BIGA_PEAK_HOURS = 16;

export const getLeaveningSliderRange = (leaveningType) => {
    const spec = LEAVENINGS[leaveningType] || {};
    return {
        min: spec.sliderMin ?? 0,
        max: spec.sliderMax ?? 100,
        step: spec.sliderStep ?? 1,
    };
};

export const HYDRATION_SLIDER = { min: 50, max: 100, step: 1 };
export const SALT_SLIDER = { min: 0, max: 4, step: 0.1 };
export const TEMPERATURE_SLIDER = { min: 15, max: 32, step: 1 };

// Absolute clamp limits — wider than the default window so typed values and a
// recentering slider can move beyond the initial base range.
const extendSliderAbsolute = ({ min, max, step }, floorMin) => {
    const half = (max - min) / 2;
    const absoluteMin = Math.max(floorMin ?? min, min - half);
    return {
        min: absoluteMin,
        max: max + half,
        step,
    };
};

export const HYDRATION_ABSOLUTE = extendSliderAbsolute(HYDRATION_SLIDER, 30);
export const SALT_ABSOLUTE = extendSliderAbsolute(SALT_SLIDER);
export const TEMPERATURE_ABSOLUTE = extendSliderAbsolute(TEMPERATURE_SLIDER, 0);

export const getLeaveningAbsoluteRange = (leaveningType) =>
    extendSliderAbsolute(getLeaveningSliderRange(leaveningType));

// Recentre a fixed-width window on the current value. Salt at 2% shows 0–4%;
// at 4% the same-width window shifts to 2–6%.
export const getDynamicSliderRange = (value, baseRange, absoluteRange = baseRange) => {
    const numeric = Number(value);
    const center = Number.isFinite(numeric) ? numeric : (baseRange.min + baseRange.max) / 2;
    const span = baseRange.max - baseRange.min;
    const half = span / 2;
    const decimals = baseRange.step < 1 ? 1 : 0;
    const factor = 10 ** decimals;
    const snap = (n) => Math.round(n * factor) / factor;

    let min = center - half;
    let max = center + half;

    if (min < absoluteRange.min) {
        max += absoluteRange.min - min;
        min = absoluteRange.min;
    }
    if (max > absoluteRange.max) {
        min -= max - absoluteRange.max;
        max = absoluteRange.max;
    }

    min = Math.max(absoluteRange.min, min);
    max = Math.min(absoluteRange.max, max);

    return {
        min: snap(min),
        max: snap(max),
        step: baseRange.step,
    };
};

export const clampSliderValue = (value, { min, max, step }) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return min;
    }
    const clamped = Math.min(max, Math.max(min, numeric));
    const rounded = Math.round(clamped / step) * step;
    const decimals = step < 1 ? 1 : 0;
    const factor = 10 ** decimals;
    return Math.round(rounded * factor) / factor;
};

export const clampLeavening = (value, leaveningType) => {
    return clampSliderValue(value, getLeaveningSliderRange(leaveningType));
};

// Reference conditions for the (rough) fermentation-time model.
const REFERENCE_TEMP_C = 24; // ~75°F, typical room temperature
const REFERENCE_YEAST_BULK_HOURS = 2; // 1% instant yeast at 24°C ≈ 2h bulk
const PROOF_TO_BULK_RATIO = 0.6; // final proof runs shorter than the bulk rise
// 1:1:1 levain (seed is ~⅓ of the build) at 24°C peaks in about this long.
const REFERENCE_LEVAIN_INOCULUM_PERCENT = 100 / 3;
const REFERENCE_LEVAIN_PEAK_HOURS = 5;

// Fermentation is faster with more (or stronger) leavening and warmer dough.
// Temperature uses a Q10 of ~2: every 10°C below the 24°C reference roughly
// doubles the time (and every 10°C above roughly halves it). These are
// deliberately rough estimates meant as a starting point, not gospel.
export const computeTiming = ({ leaveningType = 'Instant Yeast', leavening, temperature = REFERENCE_TEMP_C }) => {
    const percent = Number(leavening);
    const temp = Number(temperature);
    const spec = LEAVENINGS[leaveningType] || {};
    const tempFactor = 2 ** ((REFERENCE_TEMP_C - temp) / 10);

    let bulkHours = 0;
    if (percent > 0 || spec.isPreferment) {
        if (spec.isSourdough) {
            // Sourdough: doubling the starter roughly halves the bulk rise
            // (20% starter ≈ 5h at 24°C).
            bulkHours = (100 / percent) * tempFactor;
        } else if (spec.isPreferment) {
            // Poolish/biga: bulk timing is driven by the yeast added to the
            // final dough, not the preferment percentage.
            bulkHours = (spec.targetBulkHours ?? 3) * tempFactor;
        } else {
            // Commercial yeast, normalised to instant-yeast power.
            const power = percent * (spec.powerPerPercent ?? 1);
            bulkHours = (REFERENCE_YEAST_BULK_HOURS / power) * tempFactor;
        }
    }

    const proofHours = bulkHours * PROOF_TO_BULK_RATIO;
    return {
        bulkHours,
        proofHours,
        totalHours: bulkHours + proofHours,
    };
};

// Rough peak time for poolish or biga before mixing the final dough.
export const computePrefermentPeakHours = ({
    leaveningType,
    leavening,
    temperature = REFERENCE_TEMP_C,
}) => {
    const percent = Number(leavening);
    const temp = Number(temperature);
    const spec = LEAVENINGS[leaveningType] || {};

    if (!spec.isPreferment || percent <= 0) {
        return 0;
    }

    const tempFactor = 2 ** ((REFERENCE_TEMP_C - temp) / 10);

    if (leaveningType === 'Poolish') {
        return (REFERENCE_POOLISH_PERCENT / percent) * REFERENCE_POOLISH_PEAK_HOURS * tempFactor;
    }
    if (leaveningType === 'Biga') {
        return (REFERENCE_BIGA_PERCENT / percent) * REFERENCE_BIGA_PEAK_HOURS * tempFactor;
    }

    return 0;
};

export const subtractHours = (date, hours) =>
    new Date(date.getTime() - Number(hours) * 60 * 60 * 1000);

export const formatDateTime = (date) => {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
        return '—';
    }
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

export const parseBakeDateTime = (dateStr, timeStr) => {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr).trim());
    if (!dateMatch || !timeMatch) {
        return null;
    }

    const parsed = new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3]),
        Number(timeMatch[1]),
        Number(timeMatch[2]),
        0,
        0
    );

    return Number.isFinite(parsed.getTime()) ? parsed : null;
};

export const defaultBakeDate = () => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(8, 0, 0, 0);
    return {
        date: next.toISOString().slice(0, 10),
        time: '08:00',
    };
};

const prefermentStepLabel = ({ leaveningType, starterPlan }) => {
    if (leaveningType === 'Sourdough Starter') {
        if (starterPlan?.doughStarter?.strategy === 'build') {
            return 'Start levain build';
        }
        if (starterPlan?.doughStarter?.strategy === 'partial') {
            return 'Start levain / use discard';
        }
        return 'Pre-feed starter jar';
    }
    if (leaveningType === 'Poolish') {
        return 'Mix poolish';
    }
    if (leaveningType === 'Biga') {
        return 'Mix biga';
    }
    return 'Start preferment';
};

export const computeBakeSchedule = ({
    targetBakeTime,
    timing,
    leaveningType,
    starterPlan = null,
    prefermentPeakHours = 0,
    autolyseHours = AUTO_LYSE_HOURS,
}) => {
    if (!(targetBakeTime instanceof Date) || !Number.isFinite(targetBakeTime.getTime())) {
        return null;
    }

    const spec = LEAVENINGS[leaveningType] || {};
    const bake = targetBakeTime;
    const proofStart = subtractHours(bake, timing.proofHours);
    const bulkStart = subtractHours(proofStart, timing.bulkHours);
    const mixStart = subtractHours(bulkStart, autolyseHours);

    let prefermentHours = 0;
    if (spec.isSourdough && starterPlan) {
        prefermentHours = starterPlan.readyInHours ?? 0;
    } else if (spec.isPreferment) {
        prefermentHours = prefermentPeakHours;
    }

    const prefermentStart = prefermentHours > 0 ? subtractHours(mixStart, prefermentHours) : null;
    const steps = [];

    if (prefermentStart && prefermentHours > 0) {
        steps.push({
            label: prefermentStepLabel({ leaveningType, starterPlan }),
            time: prefermentStart,
            durationHours: prefermentHours,
        });
    }

    steps.push(
        { label: 'Mix dough (autolyse)', time: mixStart, durationHours: autolyseHours },
        { label: 'Bulk ferment', time: bulkStart, durationHours: timing.bulkHours },
        { label: 'Divide & shape', time: proofStart, durationHours: 0 },
        { label: 'Final proof', time: proofStart, durationHours: timing.proofHours },
        { label: 'Bake', time: bake, durationHours: 0 }
    );

    const firstStep = prefermentStart ?? mixStart;
    const totalLeadHours = (bake.getTime() - firstStep.getTime()) / (60 * 60 * 1000);
    const now = new Date();

    return {
        steps,
        bake,
        mixStart,
        prefermentStart,
        firstStep,
        totalLeadHours,
        inPast: firstStep < now,
    };
};

// Format a duration in hours as e.g. "4 h 30 min".
export const formatDuration = (hours) => {
    if (!Number.isFinite(hours) || hours <= 0) {
        return '—';
    }
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) {
        return `${m} min`;
    }
    if (m === 0) {
        return `${h} h`;
    }
    return `${h} h ${m} min`;
};

// Build a simple step-by-step method for the current dough, weaving in the
// estimated bulk/proof times.
export const buildMethod = ({
    leaveningType,
    timing,
    temperature,
    units,
    unitLabel,
    prefermentPeakHours = 0,
    yeastPlan = null,
}) => {
    const leavening = leaveningType.toLowerCase();
    const spec = LEAVENINGS[leaveningType] || {};
    const steps = [];

    if (spec.isPreferment && prefermentPeakHours > 0 && yeastPlan) {
        steps.push(
            `Mix the ${leavening} with ${yeastPlan.prefermentYeastGrams} g instant yeast (${yeastPlan.prefermentYeastPercent}% of preferment flour). Ferment about ${formatDuration(prefermentPeakHours)} at ${Number(temperature)}°C.`
        );
    }

    if (spec.isPreferment && yeastPlan) {
        steps.push(
            `Combine the ripe ${leavening} with the remaining flour and water until no dry flour remains, then rest 20 min (autolyse).`,
            `Add the salt and ${yeastPlan.finalYeastGrams} g instant yeast; mix or knead until the dough is smooth.`
        );
    } else {
        steps.push(
            'Mix the flour and water until no dry flour remains, then rest 20 min (autolyse).',
            `Add the salt and ${leavening}; mix or knead until the dough is smooth.`
        );
    }

    steps.push(
        `Bulk ferment about ${formatDuration(timing.bulkHours)} at ${Number(temperature)}°C, with a few stretch-and-folds in the first hour.`,
        `Divide and shape into ${Number(units)} ${unitLabel}.`,
        `Proof about ${formatDuration(timing.proofHours)}, until visibly puffy.`,
        'Bake hot (with steam for bread; a blazing oven or stone for pizza) until deep golden.'
    );

    return steps;
};

export const PRESETS = {
    'Neapolitan Pizza': { hydration: 60, salt: 2.8, leavening: 0.2, leaveningType: 'Instant Yeast', unitWeight: 250, units: 4, unitLabel: 'dough balls' },
    'New York Pizza': { hydration: 62, salt: 2.0, leavening: 0.5, leaveningType: 'Instant Yeast', unitWeight: 280, units: 4, unitLabel: 'dough balls' },
    'Baguette': { hydration: 68, salt: 2.0, leavening: 0.6, leaveningType: 'Instant Yeast', unitWeight: 350, units: 3, unitLabel: 'baguettes' },
    'Ciabatta': { hydration: 80, salt: 2.0, leavening: 0.6, leaveningType: 'Instant Yeast', unitWeight: 400, units: 2, unitLabel: 'loaves' },
    'Country Sourdough': { hydration: 72, salt: 2.0, leavening: 20, leaveningType: 'Sourdough Starter', unitWeight: 900, units: 1, unitLabel: 'loaves' },
    'Focaccia': { hydration: 78, salt: 2.2, leavening: 0.8, leaveningType: 'Instant Yeast', unitWeight: 500, units: 2, unitLabel: 'pans' },
    'Lunch Bread': { hydration: 64, salt: 2.0, leavening: 1.5, leaveningType: 'Instant Yeast', unitWeight: 750, units: 2, unitLabel: 'loaves' },
    'Custom': { hydration: 70, salt: 2.0, leavening: 1.0, leaveningType: 'Instant Yeast', unitWeight: 500, units: 2, unitLabel: 'loaves' },
};

const round = (value, decimals = 0) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
};

// Given a target total dough weight and the baker's percentages, solve for the
// flour weight, then derive everything else from it. When the leavening is a
// sourdough starter, split the starter into the flour and water it carries and
// fold those into the totals so we can report the true hydration.
export const computeRecipe = ({ totalWeight, hydration, salt, leavening, leaveningType = 'Instant Yeast' }) => {
    const sumOfPercents = 100 + Number(hydration) + Number(salt) + Number(leavening);
    const flour = (totalWeight * 100) / sumOfPercents;
    const water = (flour * Number(hydration)) / 100;
    const saltGrams = (flour * Number(salt)) / 100;
    const leaveningGrams = (flour * Number(leavening)) / 100;

    const spec = LEAVENINGS[leaveningType] || {};
    let starterFlour = 0;
    let starterWater = 0;
    if (spec.contributesToDough) {
        const starterHydration = spec.starterHydration ?? 100;
        // starter = flourPart + waterPart, with waterPart = flourPart * hydration/100.
        starterFlour = leaveningGrams / (1 + starterHydration / 100);
        starterWater = leaveningGrams - starterFlour;
    }

    const totalFlour = flour + starterFlour;
    const totalWater = water + starterWater;
    const trueHydration = totalFlour > 0 ? (totalWater / totalFlour) * 100 : 0;

    return {
        flour: round(flour),
        water: round(water),
        salt: round(saltGrams, 1),
        leavening: round(leaveningGrams, 1),
        total: round(flour + water + saltGrams + leaveningGrams),
        starterFlour: round(starterFlour),
        starterWater: round(starterWater),
        totalFlour: round(totalFlour),
        totalWater: round(totalWater),
        trueHydration: round(trueHydration, 1),
        contributesToDough: !!spec.contributesToDough,
        isPreferment: !!spec.isPreferment,
    };
};

// Poolish and biga need yeast in the preferment and again in the final dough.
// The preferment gets a tiny dose to kick off fermentation; the final dough
// gets instant yeast on the remaining flour (minus what went into the
// preferment), sized for the target bulk rise at the current temperature.
export const computeYeastPlan = ({
    recipe,
    leaveningType,
    temperature = REFERENCE_TEMP_C,
}) => {
    const spec = LEAVENINGS[leaveningType] || {};
    if (!spec.isPreferment) {
        return null;
    }

    const prefermentFlour = Number(recipe.starterFlour);
    const remainingFlour = Number(recipe.flour);
    const prefermentYeastPercent = spec.prefermentYeastPercent ?? 0;
    const prefermentYeastGrams = (prefermentFlour * prefermentYeastPercent) / 100;

    const temp = Number(temperature);
    const tempFactor = 2 ** ((REFERENCE_TEMP_C - temp) / 10);
    const targetBulkHours = spec.targetBulkHours ?? 3;
    const totalFinalYeastPercent = (REFERENCE_YEAST_BULK_HOURS / targetBulkHours) * tempFactor;
    const totalFinalYeastGrams = (remainingFlour * totalFinalYeastPercent) / 100;
    const finalYeastGrams = Math.max(0, totalFinalYeastGrams - prefermentYeastGrams);
    const finalYeastPercent =
        remainingFlour > 0 ? (finalYeastGrams / remainingFlour) * 100 : 0;

    return {
        prefermentYeastGrams: round(prefermentYeastGrams, 2),
        prefermentYeastPercent,
        finalYeastGrams: round(finalYeastGrams, 2),
        finalYeastPercent: round(finalYeastPercent, 2),
        totalYeastGrams: round(prefermentYeastGrams + finalYeastGrams, 2),
    };
};

// When you feed the mother: keep a small seed, add flour + water to a target jar
// weight. The rest of the ripe starter (jar minus seed) is discard — often used
// in the same bake.
export const computeStarterFeed = ({
    seedWeight,
    targetTotal,
    starterHydration = 100,
}) => {
    const seed = Number(seedWeight);
    const target = Number(targetTotal);
    const hydration = Number(starterHydration);

    if (!Number.isFinite(seed) || !Number.isFinite(target) || seed <= 0 || target <= seed) {
        return null;
    }

    const flourTotal = target / (1 + hydration / 100);
    const waterTotal = target - flourTotal;
    const seedFlour = seed / (1 + hydration / 100);
    const seedWater = seed - seedFlour;

    return {
        seedWeight: round(seed),
        targetTotal: round(target),
        addFlour: round(flourTotal - seedFlour, 1),
        addWater: round(waterTotal - seedWater, 1),
        addTotal: round(target - seed),
        inoculumPercent: round((seed / target) * 100, 1),
    };
};

// Rough peak time for a starter build from seed weight and final target mass.
// More seed in the mix (higher inoculum) peaks sooner; warmer starter peaks sooner.
export const computeLevainPeakHours = ({
    seedWeight,
    targetTotal,
    temperature = REFERENCE_TEMP_C,
}) => {
    const seed = Number(seedWeight);
    const target = Number(targetTotal);
    const temp = Number(temperature);

    if (!Number.isFinite(seed) || !Number.isFinite(target) || seed <= 0 || target <= seed) {
        return 0;
    }

    const inoculumPercent = (seed / target) * 100;
    const tempFactor = 2 ** ((REFERENCE_TEMP_C - temp) / 10);
    return (REFERENCE_LEVAIN_INOCULUM_PERCENT / inoculumPercent) * REFERENCE_LEVAIN_PEAK_HOURS * tempFactor;
};

export const computeStarterPlan = ({
    jarWeight,
    seedKept,
    targetTotal,
    starterHydration = 100,
    doughStarterNeed = 0,
    discardOnHand,
    temperature = REFERENCE_TEMP_C,
}) => {
    const jar = Number(jarWeight);
    const seed = Number(seedKept);
    const need = Number(doughStarterNeed);
    const temp = Number(temperature);
    const discard =
        discardOnHand === undefined || discardOnHand === null || discardOnHand === ''
            ? jar - seed
            : Number(discardOnHand);

    if (
        !Number.isFinite(jar) ||
        !Number.isFinite(seed) ||
        !Number.isFinite(discard) ||
        jar <= 0 ||
        seed <= 0 ||
        jar < seed ||
        discard < 0
    ) {
        return null;
    }

    const motherFeed = computeStarterFeed({ seedWeight: seed, targetTotal, starterHydration });
    if (!motherFeed) {
        return null;
    }

    const jarDiscard = jar - seed;
    const useFromDiscard = Math.min(need, Math.max(0, discard));
    const shortfall = round(Math.max(0, need - useFromDiscard), 1);
    const surplus = round(Math.max(0, discard - useFromDiscard), 1);
    const coversDough = shortfall === 0;

    let doughStarter = null;
    if (coversDough) {
        doughStarter = {
            strategy: 'discard',
            useFromDiscard: round(useFromDiscard, 1),
            useFromSeed: 0,
            seedWeight: 0,
            targetTotal: round(need, 1),
            addFlour: 0,
            addWater: 0,
            addTotal: 0,
            inoculumPercent: 100,
            peakHours: 0,
        };
    } else if (shortfall > seed) {
        const levainBuild = computeStarterFeed({
            seedWeight: seed,
            targetTotal: shortfall,
            starterHydration,
        });
        doughStarter = {
            strategy: useFromDiscard > 0 ? 'partial' : 'build',
            useFromDiscard: round(useFromDiscard, 1),
            useFromSeed: 0,
            peakHours: computeLevainPeakHours({ seedWeight: seed, targetTotal: shortfall, temperature: temp }),
            ...levainBuild,
        };
    } else if (shortfall > 0) {
        doughStarter = {
            strategy: 'partial',
            useFromDiscard: round(useFromDiscard, 1),
            useFromSeed: shortfall,
            seedWeight: 0,
            targetTotal: shortfall,
            addFlour: 0,
            addWater: 0,
            addTotal: 0,
            inoculumPercent: 100,
            peakHours: 0,
        };
    }

    const motherPeakHours = computeLevainPeakHours({
        seedWeight: seed,
        targetTotal,
        temperature: temp,
    });

    return {
        jarWeight: round(jar),
        jarDiscard: round(jarDiscard),
        discardOnHand: round(discard),
        discardAvailable: round(discard),
        doughStarterNeed: round(need, 1),
        surplus,
        shortfall,
        coversDough,
        doughStarter,
        motherFeed: {
            ...motherFeed,
            peakHours: motherPeakHours,
        },
        readyInHours: doughStarter?.peakHours ?? 0,
    };
};

const capitalize = (text) => text.replace(/^\w/, (c) => c.toUpperCase());

const NumberField = ({ label, suffix, value, onChange }) => (
    <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.fieldInput}>
            <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                inputMode="numeric"
                value={String(value)}
                onChangeText={onChange}
            />
            {suffix ? <Text style={styles.fieldSuffix}>{suffix}</Text> : null}
        </View>
    </View>
);

const TextField = ({ label, value, onChange, placeholder, ...inputProps }) => (
    <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.fieldInput}>
            <TextInput
                style={styles.textInput}
                value={String(value)}
                onChangeText={onChange}
                placeholder={placeholder}
                {...inputProps}
            />
        </View>
    </View>
);

const SliderField = ({ label, suffix, value, range, clampRange, onChange, gramsLabel }) => {
    const { min, max, step } = range;
    const limits = clampRange ?? range;
    const [draft, setDraft] = useState(String(value));
    const isEditing = useRef(false);

    useEffect(() => {
        if (!isEditing.current) {
            setDraft(String(value));
        }
    }, [value]);

    const commitDraft = () => {
        isEditing.current = false;
        const clamped = clampSliderValue(draft, limits);
        onChange(clamped);
        setDraft(String(clamped));
    };

    const formatBound = (bound) => {
        const decimals = step < 1 ? 1 : 0;
        const factor = 10 ** decimals;
        return Math.round(bound * factor) / factor;
    };

    return (
        <View style={styles.field}>
            <View style={styles.sliderHeader}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <View style={styles.sliderInputRow}>
                    <View style={[styles.fieldInput, styles.sliderValueInput]}>
                        <TextInput
                            style={styles.sliderTextInput}
                            keyboardType="decimal-pad"
                            inputMode="decimal"
                            value={draft}
                            onFocus={() => {
                                isEditing.current = true;
                            }}
                            onBlur={commitDraft}
                            onSubmitEditing={commitDraft}
                            onChangeText={setDraft}
                        />
                        {suffix ? <Text style={styles.fieldSuffix}>{suffix}</Text> : null}
                    </View>
                    {gramsLabel ? <Text style={styles.sliderGrams}>({gramsLabel})</Text> : null}
                </View>
            </View>
            <Slider
                style={styles.slider}
                minimumValue={min}
                maximumValue={max}
                step={step}
                value={Number(value)}
                onValueChange={(next) => {
                    isEditing.current = false;
                    const clamped = clampSliderValue(next, limits);
                    onChange(clamped);
                    setDraft(String(clamped));
                }}
                minimumTrackTintColor="#7a3e12"
                maximumTrackTintColor="#e2d3c0"
                thumbTintColor="#7a3e12"
            />
            <View style={styles.sliderBounds}>
                <Text style={styles.sliderBound}>{formatBound(min)}{suffix}</Text>
                <Text style={styles.sliderBound}>{formatBound(max)}{suffix}</Text>
            </View>
        </View>
    );
};

const RecipeRow = ({ ingredient, percent, grams, isTotal }) => (
    <View style={[styles.row, isTotal && styles.totalRow]}>
        <Text style={[styles.cell, styles.cellIngredient, isTotal && styles.totalText]}>{ingredient}</Text>
        <Text style={[styles.cell, styles.cellPercent, isTotal && styles.totalText]}>{percent}</Text>
        <Text style={[styles.cell, styles.cellGrams, isTotal && styles.totalText]}>{grams}</Text>
    </View>
);

const BreadCalculator = () => {
    useEffect(() => {
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
            document.title = 'Hydration Bread Calculator';
        }
    }, []);

    const [presetName, setPresetName] = useState('Country Sourdough');
    const preset = PRESETS[presetName];

    const [hydration, setHydration] = useState(preset.hydration);
    const [salt, setSalt] = useState(preset.salt);
    const [leavening, setLeavening] = useState(preset.leavening);
    const [leaveningType, setLeaveningType] = useState(preset.leaveningType);
    const [units, setUnits] = useState(preset.units);
    const [unitWeight, setUnitWeight] = useState(preset.unitWeight);
    const [temperature, setTemperature] = useState(REFERENCE_TEMP_C);
    const [starterJarWeight, setStarterJarWeight] = useState(200);
    const [starterSeedKept, setStarterSeedKept] = useState(25);
    const [starterFeedTarget, setStarterFeedTarget] = useState(200);
    const [starterDiscardOnHand, setStarterDiscardOnHand] = useState(175);
    const initialBake = defaultBakeDate();
    const [bakeDate, setBakeDate] = useState(initialBake.date);
    const [bakeTime, setBakeTime] = useState(initialBake.time);

    const sliderRange = getLeaveningSliderRange(leaveningType);
    const hydrationRange = useMemo(
        () => getDynamicSliderRange(hydration, HYDRATION_SLIDER, HYDRATION_ABSOLUTE),
        [hydration]
    );
    const saltRange = useMemo(
        () => getDynamicSliderRange(salt, SALT_SLIDER, SALT_ABSOLUTE),
        [salt]
    );
    const temperatureRange = useMemo(
        () => getDynamicSliderRange(temperature, TEMPERATURE_SLIDER, TEMPERATURE_ABSOLUTE),
        [temperature]
    );
    const leaveningRange = useMemo(
        () => getDynamicSliderRange(leavening, sliderRange, sliderRange),
        [leavening, sliderRange]
    );

    const applyPreset = (name) => {
        const next = PRESETS[name];
        setPresetName(name);
        setHydration(next.hydration);
        setSalt(next.salt);
        setLeavening(next.leavening);
        setLeaveningType(next.leaveningType);
        setUnits(next.units);
        setUnitWeight(next.unitWeight);
    };

    // Switching leavening type reloads that type's typical dose so the numbers
    // stay sensible (e.g. 20% starter vs 0.5% instant yeast).
    const changeLeaveningType = (type) => {
        setLeaveningType(type);
        setLeavening(LEAVENINGS[type].defaultPercent);
    };

    const changeHydration = (value) => {
        setHydration(clampSliderValue(value, HYDRATION_ABSOLUTE));
    };

    const changeSalt = (value) => {
        setSalt(clampSliderValue(value, SALT_ABSOLUTE));
    };

    const changeTemperature = (value) => {
        setTemperature(clampSliderValue(value, TEMPERATURE_ABSOLUTE));
    };

    const changeLeaveningAmount = (value) => {
        setLeavening(clampLeavening(value, leaveningType));
    };

    const totalWeight = Number(units) * Number(unitWeight);

    const recipe = useMemo(
        () => computeRecipe({ totalWeight, hydration, salt, leavening, leaveningType }),
        [totalWeight, hydration, salt, leavening, leaveningType]
    );

    const yeastPlan = useMemo(
        () => computeYeastPlan({ recipe, leaveningType, temperature }),
        [recipe, leaveningType, temperature]
    );

    const timing = useMemo(
        () => computeTiming({ leaveningType, leavening, temperature }),
        [leaveningType, leavening, temperature]
    );

    const prefermentPeakHours = useMemo(
        () => computePrefermentPeakHours({ leaveningType, leavening, temperature }),
        [leaveningType, leavening, temperature]
    );

    const method = useMemo(
        () =>
            buildMethod({
                leaveningType,
                timing,
                temperature,
                units,
                unitLabel: preset.unitLabel,
                prefermentPeakHours,
                yeastPlan,
            }),
        [leaveningType, timing, temperature, units, preset.unitLabel, prefermentPeakHours, yeastPlan]
    );

    const isSourdough = !!LEAVENINGS[leaveningType]?.isSourdough;
    const isPreferment = !!LEAVENINGS[leaveningType]?.isPreferment;
    const starterHydration = LEAVENINGS[leaveningType]?.starterHydration ?? 100;
    const starterPlan = useMemo(() => {
        if (!isSourdough) {
            return null;
        }
        return computeStarterPlan({
            jarWeight: starterJarWeight,
            seedKept: starterSeedKept,
            targetTotal: starterFeedTarget,
            starterHydration,
            doughStarterNeed: recipe.leavening,
            discardOnHand: starterDiscardOnHand,
            temperature,
        });
    }, [
        isSourdough,
        recipe.leavening,
        starterJarWeight,
        starterSeedKept,
        starterFeedTarget,
        starterDiscardOnHand,
        starterHydration,
        temperature,
    ]);

    const targetBakeTime = useMemo(
        () => parseBakeDateTime(bakeDate, bakeTime),
        [bakeDate, bakeTime]
    );

    const bakeSchedule = useMemo(
        () =>
            computeBakeSchedule({
                targetBakeTime,
                timing,
                leaveningType,
                starterPlan,
                prefermentPeakHours,
            }),
        [targetBakeTime, timing, leaveningType, starterPlan, prefermentPeakHours]
    );

    return (
        <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.calculator}>
                <View style={styles.header}>
                    <Text style={styles.title}>Hydration Bread Calculator</Text>
                    <Text style={styles.subtitle}>
                        Scale any dough with baker&apos;s percentages — pizza is just bread with attitude.
                    </Text>
                </View>

                <View style={styles.body}>
                    <View style={styles.panel}>
                        <View style={styles.field}>
                            <Text style={styles.fieldLabel}>Style preset</Text>
                            <View style={styles.fieldInput}>
                                <Picker
                                    selectedValue={presetName}
                                    onValueChange={applyPreset}
                                    style={styles.picker}
                                >
                                    {Object.keys(PRESETS).map((name) => (
                                        <Picker.Item key={name} label={name} value={name} />
                                    ))}
                                </Picker>
                            </View>
                        </View>

                        <View style={styles.fieldRow}>
                            <View style={styles.fieldRowItem}>
                                <NumberField label={capitalize(preset.unitLabel)} value={units} onChange={setUnits} />
                            </View>
                            <View style={styles.fieldRowItem}>
                                <NumberField label="Weight each" suffix="g" value={unitWeight} onChange={setUnitWeight} />
                            </View>
                        </View>

                        <SliderField
                            label="Hydration"
                            suffix="%"
                            value={hydration}
                            range={hydrationRange}
                            clampRange={HYDRATION_ABSOLUTE}
                            onChange={changeHydration}
                            gramsLabel={`${recipe.water} g`}
                        />
                        <SliderField
                            label="Salt"
                            suffix="%"
                            value={salt}
                            range={saltRange}
                            clampRange={SALT_ABSOLUTE}
                            onChange={changeSalt}
                            gramsLabel={`${recipe.salt} g`}
                        />

                        <View style={styles.field}>
                            <Text style={styles.fieldLabel}>Leavening</Text>
                            <View style={styles.fieldInput}>
                                <Picker
                                    selectedValue={leaveningType}
                                    onValueChange={changeLeaveningType}
                                    style={styles.picker}
                                >
                                    {Object.keys(LEAVENINGS).map((type) => (
                                        <Picker.Item key={type} label={type} value={type} />
                                    ))}
                                </Picker>
                            </View>
                        </View>

                        <SliderField
                            label={`${leaveningType} amount`}
                            suffix="%"
                            value={leavening}
                            range={leaveningRange}
                            clampRange={sliderRange}
                            onChange={changeLeaveningAmount}
                            gramsLabel={`${recipe.leavening} g`}
                        />
                        <SliderField
                            label="Dough temperature"
                            suffix="°C"
                            value={temperature}
                            range={temperatureRange}
                            clampRange={TEMPERATURE_ABSOLUTE}
                            onChange={changeTemperature}
                        />

                        <View style={styles.scheduleSection}>
                            <Text style={styles.scheduleTitle}>Bake schedule</Text>
                            <Text style={styles.scheduleIntro}>
                                Set when you want bread in the oven — leavening and temperature sliders shift preferment timing.
                            </Text>
                            <View style={styles.fieldRow}>
                                <View style={styles.fieldRowItem}>
                                    <TextField
                                        label="Bake date"
                                        value={bakeDate}
                                        onChange={setBakeDate}
                                        placeholder="YYYY-MM-DD"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                </View>
                                <View style={styles.fieldRowItem}>
                                    <TextField
                                        label="Bake time"
                                        value={bakeTime}
                                        onChange={setBakeTime}
                                        placeholder="HH:MM"
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                </View>
                            </View>
                        </View>

                        <Text style={styles.totalTarget}>
                            Target dough weight: <Text style={styles.totalTargetStrong}>{round(totalWeight)} g</Text>
                        </Text>
                    </View>

                    <View style={styles.panel}>
                        <Text style={styles.panelTitle}>Recipe</Text>
                        <View style={styles.headerRow}>
                            <Text style={[styles.headerCell, styles.cellIngredient]}>Ingredient</Text>
                            <Text style={[styles.headerCell, styles.cellPercent]}>Baker&apos;s %</Text>
                            <Text style={[styles.headerCell, styles.cellGrams]}>Grams</Text>
                        </View>
                        <RecipeRow ingredient="Flour" percent="100%" grams={`${recipe.flour} g`} />
                        <RecipeRow ingredient="Water" percent={`${round(hydration, 1)}%`} grams={`${recipe.water} g`} />
                        <RecipeRow ingredient="Salt" percent={`${round(salt, 1)}%`} grams={`${recipe.salt} g`} />
                        <RecipeRow ingredient={leaveningType} percent={`${round(leavening, 1)}%`} grams={`${recipe.leavening} g`} />
                        {yeastPlan ? (
                            <>
                                <RecipeRow
                                    ingredient={`Yeast (in ${leaveningType.toLowerCase()})`}
                                    percent={`${yeastPlan.prefermentYeastPercent}% pref. flour`}
                                    grams={`${yeastPlan.prefermentYeastGrams} g`}
                                />
                                <RecipeRow
                                    ingredient="Yeast (final dough)"
                                    percent={`${yeastPlan.finalYeastPercent}%`}
                                    grams={`${yeastPlan.finalYeastGrams} g`}
                                />
                            </>
                        ) : null}
                        <RecipeRow ingredient="Total dough" percent="—" grams={`${recipe.total} g`} isTotal />

                        {isPreferment ? (
                            <Text style={styles.note}>
                                {leaveningType} is flour + water with a pinch of yeast in the preferment, plus more instant yeast in the final mix.
                                It adds ~{recipe.starterFlour} g flour and {recipe.starterWater} g water. True hydration incl. preferment:{' '}
                                <Text style={styles.noteStrong}>{recipe.trueHydration}%</Text>{' '}
                                ({recipe.totalWater} g water / {recipe.totalFlour} g flour).
                            </Text>
                        ) : recipe.contributesToDough ? (
                            <Text style={styles.note}>
                                {isSourdough ? 'Starter' : leaveningType} is flour + water, so it adds ~{recipe.starterFlour} g flour and{' '}
                                {recipe.starterWater} g water. True hydration incl. preferment:{' '}
                                <Text style={styles.noteStrong}>{recipe.trueHydration}%</Text>{' '}
                                ({recipe.totalWater} g water / {recipe.totalFlour} g flour).
                            </Text>
                        ) : null}

                        {starterPlan ? (
                            <View style={styles.starterSection}>
                                <Text style={styles.starterTitle}>Feed &amp; bake</Text>
                                <Text style={styles.starterIntro}>
                                    How much ripe starter you have for the dough, plus jar maintenance after baking.
                                </Text>
                                <NumberField
                                    label="Discard on hand"
                                    suffix="g"
                                    value={starterDiscardOnHand}
                                    onChange={setStarterDiscardOnHand}
                                />
                                <Text style={styles.starterHint}>
                                    Ripe starter ready to go into the dough (jar − seed is often{' '}
                                    {round(Number(starterJarWeight) - Number(starterSeedKept))} g).
                                </Text>
                                <View style={styles.fieldRow}>
                                    <View style={styles.fieldRowItem}>
                                        <NumberField
                                            label="Jar before feed"
                                            suffix="g"
                                            value={starterJarWeight}
                                            onChange={setStarterJarWeight}
                                        />
                                    </View>
                                    <View style={styles.fieldRowItem}>
                                        <NumberField
                                            label="Seed kept"
                                            suffix="g"
                                            value={starterSeedKept}
                                            onChange={setStarterSeedKept}
                                        />
                                    </View>
                                </View>
                                <NumberField
                                    label="Feed to"
                                    suffix="g"
                                    value={starterFeedTarget}
                                    onChange={setStarterFeedTarget}
                                />

                                {starterPlan.doughStarter ? (
                                    <>
                                        <Text style={styles.starterSubtitle}>Starter for this dough</Text>
                                        <View style={styles.starterRow}>
                                            <Text style={styles.starterLabel}>Need</Text>
                                            <Text style={styles.starterValue}>{starterPlan.doughStarterNeed} g</Text>
                                        </View>
                                        {starterPlan.doughStarter.strategy === 'discard' ? (
                                            <>
                                                <View style={styles.starterRow}>
                                                    <Text style={styles.starterLabel}>Use from discard</Text>
                                                    <Text style={styles.starterValue}>
                                                        {starterPlan.doughStarter.useFromDiscard} g
                                                    </Text>
                                                </View>
                                                <View style={styles.starterRow}>
                                                    <Text style={styles.starterLabel}>Ready in</Text>
                                                    <Text style={styles.starterValue}>Now (ripe discard)</Text>
                                                </View>
                                            </>
                                        ) : starterPlan.doughStarter.strategy === 'partial' ? (
                                            <>
                                                {starterPlan.doughStarter.useFromDiscard > 0 ? (
                                                    <View style={styles.starterRow}>
                                                        <Text style={styles.starterLabel}>Use from discard</Text>
                                                        <Text style={styles.starterValue}>
                                                            {starterPlan.doughStarter.useFromDiscard} g (now)
                                                        </Text>
                                                    </View>
                                                ) : null}
                                                {starterPlan.doughStarter.useFromSeed > 0 ? (
                                                    <View style={styles.starterRow}>
                                                        <Text style={styles.starterLabel}>Use from seed</Text>
                                                        <Text style={styles.starterValue}>
                                                            {starterPlan.doughStarter.useFromSeed} g (ripe)
                                                        </Text>
                                                    </View>
                                                ) : null}
                                                {starterPlan.doughStarter.seedWeight > 0 ? (
                                                    <>
                                                        <View style={styles.starterRow}>
                                                            <Text style={styles.starterLabel}>Build from seed</Text>
                                                            <Text style={styles.starterValue}>
                                                                {starterPlan.doughStarter.seedWeight} g
                                                            </Text>
                                                        </View>
                                                        <View style={styles.starterRow}>
                                                            <Text style={styles.starterLabel}>Add</Text>
                                                            <Text style={styles.starterValue}>
                                                                {starterPlan.doughStarter.addFlour} g flour +{' '}
                                                                {starterPlan.doughStarter.addWater} g water
                                                            </Text>
                                                        </View>
                                                        <View style={styles.starterRow}>
                                                            <Text style={styles.starterLabel}>Build to</Text>
                                                            <Text style={styles.starterValue}>
                                                                {starterPlan.doughStarter.targetTotal} g
                                                            </Text>
                                                        </View>
                                                        <View style={styles.starterRow}>
                                                            <Text style={styles.starterLabel}>Peak in</Text>
                                                            <Text style={styles.starterValue}>
                                                                {formatDuration(starterPlan.doughStarter.peakHours)} at{' '}
                                                                {round(Number(temperature), 0)}°C
                                                            </Text>
                                                        </View>
                                                    </>
                                                ) : null}
                                            </>
                                        ) : (
                                            <>
                                                <View style={styles.starterRow}>
                                                    <Text style={styles.starterLabel}>Build from seed</Text>
                                                    <Text style={styles.starterValue}>
                                                        {starterPlan.doughStarter.seedWeight} g
                                                    </Text>
                                                </View>
                                                <View style={styles.starterRow}>
                                                    <Text style={styles.starterLabel}>Add</Text>
                                                    <Text style={styles.starterValue}>
                                                        {starterPlan.doughStarter.addFlour} g flour +{' '}
                                                        {starterPlan.doughStarter.addWater} g water
                                                    </Text>
                                                </View>
                                                <View style={styles.starterRow}>
                                                    <Text style={styles.starterLabel}>Build to</Text>
                                                    <Text style={styles.starterValue}>
                                                        {starterPlan.doughStarter.targetTotal} g
                                                    </Text>
                                                </View>
                                                <View style={styles.starterRow}>
                                                    <Text style={styles.starterLabel}>Peak in</Text>
                                                    <Text style={styles.starterValue}>
                                                        {formatDuration(starterPlan.doughStarter.peakHours)} at{' '}
                                                        {round(Number(temperature), 0)}°C
                                                    </Text>
                                                </View>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <Text style={styles.note}>
                                        Short {starterPlan.shortfall} g starter for this dough — scale down, use a
                                        larger jar, or lower the starter percentage.
                                    </Text>
                                )}

                                <Text style={styles.starterSubtitle}>Refresh the jar</Text>
                                <View style={styles.starterRow}>
                                    <Text style={styles.starterLabel}>Add to seed</Text>
                                    <Text style={styles.starterValue}>
                                        {starterPlan.motherFeed.addFlour} g flour +{' '}
                                        {starterPlan.motherFeed.addWater} g water
                                    </Text>
                                </View>
                                <View style={styles.starterRow}>
                                    <Text style={styles.starterLabel}>Jar peaks in</Text>
                                    <Text style={styles.starterValue}>
                                        {formatDuration(starterPlan.motherFeed.peakHours)} at{' '}
                                        {round(Number(temperature), 0)}°C
                                    </Text>
                                </View>

                                <Text style={styles.note}>
                                    {starterPlan.coversDough ? (
                                        <>
                                            Use {starterPlan.doughStarter.useFromDiscard} g discard for the dough,
                                            then keep {starterPlan.motherFeed.seedWeight} g and feed the jar to{' '}
                                            {starterPlan.motherFeed.targetTotal} g
                                            {starterPlan.surplus > 0
                                                ? ` (${starterPlan.surplus} g discard left over).`
                                                : '.'}{' '}
                                            Mix dough now, then allow {formatDuration(timing.totalHours)} rise.
                                        </>
                                    ) : starterPlan.doughStarter?.strategy === 'partial' ? (
                                        <>
                                            {starterPlan.doughStarter.useFromDiscard > 0
                                                ? `Use ${starterPlan.doughStarter.useFromDiscard} g discard now`
                                                : 'Start the levain'}
                                            {starterPlan.doughStarter.seedWeight > 0
                                                ? ` and build ${starterPlan.doughStarter.targetTotal} g more (~${formatDuration(starterPlan.doughStarter.peakHours)})`
                                                : starterPlan.doughStarter.useFromSeed > 0
                                                  ? ` plus ${starterPlan.doughStarter.useFromSeed} g from your seed stock`
                                                  : ''}
                                            . About {formatDuration(starterPlan.readyInHours + timing.totalHours)} until
                                            bake, then refresh the jar.
                                        </>
                                    ) : starterPlan.doughStarter ? (
                                        <>
                                            Build {starterPlan.doughStarter.targetTotal} g levain first (~
                                            {formatDuration(starterPlan.doughStarter.peakHours)}), mix the dough, then
                                            feed the jar on the side. About{' '}
                                            {formatDuration(starterPlan.readyInHours + timing.totalHours)} until bake
                                            after you start the levain.
                                        </>
                                    ) : null}
                                </Text>
                            </View>
                        ) : null}

                        <Text style={styles.timingTitle}>Estimated timing at {round(Number(temperature), 0)}°C</Text>
                        <View style={styles.timingRow}>
                            <Text style={styles.timingLabel}>Bulk ferment</Text>
                            <Text style={styles.timingValue}>{formatDuration(timing.bulkHours)}</Text>
                        </View>
                        <View style={styles.timingRow}>
                            <Text style={styles.timingLabel}>Final proof</Text>
                            <Text style={styles.timingValue}>{formatDuration(timing.proofHours)}</Text>
                        </View>
                        <View style={[styles.timingRow, styles.timingTotalRow]}>
                            <Text style={[styles.timingLabel, styles.totalText]}>Total rise</Text>
                            <Text style={[styles.timingValue, styles.totalText]}>{formatDuration(timing.totalHours)}</Text>
                        </View>
                        <Text style={styles.note}>
                            More (or stronger) leavening and warmer dough ferment faster — these are rough estimates,
                            so watch the dough, not the clock.
                        </Text>

                        {bakeSchedule ? (
                            <View style={styles.scheduleResults}>
                                <Text style={styles.scheduleTitle}>When to start</Text>
                                <View style={styles.timingRow}>
                                    <Text style={styles.timingLabel}>Target bake</Text>
                                    <Text style={styles.timingValue}>{formatDateTime(bakeSchedule.bake)}</Text>
                                </View>
                                <View style={[styles.timingRow, styles.timingTotalRow]}>
                                    <Text style={[styles.timingLabel, styles.totalText]}>Start by</Text>
                                    <Text style={[styles.timingValue, styles.totalText]}>
                                        {formatDateTime(bakeSchedule.firstStep)}
                                    </Text>
                                </View>
                                <View style={styles.timingRow}>
                                    <Text style={styles.timingLabel}>Total lead time</Text>
                                    <Text style={styles.timingValue}>
                                        {formatDuration(bakeSchedule.totalLeadHours)}
                                    </Text>
                                </View>
                                {bakeSchedule.inPast ? (
                                    <Text style={styles.scheduleWarning}>
                                        That start time is already in the past — pick a later bake time or use more
                                        preferment for a shorter rise.
                                    </Text>
                                ) : null}
                                {bakeSchedule.steps.map((step, index) => (
                                    <View key={`${step.label}-${index}`} style={styles.scheduleStep}>
                                        <Text style={styles.scheduleStepLabel}>{step.label}</Text>
                                        <Text style={styles.scheduleStepTime}>{formatDateTime(step.time)}</Text>
                                        {step.durationHours > 0 ? (
                                            <Text style={styles.scheduleStepDuration}>
                                                ~{formatDuration(step.durationHours)}
                                            </Text>
                                        ) : null}
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <Text style={styles.note}>
                                Enter a valid bake date (YYYY-MM-DD) and time (HH:MM, 24-hour) to see your schedule.
                            </Text>
                        )}
                    </View>
                </View>

                <View style={[styles.panel, styles.methodPanel]}>
                    <Text style={styles.panelTitle}>Method</Text>
                    {method.map((step, index) => (
                        <View key={index} style={styles.methodStep}>
                            <Text style={styles.methodNumber}>{index + 1}</Text>
                            <Text style={styles.methodText}>{step}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        Built by{' '}
                        <Text
                            style={styles.footerLink}
                            accessibilityRole="link"
                            onPress={() => Linking.openURL(NASH_ENGINEERING_URL)}
                        >
                            pizza.nash.engineering
                        </Text>
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scroll: {
        flexGrow: 1,
        backgroundColor: '#fdf6ec',
        alignItems: 'center',
        paddingVertical: 32,
        paddingHorizontal: 16,
    },
    calculator: {
        width: '100%',
        maxWidth: 860,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: '#7a3e12',
        textAlign: 'center',
    },
    subtitle: {
        marginTop: 8,
        fontSize: 16,
        color: '#8a7b6b',
        textAlign: 'center',
    },
    body: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    panel: {
        flexGrow: 1,
        flexBasis: 320,
        backgroundColor: '#fffaf3',
        borderColor: '#ece0d1',
        borderWidth: 1,
        borderRadius: 14,
        padding: 20,
    },
    panelTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#7a3e12',
        marginBottom: 12,
    },
    field: {
        marginBottom: 16,
    },
    fieldRow: {
        flexDirection: 'row',
        gap: 12,
    },
    fieldRowItem: {
        flex: 1,
    },
    fieldLabel: {
        fontWeight: '600',
        fontSize: 14,
        marginBottom: 6,
        color: '#5c4a38',
    },
    fieldInput: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderColor: '#d9c9b5',
        borderWidth: 1,
        borderRadius: 8,
        overflow: 'hidden',
    },
    textInput: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        fontSize: 16,
        color: '#2b2118',
    },
    picker: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 8,
        fontSize: 16,
        color: '#2b2118',
        backgroundColor: '#fff',
        borderWidth: 0,
    },
    fieldSuffix: {
        paddingHorizontal: 12,
        color: '#a08b74',
        fontWeight: '600',
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
        gap: 12,
    },
    sliderInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
    },
    sliderValueInput: {
        width: 96,
        flex: 0,
    },
    sliderTextInput: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 10,
        fontSize: 16,
        fontWeight: '700',
        color: '#7a3e12',
        fontVariant: ['tabular-nums'],
        textAlign: 'right',
    },
    sliderValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#7a3e12',
        fontVariant: ['tabular-nums'],
    },
    sliderGrams: {
        fontSize: 13,
        fontWeight: '600',
        color: '#8a7b6b',
    },
    slider: {
        width: '100%',
        height: 36,
    },
    sliderBounds: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: -2,
    },
    sliderBound: {
        fontSize: 12,
        color: '#a08b74',
    },
    scheduleSection: {
        marginTop: 8,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e2d3c0',
    },
    scheduleTitle: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#a08b74',
        marginBottom: 6,
    },
    scheduleIntro: {
        fontSize: 13,
        lineHeight: 19,
        color: '#8a7b6b',
        marginBottom: 12,
    },
    scheduleResults: {
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e2d3c0',
    },
    scheduleStep: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#efe3d4',
    },
    scheduleStepLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#5c4a38',
    },
    scheduleStepTime: {
        marginTop: 2,
        fontSize: 15,
        color: '#2b2118',
        fontVariant: ['tabular-nums'],
    },
    scheduleStepDuration: {
        marginTop: 2,
        fontSize: 13,
        color: '#8a7b6b',
    },
    scheduleWarning: {
        marginTop: 10,
        marginBottom: 4,
        fontSize: 13,
        lineHeight: 19,
        color: '#a33b12',
        fontWeight: '600',
    },
    totalTarget: {
        marginTop: 12,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e2d3c0',
        color: '#5c4a38',
    },
    totalTargetStrong: {
        color: '#7a3e12',
        fontWeight: '700',
    },
    headerRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#efe3d4',
        paddingBottom: 8,
    },
    headerCell: {
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#a08b74',
        fontWeight: '600',
    },
    row: {
        flexDirection: 'row',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#efe3d4',
    },
    totalRow: {
        borderBottomWidth: 0,
        borderTopWidth: 2,
        borderTopColor: '#e2d3c0',
    },
    cell: {
        color: '#2b2118',
        fontSize: 15,
    },
    cellIngredient: {
        flex: 2,
    },
    cellPercent: {
        flex: 1,
        textAlign: 'center',
        color: '#8a7b6b',
    },
    cellGrams: {
        flex: 1,
        textAlign: 'right',
    },
    totalText: {
        fontWeight: '700',
        color: '#7a3e12',
    },
    note: {
        marginTop: 14,
        fontSize: 13,
        lineHeight: 19,
        color: '#8a7b6b',
    },
    noteStrong: {
        color: '#7a3e12',
        fontWeight: '700',
    },
    starterSection: {
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e2d3c0',
    },
    starterTitle: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#a08b74',
        marginBottom: 6,
    },
    starterIntro: {
        fontSize: 13,
        lineHeight: 19,
        color: '#8a7b6b',
        marginBottom: 12,
    },
    starterHint: {
        marginTop: -8,
        marginBottom: 12,
        fontSize: 12,
        lineHeight: 17,
        color: '#a08b74',
    },
    starterSubtitle: {
        marginTop: 16,
        marginBottom: 4,
        fontSize: 13,
        fontWeight: '700',
        color: '#5c4a38',
    },
    starterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#efe3d4',
    },
    starterLabel: {
        fontSize: 15,
        color: '#5c4a38',
        flex: 1,
        paddingRight: 8,
    },
    starterValue: {
        fontSize: 15,
        color: '#2b2118',
        fontVariant: ['tabular-nums'],
        textAlign: 'right',
        flexShrink: 1,
    },
    timingTitle: {
        marginTop: 20,
        marginBottom: 8,
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#a08b74',
    },
    timingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#efe3d4',
    },
    timingTotalRow: {
        borderBottomWidth: 0,
        borderTopWidth: 2,
        borderTopColor: '#e2d3c0',
    },
    timingLabel: {
        fontSize: 15,
        color: '#5c4a38',
    },
    timingValue: {
        fontSize: 15,
        color: '#2b2118',
        fontVariant: ['tabular-nums'],
    },
    methodPanel: {
        flexBasis: '100%',
        marginTop: 16,
    },
    methodStep: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    methodNumber: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#7a3e12',
        color: '#fff',
        textAlign: 'center',
        lineHeight: 26,
        fontWeight: '700',
        marginRight: 12,
        overflow: 'hidden',
    },
    methodText: {
        flex: 1,
        fontSize: 15,
        lineHeight: 22,
        color: '#2b2118',
    },
    footer: {
        alignItems: 'center',
        marginTop: 24,
        paddingBottom: 8,
    },
    footerText: {
        fontSize: 14,
        color: '#a08b74',
    },
    footerLink: {
        color: '#7a3e12',
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
});

export default BreadCalculator;
