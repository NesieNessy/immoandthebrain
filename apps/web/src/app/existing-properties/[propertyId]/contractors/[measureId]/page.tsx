import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// A measure no longer has a page of its own — everything is on the
// Handwerkerleistungen page. Old links open it there with its panel open.
export default async function Page({ params }: { params: Promise<{ propertyId: string; measureId: string }> }) {
    const { propertyId, measureId } = await params;
    redirect(`/existing-properties/${encodeURIComponent(propertyId)}/contractors?measure=${encodeURIComponent(measureId)}`);
}
