import React from 'react';
import { render, screen } from '@testing-library/react-native';
import BreadCalculator, { computeRecipe, LEAVENINGS } from './BreadCalculator';

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

  test('cake yeast default dose is ~3x instant yeast', () => {
    expect(LEAVENINGS['Cake Yeast'].defaultPercent).toBeCloseTo(LEAVENINGS['Instant Yeast'].defaultPercent * 3);
  });
});

describe('BreadCalculator', () => {
  test('renders the calculator heading and a flour row', () => {
    render(<BreadCalculator />);
    expect(screen.getByText('Hydration Bread Calculator')).toBeTruthy();
    expect(screen.getByText('Flour')).toBeTruthy();
  });

  test('defaults to the Country Sourdough preset using a sourdough starter', () => {
    render(<BreadCalculator />);
    // The leavening row is labelled with the selected leavening type.
    expect(screen.getAllByText('Sourdough Starter').length).toBeGreaterThan(0);
  });
});
