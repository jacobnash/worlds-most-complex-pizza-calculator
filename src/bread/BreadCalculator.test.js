import React from 'react';
import { render, screen } from '@testing-library/react-native';
import BreadCalculator, {
  computeBakeSchedule,
  computePrefermentPeakHours,
  computeRecipe,
  computeStarterFeed,
  computeStarterPlan,
  computeLevainPeakHours,
  computeTiming,
  computeYeastPlan,
  clampLeavening,
  clampSliderValue,
  formatDateTime,
  formatDuration,
  getLeaveningSliderRange,
  getDynamicSliderRange,
  HYDRATION_SLIDER,
  SALT_SLIDER,
  LEAVENINGS,
  parseBakeDateTime,
  PRESETS,
  subtractHours,
} from './BreadCalculator';

jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockSlider = (props) => <View testID="slider" {...props} />;
  MockSlider.displayName = 'MockSlider';
  return MockSlider;
});

describe('computeRecipe (baker\'s percentages)', () => {
  test('solves flour from the target dough weight and derives the rest', () => {
    // Neapolitan Pizza style: 4 x 250g = 1000g target, instant yeast.
    const recipe = computeRecipe({ totalWeight: 1000, hydration: 60, salt: 2.8, leavening: 0.2, leaveningType: 'Instant Yeast' });
    expect(recipe.flour).toBe(613);
    expect(recipe.water).toBe(368);
    expect(recipe.salt).toBe(17.2);
    expect(recipe.leavening).toBe(1.2);
    expect(recipe.total).toBe(1000);
  });

  test('100% hydration means water equals flour', () => {
    const recipe = computeRecipe({ totalWeight: 1000, hydration: 100, salt: 0, leavening: 0 });
    expect(recipe.water).toBe(recipe.flour);
  });

  test('commercial yeast does not contribute flour or water', () => {
    const recipe = computeRecipe({ totalWeight: 1000, hydration: 65, salt: 2, leavening: 1.5, leaveningType: 'Cake Yeast' });
    expect(recipe.contributesToDough).toBe(false);
    expect(recipe.starterFlour).toBe(0);
    expect(recipe.starterWater).toBe(0);
    expect(recipe.trueHydration).toBe(65);
  });

  test('sourdough starter (100% hydration) adds equal flour and water and raises true hydration', () => {
    const recipe = computeRecipe({ totalWeight: 1000, hydration: 70, salt: 2, leavening: 20, leaveningType: 'Sourdough Starter' });
    expect(recipe.contributesToDough).toBe(true);
    // A 100% hydration starter is half flour, half water.
    expect(recipe.starterFlour).toBe(recipe.starterWater);
    expect(recipe.totalFlour).toBeGreaterThan(recipe.flour);
    expect(recipe.totalWater).toBeGreaterThan(recipe.water);
    // Added water is 70% of base flour; folding in the starter's equal parts
    // pulls the true hydration up toward 100%.
    expect(recipe.trueHydration).toBeGreaterThan(70);
    expect(recipe.trueHydration).toBeLessThan(100);
  });

  test('poolish and biga contribute flour and water and need yeast in both stages', () => {
    const poolish = computeRecipe({ totalWeight: 1000, hydration: 70, salt: 2, leavening: 20, leaveningType: 'Poolish' });
    expect(poolish.contributesToDough).toBe(true);
    expect(poolish.isPreferment).toBe(true);
    expect(poolish.starterFlour).toBe(poolish.starterWater);

    const poolishYeast = computeYeastPlan({ recipe: poolish, leaveningType: 'Poolish', temperature: 24 });
    expect(poolishYeast.prefermentYeastPercent).toBe(0.1);
    expect(poolishYeast.prefermentYeastGrams).toBeGreaterThan(0);
    expect(poolishYeast.finalYeastGrams).toBeGreaterThan(0);

    const biga = computeRecipe({ totalWeight: 1000, hydration: 70, salt: 2, leavening: 30, leaveningType: 'Biga' });
    expect(biga.contributesToDough).toBe(true);
    expect(biga.isPreferment).toBe(true);
    expect(biga.starterWater).toBeLessThan(biga.starterFlour);

    const bigaYeast = computeYeastPlan({ recipe: biga, leaveningType: 'Biga', temperature: 24 });
    expect(bigaYeast.prefermentYeastPercent).toBe(0.3);
    expect(bigaYeast.prefermentYeastGrams).toBeGreaterThan(0);
    expect(bigaYeast.finalYeastGrams).toBeGreaterThan(0);
  });

  test('cake yeast default dose is ~3x instant yeast', () => {
    expect(LEAVENINGS['Cake Yeast'].defaultPercent).toBeCloseTo(LEAVENINGS['Instant Yeast'].defaultPercent * 3);
  });
});

