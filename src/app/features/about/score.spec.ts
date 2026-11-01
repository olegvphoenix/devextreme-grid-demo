import { Requirement } from '../../models/requirement.model';
import { scoreOf, totalScore } from './score';

function requirement(partial: Partial<Requirement>): Requirement {
  return {
    id: 'r',
    title: 'Требование',
    assessment: 'штатно',
    locFiles: [],
    apis: [],
    limitations: '',
    demoLink: '',
    ...partial,
  };
}

describe('scoreOf', () => {
  it('штатно = да = 2', () => {
    expect(scoreOf('штатно')).toBe(2);
  });

  it('с доработкой = частично = 1', () => {
    expect(scoreOf('с доработкой')).toBe(1);
  });

  it('не реализуется = нет = 0', () => {
    expect(scoreOf('не реализуется')).toBe(0);
  });
});

describe('totalScore', () => {
  it('складывает баллы и считает максимум по 2 на требование', () => {
    const result = totalScore([
      requirement({ id: 'a', assessment: 'штатно' }),
      requirement({ id: 'b', assessment: 'с доработкой' }),
      requirement({ id: 'c', assessment: 'не реализуется' }),
    ]);
    expect(result).toEqual({ score: 3, max: 6 });
  });

  it('дополнения (extra) не входят ни в балл, ни в максимум', () => {
    const result = totalScore([
      requirement({ id: 'a', assessment: 'штатно' }),
      requirement({ id: 'x', assessment: 'штатно', extra: true }),
    ]);
    expect(result).toEqual({ score: 2, max: 2 });
  });

  it('пустой список даёт 0 из 0', () => {
    expect(totalScore([])).toEqual({ score: 0, max: 0 });
  });
});
