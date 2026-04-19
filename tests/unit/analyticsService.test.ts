jest.mock('@/config/database', () => require('../helpers/mockDeps').dbMock);

import { getPlatformActivity } from '@/features/analytics/analyticsService';
import { dbMock } from '../helpers/mockDeps';

const { pool } = dbMock;

describe('analyticsService.getPlatformActivity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns parsed counts from 4 parallel queries', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '12' }] }) // disputes
      .mockResolvedValueOnce({ rows: [{ count: '10070' }] }) // completed
      .mockResolvedValueOnce({ rows: [{ count: '350' }] }) // ongoing
      .mockResolvedValueOnce({ rows: [{ count: '28450' }] }); // active users

    const result = await getPlatformActivity();

    expect(result).toMatchObject({
      disputes: 12,
      completedTransactions: 10070,
      ongoingTransactions: 350,
      activeUsers: 28450,
    });
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns 0 for missing tables (error 42P01)', async () => {
    const missingTableErr = Object.assign(new Error('relation "disputes" does not exist'), {
      code: '42P01',
    });
    pool.query
      .mockRejectedValueOnce(missingTableErr)
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockRejectedValueOnce(missingTableErr)
      .mockResolvedValueOnce({ rows: [{ count: '100' }] });

    const result = await getPlatformActivity();

    expect(result.disputes).toBe(0);
    expect(result.completedTransactions).toBe(5);
    expect(result.ongoingTransactions).toBe(0);
    expect(result.activeUsers).toBe(100);
  });

  it('falls back to 0 on any other DB error (fail closed)', async () => {
    pool.query
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce({ rows: [{ count: '7' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ count: '42' }] });

    const result = await getPlatformActivity();

    expect(result.disputes).toBe(0);
    expect(result.completedTransactions).toBe(7);
    expect(result.ongoingTransactions).toBe(3);
    expect(result.activeUsers).toBe(42);
  });

  it('handles empty results gracefully', async () => {
    pool.query.mockResolvedValue({ rows: [] });
    const result = await getPlatformActivity();
    expect(result.disputes).toBe(0);
    expect(result.completedTransactions).toBe(0);
    expect(result.ongoingTransactions).toBe(0);
    expect(result.activeUsers).toBe(0);
  });
});
