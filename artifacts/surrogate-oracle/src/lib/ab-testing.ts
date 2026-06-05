/**
 * SURROGATE: ORACLE — Non-Destructive A/B Testing
 * 
 * Test the texture, never the ritual.
 */
import { trackOracleEvent } from './analytics';

export type ABTestVariant = 'control' | 'elevated' | 'slower';

interface ABTest {
  name: string;
  variants: ABTestVariant[];
  default: ABTestVariant;
}

const TESTS: ABTest[] = [
  {
    name: 'dormant_atmosphere_density',
    variants: ['control', 'elevated'],
    default: 'control'
  },
  {
    name: 'ghost_text_spawn_gap',
    variants: ['control', 'slower'],
    default: 'control'
  }
];

export const getABVariant = (testName: string): ABTestVariant => {
  const test = TESTS.find(t => t.name === testName);
  if (!test) return 'control';

  const storageKey = `oracle_ab_${testName}`;
  const stored = localStorage.getItem(storageKey) as ABTestVariant;

  if (stored && test.variants.includes(stored)) {
    return stored;
  }

  // Assign new variant
  const assigned = test.variants[Math.floor(Math.random() * test.variants.length)];
  localStorage.setItem(storageKey, assigned);
  
  trackOracleEvent({ event: 'oracle_ab_variant', test_name: testName, variant: assigned });
  
  return assigned;
};
