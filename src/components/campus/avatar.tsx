import type { InterestAvatar as Avatar } from '@/lib/campus-model';

export function InterestAvatar({ avatar, size = 88, label = 'Interest avatar' }: { avatar: Avatar; size?: number; label?: string }) {
  const has = (id: Avatar['interests'][number]) => avatar.interests.includes(id);
  return <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label} className="cp-avatar">
    <circle cx="60" cy="60" r="59" fill={avatar.colour} fillOpacity=".13"/>
    <ellipse cx="60" cy="102" rx="29" ry="5" fill={avatar.colour} fillOpacity=".14"/>
    <path d="M32 89V62C32 40 42 29 60 29S88 40 88 62V89C77 101 43 101 32 89Z" fill={avatar.colour}/>
    <path d="M39 61C39 49 48 44 60 44S81 49 81 61V75C81 88 39 88 39 75Z" fill="#f9f7ee"/>
    <path d="M49 65V69M71 65V69" stroke="#353d32" strokeWidth="4.5" strokeLinecap="round"/>
    <path d="M55 77Q60 80 65 77" stroke="#64765d" strokeWidth="2" strokeLinecap="round" fill="none"/>
    <path d="M44 96V103M76 96V103" stroke={avatar.colour} strokeWidth="8" strokeLinecap="round"/>
    <path d="M31 67L24 78M89 67L96 78" stroke={avatar.colour} strokeWidth="7" strokeLinecap="round"/>
    {has('technology') && <g><path d="M60 29V19" stroke={avatar.colour} strokeWidth="3"/><circle cx="60" cy="16" r="5" fill="#c3ac65"/></g>}
    {has('sustainability') && <g><path d="M61 31V19" stroke="#5e7e50" strokeWidth="2"/><path d="M61 25C47 25 48 13 48 13C60 12 64 19 61 25Z" fill="#829c64"/><path d="M61 22C61 10 73 11 73 11C74 20 67 24 61 22Z" fill="#a2b386"/></g>}
    {has('arts') && <g><path d="M34 39C40 20 75 18 86 38Z" fill="#bd846e"/><path d="M59 25L63 19" stroke="#936552" strokeWidth="3" strokeLinecap="round"/></g>}
    {has('music') && <g fill="none" stroke="#d4b86e" strokeWidth="5"><path d="M31 59V51C31 17 89 17 89 51V59"/><path d="M31 56V71M89 56V71" strokeWidth="9" strokeLinecap="round"/></g>}
    {has('business') && <g><path d="M35 90L86 44" stroke="#ddba89" strokeWidth="4"/><rect x="72" y="77" width="23" height="18" rx="4" fill="#c59b70"/><path d="M79 77V73H88V77" stroke="#9f7956" strokeWidth="2" fill="none"/></g>}
    {has('design') && <g transform="rotate(19 25 83)"><path d="M22 65H28V93L25 99L22 93Z" fill="#d4b161"/><path d="M22 65H28V70H22Z" fill="#cb8f83"/><path d="M23 95L25 99L27 95" fill="#424e37"/></g>}
    {has('sport') && <g stroke="#8d9c7a" strokeWidth="2"><ellipse cx="99" cy="73" rx="9" ry="12" fill="#e7ebdc"/><path d="M94 64L103 81M91 73H107M99 61V85M99 85V99"/></g>}
    {has('community') && <g><path d="M43 91L60 86L77 91V103L60 98L43 103Z" fill="#d8debf"/><path d="M60 86V98" stroke="#a1ae82" strokeWidth="1.5"/></g>}
  </svg>;
}
