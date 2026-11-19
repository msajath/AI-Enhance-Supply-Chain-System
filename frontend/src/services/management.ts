import { ApiError, normalizeApiError } from './apiError';
import { apiClient, unwrapResponse } from './api';
export type Row = Record<string, unknown> & { id: string };
export interface Context { projects:Row[]; sites:Row[]; warehouses:Row[]; organization:Row; permissions:string[] }
export const emptyContext:Context={projects:[],sites:[],warehouses:[],organization:{id:''},permissions:[]};
export async function read<T>(path:string):Promise<T> { const r=await apiClient.get('/api/v1/'+path,{withCredentials:true});return unwrapResponse<T>(r.data); }
export async function write(path:string,body:unknown,method:'post'|'patch'|'put'|'delete'='post') { const r=method==='delete'?await apiClient.delete('/api/v1/'+path,{data:body,withCredentials:true}):await apiClient[method]('/api/v1/'+path,body,{withCredentials:true});return r.status===204?undefined:unwrapResponse<unknown>(r.data); }
export function errorMessage(error:unknown):string {
 const normalized=error instanceof ApiError?error:normalizeApiError(error);
 return normalized.fieldErrors.length?normalized.fieldErrors.map(field=>field.field+': '+field.message).join('; '):normalized.message;
}
