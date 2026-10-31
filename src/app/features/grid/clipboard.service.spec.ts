import {
  ClipboardService,
  hasTextSelection,
  isCopyShortcut,
  isEditableTarget,
} from './clipboard.service';

describe('ClipboardService', () => {
  let service: ClipboardService;
  let execCommand: jasmine.Spy;
  let copiedThroughTextarea: string | null;

  function stubClipboard(
    clipboard: { writeText(t: string): Promise<void> } | undefined
  ): void {
    Object.defineProperty(navigator, 'clipboard', {
      value: clipboard,
      configurable: true,
    });
  }

  beforeEach(() => {
    service = new ClipboardService();
    copiedThroughTextarea = null;
    // Как браузер: execCommand('copy') шлёт событие copy выделенному элементу,
    // обработчик может подменить текст через clipboardData.
    execCommand = spyOn(document, 'execCommand').and.callFake(
      (command: string) => {
        const active = document.activeElement;
        if (command !== 'copy' || !(active instanceof HTMLTextAreaElement)) {
          return false;
        }
        const event = new ClipboardEvent('copy', {
          clipboardData: new DataTransfer(),
          cancelable: true,
        });
        active.dispatchEvent(event);
        copiedThroughTextarea = event.defaultPrevented
          ? event.clipboardData!.getData('text/plain')
          : active.value;
        return true;
      }
    );
  });

  afterEach(() => {
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it('пишет через navigator.clipboard, когда он есть', async () => {
    const writeText = jasmine
      .createSpy('writeText')
      .and.returnValue(Promise.resolve());
    stubClipboard({ writeText });
    await service.copy('a\tb');
    expect(writeText).toHaveBeenCalledWith('a\tb');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('без navigator.clipboard копирует через textarea и execCommand', async () => {
    stubClipboard(undefined);
    await service.copy('x\r\ny');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copiedThroughTextarea).toBe('x\r\ny');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('отказ writeText уходит в запасной путь', async () => {
    stubClipboard({ writeText: () => Promise.reject(new Error('denied')) });
    await service.copy('z');
    expect(copiedThroughTextarea).toBe('z');
  });

  it('запасной путь возвращает фокус туда, где он был', async () => {
    stubClipboard(undefined);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    await service.copy('z');
    expect(document.activeElement).toBe(button);
    button.remove();
  });

  it('если и execCommand не сработал — отказ', async () => {
    stubClipboard(undefined);
    execCommand.and.returnValue(false);
    await expectAsync(service.copy('z')).toBeRejected();
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('isCopyShortcut', () => {
  const key = (init: KeyboardEventInit): KeyboardEvent =>
    new KeyboardEvent('keydown', init);

  it('Ctrl+C и Cmd+C по физической клавише, раскладка не важна', () => {
    expect(isCopyShortcut(key({ ctrlKey: true, code: 'KeyC', key: 'c' })))
      .toBeTrue();
    expect(isCopyShortcut(key({ ctrlKey: true, code: 'KeyC', key: 'с' })))
      .toBeTrue();
    expect(isCopyShortcut(key({ metaKey: true, code: 'KeyC', key: 'c' })))
      .toBeTrue();
  });

  it('без модификатора, с Alt или другая клавиша — нет', () => {
    expect(isCopyShortcut(key({ code: 'KeyC', key: 'c' }))).toBeFalse();
    expect(
      isCopyShortcut(key({ ctrlKey: true, altKey: true, code: 'KeyC' }))
    ).toBeFalse();
    expect(isCopyShortcut(key({ ctrlKey: true, code: 'KeyV' }))).toBeFalse();
  });
});

describe('isEditableTarget', () => {
  it('поля ввода и contenteditable — редактируемые', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.appendChild(editable);
    expect(isEditableTarget(document.createElement('input'))).toBeTrue();
    expect(isEditableTarget(document.createElement('textarea'))).toBeTrue();
    expect(isEditableTarget(editable)).toBeTrue();
    editable.remove();
  });

  it('ячейка таблицы и null — нет', () => {
    expect(isEditableTarget(document.createElement('td'))).toBeFalse();
    expect(isEditableTarget(null)).toBeFalse();
  });
});

describe('hasTextSelection', () => {
  it('выделенный текст на странице есть — true, снято — false', () => {
    const span = document.createElement('span');
    span.textContent = 'текст';
    document.body.appendChild(span);
    const selection = document.getSelection()!;
    selection.selectAllChildren(span);
    expect(hasTextSelection()).toBeTrue();
    selection.removeAllRanges();
    expect(hasTextSelection()).toBeFalse();
    span.remove();
  });
});
