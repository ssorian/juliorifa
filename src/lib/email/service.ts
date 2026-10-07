import '@tanstack/react-start/server-only'

export class EmailDeliveryError extends Error {
  constructor(public readonly code:'EMAIL_NOT_CONFIGURED'|'EMAIL_UNAVAILABLE'){super('Email delivery unavailable')}
}
export async function sendEmail(message:{to:string;subject:string;text:string;idempotencyKey?:string},transport:typeof fetch=fetch,config={key:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM}) {
  const {key,from}=config
  if(!key||!from) throw new EmailDeliveryError('EMAIL_NOT_CONFIGURED')
  try {
    if(message.idempotencyKey && !/^[A-Za-z0-9_/-]{1,256}$/.test(message.idempotencyKey)) throw new Error('Invalid delivery key')
    const response=await transport('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(message.idempotencyKey?{'Idempotency-Key':message.idempotencyKey}:{})},body:JSON.stringify({from,to:[message.to],subject:message.subject,text:message.text}),signal:AbortSignal.timeout(10000)})
    if(!response.ok) throw new Error('Delivery failed')
  } catch {throw new EmailDeliveryError('EMAIL_UNAVAILABLE')}
}
