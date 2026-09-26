import { quickCheckIdFromWorkflow, quickCheckWorkflowId } from '@/lib/detailCheck/workflow';
import { requireUserId } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const { rows } = await db.query(
    'SELECT * FROM document WHERE user_id = $1 ORDER BY document_date DESC NULLS LAST, document_id DESC',
    [userId],
  );
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const input = await request.json();
  if (input.property_id != null) {
    const property = await db.query('SELECT 1 FROM property WHERE property_id = $1 AND user_id = $2', [Number(input.property_id), userId]);
    if (!property.rowCount) return NextResponse.json({ error: 'Objekt nicht gefunden.' }, { status: 404 });
  }
  // Detail-check link: the workflow the document belongs to. A workflow of an
  // Ersteinschätzung ("quick-check:<id>") also fills quick_check_id, and a
  // Detailbewertung document given only a quick check gets its workflow — so
  // both links always agree.
  let workflowId: string | null = typeof input.detail_check_workflow_id === 'string' && input.detail_check_workflow_id
    ? input.detail_check_workflow_id
    : null;
  let quickCheckId: number | null = input.quick_check_id != null ? Number(input.quick_check_id) : null;
  if (workflowId) {
    const fromWorkflow = quickCheckIdFromWorkflow(workflowId);
    if (fromWorkflow != null) {
      if (quickCheckId != null && quickCheckId !== fromWorkflow) {
        return NextResponse.json({ error: 'Detailbewertung und Ersteinschätzung passen nicht zusammen.' }, { status: 400 });
      }
      quickCheckId = fromWorkflow;
    } else {
      const detailCheck = await db.query('SELECT 1 FROM detail_check_property_data WHERE user_id = $1 AND workflow_id = $2', [userId, workflowId]);
      if (!detailCheck.rowCount) return NextResponse.json({ error: 'Detailbewertung nicht gefunden.' }, { status: 404 });
    }
  } else if (quickCheckId != null && input.category === 'Detailbewertung') {
    workflowId = quickCheckWorkflowId(quickCheckId);
  }
  if (quickCheckId != null) {
    const quickCheck = await db.query('SELECT 1 FROM quick_check WHERE quick_check_id = $1 AND user_id = $2', [quickCheckId, userId]);
    if (!quickCheck.rowCount) return NextResponse.json({ error: 'Ersteinschätzung nicht gefunden.' }, { status: 404 });
  }
  const { rows } = await db.query(
    `
      INSERT INTO document (
        user_id, category, name, property_id, quick_check_id, detail_check_workflow_id,
        document_date, file_name, storage_path, content_type, file_size
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `,
    [
      userId, input.category, input.name, input.property_id ?? null,
      quickCheckId, workflowId, input.document_date ?? null, input.file_name,
      input.storage_path, input.content_type ?? null, input.file_size ?? null,
    ],
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId(request);
  if (userId instanceof Response) return userId;
  const id = Number(new URL(request.url).searchParams.get('id'));
  const result = await db.query('DELETE FROM document WHERE document_id = $1 AND user_id = $2', [id, userId]);
  return NextResponse.json({ deleted: result.rowCount ?? 0 });
}