describe('computeStarterFeed', () => {
  test('feeds 25 g seed back to 200 g at 100% hydration', () => {
    const feed = computeStarterFeed({ seedWeight: 25, targetTotal: 200, starterHydration: 100 });
    expect(feed).toMatchObject({
      seedWeight: 25,
      targetTotal: 200,
      addFlour: 87.5,
      addWater: 87.5,
      addTotal: 175,
      inoculumPercent: 12.5,
    });
  });
});

describe('computeLevainPeakHours', () => {
  test('1:1:1 build peaks in about 5 h at 24°C', () => {
    const hours = computeLevainPeakHours({ seedWeight: 33, targetTotal: 99, temperature: 24 });
    expect(hours).toBeCloseTo(5);
  });

  test('a smaller seed share takes longer to peak', () => {
    const fast = computeLevainPeakHours({ seedWeight: 33, targetTotal: 99, temperature: 24 });
    const slow = computeLevainPeakHours({ seedWeight: 25, targetTotal: 125, temperature: 24 });
    expect(slow).toBeGreaterThan(fast);
  });
});

describe('computeStarterPlan', () => {
  test('matches a 200 g jar with 25 g kept and enough discard for country sourdough', () => {
    const recipe = computeRecipe({
      totalWeight: 900,
      hydration: 72,
      salt: 2,
      leavening: 20,
      leaveningType: 'Sourdough Starter',
    });
    const plan = computeStarterPlan({
      jarWeight: 200,
      seedKept: 25,
      targetTotal: 200,
      doughStarterNeed: recipe.leavening,
      discardOnHand: 175,
      temperature: 24,
    });
    expect(plan.discardOnHand).toBe(175);
    expect(plan.coversDough).toBe(true);
    expect(plan.shortfall).toBe(0);
    expect(plan.surplus).toBeGreaterThan(0);
    expect(plan.doughStarter.strategy).toBe('discard');
    expect(plan.doughStarter.peakHours).toBe(0);
    expect(plan.motherFeed.peakHours).toBeGreaterThan(plan.doughStarter.peakHours);
  });

  test('uses the discard on hand you specify instead of assuming a full jar', () => {
    const recipe = computeRecipe({
      totalWeight: 900,
      hydration: 72,
      salt: 2,
      leavening: 40,
      leaveningType: 'Sourdough Starter',
    });
    const plan = computeStarterPlan({
      jarWeight: 200,
      seedKept: 25,
      targetTotal: 200,
      doughStarterNeed: recipe.leavening,
      discardOnHand: 100,
      temperature: 24,
    });
    expect(plan.discardOnHand).toBe(100);
    expect(plan.coversDough).toBe(false);
    expect(plan.doughStarter.strategy).toBe('partial');
    expect(plan.doughStarter.useFromDiscard).toBe(100);
    expect(plan.doughStarter.targetTotal).toBeGreaterThan(0);
    expect(plan.doughStarter.peakHours).toBeGreaterThan(0);
  });

  test('builds a levain when there is no discard on hand', () => {
    const plan = computeStarterPlan({
      jarWeight: 200,
      seedKept: 25,
      targetTotal: 200,
      doughStarterNeed: 250,
      discardOnHand: 0,
      temperature: 24,
    });
    expect(plan.coversDough).toBe(false);
    expect(plan.doughStarter.strategy).toBe('build');
    expect(plan.doughStarter.useFromDiscard).toBe(0);
    expect(plan.doughStarter.targetTotal).toBe(250);
    expect(plan.doughStarter.peakHours).toBeGreaterThan(0);
  });
});

