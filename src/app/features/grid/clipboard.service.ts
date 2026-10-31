import { Injectable } from '@angular/core';

/**
 * Запись в буфер обмена: `navigator.clipboard.writeText`, а без него (страница
 * по HTTP — не защищённый контекст) или при его отказе — скрытый `textarea`
 * и `document.execCommand('copy')`.
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  async copy(text: string): Promise<void> {
    const clipboard = navigator.clipboard;
    if (clipboard !== undefined) {
      try {
        await clipboard.writeText(text);
        return;
      } catch {
        // запасной путь ниже
      }
    }
    if (!copyThroughTextarea(text)) {
      throw new Error('Буфер обмена недоступен');
    }
  }
}

/** Ctrl+C или Cmd+C по физической клавише: работает в любой раскладке. */
export function isCopyShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyC'
  );
}

/** В поле ввода Ctrl+C копирует набранный текст, грид не вмешивается. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

/** Пользователь выделил текст мышью: Ctrl+C копирует его, а не выбор грида. */
export function hasTextSelection(): boolean {
  const selection = document.getSelection();
  return selection !== null && selection.toString() !== '';
}

/**
 * Выделенный `textarea` даёт `execCommand('copy')` что копировать; текст в буфер
 * кладёт обработчик `copy` как есть — `textarea.value` превращает `\r\n` в `\n`.
 */
function copyThroughTextarea(text: string): boolean {
  const previous = document.activeElement;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-10000px';
  textarea.style.opacity = '0';
  const putText = (event: ClipboardEvent): void => {
    if (event.clipboardData !== null) {
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
    }
  };
  textarea.addEventListener('copy', putText);
  document.body.appendChild(textarea);
  textarea.select();
  let copied: boolean;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    textarea.remove();
    if (previous instanceof HTMLElement) {
      previous.focus();
    }
  }
  return copied;
}
