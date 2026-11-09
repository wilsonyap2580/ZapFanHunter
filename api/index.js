// Vercel serverless function: every /api/* request is routed here (see vercel.json)
// and handled by the same Express app that runs locally.
import app from '../server/src/app.js';

export default app;
