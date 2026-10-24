import { z } from 'zod';

// Only browser push providers may receive server requests.
export const pushEndpointSchema = z.url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
    && (url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com'
      || url.hostname.endsWith('.push.apple.com'));
}, 'Unsupported push provider');
export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }),
});
export type DeviceSubscription = z.infer<typeof pushSubscriptionSchema>;
export const pushStatusSchema = z.object({ publicKey: z.string().nullable(), enabled: z.boolean() });
export type PushStatus = z.infer<typeof pushStatusSchema>;
