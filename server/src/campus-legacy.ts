import type { CommunityState, Command } from '../../src/lib/model';

/** The archive must never become a second route to a campus member's identity. */
export function campusSafeLegacy(base:CommunityState, campusIds:Set<string>):CommunityState {
  const sessions=base.sessions.filter(session=>![session.organizerId,...session.participants,...session.pending,...session.waitlist,...session.invited].some(id=>campusIds.has(id)));
  const sessionsIds=new Set(sessions.map(session=>session.id));
  return {...base,profiles:base.profiles.filter(person=>!campusIds.has(person.id)),sessions,
    connections:base.connections.filter(edge=>!campusIds.has(edge.from)&&!campusIds.has(edge.to)),
    messages:base.messages.filter(message=>!campusIds.has(message.from)&&!campusIds.has(message.to)),
    comments:base.comments.filter(comment=>!campusIds.has(comment.authorId)&&sessionsIds.has(comment.sessionId)),
    blocks:base.blocks.filter(edge=>!campusIds.has(edge.from)&&!campusIds.has(edge.to)),
    reports:base.reports.filter(report=>!campusIds.has(report.reporterId)&&!campusIds.has(report.targetId))};
}
export function targetsCampus(command:Command,base:CommunityState,ids:Set<string>):boolean {
  if('userId' in command&&ids.has(command.userId))return true;
  if('targetId' in command&&ids.has(command.targetId))return true;
  if(command.type==='profile.save'&&ids.has(command.profile.id))return true;
  if(command.type==='session.create'&&[command.session.organizerId,...command.session.participants,...command.session.pending,...command.session.waitlist,...command.session.invited].some(id=>ids.has(id)))return true;
  if('id' in command) {
    const safe=campusSafeLegacy(base,ids);
    if(base.sessions.some(item=>item.id===command.id)&&!safe.sessions.some(item=>item.id===command.id))return true;
    if(base.connections.some(item=>item.id===command.id)&&!safe.connections.some(item=>item.id===command.id))return true;
    if(base.reports.some(item=>item.id===command.id)&&!safe.reports.some(item=>item.id===command.id))return true;
  }
  return false;
}
