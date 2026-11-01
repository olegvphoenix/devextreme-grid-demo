import { toBinaryString } from './native-export';

describe('toBinaryString', () => {
  it('каждый байт — один символ с тем же кодом, включая старшие', () => {
    const bytes = new Uint8Array([0, 1, 0, 0, 255, 128, 65]);
    expect(toBinaryString(bytes.buffer)).toBe('\x00\x01\x00\x00\xff\x80A');
  });

  it('буфер длиннее одного куска собирается целиком и по порядку', () => {
    const bytes = new Uint8Array(70000);
    bytes.forEach((_, index) => (bytes[index] = index % 251));
    const text = toBinaryString(bytes.buffer);
    expect(text.length).toBe(70000);
    expect(text.charCodeAt(0)).toBe(0);
    expect(text.charCodeAt(32768)).toBe(32768 % 251);
    expect(text.charCodeAt(69999)).toBe(69999 % 251);
  });

  it('начало TTF распознаётся jsPDF как бинарная строка', () => {
    expect(
      /^\x00\x01\x00\x00/.test(
        toBinaryString(new Uint8Array([0, 1, 0, 0, 9]).buffer)
      )
    ).toBeTrue();
  });
});
