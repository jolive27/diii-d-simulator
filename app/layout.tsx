import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'DIII-D Virtual Shot',description:'An educational tokamak workbench: particle and thermal evolution with fixed-boundary magnetic equilibrium.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
