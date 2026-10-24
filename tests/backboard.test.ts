import { expect, it } from 'vitest';
import { BackboardGemma } from '../server/src/backboard';
import { anonymousPair, anonymise } from '../packages/anonymiser';
import { goalId, interestId, interests, skillId, sportId } from '../src/lib/campus-model';
const vocabulary={interests:interestId.options,skills:skillId.options,goals:goalId.options,sports:sportId.options};
const person={interests:['technology','unknown-email@example.test'],skills:['engineering'],lookingFor:['cofounder'],sports:[],name:'Private Name',privateIdea:'Secret startup text',id:'private-account-id'};

it('constructs an allowlisted object and keeps the catalogue and accepted vocabulary aligned',()=>{
  expect(anonymise(person,vocabulary)).toEqual({interests:['technology'],skills:['engineering'],looking_for:['cofounder'],sports:[]});
  expect(interests.map(item=>item.id).sort()).toEqual([...interestId.options].sort());
});

it('uses the explicit Gemma model, disables memory, strips unknown fields and cleans the task thread',async()=>{
  const calls:{url:string;body?:unknown}[]=[];
  const send:typeof fetch=async(input,init)=>{
    calls.push({url:String(input),body:typeof init?.body==='string'?JSON.parse(init.body):undefined});
    if(init?.method==='DELETE')return new Response('{}',{status:200});
    return Response.json({status:'COMPLETED',model_name:'google/gemma-4-26b-a4b-it',thread_id:'11111111-1111-4111-8111-111111111111',content:'{"score":85,"reasonCodes":["shared_interests"]}'});
  };
  const ai=new BackboardGemma({apiKey:'test-only-not-real',provider:'openrouter',model:'google/gemma-4-26b-a4b-it',fetch:send});
  expect(await ai.score(anonymousPair('cofounder',person,person,vocabulary))).toEqual({score:85,reasonCodes:['shared_interests']});
  expect(calls[0].body).toMatchObject({memory:'off',web_search:'off',model_name:ai.model,json_output:true});
  const sent=JSON.stringify(calls[0].body);
  expect(sent).not.toContain(person.name);
  expect(sent).not.toContain(person.privateIdea);
  expect(sent).not.toContain(person.id);
  expect(sent).not.toContain('unknown-email');
  expect(calls[1].url).toContain('/threads/11111111-1111-4111-8111-111111111111');
});

it('rejects unsafe model prose and still cleans known error-created threads',async()=>{
  let deleted=false;
  const send:typeof fetch=async(_input,init)=>{
    if(init?.method==='DELETE'){deleted=true;return Response.json({});}
    return Response.json({status:'FAILED',thread_id:'11111111-1111-4111-8111-111111111111',content:'sensitive upstream error'},{status:502});
  };
  const ai=new BackboardGemma({apiKey:'test-only',provider:'openrouter',model:'google/gemma-4-26b-a4b-it',fetch:send});
  await expect(ai.score(anonymousPair('cofounder',person,person,vocabulary))).rejects.toThrow('Gemma service unavailable (502)');
  expect(deleted).toBe(true);
});
