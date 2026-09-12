import MeasureDetail from './MeasureDetail';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ propertyId: string; measureId: string }> }) {
    const { propertyId, measureId } = await params;
    return <MeasureDetail propertyId={propertyId} measureId={measureId} />;
}
