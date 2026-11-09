'use client';

import type { MessageKey } from '@parkshield/i18n';
import {
  CTA_MAX,
  CTA_SUGGESTIONS,
  DECAL_PRODUCTS,
  DECAL_TEMPLATES,
  type DecalProduct,
  type DecalTemplate,
} from '@parkshield/shared';
import {
  Button,
  Card,
  Container,
  Field,
  Heading,
  Input,
  Notice,
  Stack,
  Text,
  useI18n,
} from '@parkshield/ui';
import { clsx } from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { PageShell } from '@/components/site-chrome';
import { api, ApiError, errorText } from '@/lib/api-client';
import type { OrderSummary, Vehicle } from '@/lib/api-server';
import { VehicleForm } from '../vehicles-view';

const CUSTOM = '__custom__';

function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  label,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o}
            className={clsx(
              'flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 px-4',
              o === value ? 'border-primary bg-info-bg text-info-fg' : 'border-border-strong',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o}
              checked={o === value}
              onChange={() => onChange(o)}
              className="size-5"
            />
            {label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Designer({ vehicle, onSaved }: { vehicle: Vehicle; onSaved: (v: Vehicle) => void }) {
  const { t } = useI18n();
  const saved = vehicle.decal!;
  const savedIsSuggestion = (CTA_SUGGESTIONS as readonly string[]).includes(saved.cta);
  const [template, setTemplate] = useState<DecalTemplate>(saved.template);
  const [choice, setChoice] = useState<string>(savedIsSuggestion ? saved.cta : CUSTOM);
  const [custom, setCustom] = useState(savedIsSuggestion ? '' : saved.cta);
  const [product, setProduct] = useState<DecalProduct>('uv_vinyl_sticker');
  const cta = choice === CUSTOM ? custom.trim() : choice;
  const [previewCta, setPreviewCta] = useState(cta);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Debounce typing so the preview is not re-rendered on every key stroke.
  useEffect(() => {
    const timer = setTimeout(() => setPreviewCta(cta), 350);
    return () => clearTimeout(timer);
  }, [cta]);

  const src = `/v1/vehicles/${vehicle.id}/decal.svg?${new URLSearchParams({
    template,
    product,
    ...(previewCta ? { cta: previewCta } : {}),
  })}`;
  const previewBroken = brokenSrc === src;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(
        await api<Vehicle>(`/v1/vehicles/${vehicle.id}/decal`, {
          method: 'PUT',
          body: { template, cta },
        }),
      );
      setMessage({ tone: 'success', text: t('vehicles.saved') });
    } catch (err) {
      const blocked = err instanceof ApiError && err.body?.error === 'cta_not_allowed';
      setMessage({ tone: 'danger', text: blocked ? t('decal.ctaNotAllowed') : errorText(err, t) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Stack gap={6}>
          <Heading level={2} className="text-xl">
            {t('decal.title')}
          </Heading>
          <ChoiceGroup
            legend={t('decal.template')}
            name="template"
            options={DECAL_TEMPLATES}
            value={template}
            onChange={setTemplate}
            label={(o) => t(`decal.template_${o}` as MessageKey)}
          />
          <ChoiceGroup
            legend={t('decal.cta')}
            name="cta"
            options={[...CTA_SUGGESTIONS, CUSTOM]}
            value={choice}
            onChange={setChoice}
            label={(o) => (o === CUSTOM ? t('decal.ctaCustom') : o)}
          />
          {choice === CUSTOM && (
            <Field label={t('decal.ctaCustomLabel')}>
              {({ id }) => (
                <Input
                  id={id}
                  value={custom}
                  maxLength={CTA_MAX}
                  onChange={(e) => setCustom(e.target.value)}
                />
              )}
            </Field>
          )}
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          <Button onClick={save} busy={busy} disabled={!cta} className="w-fit">
            {t('decal.save')}
          </Button>
        </Stack>
        <Stack gap={4}>
          <Heading level={3}>{t('decal.preview')}</Heading>
          <ChoiceGroup
            legend={t('decal.product')}
            name="product"
            options={DECAL_PRODUCTS}
            value={product}
            onChange={setProduct}
            label={(o) => t(`decal.product_${o}` as MessageKey)}
          />
          {previewBroken ? (
            <Notice tone="danger">{t('decal.ctaNotAllowed')}</Notice>
          ) : (
            <img
              src={src}
              alt={t('decal.previewAlt', { cta: previewCta })}
              onError={() => setBrokenSrc(src)}
              className={clsx(
                'w-full rounded-xl border border-border bg-surface',
                product === 'uv_vinyl_sticker' ? 'max-w-sm' : 'max-w-xs',
              )}
            />
          )}
          <a
            href={`/v1/vehicles/${vehicle.id}/decal.pdf`}
            download
            className="inline-flex min-h-12 w-fit items-center rounded-xl bg-secondary px-5 font-semibold text-secondary-fg"
          >
            {t('decal.homePdf')}
          </a>
          <Text muted className="text-sm">
            {t('decal.homePdfHint')}
          </Text>
        </Stack>
      </div>
    </Card>
  );
}

function IncludedOrder({
  vehicleId,
  onOrdered,
}: {
  vehicleId: string;
  onOrdered: (o: OrderSummary) => void;
}) {
  const { t } = useI18n();
  const [a, setA] = useState({ name: '', line1: '', line2: '', postalCode: '', city: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof a) => (e: { target: { value: string } }) =>
    setA((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const address = { ...a, line2: a.line2 || undefined, country: 'DE' };
      onOrdered(
        await api<OrderSummary>(`/v1/vehicles/${vehicleId}/order-included`, { body: { address } }),
      );
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Text>{t('order.includedIntro')}</Text>
      <Field label={t('order.name')}>
        {({ id }) => (
          <Input id={id} required autoComplete="name" value={a.name} onChange={set('name')} />
        )}
      </Field>
      <Field label={t('order.line1')}>
        {({ id }) => (
          <Input
            id={id}
            required
            autoComplete="address-line1"
            value={a.line1}
            onChange={set('line1')}
          />
        )}
      </Field>
      <Field label={t('order.line2')} optionalLabel={t('common.optional')}>
        {({ id }) => (
          <Input id={id} autoComplete="address-line2" value={a.line2} onChange={set('line2')} />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label={t('order.postalCode')}>
          {({ id }) => (
            <Input
              id={id}
              required
              inputMode="numeric"
              pattern="\d{5}"
              autoComplete="postal-code"
              value={a.postalCode}
              onChange={set('postalCode')}
            />
          )}
        </Field>
        <Field label={t('order.city')}>
          {({ id }) => (
            <Input
              id={id}
              required
              autoComplete="address-level2"
              value={a.city}
              onChange={set('city')}
            />
          )}
        </Field>
      </div>
      <Text muted className="text-sm">
        {t('order.countryNote')}
      </Text>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="submit" busy={busy} className="w-fit">
        {t('order.submit')}
      </Button>
    </form>
  );
}

export function VehicleDetail({
  vehicle: initial,
  orders: initialOrders,
  includedAvailable,
}: {
  vehicle: Vehicle;
  orders: OrderSummary[];
  includedAvailable: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [vehicle, setVehicle] = useState(initial);
  const [orders, setOrders] = useState(initialOrders);
  const [canOrder, setCanOrder] = useState(includedAvailable);
  const [justOrdered, setJustOrdered] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);

  async function remove() {
    if (!window.confirm(t('vehicles.deleteConfirm'))) return;
    await api(`/v1/vehicles/${vehicle.id}`, { method: 'DELETE' });
    router.push('/konto/fahrzeuge');
    router.refresh();
  }

  return (
    <PageShell>
      <Container className="max-w-5xl py-10">
        <Stack gap={6}>
          <div>
            <Link href="/konto/fahrzeuge" className="text-primary underline">
              {t('vehicles.back')}
            </Link>
            <Heading level={1} className="mt-2">
              {vehicle.nickname}
            </Heading>
          </div>

          {vehicle.decal && <Designer vehicle={vehicle} onSaved={setVehicle} />}

          <Card>
            <Stack gap={4}>
              <Heading level={2} className="text-xl">
                {t('order.title')}
              </Heading>
              {justOrdered && <Notice tone="success">{t('order.submitted')}</Notice>}
              {canOrder ? (
                <IncludedOrder
                  vehicleId={vehicle.id}
                  onOrdered={(o) => {
                    setOrders((list) => [o, ...list]);
                    setCanOrder(false);
                    setJustOrdered(true);
                  }}
                />
              ) : (
                orders.length === 0 && <Text muted>{t('order.used')}</Text>
              )}
              {orders.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Text>
                        {t('order.orderLine', {
                          nickname: o.nickname ?? vehicle.nickname,
                          date: new Date(o.createdAt),
                          status: t(`order.status_${o.status}` as MessageKey),
                        })}
                      </Text>
                      {o.trackingNumber && (
                        <Text muted>{t('order.tracking', { number: o.trackingNumber })}</Text>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Stack>
          </Card>

          <Card>
            <Stack gap={4}>
              <Heading level={2} className="text-xl">
                {t('vehicles.details')}
              </Heading>
              {detailsSaved && <Notice tone="success">{t('vehicles.saved')}</Notice>}
              <VehicleForm
                initial={vehicle}
                submitLabel={t('vehicles.save')}
                onSubmit={async (v) => {
                  setVehicle(
                    await api<Vehicle>(`/v1/vehicles/${vehicle.id}`, { method: 'PATCH', body: v }),
                  );
                  setDetailsSaved(true);
                }}
              />
              <Button variant="danger" onClick={remove} className="w-fit">
                {t('vehicles.delete')}
              </Button>
            </Stack>
          </Card>
        </Stack>
      </Container>
    </PageShell>
  );
}
