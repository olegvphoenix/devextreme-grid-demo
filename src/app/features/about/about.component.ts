import { Component } from '@angular/core';

import packageJson from '../../../../package.json';
import locJson from '../../../assets/loc.json';
import { Requirement } from '../../models/requirement.model';
import { REQUIREMENTS } from './requirements';
import { totalScore } from './score';

export interface PackageVersion {
  name: string;
  version: string;
}

/** Результат scripts/count-loc.js (npm run loc). */
interface LocReport {
  requirements: Record<string, number>;
  shared: number;
  files: Record<string, number>;
}

export interface SummaryRow {
  requirement: Requirement;
  /** Строк своего кода по locFiles; null — выделенных файлов нет, код в обвязке грида. */
  loc: number | null;
  locDetails: string;
  demoPath: string | null;
  demoFragment: string | null;
}

const LOC: LocReport = locJson;

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.css'],
})
export class AboutComponent {
  readonly dependencies = toVersions(packageJson.dependencies);
  readonly devDependencies = toVersions(packageJson.devDependencies);
  readonly rows: SummaryRow[] = REQUIREMENTS.map(toSummaryRow);
  readonly total = totalScore(REQUIREMENTS);
  readonly sharedLoc = LOC.shared;
  readonly counts = {
    stock: countOf('штатно'),
    partial: countOf('с доработкой'),
    none: countOf('не реализуется'),
  };

  trackById(_: number, row: SummaryRow): string {
    return row.requirement.id;
  }
}

function countOf(assessment: Requirement['assessment']): number {
  return REQUIREMENTS.filter(
    (r) => r.extra !== true && r.assessment === assessment
  ).length;
}

function toVersions(packages: Record<string, string>): PackageVersion[] {
  return Object.entries(packages).map(([name, version]) => ({
    name,
    version,
  }));
}

function toSummaryRow(requirement: Requirement): SummaryRow {
  const [demoPath, demoFragment] = splitLink(requirement.demoLink);
  const hasFiles = requirement.locFiles.length > 0;
  return {
    requirement,
    loc: hasFiles ? LOC.requirements[requirement.id] ?? 0 : null,
    locDetails: hasFiles
      ? requirement.locFiles
          .map((file) => `${file}: ${LOC.files[file] ?? '?'}`)
          .join('\n')
      : 'Код — в обвязке страницы грида (grid.component.*), не разнесён по требованиям',
    demoPath,
    demoFragment,
  };
}

/** `/grid#export` → путь и fragment для routerLink; без ссылки — оба null. */
function splitLink(link: string): [string | null, string | null] {
  if (link === '') {
    return [null, null];
  }
  const hash = link.indexOf('#');
  if (hash < 0) {
    return [link, null];
  }
  return [link.slice(0, hash), link.slice(hash + 1)];
}
