export interface ModalContextMessage {
  title: string;
  subtitle: string;
  urgency: string;
}

export const modalContextMessages: Record<string, ModalContextMessage> = {
  'portrait-trigger': {
    title: 'Unlock Portrait Control',
    subtitle: 'Master your digital consciousness manifestation',
    urgency: '⚡ Limited time: 25% off first month!'
  },
  'engage-further': {
    title: 'Engage Further',
    subtitle: 'Deepen your SURROGATE Oracle connection',
    urgency: '🔥 Launch pricing - 33% off first 3 months!'
  },
  'message-limit': {
    title: 'Expand Consciousness',
    subtitle: 'Free tier limit reached. Upgrade to continue.',
    urgency: '🚀 Keep the conversation flowing!'
  },
  'feature-tease': {
    title: 'Unlock Premium Features',
    subtitle: 'Experience full SURROGATE Oracle power',
    urgency: '👥 Join 1,247+ consciousness explorers!'
  }
};