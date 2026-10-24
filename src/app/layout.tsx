import type { Metadata, Viewport } from 'next';
import './globals.css';
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const metadata: Metadata = { title:'Farmers — Harvest your future',description:'Harvest your future. By shaping your identity. Discover sports, meet your community and play together.',manifest:`${base}/manifest.webmanifest`,icons:{icon:`${base}/icons/icon-192.png`,apple:`${base}/icons/icon-192.png`},appleWebApp:{capable:true,statusBarStyle:'default',title:'Farmers'} };
export const viewport:Viewport = { width:'device-width',initialScale:1,themeColor:'#faf9f6' };
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
