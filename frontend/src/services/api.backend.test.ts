import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { apiClient, getHealthCheck } from './api';
import { login, restoreSession } from './auth';
import { onSessionExpired, startSession } from './session';

// Opt-in real Express/PostgreSQL read-only checks. No seeds, mutations, login
// successes, access-denial audits or PostgreSQL-backed session store are used.
// Build backend first; the product database must already be configured/running.
const enabled=process.env.AESCS32_LIVE_READONLY==='1';
describe.skipIf(!enabled)('AESCS-32 frontend client against the real backend (read-only)',()=>{
 const original={adapter:apiClient.defaults.adapter,baseURL:apiClient.defaults.baseURL};
 let server:Server|undefined;
 let pool:{end:()=>Promise<void>}|undefined;
 beforeAll(async()=>{
  vi.stubEnv('CORS_ORIGIN',window.location.origin);
  const require=createRequire(import.meta.url);
  const {createApp}=require('../../../backend/dist/app.js');
  const session=require('express-session');
  pool=require('../../../backend/dist/config/database.js').pool;
  server=createServer(createApp(new session.MemoryStore()));
  await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(0,'127.0.0.1',resolve);});
  apiClient.defaults.baseURL=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  apiClient.defaults.adapter='xhr';
  startSession();
 },15000);
 afterAll(async()=>{
  apiClient.defaults.adapter=original.adapter;apiClient.defaults.baseURL=original.baseURL;
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  await pool?.end();vi.unstubAllEnvs();
 });
 it('receives a valid health envelope from the real backend and PostgreSQL',async()=>{
  expect(await getHealthCheck()).toMatchObject({status:'healthy',database:{status:'connected'}});
 });
 it('gets a real protected API 401 and sends one expiration event',async()=>{
  startSession();const expired=vi.fn(),remove=onSessionExpired(expired);
  try{await expect(apiClient.get('/api/v1/projects')).rejects.toMatchObject({status:401});expect(expired).toHaveBeenCalledTimes(1);}finally{remove();}
 });
 it('rejects a malformed Bearer JWT through the backend verification middleware',async()=>{
  await expect(apiClient.get('/api/v1/projects',{headers:{Authorization:'Bearer malformed-test-token'}})).rejects.toMatchObject({status:401,code:'INVALID_TOKEN'});
 });
 it('rejects unknown-account login without expiring or redirecting a session',async()=>{
  startSession();const expired=vi.fn(),remove=onSessionExpired(expired);
  try{
   await expect(login({email:`${randomUUID()}@example.invalid`,password:randomUUID()})).rejects.toMatchObject({status:401,code:'INVALID_CREDENTIALS'});
   expect(expired).not.toHaveBeenCalled();
  }finally{remove();}
 });
 it('restores an absent cookie session as null',async()=>{
  expect(await restoreSession()).toBeNull();
 });
});
