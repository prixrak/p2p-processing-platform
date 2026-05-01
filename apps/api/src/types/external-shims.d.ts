/** Minimal shims for packages without bundled TypeScript types. */
declare module 'tronweb' {
  export const TronWeb: any;
}

declare module 'hdkey' {
  const HDKey: any;
  export default HDKey;
}
