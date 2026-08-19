/**
 * プロフィール画面の顔写真セクション。
 *
 * 写真は「登録の種」であり、職員が実機で本人確認して承認するまで出席照合には
 * 載らない (spec/feature/face-photo-profile.md §4)。UI でもその状態を
 * 「審査待ち」として明示する。同意文面は Cernere の policy API から取得し、
 * GLab 側に文面を持たない。
 */

import { el, type PanelContext } from '../panel-kit.ts';

interface PolicyEntry {
  version: string;
  text: string;
  requiredFor?: string[];
}

interface TemplateStatusEntry {
  facilityId: string;
  state?: string;
}

const PHOTO_POLICY_HINT = 'photo';

export function facePhotoSection(ctx: PanelContext): HTMLElement {
  const wrap = el('section', 'gl-notice');
  wrap.append(el('h3', undefined, '📷 プロフィール顔写真'));
  const status = el('p', 'gl-muted', '状態を確認しています…');
  const body = el('div');
  wrap.append(status, body);
  void render(ctx, status, body);
  return wrap;
}

async function render(ctx: PanelContext, status: HTMLElement, body: HTMLElement): Promise<void> {
  body.innerHTML = '';
  const state = await loadState(ctx);
  if (!state) {
    status.textContent = '顔写真の状態を取得できませんでした (Cernere に接続できません)。';
    return;
  }

  status.textContent = describeState(state.templateState);
  if (state.photo) body.append(photoPreview(state.photo), deleteButton(ctx, status, body));
  else body.append(consentAndUpload(ctx, state.policy, status, body));
}

interface FacePhotoState {
  photo: Blob | null;
  templateState: string | null;
  policy: PolicyEntry | null;
}

async function loadState(ctx: PanelContext): Promise<FacePhotoState | null> {
  const [statusResult, policyResult, photoResult] = await Promise.allSettled([
    ctx.api('/face-photo/status'),
    ctx.api('/face-photo/policy'),
    ctx.api('/face-photo/me'),
  ]);
  if (statusResult.status === 'rejected' || photoResult.status === 'rejected') return null;
  const statusResponse = statusResult.value;
  const photoResponse = photoResult.value;
  if (!statusResponse.ok || (!photoResponse.ok && photoResponse.status !== 404)) return null;

  try {
    const entries = (await statusResponse.json() as { items?: TemplateStatusEntry[] }).items ?? [];
    const policies = policyResult.status === 'fulfilled' && policyResult.value.ok
      ? ((await policyResult.value.json() as { policies?: PolicyEntry[] }).policies ?? [])
      : [];
    return {
      photo: photoResponse.ok ? await photoResponse.blob() : null,
      templateState: entries[0]?.state ?? null,
      policy: pickPhotoPolicy(policies),
    };
  } catch {
    return null;
  }
}

/** 写真経路が要求する版を選ぶ。requiredFor が無い古い応答でも版名から拾える。 */
function pickPhotoPolicy(policies: PolicyEntry[]): PolicyEntry | null {
  return policies.find((policy) => policy.requiredFor?.includes('photo'))
    ?? policies.find((policy) => policy.version.includes(PHOTO_POLICY_HINT))
    ?? null;
}

function describeState(state: string | null): string {
  if (state === 'pending') return '顔認証: 審査待ち (職員が実機で確認すると有効になります)';
  if (state === 'active') return '顔認証: 登録済み';
  if (state === 'revoked') return '顔認証: 無効化されています';
  return '顔認証: 未登録';
}

function photoPreview(photo: Blob): HTMLElement {
  const image = el('img', 'gl-face-photo');
  image.alt = '';
  image.width = 96;
  image.height = 96;
  const url = URL.createObjectURL(photo);
  const release = () => URL.revokeObjectURL(url);
  image.onload = release;
  image.onerror = release;
  image.src = url;
  return image;
}

function deleteButton(ctx: PanelContext, status: HTMLElement, body: HTMLElement): HTMLElement {
  const row = el('div', 'gl-row');
  const note = el('p', 'gl-muted', '削除すると、写真と顔認証の登録データが同時に消えます。');
  const button = el('button', 'gl-btn', '写真を削除');
  button.onclick = () => {
    button.disabled = true;
    void ctx.api('/face-photo', { method: 'DELETE' })
      .then((response) => {
        if (!response.ok) throw new Error(`delete failed with status ${response.status}`);
        return render(ctx, status, body);
      })
      .catch(() => {
        status.textContent = '顔写真を削除できませんでした。';
        button.disabled = false;
      });
  };
  row.append(note, button);
  return row;
}

function consentAndUpload(
  ctx: PanelContext,
  policy: PolicyEntry | null,
  status: HTMLElement,
  body: HTMLElement,
): HTMLElement {
  const form = el('form', 'gl-col');
  if (!policy) {
    form.append(el('p', 'gl-muted', '同意文面を取得できないため、写真は登録できません。'));
    return form;
  }

  form.append(el('p', 'gl-muted', policy.text));
  const agree = el('input');
  agree.type = 'checkbox';
  agree.id = 'face-photo-consent';
  const agreeLabel = el('label', undefined, ' 上記に同意します');
  agreeLabel.htmlFor = agree.id;

  const facilityId = el('input', 'gl-input');
  facilityId.placeholder = '施設 ID';
  facilityId.required = true;

  const file = el('input', 'gl-input');
  file.type = 'file';
  file.accept = 'image/*';
  file.required = true;

  const submit = el('button', 'gl-btn', '写真を登録');
  const message = el('p', 'gl-muted', '');
  form.append(agree, agreeLabel, facilityId, file, submit, message);

  form.onsubmit = (event) => {
    event.preventDefault();
    const selected = file.files?.[0];
    if (!agree.checked || !selected) {
      message.textContent = '同意と写真の選択が必要です。';
      return;
    }
    submit.disabled = true;
    message.textContent = '登録しています…';
    void upload(ctx, policy.version, facilityId.value.trim(), selected)
      .then(() => render(ctx, status, body))
      .catch((error: unknown) => {
        submit.disabled = false;
        message.textContent = error instanceof Error ? error.message : '登録に失敗しました。';
      });
  };
  return form;
}

async function upload(
  ctx: PanelContext,
  policyVersion: string,
  facilityId: string,
  file: File,
): Promise<void> {
  // 同意が先。Cernere は同意の無い写真を 409 で拒否するが、UI 側でも順序を守る。
  const consent = await ctx.api('/face-photo/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ policyVersion, facilityId }),
  });
  if (!consent.ok) throw new Error('同意を記録できませんでした。');

  const form = new FormData();
  form.append('image', file);
  const response = await ctx.api(`/face-photo?facilityId=${encodeURIComponent(facilityId)}`, {
    method: 'POST',
    body: form,
  });
  if (response.status === 422) throw new Error('顔を検出できませんでした。別の写真を選んでください。');
  if (!response.ok) throw new Error('写真を登録できませんでした。');
}
