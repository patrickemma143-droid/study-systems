// "Where is this paper from?" — the rules read the header at once; the AI refines it when it is on.
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, userId } from '../auth';
import { ai } from '../config';
import { cachedJson } from '../ai/service';
import { originRequest } from '../ai/origin';
import { cleanOrigin, detectOrigin, mergeOrigin } from '../../shared/origin';

export const originRouter = Router();
originRouter.use(requireAuth);

originRouter.post('/detect', async (req, res) => {
  const uid = userId(res);
  const b = z.object({ text: z.string().max(200_000), name: z.string().max(300).default(''), useAi: z.boolean().default(true) }).parse(req.body);
  const head = b.text.slice(0, 6000);
  const rules = detectOrigin(b.text, b.name);
  if (!b.useAi || ai.provider === 'none' || head.trim().length < 30) return res.json({ origin: rules, ai: false });
  try {
    const key = crypto.createHash('sha256').update(`${b.name}\u0000${head}`).digest('hex');
    const { data, cached } = await cachedJson(uid, 'detect', key, originRequest(head, b.name), (raw) => cleanOrigin({ ...raw, source: 'ai' }));
    res.json({ origin: mergeOrigin(rules, data), ai: true, cached });
  } catch {
    // over the day's allowance, or the AI is down: the rules' reading is still useful
    res.json({ origin: rules, ai: false });
  }
});
