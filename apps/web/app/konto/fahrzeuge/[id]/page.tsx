import { notFound, redirect } from 'next/navigation';
import { serverApi, type OrderSummary, type Vehicle } from '@/lib/api-server';
import { VehicleDetail } from './vehicle-detail';

export const metadata = { title: 'Fahrzeug', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vehicle, orders] = await Promise.all([
    serverApi<Vehicle>(`/v1/vehicles/${encodeURIComponent(id)}`),
    serverApi<{ orders: OrderSummary[]; includedAvailable: boolean }>('/v1/orders'),
  ]);
  if (vehicle.status === 401) redirect('/anmelden');
  if (!vehicle.data) notFound();
  return (
    <VehicleDetail
      vehicle={vehicle.data}
      orders={(orders.data?.orders ?? []).filter((o) => o.vehicleId === id)}
      includedAvailable={orders.data?.includedAvailable ?? false}
    />
  );
}
