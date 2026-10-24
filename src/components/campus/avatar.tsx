import type { InterestAvatar as Avatar } from '@/lib/campus-model';
export function InterestAvatar({ avatar, size = 88, label = 'Farmer avatar' }: { avatar: Avatar; size?: number; label?: string }) {
 const variant=avatar.interests.includes('sport')?'giocatore-giallo':avatar.interests.includes('business')?'marco':avatar.interests.includes('community')?'giulia-saluta':'giulia';
 return <img className="cp-avatar" src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/brand/farmer-${variant}.svg`} width={size} height={size} alt={label} style={{objectFit:'contain'}}/>;
}
