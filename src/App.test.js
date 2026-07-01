import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the hydration bread calculator heading', () => {
  render(<App />);
  const heading = screen.getByRole('heading', { name: /hydration bread calculator/i });
  expect(heading).toBeInTheDocument();
});

test('renders a flour row at 100% baker\'s percentage', () => {
  render(<App />);
  expect(screen.getByText(/flour/i)).toBeInTheDocument();
  expect(screen.getByText('100%')).toBeInTheDocument();
});
