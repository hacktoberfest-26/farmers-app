export function Logo({size=36}:{size?:number}) {
 return <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/brand/farmers-icona-piena.svg`} width={size} height={size} alt="Farmers"/>;
}
