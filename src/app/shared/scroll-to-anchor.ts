/**
 * Прокрутка к элементу с id из fragment маршрута. Штатный anchorScrolling
 * Angular 12 зовёт window.scrollTo, а страницы прокручиваются внутри
 * .app-content, поэтому прокрутка — через scrollIntoView самого элемента.
 */
export function scrollToAnchor(fragment: string | null): boolean {
  if (fragment === null || fragment === '') {
    return false;
  }
  const target = document.getElementById(fragment);
  if (target === null) {
    return false;
  }
  target.scrollIntoView({ block: 'start' });
  return true;
}
