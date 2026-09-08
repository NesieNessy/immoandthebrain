import { requireUserId } from '@/lib/server/auth';
import { NextResponse } from 'next/server';
import type { ExtractedSettlementData } from '@/lib/serviceCharge/settlementExtraction';

const ACCEPTED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

const EXTRACTION_PROMPT = `This document is a German Nebenkostenabrechnung (or Wirtschaftsplan) — an annual service-charge settlement/budget for a rental property. It may be scanned, photographed, or exported from any property-management software, so its layout varies.

Extract:
- The billing period (Abrechnungszeitraum) start and end date, as YYYY-MM-DD. If the document only states a year, use Jan 1 / Dec 31 of that year. Use null for a field you cannot determine.
- Every individual cost line item (Kostenposition / Betriebskostenart), such as Grundsteuer, Wasserversorgung, Heizung, Hausmeister, Versicherung, Verwaltungskosten, etc. For each: its label as written (or a standard BetrKV German term if the document uses an abbreviation), whether it is recharged to tenants ("allocable" — true for umlagefähige Kosten, false for nicht umlagefähige Kosten such as Verwaltungskosten, Instandhaltung, Rücklagen), the actual/settled whole-building amount for the billing period (actualAmount), and the budgeted whole-building amount for the following year if the document is or includes a Wirtschaftsplan (budgetAmount). Use null for an amount that isn't in the document. Amounts are whole-building totals, not a single tenant's share — if the document only shows a per-unit amount, still report it as given rather than guessing the building total.

Call the extract_settlement_data tool with the result.`;

const EXTRACTION_TOOL = {
  name: 'extract_settlement_data',
  description: 'Records the billing period and cost line items extracted from a Nebenkostenabrechnung document.',
  input_schema: {
    type: 'object',
    properties: {
      periodStart: { type: ['string', 'null'], description: 'Billing period start date, YYYY-MM-DD, or null.' },
      periodEnd: { type: ['string', 'null'], description: 'Billing period end date, YYYY-MM-DD, or null.' },
      costItems: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            allocable: { type: 'boolean' },
            actualAmount: { type: ['number', 'null'] },
            budgetAmount: { type: ['number', 'null'] },
          },
          required: ['label', 'allocable', 'actualAmount', 'budgetAmount'],
        },
      },
    },
    required: ['costItems'],
  },
};

interface AnthropicToolUseBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
}

function isToolUseBlock(block: unknown): block is AnthropicToolUseBlock {
  return typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'tool_use';
}

export async function POST(request: Request) {
  await requireUserId(request);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY ist nicht konfiguriert.' }, { status: 500 });
  }

  const body = await request.json() as { fileDataUrl?: string; mimeType?: string };
  const match = /^data:([^;]+);base64,(.+)$/.exec(body.fileDataUrl ?? '');
  if (!match) return NextResponse.json({ error: 'Ungültige Datei.' }, { status: 400 });
  const [, mimeType, base64] = match;
  if (!ACCEPTED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json({ error: 'Nur PDF, PNG oder JPEG werden unterstützt.' }, { status: 400 });
  }

  const documentBlock = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: 'extract_settlement_data' },
      messages: [{
        role: 'user',
        content: [documentBlock, { type: 'text', text: EXTRACTION_PROMPT }],
      }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return NextResponse.json({ error: 'Die Dokumentenerkennung ist fehlgeschlagen.', detail }, { status: 502 });
  }

  const data = await response.json() as { content?: unknown[] };
  const toolUse = (data.content ?? []).find(isToolUseBlock);
  if (!toolUse) {
    return NextResponse.json({ error: 'Die Dokumentenerkennung lieferte kein verwertbares Ergebnis.' }, { status: 502 });
  }

  const input = toolUse.input as { periodStart?: string | null; periodEnd?: string | null; costItems?: unknown[] };
  const result: ExtractedSettlementData = {
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    costItems: (input.costItems ?? []).map((item) => {
      const i = item as { label?: string; allocable?: boolean; actualAmount?: number | null; budgetAmount?: number | null };
      return {
        label: i.label ?? '',
        allocable: i.allocable ?? true,
        actualAmount: typeof i.actualAmount === 'number' ? i.actualAmount : null,
        budgetAmount: typeof i.budgetAmount === 'number' ? i.budgetAmount : null,
      };
    }).filter((item) => item.label.trim() !== ''),
  };

  return NextResponse.json(result);
}
