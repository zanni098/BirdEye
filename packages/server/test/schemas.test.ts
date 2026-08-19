import { describe, it, expect } from 'vitest';
import { CreateTaskSchema } from '../src/schemas.ts';

describe('CreateTaskSchema', () => {
  it('accepts valid input', () => {
    const result = CreateTaskSchema.safeParse({
      title: 'Build rocket',
      briefing: 'Launch to Mars',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Build rocket');
      expect(result.data.briefing).toBe('Launch to Mars');
    }
  });

  it('rejects missing title', () => {
    const result = CreateTaskSchema.safeParse({ briefing: 'Launch to Mars' });
    expect(result.success).toBe(false);
  });

  it('rejects empty title', () => {
    const result = CreateTaskSchema.safeParse({ title: '', briefing: 'Launch to Mars' });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields', () => {
    const result = CreateTaskSchema.safeParse({
      title: 'Build rocket',
      briefing: 'Launch to Mars',
      evilField: true,
    });
    expect(result.success).toBe(false);
  });
});