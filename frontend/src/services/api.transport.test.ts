import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { apiClient } from './api';

// Exercise Axios's real browser adapter against a disposable loopback server.
// No product backend, network database, or additional test dependency is needed.
const originalAdapter=apiClient.defaults.adapter;
const timers=new Set<ReturnType<typeof setTimeout>>();
let baseURL='';
let slowRequests=0;
const server=createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin',req.headers.origin??'*');
 res.setHeader('Access-Control-Allow-Credentials','true');
 res.setHeader('Content-Type','application/json');
 if(req.url?.includes('/slow')) {
  slowRequests++;
  const timer=setTimeout(()=>{timers.delete(timer);res.end('{"success":true,"data":null}');},1000);
  timers.add(timer);return;
 }
 if(req.url?.includes('/invalid')) {res.end('{invalid-json');return;}
 if(req.url?.includes('/empty')) {res.statusCode=204;res.end();return;}
 res.end(JSON.stringify({success:true,data:{contentType:req.headers['content-type']??null}}));
});
beforeAll(async()=>{
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 baseURL=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 apiClient.defaults.adapter='xhr';
});
afterAll(async()=>{
 apiClient.defaults.adapter=originalAdapter;
 timers.forEach(clearTimeout);
 server.closeAllConnections();
 await new Promise<void>(resolve=>server.close(()=>resolve()));
});
describe('AESCS-32 browser transport',()=>{
 it('aborts a request at its configured timeout',async()=>{
  await expect(apiClient.get('/api/v1/slow',{baseURL,timeout:30})).rejects.toMatchObject({kind:'timeout',code:'TIMEOUT'});
 });
 it('cancels a dispatched request through AbortController',async()=>{
  const seen=slowRequests,controller=new AbortController();
  const pending=apiClient.get('/api/v1/slow',{baseURL,signal:controller.signal});
  await vi.waitFor(()=>expect(slowRequests).toBeGreaterThan(seen));
  const assertion=expect(pending).rejects.toMatchObject({kind:'canceled'});
  controller.abort();await assertion;
 });
 it('rejects malformed JSON returned over HTTP',async()=>{
  await expect(apiClient.get('/api/v1/invalid',{baseURL})).rejects.toMatchObject({kind:'invalid_response'});
 });
 it('accepts a real HTTP 204 without JSON',async()=>{
  expect((await apiClient.delete('/api/v1/empty',{baseURL})).data).toBeUndefined();
 });
 it('sends a browser-generated multipart boundary for uploads',async()=>{
  const form=new FormData();form.append('file',new Blob(['test']),'test.txt');
  const response=await apiClient.post('/api/v1/upload',form,{baseURL});
  expect(response.data.data.contentType).toMatch(/^multipart\/form-data; boundary=/);
 });
});
