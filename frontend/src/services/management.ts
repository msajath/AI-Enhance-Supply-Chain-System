import { apiClient } from './api';
import axios from 'axios';
export type Row = Record<string, unknown> & { id: string };
export interface Context { projects:Row[]; sites:Row[]; warehouses:Row[]; organization:Row; permissions:string[] }
export const emptyContext:Context={projects:[],sites:[],warehouses:[],organization:{id:''},permissions:[]};
export async function read<T>(path:string):Promise<T> { const r=await apiClient.get('/api/v1/'+path,{withCredentials:true});return r.data.data; }
export async function write(path:string,body:unknown,method:'post'|'patch'|'put'='post') { const r=await apiClient[method]('/api/v1/'+path,body,{withCredentials:true});return r.data.data; }
export function errorMessage(error:unknown):string {
 if(axios.isAxiosError(error)) { if(error.response?.status===401) return 'Your session has expired. Please sign in again.';if(error.response?.status===403)return 'Access denied. You do not have permission for this resource.';
  if([400,409].includes(error.response?.status??0)) return error.response?.data?.error?.message??'Check the entered details.';
 }
 return 'Unable to load or save data. Please try again.';
}
