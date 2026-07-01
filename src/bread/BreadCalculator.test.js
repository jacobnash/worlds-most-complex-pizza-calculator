import React from 'react';
import { render, screen } from '@testing-library/react-native';
import BreadCalculator, { computeRecipe } from './BreadCalculator';

describe('computeRecipe (baker\'s percentages)', () => {
  test('solves flour from the target dough weight and derives the rest', () => {
    // Neapolitan Pizza style: 4 x 250g = 1000g target.
    const recipe = computeRecipe({ totalWeight: 1000, hydration: 60, salt: 2.8, leavening: 0.2 });
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
});

describe('BreadCalculator', () => {
  test('renders the calculator heading and a flour row', () => {
    render(<BreadCalculator />);
    expect(screen.getByText('Hydration Bread Calculator')).toBeTruthy();
    expect(screen.getByText('Flour')).toBeTruthy();
  });
});
