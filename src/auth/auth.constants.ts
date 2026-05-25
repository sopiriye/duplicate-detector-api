import { StringValue } from 'ms';

export function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'not-secure-secret-for-dev-only';
}

export function getJwtExpiresIn(): StringValue {
  return (process.env.JWT_EXPIRES_IN as StringValue | undefined) ?? '1d';
}
