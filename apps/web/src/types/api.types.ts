export interface ApiResponseEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface HealthData {
  status: 'healthy' | 'degraded' | 'error';
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  database: {
    status: 'connected' | 'disconnected';
    latencyMs: number | null;
    error: string | null;
  };
  system: {
    nodeVersion: string;
    memoryUsageMb: number;
  };
}
