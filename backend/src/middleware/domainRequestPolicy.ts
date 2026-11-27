import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { ApiResponse } from '../utils/apiResponse';

/** Shared browser-origin and content-type policy for transactional domain routers. */
export const domainRequestPolicy: RequestHandler = (req,res,next) => {
 res.setHeader('Cache-Control','no-store');
 if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
  const allowed=[env.CORS_ORIGIN,...(env.NODE_ENV==='production'?[]:['http://localhost:5173','http://127.0.0.1:5173'])];
  const origin=req.get('Origin');
  if(req.get('Sec-Fetch-Site')==='cross-site'||origin&&!allowed.includes(origin)) {
   res.status(403).json(ApiResponse.error('Request origin is not allowed.','FORBIDDEN'));return;
  }
  if(!req.is('application/json')) {res.status(415).json(ApiResponse.error('JSON request data is required.','INVALID_CONTENT_TYPE'));return;}
 }
 next();
};
