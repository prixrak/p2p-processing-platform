'use client';

import dynamic from 'next/dynamic';

const ExternalApiPlayground = dynamic(
  () =>
    import('@/features/external-api-playground').then((mod) => mod.ExternalApiPlayground),
  { ssr: false },
);

export default function ExternalApiPlaygroundPage() {
  return <ExternalApiPlayground />;
}