describe('computeTiming (fermentation time)', () => {
  test('more yeast means a shorter bulk ferment', () => {
    const less = computeTiming({ leaveningType: 'Instant Yeast', leavening: 0.25, temperature: 24 });
    const more = computeTiming({ leaveningType: 'Instant Yeast', leavening: 1, temperature: 24 });
    expect(more.bulkHours).toBeLessThan(less.bulkHours);
    // Instant yeast at 1% and 24°C is the ~2h reference point.
    expect(more.bulkHours).toBeCloseTo(2);
  });

  test('cake yeast ferments like instant yeast at ~3x the dose (same power)', () => {
    const instant = computeTiming({ leaveningType: 'Instant Yeast', leavening: 0.5, temperature: 24 });
    const cake = computeTiming({ leaveningType: 'Cake Yeast', leavening: 1.5, temperature: 24 });
    expect(cake.bulkHours).toBeCloseTo(instant.bulkHours);
  });

  test('warmer dough ferments faster (Q10 ~ 2 per 10°C)', () => {
    const cool = computeTiming({ leaveningType: 'Instant Yeast', leavening: 1, temperature: 24 });
    const warm = computeTiming({ leaveningType: 'Instant Yeast', leavening: 1, temperature: 34 });
    expect(warm.bulkHours).toBeCloseTo(cool.bulkHours / 2);
  });

  test('more sourdough starter shortens the bulk ferment', () => {
    const less = computeTiming({ leaveningType: 'Sourdough Starter', leavening: 10, temperature: 24 });
    const more = computeTiming({ leaveningType: 'Sourdough Starter', leavening: 20, temperature: 24 });
    expect(more.bulkHours).toBeLessThan(less.bulkHours);
  });

  test('poolish bulk timing follows final-dough yeast, not preferment size', () => {
    const small = computeTiming({ leaveningType: 'Poolish', leavening: 10, temperature: 24 });
    const large = computeTiming({ leaveningType: 'Poolish', leavening: 40, temperature: 24 });
    expect(small.bulkHours).toBe(large.bulkHours);
    expect(small.bulkHours).toBe(3);
  });
});

describe('computePrefermentPeakHours', () => {
  test('more poolish peaks sooner', () => {
    const less = computePrefermentPeakHours({ leaveningType: 'Poolish', leavening: 10, temperature: 24 });
    const more = computePrefermentPeakHours({ leaveningType: 'Poolish', leavening: 20, temperature: 24 });
    expect(more).toBeLessThan(less);
    expect(more).toBeCloseTo(12);
  });

  test('biga peaks slower than poolish at the same percent', () => {
    const poolish = computePrefermentPeakHours({ leaveningType: 'Poolish', leavening: 20, temperature: 24 });
    const biga = computePrefermentPeakHours({ leaveningType: 'Biga', leavening: 20, temperature: 24 });
    expect(biga).toBeGreaterThan(poolish);
  });

  test('returns zero for sourdough starter (handled by starter plan)', () => {
    expect(computePrefermentPeakHours({ leaveningType: 'Sourdough Starter', leavening: 20, temperature: 24 })).toBe(0);
  });
});

describe('computeBakeSchedule', () => {
  test('works backwards from a target bake time', () => {
    const targetBakeTime = new Date(2026, 6, 7, 8, 0, 0);
    const timing = computeTiming({ leaveningType: 'Instant Yeast', leavening: 1, temperature: 24 });
    const schedule = computeBakeSchedule({
      targetBakeTime,
      timing,
      leaveningType: 'Instant Yeast',
    });

    expect(schedule.bake.getTime()).toBe(targetBakeTime.getTime());
    expect(schedule.steps[schedule.steps.length - 1].label).toBe('Bake');
    expect(schedule.steps[0].label).toBe('Mix dough (autolyse)');
    expect(schedule.mixStart.getTime()).toBe(
      subtractHours(targetBakeTime, timing.totalHours + 20 / 60).getTime()
    );
  });

  test('includes preferment step for poolish', () => {
    const targetBakeTime = new Date(2026, 6, 7, 8, 0, 0);
    const timing = computeTiming({ leaveningType: 'Poolish', leavening: 20, temperature: 24 });
    const prefermentPeakHours = computePrefermentPeakHours({ leaveningType: 'Poolish', leavening: 20, temperature: 24 });
    const schedule = computeBakeSchedule({
      targetBakeTime,
      timing,
      leaveningType: 'Poolish',
      prefermentPeakHours,
    });

    expect(schedule.steps[0].label).toBe('Mix poolish');
    expect(schedule.prefermentStart.getTime()).toBe(
      subtractHours(schedule.mixStart, prefermentPeakHours).getTime()
    );
  });
});

