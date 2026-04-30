/** Minimal shims for packages without bundled TypeScript types. */
declare module 'tronweb' {
  const TronWeb: any;
  export default TronWeb;
}

declare module 'hdkey' {
  const HDKey: any;
  export default HDKey;
}
