import type { ShareKind } from '../../types';
import type { PhaseBucket } from './view';

// Plain-language suggestions for supporters. These are general and never
// replace what the person has asked for; their own notes are shown first.

interface Guidance {
  title: string;
  tips: string[];
}

const PARTNER: Record<PhaseBucket, Guidance> = {
  period: {
    title: 'On their period today',
    tips: [
      'Cramps and tiredness are common, especially in the first two days.',
      'Warmth helps many people: a heating pad or a warm drink.',
      'Ask what they need today; it can differ from last month.',
    ],
  },
  follicular: {
    title: 'The days after a period',
    tips: ['Energy often picks up in this part of the cycle.', 'A good stretch for plans that take more effort.'],
  },
  fertile: {
    title: 'Around the middle of the cycle',
    tips: ['Many people feel their most energetic now.', 'Nothing special is needed; carry on as usual.'],
  },
  luteal: {
    title: 'The second half of the cycle',
    tips: ['Energy can start to dip as the cycle goes on.', 'Small things, like sorting dinner, can take pressure off.'],
  },
  before: {
    title: 'A period is getting close',
    tips: [
      'Some people feel more tired, tense or low in these days.',
      'Check that supplies and pain relief are stocked.',
      'Patience goes a long way; avoid guessing at their mood out loud.',
    ],
  },
  late: {
    title: 'This period is later than expected',
    tips: [
      'Cycles shift for many ordinary reasons, including stress, travel and illness.',
      'Let them bring it up; a calm presence helps more than questions.',
    ],
  },
};

const PARENT: Record<PhaseBucket, Guidance> = {
  period: {
    title: 'A period has started',
    tips: [
      'Check there are enough pads or other supplies, including in the school bag.',
      'Cramps are common; warmth and rest help. Ask before offering pain relief.',
      'Keep it matter-of-fact. They chose to share this with you.',
    ],
  },
  follicular: { title: 'Between periods', tips: ['Nothing needed right now.'] },
  fertile: { title: 'Between periods', tips: ['Nothing needed right now.'] },
  luteal: { title: 'Between periods', tips: ['Nothing needed right now.'] },
  before: {
    title: 'A period may start soon',
    tips: ['A small kit in the school bag helps: pads, spare underwear, a sealable bag.', 'Make sure supplies at home are topped up.'],
  },
  late: {
    title: 'This period is later than expected',
    tips: [
      'Irregular cycles are very common in the first couple of years.',
      'There is usually no need to act; let them raise it if they want to.',
    ],
  },
};

const PARENT_MINIMAL: Record<'on' | 'off' | 'late', Guidance> = {
  on: PARENT.period,
  off: { title: 'No period right now', tips: ['Nothing needed. You will see here when the next one starts.'] },
  late: PARENT.late,
};

export function guidanceFor(kind: ShareKind, bucket: PhaseBucket | undefined, onPeriod: boolean, late: boolean): Guidance {
  if (bucket) return (kind === 'parent' ? PARENT : PARTNER)[bucket];
  // Without phase sharing only the basics are known.
  const basic = onPeriod ? 'on' : late ? 'late' : 'off';
  if (kind === 'parent') return PARENT_MINIMAL[basic];
  return basic === 'on' ? PARTNER.period : basic === 'late' ? PARTNER.late : { title: 'No period right now', tips: ['Nothing needed right now.'] };
}

export const FLAG_TEXT: Record<'irregular' | 'pain', string> = {
  irregular:
    'Cycles have varied a lot over several months. That is common early on, and a doctor can help if it continues.',
  pain: 'Strong pain has been logged in several cycles. Period pain that gets in the way of daily life is worth raising with a doctor.',
};
