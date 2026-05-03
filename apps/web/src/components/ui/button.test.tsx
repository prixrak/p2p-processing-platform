import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('secondary and ghost variants include active-state classes', () => {
    expect(renderToStaticMarkup(<Button variant="secondary">x</Button>)).toContain(
      'active:bg-bg-secondary',
    );
    expect(renderToStaticMarkup(<Button variant="ghost">x</Button>)).toContain(
      'active:bg-bg-secondary',
    );
  });
});
