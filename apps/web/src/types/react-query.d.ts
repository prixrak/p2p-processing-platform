import '@tanstack/react-query';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Skip global error toast (handle locally). */
      silentError?: boolean;
    };
  }
}
