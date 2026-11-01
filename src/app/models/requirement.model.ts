/** Оценка покрытия требования DevExtreme: штатно = да, с доработкой = частично, не реализуется = нет. */
export type Assessment = 'штатно' | 'с доработкой' | 'не реализуется';

export interface Requirement {
  id: string;
  title: string;
  assessment: Assessment;
  /** Файлы своего кода, строки которых считает scripts/count-loc.js. */
  locFiles: string[];
  apis: string[];
  limitations: string;
  /** Маршрут с якорем раздела демо (`/grid#export`), пусто — ссылки нет. */
  demoLink: string;
  /** Дополнение сверх задания: в таблице есть, на балл не влияет. */
  extra?: boolean;
}
