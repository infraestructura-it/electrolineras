import { Html, Head, Main, NextScript } from 'next/document';

export default function Documento() {
  return (
    <Html lang="es">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <meta name="theme-color" content="#0F1828" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