describe('parseBakeDateTime and formatDateTime', () => {
  test('parses YYYY-MM-DD and HH:MM', () => {
    const parsed = parseBakeDateTime('2026-07-07', '08:00');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(7);
    expect(parsed.getHours()).toBe(8);
    expect(parsed.getMinutes()).toBe(0);
  });

  test('formats a readable date string', () => {
    const formatted = formatDateTime(new Date(2026, 6, 7, 8, 0, 0));
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/Jul/);
  });
});

describe('clampLeavening', () => {
  test('clamps to the slider range for each leavening type', () => {
    expect(clampLeavening(3, 'Sourdough Starter')).toBe(5);
    expect(clampLeavening(25, 'Sourdough Starter')).toBe(25);
    expect(clampLeavening(99, 'Sourdough Starter')).toBe(40);
    expect(getLeaveningSliderRange('Poolish').max).toBe(50);
  });
});

describe('clampSliderValue', () => {
  test('clamps hydration and salt sliders', () => {
    expect(clampSliderValue(45, HYDRATION_SLIDER)).toBe(50);
    expect(clampSliderValue(72, HYDRATION_SLIDER)).toBe(72);
    expect(clampSliderValue(110, HYDRATION_SLIDER)).toBe(100);
    expect(clampSliderValue(2.23, SALT_SLIDER)).toBe(2.2);
    expect(clampSliderValue(5, SALT_SLIDER)).toBe(4);
  });
});

describe('getDynamicSliderRange', () => {
  test('recentres salt around the current value', () => {
    expect(getDynamicSliderRange(2, SALT_SLIDER, { min: 0, max: 6, step: 0.1 })).toMatchObject({
      min: 0,
      max: 4,
    });
    expect(getDynamicSliderRange(4, SALT_SLIDER, { min: 0, max: 6, step: 0.1 })).toMatchObject({
      min: 2,
      max: 6,
    });
  });
});

describe('formatDuration', () => {
  test('formats hours and minutes', () => {
    expect(formatDuration(2)).toBe('2 h');
    expect(formatDuration(2.5)).toBe('2 h 30 min');
    expect(formatDuration(0.5)).toBe('30 min');
    expect(formatDuration(0)).toBe('—');
  });
});

describe('PRESETS', () => {
  test('includes focaccia and lunch bread with sensible defaults', () => {
    expect(PRESETS.Focaccia).toMatchObject({
      hydration: 78,
      unitLabel: 'pans',
      leaveningType: 'Instant Yeast',
    });
    expect(PRESETS['Lunch Bread']).toMatchObject({
      hydration: 64,
      unitLabel: 'loaves',
      leaveningType: 'Instant Yeast',
    });
  });
});

describe('BreadCalculator', () => {
  test('renders the calculator heading and a flour row', () => {
    render(<BreadCalculator />);
    expect(screen.getByText('Hydration Bread Calculator')).toBeTruthy();
    expect(screen.getByText('Flour')).toBeTruthy();
    expect(screen.getAllByTestId('slider').length).toBeGreaterThanOrEqual(4);
  });

  test('defaults to the Country Sourdough preset using a sourdough starter', () => {
    render(<BreadCalculator />);
    // The leavening row is labelled with the selected leavening type.
    expect(screen.getAllByText('Sourdough Starter').length).toBeGreaterThan(0);
    expect(screen.getByText('Feed & bake')).toBeTruthy();
    expect(screen.getByText('Discard on hand')).toBeTruthy();
    expect(screen.getByText('Starter for this dough')).toBeTruthy();
  });

  test('shows the method steps and timing', () => {
    render(<BreadCalculator />);
    expect(screen.getByText('Method')).toBeTruthy();
    expect(screen.getAllByText('Bulk ferment').length).toBeGreaterThan(0);
    expect(screen.getByText('Total rise')).toBeTruthy();
    expect(screen.getByText('Bake schedule')).toBeTruthy();
    expect(screen.getByText('When to start')).toBeTruthy();
  });

  test('links to pizza.nash.engineering in the footer', () => {
    render(<BreadCalculator />);
    expect(screen.getByText('pizza.nash.engineering')).toBeTruthy();
  });
});
