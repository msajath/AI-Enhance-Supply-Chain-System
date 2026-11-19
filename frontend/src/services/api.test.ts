import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { apiClient, API_TIMEOUT_MS, unwrapResponse } from './api';
import { ApiError, normalizeApiError } from './apiError';
import { onSessionExpired, startSession } from './session';
import { login, logout, restoreSession } from './auth';

const initialAdapter=apiClient.defaults.adapter;
const subscriptions:(()=>void)[]=[];
const body={success:true,data:{id:'record'}};
function respond(status=200,data:unknown=body):AxiosAdapter {
 return async config=>{
  const response={status,data,config,headers:new AxiosHeaders(),statusText:''};
  if(status>=400)throw new AxiosError('private backend stack and credentials','ERR_BAD_REQUEST',config,undefined,response);
  return response;
 };
}
function subscribe() {const listener=vi.fn();subscriptions.push(onSessionExpired(listener));return listener;}
beforeEach(()=>{startSession();apiClient.defaults.adapter=respond();});
afterEach(()=>{apiClient.defaults.adapter=initialAdapter;subscriptions.splice(0).forEach(remove=>remove());vi.unstubAllEnvs();});

describe('AESCS-32 centralized API client',()=>{
 it('supports typed GET and POST envelopes using the configured base URL',async()=>{
  const adapter=vi.fn(respond());apiClient.defaults.adapter=adapter;
  expect(unwrapResponse<{id:string}>((await apiClient.get('/api/v1/example')).data)).toEqual({id:'record'});
  await apiClient.post('/api/v1/example',{name:'Created'});
  const [get,post]=adapter.mock.calls.map(([config])=>config);
  expect(get.baseURL).toBe(apiClient.defaults.baseURL);
  expect(get.timeout).toBe(API_TIMEOUT_MS);
  expect(post.data).toBe(JSON.stringify({name:'Created'}));
  expect(post.headers.get('Content-Type')).toBe('application/json');
 });
 it('loads Vite base URL and timeout settings',async()=>{
  vi.stubEnv('VITE_API_BASE_URL','https://api.example.test');vi.stubEnv('VITE_API_TIMEOUT_MS','2500');
  vi.resetModules();const configured=await import('./api');
  expect(configured.apiClient.defaults.baseURL).toBe('https://api.example.test');
  expect(configured.apiClient.defaults.timeout).toBe(2500);
 });
 it('sends the existing cookie session, never a JS-stored JWT',async()=>{
  localStorage.setItem('token','untrusted-browser-value');
  const adapter=vi.fn(respond());apiClient.defaults.adapter=adapter;
  await apiClient.get('/api/v1/projects');
  const config=adapter.mock.calls[0][0];
  expect(config.withCredentials).toBe(true);expect(config.headers.has('Authorization')).toBe(false);
  localStorage.removeItem('token');
 });
 it('leaves multipart boundaries to the browser',async()=>{
  const adapter=vi.fn(respond());apiClient.defaults.adapter=adapter;
  const form=new FormData();form.append('file',new Blob(['contents']),'test.txt');
  await apiClient.post('/api/v1/upload',form);
  expect(adapter.mock.calls[0][0].data).toBe(form);
  expect(adapter.mock.calls[0][0].headers.get('Content-Type')).not.toContain('application/json');
 });
 it('normalizes validation details without exposing raw internals',async()=>{
  apiClient.defaults.adapter=respond(400,{success:false,error:{code:'VALIDATION_ERROR',message:'private SQL',details:[{path:['body','email'],message:'Invalid email'},{path:['body','name'],message:'postgres stack trace'}],stack:'internal'}});
  const error=await apiClient.post('/api/v1/example',{}).catch(e=>e);
  expect(error).toBeInstanceOf(ApiError);expect(error.code).toBe('VALIDATION_ERROR');
  expect(error.fieldErrors).toEqual([{field:'body.email',message:'Invalid email'},{field:'body.name',message:'This field is invalid.'}]);
  expect(JSON.stringify(error)).not.toMatch(/private|postgres|credentials|internal/);
 });
 it('preserves field errors from the existing management validation envelope',async()=>{
  apiClient.defaults.adapter=respond(400,{success:false,error:{code:'INVALID_INPUT',message:'email: Invalid email; full_name: Required'}});
  await expect(apiClient.post('/api/v1/admin/users',{})).rejects.toMatchObject({fieldErrors:[{field:'email',message:'Invalid email'},{field:'full_name',message:'Required'}]});
 });
 it.each([403,404,409,429,500])('handles HTTP %s safely without expiring the session or retrying',async status=>{
  const expired=subscribe(),adapter=vi.fn(respond(status,{success:false,error:{message:'private SQL and stack'}}));apiClient.defaults.adapter=adapter;
  const error=await apiClient.delete('/api/v1/example').catch(e=>e);
  expect(error).toMatchObject({kind:'http',status});expect(error.message).not.toMatch(/private|SQL|stack/);
  expect(expired).not.toHaveBeenCalled();expect(adapter).toHaveBeenCalledTimes(1);
 });
 it('expires the session only once for simultaneous protected 401 responses',async()=>{
  const expired=subscribe();apiClient.defaults.adapter=respond(401);
  await Promise.allSettled([apiClient.get('/api/v1/context'),apiClient.post('/api/v1/example',{})]);
  expect(expired).toHaveBeenCalledTimes(1);
 });
 it('does not expire sessions for login or restoration 401 responses',async()=>{
  const expired=subscribe();apiClient.defaults.adapter=respond(401);
  await expect(login({email:'test@example.test',password:'test-only'})).rejects.toMatchObject({status:401});
  expect(await restoreSession()).toBeNull();expect(expired).not.toHaveBeenCalled();
 });
 it('ignores a delayed 401 from the previous session after a new sign-in',async()=>{
  const expired=subscribe();let reject!: (reason:unknown)=>void;let captured!:InternalAxiosRequestConfig;
  apiClient.defaults.adapter=config=>{captured=config;return new Promise((_resolve,fail)=>{reject=fail;});};
  const pending=apiClient.get('/api/v1/context');await vi.waitFor(()=>expect(captured).toBeDefined());
  startSession();reject(new AxiosError('old session','ERR_BAD_REQUEST',captured,undefined,{config:captured,status:401,statusText:'',data:{},headers:new AxiosHeaders()}));
  await expect(pending).rejects.toMatchObject({status:401});expect(expired).not.toHaveBeenCalled();
 });
 it('distinguishes timeout and network failure without expiring a session',async()=>{
  const expired=subscribe();
  for(const [code,kind]of [['ECONNABORTED','timeout'],['ETIMEDOUT','timeout'],['ERR_NETWORK','network']]){
   apiClient.defaults.adapter=async config=>{throw new AxiosError('private request configuration',code,config);};
   await expect(apiClient.get('/api/v1/example')).rejects.toMatchObject({kind});
  }
  expect(expired).not.toHaveBeenCalled();
 });
 it('supports AbortController cancellation before dispatch',async()=>{
  const adapter=vi.fn(respond());apiClient.defaults.adapter=adapter;
  const controller=new AbortController();controller.abort();
  await expect(apiClient.get('/api/v1/example',{signal:controller.signal})).rejects.toMatchObject({kind:'canceled'});
  expect(adapter).not.toHaveBeenCalled();
 });
 it.each(['',null,'<html>invalid</html>',{}, {success:true}])('rejects invalid or empty JSON envelopes: %j',async data=>{
  apiClient.defaults.adapter=respond(200,data);
  await expect(apiClient.get('/api/v1/example')).rejects.toMatchObject({kind:'invalid_response'});
 });
 it('handles a failed envelope even when the server returns HTTP 200',async()=>{
  apiClient.defaults.adapter=respond(200,{success:false,error:{message:'private detail'}});
  await expect(apiClient.get('/api/v1/example')).rejects.toMatchObject({kind:'api'});
 });
 it('accepts HTTP 204 without parsing a JSON payload',async()=>{
  apiClient.defaults.adapter=respond(204,'');
  expect((await apiClient.delete('/api/v1/example')).data).toBeUndefined();
 });
 it('keeps logout failures distinct from successful session cleanup',async()=>{
  apiClient.defaults.adapter=respond(503);
  await expect(logout()).rejects.toMatchObject({status:503});
  apiClient.defaults.adapter=respond(200,{success:true,data:null});await expect(logout()).resolves.toBeUndefined();
 });
 it('normalizes malformed JSON transport failures',()=>{
  expect(normalizeApiError(new AxiosError('JSON syntax internals','ERR_BAD_RESPONSE'))).toMatchObject({kind:'invalid_response'});
 });
 it.each([
  {permissions:'users.read'}, {permissions:{}}, {permissions:[null]},
  {roles:'ADMIN'}, {roles:[1]}, {roleCode:{}}, {dashboard:[]},
 ])('rejects malformed authentication metadata: %j',async metadata=>{
  apiClient.defaults.adapter=respond(200,{success:true,data:{user:{id:'u1',email:'member@example.test',full_name:'Test Member',role:'Admin',...metadata}}});
  await expect(login({email:'member@example.test',password:'test-only'})).rejects.toThrow();
 });
});
