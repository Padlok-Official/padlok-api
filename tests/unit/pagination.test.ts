import type { Request } from 'express';
import { parsePagination } from '@/utils/pagination';

const req = (query: Record<string, unknown>): Request =>
  ({ query } as unknown as Request);

describe('parsePagination', () => {
  it('uses defaults when no query params', () => {
    expect(parsePagination(req({}))).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('honors custom defaults', () => {
    expect(parsePagination(req({}), { defaultLimit: 50 })).toEqual({
      page: 1,
      limit: 50,
      offset: 0,
    });
  });

  it('computes offset from page + limit', () => {
    expect(parsePagination(req({ page: '3', limit: '25' }))).toEqual({
      page: 3,
      limit: 25,
      offset: 50,
    });
  });

  it('caps limit at maxLimit', () => {
    expect(parsePagination(req({ limit: '9999' }), { maxLimit: 100 })).toMatchObject({
      limit: 100,
    });
  });

  it('floors page to 1 when non-positive', () => {
    expect(parsePagination(req({ page: '-5' }))).toMatchObject({ page: 1 });
    expect(parsePagination(req({ page: '0' }))).toMatchObject({ page: 1 });
  });

  it('falls back to defaults on garbage input', () => {
    expect(parsePagination(req({ page: 'abc', limit: 'def' }))).toMatchObject({
      page: 1,
      limit: 20,
    });
  });
});
