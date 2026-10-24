import { pushConfiguration } from './push';
import nodemailer from 'nodemailer';
import { BackboardGemma } from './backboard';
import type { CampusOptions } from './campus-routes';

export function campusConfiguration(env:NodeJS.ProcessEnv, cleanupFailed:()=>void):CampusOptions {
  const push=pushConfiguration(env);
  const ai=env.BACKBOARD_API_KEY?new BackboardGemma({apiKey:env.BACKBOARD_API_KEY,provider:env.BACKBOARD_PROVIDER||'openrouter',model:env.BACKBOARD_MODEL||'google/gemma-4-26b-a4b-it',cleanupFailed}):null;
  const sharedDemo=env.CAMPUS_DEMO_CODE?{code:env.CAMPUS_DEMO_CODE}:undefined;
  if(sharedDemo&&sharedDemo.code.length<8)throw new Error('CAMPUS_DEMO_CODE must contain at least 8 characters');
  const domains=(env.AUTH_EMAIL_DOMAINS||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  const smtpPort=Number(env.SMTP_PORT||587);
  if(!Number.isInteger(smtpPort)||smtpPort<1||smtpPort>65535)throw new Error('Invalid SMTP_PORT');
  if(env.SMTP_HOST&&env.SMTP_USER&&env.SMTP_PASSWORD&&env.SMTP_FROM&&domains.length&&env.OTP_SECRET) {
    if(env.OTP_SECRET.length<32)throw new Error('OTP_SECRET must contain at least 32 characters');
    const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:smtpPort,secure:smtpPort===465,requireTLS:true,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
    return {ai,push,sharedDemo,recoverOnStart:true,email:{domains,secret:env.OTP_SECRET,sendCode:async(email,code)=>{
      await transport.sendMail({from:env.SMTP_FROM,to:email,subject:'Your Farmers sign-in code',text:`Your Farmers sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`});
    }}};
  }
  return {ai,push,sharedDemo,recoverOnStart:true};
}
