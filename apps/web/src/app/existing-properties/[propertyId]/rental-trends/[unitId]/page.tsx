import RentalTrends from '../RentalTrends';

export const dynamic = 'force-dynamic';

// Reachable per-unit from the property hub — Objektentwicklung proposals
// are computed against this unit's live tenancy.
export default async function Page({ params }: { params: Promise<{ propertyId: string; unitId: string }> }) {
    const { propertyId, unitId } = await params;
    return <RentalTrends propertyId={propertyId} unitId={unitId} />;
}
