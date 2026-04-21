'use client';

/** Shown when the image was built without `INCLUDE_EXTERNAL_PLAYGROUND=true` (real module not in bundle). */
export function ExternalApiPlayground() {
  return (
    <main style={{ padding: '1.5rem', fontFamily: 'system-ui' }}>
      <h1>External API Playground</h1>
      <p>
        This build does not include the playground. Rebuild the web image with{' '}
        <code>INCLUDE_EXTERNAL_PLAYGROUND=true</code>.
      </p>
    </main>
  );
}
