import { hashPassword, verifyPassword } from '@/utils/password';

jest.setTimeout(15_000);

describe('password utilities', () => {
  it('hashes produce a bcrypt-formatted string', async () => {
    const hash = await hashPassword('MyStrongPassw0rd!');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash.length).toBeGreaterThan(55);
  });

  it('verifyPassword returns true for matching passwords', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple');
    await expect(verifyPassword('CorrectHorseBatteryStaple', hash)).resolves.toBe(true);
  });

  it('verifyPassword returns false for wrong passwords', async () => {
    const hash = await hashPassword('RightOne');
    await expect(verifyPassword('WrongOne', hash)).resolves.toBe(false);
  });

  it('two hashes of the same password differ (salting works)', async () => {
    const p = 'samePassword123';
    const [a, b] = await Promise.all([hashPassword(p), hashPassword(p)]);
    expect(a).not.toBe(b);
    await expect(verifyPassword(p, a)).resolves.toBe(true);
    await expect(verifyPassword(p, b)).resolves.toBe(true);
  });
});
