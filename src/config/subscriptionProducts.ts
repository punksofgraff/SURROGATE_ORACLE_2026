export interface SubscriptionProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  period: string;
  popular?: boolean;
  features: string[];
  cultureCoinsMultiplier?: number;
}

export const subscriptionProducts: SubscriptionProduct[] = [
  {
    id: 'seeker_monthly',
    title: 'SEEKER',
    description: 'Unlimited Oracle + 2x Coins',
    price: 2.99,
    currency: 'USD',
    period: 'monthly',
    features: [
      'Unlimited Oracle conversations',
      '2x Culture Coin multiplier',
      'Basic consciousness tracking',
      'Email support'
    ],
    cultureCoinsMultiplier: 2
  },
  {
    id: 'trans_humanist_monthly',
    title: 'TRANS-HUMANIST',
    description: 'Premium AI + 3x Coins',
    price: 5.99,
    currency: 'USD',
    period: 'monthly',
    popular: true,
    features: [
      'Premium AI models access',
      '3x Culture Coin multiplier',
      'Advanced consciousness metrics',
      'Priority Oracle responses',
      'Exclusive FreakDali portraits'
    ],
    cultureCoinsMultiplier: 3
  },
  {
    id: 'cultural_architect_monthly',
    title: 'CULTURAL ARCHITECT',
    description: 'Full evolution + 5x Coins',
    price: 9.99,
    currency: 'USD',
    period: 'monthly',
    features: [
      'All premium features',
      '5x Culture Coin multiplier',
      'Full consciousness evolution',
      'Custom portrait generation',
      'Direct oracle communication',
      'Early access to new features'
    ],
    cultureCoinsMultiplier: 5
  }
];