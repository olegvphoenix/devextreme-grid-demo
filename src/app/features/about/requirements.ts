import { Requirement } from '../../models/requirement.model';
import requirementsJson from './requirements.json';

/** Требования задания с оценками; JSON — чтобы тот же файл читал scripts/count-loc.js. */
export const REQUIREMENTS: Requirement[] = requirementsJson as Requirement[];
