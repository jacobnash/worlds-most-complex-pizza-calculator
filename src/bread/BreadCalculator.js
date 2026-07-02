import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';

// Baker's percentages: flour is always 100%. Every other ingredient is
// expressed as a percentage of the total flour weight. Hydration is just the
// water as a percentage of flour. Pizza dough is simply one style of bread
// dough, so the classic pizza recipes below are expressed the same way.
//
// Each preset is a starting point. All values stay editable so you can tweak a
// recipe (or dial in your own) after picking a preset.

// The three ways this app leavens dough. Commercial yeasts are dosed as a tiny
// percentage of flour; the defaults below are roughly equivalent leavening
// power (fresh/cake yeast is ~3x instant, active dry ~1.25x). A sourdough
// starter is dosed much higher and, because it is itself flour + water, it
// contributes both back to the dough — so we track that to report the *true*
// hydration.
// `powerPerPercent` is the leavening power of each type relative to instant
// yeast, per 1% of flour. Cake (fresh) yeast is ~1/3 as strong by weight, which
// is why its default dose is ~3x. This drives the fermentation-time estimate.
export const LEAVENINGS = {
    'Sourdough Starter': { defaultPercent: 20, contributesToDough: true, starterHydration: 100 },
    'Instant Yeast': { defaultPercent: 0.5, contributesToDough: false, powerPerPercent: 1 },
    'Cake Yeast': { defaultPercent: 1.5, contributesToDough: false, powerPerPercent: 1 / 3 },
};

// Reference conditions for the (rough) fermentation-time model.
const REFERENCE_TEMP_C = 24; // ~75°F, typical room temperature
const REFERENCE_YEAST_BULK_HOURS = 2; // 1% instant yeast at 24°C ≈ 2h bulk
const PROOF_TO_BULK_RATIO = 0.6; // final proof runs shorter than the bulk rise

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
    if (percent > 0) {
        if (spec.contributesToDough) {
            // Sourdough: doubling the starter roughly halves the bulk rise
            // (20% starter ≈ 5h at 24°C).
            bulkHours = (100 / percent) * tempFactor;
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
export const buildMethod = ({ leaveningType, timing, temperature, units, unitLabel }) => {
    const leavening = leaveningType.toLowerCase();
    return [
        'Mix the flour and water until no dry flour remains, then rest 20 min (autolyse).',
        `Add the salt and ${leavening}; mix or knead until the dough is smooth.`,
        `Bulk ferment about ${formatDuration(timing.bulkHours)} at ${Number(temperature)}°C, with a few stretch-and-folds in the first hour.`,
        `Divide and shape into ${Number(units)} ${unitLabel}.`,
        `Proof about ${formatDuration(timing.proofHours)}, until visibly puffy.`,
        'Bake hot (with steam for bread; a blazing oven or stone for pizza) until deep golden.',
    ];
};

export const PRESETS = {
    'Neapolitan Pizza': { hydration: 60, salt: 2.8, leavening: 0.2, leaveningType: 'Instant Yeast', unitWeight: 250, units: 4, unitLabel: 'dough balls' },
    'New York Pizza': { hydration: 62, salt: 2.0, leavening: 0.5, leaveningType: 'Instant Yeast', unitWeight: 280, units: 4, unitLabel: 'dough balls' },
    'Ciabatta': { hydration: 80, salt: 2.0, leavening: 0.6, leaveningType: 'Instant Yeast', unitWeight: 400, units: 2, unitLabel: 'loaves' },
    'Baguette': { hydration: 68, salt: 2.0, leavening: 0.6, leaveningType: 'Instant Yeast', unitWeight: 350, units: 3, unitLabel: 'baguettes' },
    'Country Sourdough': { hydration: 72, salt: 2.0, leavening: 20, leaveningType: 'Sourdough Starter', unitWeight: 900, units: 1, unitLabel: 'loaves' },
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

    const totalWeight = Number(units) * Number(unitWeight);

    const recipe = useMemo(
        () => computeRecipe({ totalWeight, hydration, salt, leavening, leaveningType }),
        [totalWeight, hydration, salt, leavening, leaveningType]
    );

    const timing = useMemo(
        () => computeTiming({ leaveningType, leavening, temperature }),
        [leaveningType, leavening, temperature]
    );

    const method = useMemo(
        () => buildMethod({ leaveningType, timing, temperature, units, unitLabel: preset.unitLabel }),
        [leaveningType, timing, temperature, units, preset.unitLabel]
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

                        <NumberField label="Hydration" suffix="%" value={hydration} onChange={setHydration} />
                        <NumberField label="Salt" suffix="%" value={salt} onChange={setSalt} />

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

                        <NumberField label={`${leaveningType} amount`} suffix="%" value={leavening} onChange={setLeavening} />
                        <NumberField label="Dough temperature" suffix="°C" value={temperature} onChange={setTemperature} />

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
                        <RecipeRow ingredient="Total dough" percent="—" grams={`${recipe.total} g`} isTotal />

                        {recipe.contributesToDough ? (
                            <Text style={styles.note}>
                                Starter is flour + water, so it adds ~{recipe.starterFlour} g flour and{' '}
                                {recipe.starterWater} g water. True hydration incl. starter:{' '}
                                <Text style={styles.noteStrong}>{recipe.trueHydration}%</Text>{' '}
                                ({recipe.totalWater} g water / {recipe.totalFlour} g flour).
                            </Text>
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
});

export default BreadCalculator;
