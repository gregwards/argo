import "./globals.css";

export const metadata = { title: "Argo — AI Oral Assessment", description: "Voice-based dynamic assessment platform" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://cdn.jsdelivr.net/npm/@fontsource/outfit@5/300.css" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/npm/@fontsource/outfit@5/400.css" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/npm/@fontsource/outfit@5/500.css" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/npm/@fontsource/outfit@5/800.css" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/npm/@fontsource/source-serif-4@5/400.css" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Ovo&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-white text-gray-900 antialiased font-outfit">{children}</body>
    </html>
  );
}
