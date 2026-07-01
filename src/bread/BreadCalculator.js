import React, { useEffect, useMemo, useState } from 'react';
import './BreadCalculator.css';

// Baker's percentages: flour is always 100%. Every other ingredient is
// expressed as a percentage of the total flour weight. Hydration is just the
// water as a percentage of flour. Pizza dough is simply one style of bread
// dough, so the classic pizza recipes below are expressed the same way.
//
// Each preset is a starting point. All values stay editable so you can tweak a
// recipe (or dial in your own) after picking a preset.
const PRESETS = {
    'Neapolitan Pizza': { hydration: 60, salt: 2.8, leavening: 0.2, unitWeight: 250, units: 4, unitLabel: 'dough balls' },
    'New York Pizza': { hydration: 62, salt: 2.0, leavening: 0.5, unitWeight: 280, units: 4, unitLabel: 'dough balls' },
    'Ciabatta': { hydration: 80, salt: 2.0, leavening: 0.6, unitWeight: 400, units: 2, unitLabel: 'loaves' },
    'Baguette': { hydration: 68, salt: 2.0, leavening: 0.6, unitWeight: 350, units: 3, unitLabel: 'baguettes' },
    'Country Sourdough': { hydration: 75, salt: 2.0, leavening: 20, unitWeight: 900, units: 1, unitLabel: 'loaves' },
    'Custom': { hydration: 70, salt: 2.0, leavening: 1.0, unitWeight: 500, units: 2, unitLabel: 'loaves' },
};

const round = (value, decimals = 0) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
};

// Given a target total dough weight and the baker's percentages, solve for the
// flour weight, then derive everything else from it.
const computeRecipe = ({ totalWeight, hydration, salt, leavening }) => {
    const sumOfPercents = 100 + Number(hydration) + Number(salt) + Number(leavening);
    const flour = (totalWeight * 100) / sumOfPercents;
    const water = (flour * Number(hydration)) / 100;
    const saltGrams = (flour * Number(salt)) / 100;
    const leaveningGrams = (flour * Number(leavening)) / 100;

    return {
        flour: round(flour),
        water: round(water),
        salt: round(saltGrams, 1),
        leavening: round(leaveningGrams, 1),
        total: round(flour + water + saltGrams + leaveningGrams),
    };
};

const NumberField = ({ label, suffix, value, min, step, onChange }) => (
    <label className="field">
        <span className="field-label">{label}</span>
        <span className="field-input">
            <input
                type="number"
                min={min}
                step={step}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
            {suffix ? <span className="field-suffix">{suffix}</span> : null}
        </span>
    </label>
);

const BreadCalculator = () => {
    useEffect(() => {
        document.title = "Hydration Bread Calculator";
    }, []);

    const [presetName, setPresetName] = useState('Country Sourdough');
    const preset = PRESETS[presetName];

    const [hydration, setHydration] = useState(preset.hydration);
    const [salt, setSalt] = useState(preset.salt);
    const [leavening, setLeavening] = useState(preset.leavening);
    const [units, setUnits] = useState(preset.units);
    const [unitWeight, setUnitWeight] = useState(preset.unitWeight);

    const applyPreset = (name) => {
        const next = PRESETS[name];
        setPresetName(name);
        setHydration(next.hydration);
        setSalt(next.salt);
        setLeavening(next.leavening);
        setUnits(next.units);
        setUnitWeight(next.unitWeight);
    };

    const totalWeight = Number(units) * Number(unitWeight);

    const recipe = useMemo(
        () => computeRecipe({ totalWeight, hydration, salt, leavening }),
        [totalWeight, hydration, salt, leavening]
    );

    return (
        <div className="calculator">
            <header className="calculator-header">
                <h1>Hydration Bread Calculator</h1>
                <p className="subtitle">
                    Scale any dough with baker&apos;s percentages &mdash; pizza is just bread with attitude.
                </p>
            </header>

            <div className="calculator-body">
                <section className="panel inputs">
                    <label className="field">
                        <span className="field-label">Style preset</span>
                        <span className="field-input">
                            <select value={presetName} onChange={(e) => applyPreset(e.target.value)}>
                                {Object.keys(PRESETS).map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </span>
                    </label>

                    <div className="field-row">
                        <NumberField
                            label={preset.unitLabel.replace(/^\w/, (c) => c.toUpperCase())}
                            value={units}
                            min={1}
                            step={1}
                            onChange={setUnits}
                        />
                        <NumberField
                            label="Weight each"
                            suffix="g"
                            value={unitWeight}
                            min={1}
                            step={10}
                            onChange={setUnitWeight}
                        />
                    </div>

                    <NumberField label="Hydration" suffix="%" value={hydration} min={0} step={1} onChange={setHydration} />
                    <NumberField label="Salt" suffix="%" value={salt} min={0} step={0.1} onChange={setSalt} />
                    <NumberField label="Yeast / Starter" suffix="%" value={leavening} min={0} step={0.1} onChange={setLeavening} />

                    <p className="total-target">
                        Target dough weight: <strong>{round(totalWeight)} g</strong>
                    </p>
                </section>

                <section className="panel results">
                    <h2>Recipe</h2>
                    <table className="recipe-table">
                        <thead>
                            <tr>
                                <th>Ingredient</th>
                                <th>Baker&apos;s %</th>
                                <th>Grams</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Flour</td>
                                <td>100%</td>
                                <td>{recipe.flour} g</td>
                            </tr>
                            <tr>
                                <td>Water</td>
                                <td>{round(hydration, 1)}%</td>
                                <td>{recipe.water} g</td>
                            </tr>
                            <tr>
                                <td>Salt</td>
                                <td>{round(salt, 1)}%</td>
                                <td>{recipe.salt} g</td>
                            </tr>
                            <tr>
                                <td>Yeast / Starter</td>
                                <td>{round(leavening, 1)}%</td>
                                <td>{recipe.leavening} g</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr>
                                <td>Total dough</td>
                                <td>&mdash;</td>
                                <td>{recipe.total} g</td>
                            </tr>
                        </tfoot>
                    </table>
                </section>
            </div>
        </div>
    );
};

export default BreadCalculator;
