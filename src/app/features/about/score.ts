import { Assessment, Requirement } from '../../models/requirement.model';

const SCORES: Record<Assessment, 0 | 1 | 2> = {
  штатно: 2,
  'с доработкой': 1,
  'не реализуется': 0,
};

export function scoreOf(assessment: Assessment): 0 | 1 | 2 {
  return SCORES[assessment];
}

export interface Score {
  score: number;
  max: number;
}

export function totalScore(items: Requirement[]): Score {
  const scored = items.filter((item) => item.extra !== true);
  return {
    score: scored.reduce((sum, item) => sum + scoreOf(item.assessment), 0),
    max: scored.length * 2,
  };
}
