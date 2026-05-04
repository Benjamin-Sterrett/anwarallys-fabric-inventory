// Item create + edit form (PRJ-784) — Wave 2. Shared `ItemFormPage` drives
// both modes; `ItemNewRoute` (default) + `ItemEditRoute` (named) parse
// useParams. Out of scope: stock adjust (PRJ-787), folder-move, photo
// upload, soft-delete (PRJ-796). Schema authoritative: ticket "name" →
// sku, "originalLengthMeters" → initialMeters, "pricePerMeter" → price;
// ticket "type" is NOT in schema. RequireAuth wraps these routes; we
// still wait for authUser !== undefined so submit isn't fired with a
// stale null actorUid (early-page-load race; see auth.ts).

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { User as FirebaseUser } from 'firebase/auth';
import { subscribeToAuthState } from '@/lib/firebase/auth';
import { createItem, getFolderById, getItemById, updateItem } from '@/lib/queries';
import type { Folder, RollItem } from '@/lib/models';
import BackButton from '@/components/BackButton';

/** Default low-stock threshold when the user leaves Minimum stock blank. */
const DEFAULT_MIN_METERS = 10;

const BTN_BASE = 'inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-5 py-3 text-sm font-medium disabled:opacity-50';
const BTN_PRIMARY = `${BTN_BASE} bg-gray-900 text-white`;
const BTN_SECONDARY = `${BTN_BASE} border border-gray-300 text-gray-800`;
const INPUT = 'mt-1 block w-full min-h-12 rounded-md border border-gray-300 px-3 py-2 text-base';
const INPUT_DISABLED = 'mt-1 block w-full min-h-12 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-base text-gray-600';

type Mode = 'create' | 'edit';

// All numeric fields are text-bound + parsed on submit (minimumMeters
// blank → DEFAULT_MIN_METERS).
interface FormState {
  sku: string; description: string; supplier: string; price: string;
  initialMeters: string; minimumMeters: string; photoUrl: string;
}

const EMPTY_FORM: FormState = {
  sku: '', description: '', supplier: '', price: '',
  initialMeters: '', minimumMeters: '', photoUrl: '',
};

function fromItem(item: RollItem): FormState {
  return {
    sku: item.sku,
    description: item.description,
    supplier: item.supplier ?? '',
    price: item.price === null ? '' : String(item.price),
    initialMeters: String(item.initialMeters),
    minimumMeters: String(item.minimumMeters),
    photoUrl: item.photoUrl ?? '',
  };
}

type ParseMode = 'required-positive' | 'optional-nonneg' | 'default-nonneg';
type ParseNum = { ok: true; value: number | null } | { ok: false; message: string };

function parseNum(raw: string, label: string, mode: ParseMode): ParseNum {
  const trimmed = raw.trim();
  if (trimmed === '') {
    if (mode === 'required-positive') return { ok: false, message: `${label} is required.` };
    return { ok: true, value: mode === 'optional-nonneg' ? null : DEFAULT_MIN_METERS };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, message: `${label} must be a number.` };
  if (mode === 'required-positive' ? n <= 0 : n < 0) {
    return { ok: false, message: mode === 'required-positive' ? `${label} must be greater than zero.` : `${label} cannot be negative.` };
  }
  return { ok: true, value: n };
}

interface TextFieldProps {
  label: string; value: string; onChange: (v: string) => void;
  type?: 'text' | 'url'; inputMode?: 'decimal';
  placeholder?: string; disabled?: boolean; autoFocus?: boolean; hint?: ReactNode;
}
function TextField(p: TextFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-800">{p.label}</span>
      <input
        type={p.type ?? 'text'} inputMode={p.inputMode} value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        autoComplete="off" autoFocus={p.autoFocus} placeholder={p.placeholder}
        disabled={p.disabled}
        className={p.disabled ? INPUT_DISABLED : INPUT}
      />
      {p.hint ? <span className="mt-1 block text-xs text-gray-600">{p.hint}</span> : null}
    </label>
  );
}

interface ItemFormPageProps { mode: Mode; folderId?: string; itemId?: string }

