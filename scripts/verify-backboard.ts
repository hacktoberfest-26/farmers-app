import { BackboardGemma } from '../server/src/backboard';
import { anonymousPair } from '../packages/anonymiser';
import { goalId, interestId, skillId, sportId } from '../src/lib/campus-model';

async function main() {
  if(!process.env.BACKBOARD_API_KEY)throw new Error('Set BACKBOARD_API_KEY in a private environment file');
  let cleanupFailed=false;
  const ai=new BackboardGemma({apiKey:process.env.BACKBOARD_API_KEY,provider:process.env.BACKBOARD_PROVIDER||'openrouter',model:process.env.BACKBOARD_MODEL||'google/gemma-4-26b-a4b-it',cleanupFailed:()=>{cleanupFailed=true;}});
  const vocabulary={interests:interestId.options,skills:skillId.options,goals:goalId.options,sports:sportId.options};
  const pair=anonymousPair('cofounder',
    {interests:['technology','sustainability','business'],skills:['engineering'],lookingFor:['cofounder'],sports:[]},
    {interests:['technology','sustainability','design'],skills:['design'],lookingFor:['join-project'],sports:[]},vocabulary);
  const result=await ai.score(pair);
  if(cleanupFailed)throw new Error('Inference succeeded but temporary thread cleanup failed');
  process.stdout.write(JSON.stringify({provider:'Backboard',model:ai.model,score:result.score,reasonCodes:result.reasonCodes,threadCleanup:true})+'\n');
}
void main().catch(error=>{process.stderr.write((error instanceof Error?error.message:'Backboard verification failed')+'\n');process.exitCode=1;});
