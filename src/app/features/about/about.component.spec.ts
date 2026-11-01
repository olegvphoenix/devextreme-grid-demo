import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import packageJson from '../../../../package.json';
import locJson from '../../../assets/loc.json';
import { AboutComponent } from './about.component';
import requirementsJson from './requirements.json';
import { REQUIREMENTS } from './requirements';
import { totalScore } from './score';

describe('AboutComponent', () => {
  let fixture: ComponentFixture<AboutComponent>;

  const query = (selector: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(selector);
  const queryAll = (selector: string): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(selector));

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AboutComponent],
    });
    fixture = TestBed.createComponent(AboutComponent);
    fixture.detectChanges();
  });

  it('данные требований — из requirements.json, идентификаторы уникальны', () => {
    expect(REQUIREMENTS).toEqual(requirementsJson as typeof REQUIREMENTS);
    const ids = REQUIREMENTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('loc.json покрывает каждое требование и совпадает с его locFiles (npm run loc)', () => {
    const counted: Record<string, number> = locJson.requirements;
    const files: Record<string, number> = locJson.files;
    REQUIREMENTS.forEach((r) => {
      expect(counted[r.id]).withContext(r.id).toEqual(jasmine.any(Number));
      const sum = r.locFiles.reduce((acc, file) => acc + files[file], 0);
      expect(counted[r.id]).withContext(r.id).toBe(sum);
    });
  });

  it('версии пакетов — из package.json', () => {
    const cells = queryAll('[data-testid="about-version"]').map((cell) =>
      cell.textContent!.trim()
    );
    const { dependencies, devDependencies } = packageJson;
    expect(cells).toContain(`devextreme ${dependencies.devextreme}`);
    expect(cells).toContain(`@angular/core ${dependencies['@angular/core']}`);
    expect(cells).toContain(`typescript ${devDependencies.typescript}`);
  });

  it('в «Итогах» по строке на каждое требование, в порядке задания', () => {
    const rowIds = queryAll('[data-testid^="summary-row-"]').map((row) =>
      row.getAttribute('data-testid')!.replace('summary-row-', '')
    );
    expect(rowIds).toEqual(REQUIREMENTS.map((r) => r.id));
  });

  it('строка показывает оценку, ограничения и API требования', () => {
    const first = REQUIREMENTS[0];
    const row = query(`[data-testid="summary-row-${first.id}"]`)!;
    expect(row.textContent).toContain(first.title);
    expect(row.textContent).toContain(first.assessment);
    expect(row.textContent).toContain(first.limitations);
    first.apis.forEach((api) => expect(row.textContent).toContain(api));
  });

  it('ссылка на раздел демо — routerLink с fragment', () => {
    const withLink = REQUIREMENTS.find((r) => r.demoLink.includes('#'))!;
    const link = query(
      `[data-testid="summary-demo-link-${withLink.id}"]`
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(withLink.demoLink);
  });

  it('дополнения помечены и не входят в балл', () => {
    const extra = REQUIREMENTS.find((r) => r.extra === true)!;
    const row = query(`[data-testid="summary-row-${extra.id}"]`)!;
    expect(row.querySelector('[data-testid="summary-extra"]')).not.toBeNull();
    const expected = totalScore(REQUIREMENTS);
    expect(query('[data-testid="summary-score"]')!.textContent).toContain(
      `${expected.score} из ${expected.max}`
    );
  });

  it('колонка API названа по DevExtreme с примечанием про Kendo', () => {
    const header = query('[data-testid="summary-table"] thead')!.textContent!;
    expect(header).toContain('Использованные API DevExtreme');
    expect(query('[data-testid="summary-kendo-note"]')!.textContent).toContain(
      'Kendo'
    );
  });

  it('страница говорит, что XPO не использован', () => {
    expect(query('[data-testid="about-xpo"]')!.textContent).toContain('XPO');
  });
});
