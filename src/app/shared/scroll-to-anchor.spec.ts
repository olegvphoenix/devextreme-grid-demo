import { scrollToAnchor } from './scroll-to-anchor';

describe('scrollToAnchor', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    host.innerHTML = '<span id="columns"></span><span id="export"></span>';
    document.body.appendChild(host);
  });

  afterEach(() => host.remove());

  it('прокручивает к элементу с id из fragment', () => {
    const target = document.getElementById('export')!;
    const spy = spyOn(target, 'scrollIntoView');
    expect(scrollToAnchor('export')).toBeTrue();
    expect(spy).toHaveBeenCalledOnceWith({ block: 'start' });
  });

  it('без fragment или с неизвестным id ничего не делает', () => {
    const spy = spyOn(document.getElementById('columns')!, 'scrollIntoView');
    expect(scrollToAnchor(null)).toBeFalse();
    expect(scrollToAnchor('missing')).toBeFalse();
    expect(spy).not.toHaveBeenCalled();
  });
});