function ItemFormPage(props: ItemFormPageProps) {
  const navigate = useNavigate();

  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);
  useEffect(() => subscribeToAuthState((u) => setAuthUser(u)), []);

  // create → load parent folder (for folderAncestors); edit → load item + parent folder.
  const [folder, setFolder] = useState<Folder | null | undefined>(undefined);
  const [item, setItem] = useState<RollItem | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Cache-backed mount reads (PRJ-893): item-form edits metadata only
  // (sku, description, supplier, etc.). These fields do not affect stock
  // correctness, so a briefly stale cache is harmless. Keeping cache-
  // backed reads preserves offline-friendly UX per the explicit pilot
  // policy. Safety-critical stock adjustments live in item-adjust.tsx.
  useEffect(() => {
    if (authUser === undefined) return;
    let cancelled = false;
    setLoadError(null);
    if (props.mode === 'create') {
      if (!props.folderId) { setFolder(null); setLoadError('Missing folder in URL.'); return; }
      setFolder(undefined);
      void getFolderById(props.folderId).then((r) => {
        if (cancelled) return;
        if (!r.ok) { setFolder(null); setLoadError(`Could not load folder: ${r.error.message} (${r.error.code})`); return; }
        if (r.data === null) { setFolder(null); setLoadError('That folder no longer exists.'); return; }
        if (r.data.deletedAt !== null) { setFolder(null); setLoadError('That folder has been deleted.'); return; }
        setFolder(r.data);
      });
    } else {
      if (!props.itemId) { setItem(null); setLoadError('Missing item in URL.'); return; }
      setItem(undefined);
      setFolder(undefined);
      void getItemById(props.itemId).then((r) => {
        if (cancelled) return;
        if (!r.ok) { setItem(null); setLoadError(`Could not load item: ${r.error.message} (${r.error.code})`); return; }
        if (!r.data) { setItem(null); setLoadError('That item no longer exists.'); return; }
        setItem(r.data);
        void getFolderById(r.data.folderId).then((fr) => {
          if (cancelled) return;
          if (!fr.ok) { setFolder(null); setLoadError(`Could not load folder: ${fr.error.message} (${fr.error.code})`); return; }
          if (fr.data === null) { setFolder(null); setLoadError('That folder no longer exists.'); return; }
          if (fr.data.deletedAt !== null) { setFolder(null); setLoadError('That folder has been deleted.'); return; }
          setFolder(fr.data);
        });
      });
    }
    return () => { cancelled = true; };
  }, [authUser, props.mode, props.folderId, props.itemId, retryToken]);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (props.mode === 'edit' && item && folder) { setForm(fromItem(item)); setHydrated(true); }
    else if (props.mode === 'create' && folder) { setForm(EMPTY_FORM); setHydrated(true); }
  }, [props.mode, item, folder]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const cancelTarget = useMemo(
    () => (props.mode === 'edit' && item ? `/folders/${item.folderId}` : props.folderId ? `/folders/${props.folderId}` : '/'),
    [props.mode, props.folderId, item],
  );

  const submit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    if (!authUser) { setSubmitError('You must be signed in.'); return; }

    const trimmedSku = form.sku.trim();
    if (trimmedSku === '') { setSubmitError('Item code is required.'); return; }

    const minParse = parseNum(form.minimumMeters, 'Minimum stock', 'default-nonneg');
    if (!minParse.ok) { setSubmitError(minParse.message); return; }
    const minimumMeters = minParse.value ?? DEFAULT_MIN_METERS; // default-nonneg never returns null

    const priceParse = parseNum(form.price, 'Price per meter', 'optional-nonneg');
    if (!priceParse.ok) { setSubmitError(priceParse.message); return; }
    const price = priceParse.value;

    const trimOrNull = (s: string) => s.trim() === '' ? null : s.trim();
    const supplier = trimOrNull(form.supplier);
    const photoUrl = trimOrNull(form.photoUrl);

    setSubmitting(true);
    let r;
    if (props.mode === 'create') {
      if (!folder) { setSubmitting(false); setSubmitError('Folder not loaded.'); return; }
      const initParse = parseNum(form.initialMeters, 'Original length', 'required-positive');
      if (!initParse.ok) { setSubmitting(false); setSubmitError(initParse.message); return; }
      r = await createItem({
        folderId: folder.folderId,
        // folderAncestors = parent.ancestors ++ [parent.folderId] — rules re-derive.
        folderAncestors: [...folder.ancestors, folder.folderId],
        sku: trimmedSku, description: form.description,
        initialMeters: initParse.value ?? 0, // required-positive never returns null
        minimumMeters, supplier, price, photoUrl, actorUid: authUser.uid,
      });
    } else {
      if (!item) { setSubmitting(false); setSubmitError('Item not loaded.'); return; }
      r = await updateItem({
        itemId: item.itemId, sku: trimmedSku, description: form.description,
        supplier, price, minimumMeters, photoUrl, actorUid: authUser.uid,
      });
    }
    setSubmitting(false);
    if (!r.ok) { setSubmitError(`Could not save item: ${r.error.message} (${r.error.code})`); return; }
    navigate(`/folders/${props.mode === 'create' ? folder!.folderId : item!.folderId}`);
  }, [authUser, form, folder, item, props.mode, navigate]);

  if (authUser === undefined || (!loadError && !hydrated)) {
    return <section className="mx-auto max-w-2xl px-4 py-8"><p className="text-sm text-gray-600">Loading…</p></section>;
  }
  if (loadError) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700" role="alert">{loadError}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRetryToken((n) => n + 1)}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700"
            >
              Retry
            </button>
            <Link to={cancelTarget} className={BTN_SECONDARY}>Back</Link>
          </div>
        </div>
      </section>
    );
  }

  const headerTitle = props.mode === 'create'
    ? `New item in ${folder?.name ?? 'folder'}`
    : `Edit item ${item?.sku ?? ''}`;

  // Live preview — rules force remainingMeters = initialMeters on create.
  const initialPreview = form.initialMeters.trim();
  const remainingHint = props.mode === 'create'
    ? (initialPreview === '' ? 'Will match original length once you fill it in.' : `Will start at ${initialPreview} m.`)
    : `Currently ${item?.remainingMeters ?? 0} m. Adjust stock from the item page.`;

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <BackButton />

      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">{headerTitle}</h1>
      </header>

      <form onSubmit={submit} className="space-y-5 rounded-lg border border-gray-200 bg-white p-4">
        <TextField label="Item code" value={form.sku} onChange={(v) => update('sku', v)}
          autoFocus={props.mode === 'create'} />

        <label className="block">
          <span className="text-sm font-medium text-gray-800">Description / notes</span>
          <textarea value={form.description} onChange={(e) => update('description', e.target.value)}
            rows={3} placeholder="Optional — pattern, color, fabric details" className={INPUT} />
        </label>

        <TextField label="Supplier" value={form.supplier} onChange={(v) => update('supplier', v)} />

        <TextField label="Price per meter (₹)" value={form.price} onChange={(v) => update('price', v)}
          inputMode="decimal" placeholder="Optional" />

        <TextField label="Original length (meters)" value={form.initialMeters}
          onChange={(v) => update('initialMeters', v)} inputMode="decimal"
          disabled={props.mode === 'edit'}
          hint={props.mode === 'edit'
            ? 'Original length is permanent. Add a new item if the original roll length is wrong.'
            : undefined} />

        <div>
          <span className="text-sm font-medium text-gray-800">Remaining meters</span>
          <p className="mt-1 text-sm text-gray-700">{remainingHint}</p>
        </div>

        <TextField label="Minimum stock alert (meters)" value={form.minimumMeters}
          onChange={(v) => update('minimumMeters', v)} inputMode="decimal"
          placeholder={`Optional — default ${DEFAULT_MIN_METERS}`} />

        <TextField label="Photo URL" value={form.photoUrl} onChange={(v) => update('photoUrl', v)}
          type="url" placeholder="Paste a link to a photo (upload coming later)" />

        {submitError ? <p className="text-sm text-red-700" role="alert">{submitError}</p> : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <button type="submit" disabled={submitting} className={BTN_PRIMARY}>
            {submitting ? 'Saving…' : props.mode === 'create' ? 'Create item' : 'Save changes'}
          </button>
          <Link to={cancelTarget} className={BTN_SECONDARY}>Back</Link>
        </div>
      </form>
    </section>
  );
}

// `key` re-mounts on URL change so internal effects re-run cleanly.
export default function ItemNewRoute() {
  const folderId = useParams<{ folderId: string }>().folderId ?? undefined;
  return <ItemFormPage key={`new-${folderId ?? '?'}`} mode="create" folderId={folderId} />;
}

export function ItemEditRoute() {
  const itemId = useParams<{ itemId: string }>().itemId ?? undefined;
  return <ItemFormPage key={`edit-${itemId ?? '?'}`} mode="edit" itemId={itemId} />;
}
