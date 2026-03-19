import { RepertoireBucket, RepertoireBucketOpening, RepertoireType, RepertoirePuzzle } from '@/types/repertoire';
import { getClientAuthHeaders } from '@/lib/auth';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || '/api/gateway';

// Minimal auth headers helper (mirrors other API modules)
const getAuthHeaders = () => getClientAuthHeaders();

export async function fetchUserRepertoires(): Promise<RepertoireBucket[]> {
  const res = await fetch(`${GATEWAY_URL}/api/repertoires`, {
    method: 'GET',
    headers: await getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error('Failed to load repertoires');
  }
  const data = await res.json();
  return data.repertoires || [];
}

export async function createRepertoire(payload: {
  name: string;
  type: RepertoireType;
  color: 'white' | 'black' | 'both';
  openings?: RepertoireBucketOpening[];
  puzzles?: RepertoirePuzzle[];
}): Promise<RepertoireBucket> {
  const res = await fetch(`${GATEWAY_URL}/api/repertoires`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || 'Failed to create repertoire');
  }
  return res.json();
}

export async function updateRepertoire(
  id: string,
  payload: Partial<{ name: string; color: 'white' | 'black' | 'both' }>
): Promise<RepertoireBucket> {
  const res = await fetch(`${GATEWAY_URL}/api/repertoires/${id}`, {
    method: 'PATCH',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || 'Failed to update repertoire');
  }
  return res.json();
}

export async function setRepertoireOpenings(
  id: string,
  openings: RepertoireBucketOpening[]
): Promise<RepertoireBucket> {
  const res = await fetch(`${GATEWAY_URL}/api/repertoires/${id}/openings`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ openings }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || 'Failed to set repertoire openings');
  }
  return res.json();
}

export async function deleteRepertoire(id: string): Promise<void> {
  const res = await fetch(`${GATEWAY_URL}/api/repertoires/${id}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || 'Failed to delete repertoire');
  }
}
