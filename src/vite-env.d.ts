/// <reference types="vite/client" />

declare module 'mammoth/mammoth.browser.min.js';
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}
