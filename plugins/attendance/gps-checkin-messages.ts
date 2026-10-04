/**
 * GPS チェックインの結果コード → 利用者向けの案内文 (契約 G2/G3)。
 * Aedilis の固定語彙と、 GLAB の中継・ブラウザ側の失敗をまとめて引く。
 */

const MESSAGES: Record<string, string> = {
  invalid_input: '位置情報の形式が正しくありません。もう一度位置を取得してください。',
  statement_invalid: '会場の位置情報を確認できませんでした。時間をおいて再度お試しください。',
  unknown_gateway: '会場の Wi-Fi ゲートウェイが登録されていません。職員に連絡してください。',
  facility_mismatch: '会場の施設情報が一致しません。職員に連絡してください。',
  statement_stale: '会場の位置情報が古くなっています。画面を更新してやり直してください。',
  accuracy_too_low: '位置の精度が足りません (100 m 以内が必要)。屋外や窓際で再取得してください。',
  out_of_range: '会場の範囲外にいるため出席できません。',
  photo_invalid: '写真を受け付けられません。JPEG / HEIC で 10 MB 以下の写真を撮ってください。',
  exif_missing: '写真に撮影日時がありません。カメラで撮った写真をそのまま送ってください。',
  exif_time_out_of_window: '写真の撮影時刻が今と離れています。その場で撮り直してください。',
  exif_location_out_of_range: '写真の撮影場所が会場の範囲外です。会場で撮り直してください。',
  photo_reused: 'この写真は既に使われています。新しく撮り直してください。',
  rate_limited: '短時間に送信しすぎました。1 分ほど待ってから再度お試しください。',
  location_statement_unavailable: '会場の位置情報 (Os) を取得できないため、現在は GPS で出席できません。',
  connector_unconfigured: '施設サービス (Aedilis) が未接続のため、現在は GPS で出席できません。',
  downstream_token_unavailable: '認証の受け渡しに失敗しました。再ログインしてからお試しください。',
  aedilis_unavailable: '施設サービス (Aedilis) に接続できません。時間をおいて再度お試しください。',
  aedilis_upstream_error: '施設サービス (Aedilis) が異常を返しました。時間をおいて再度お試しください。',
  unauthorized: 'ログインが切れています。再ログインしてください。',
};

export function gpsCheckinMessage(code: string | undefined, status: number): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return `GPS での出席に失敗しました (${status})。`;
}

/** navigator.geolocation のエラー → 案内文。 */
export function geolocationMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return '位置情報の利用が許可されていません。ブラウザ (またはOS) の設定でこのサイトの位置情報を許可してから、もう一度お試しください。';
  }
  if (error.code === error.TIMEOUT) return '位置の取得に時間がかかりすぎました。電波の良い場所で再度お試しください。';
  return '位置を取得できませんでした。端末の位置情報 (GPS) がオンか確認してください。';
}

/** https でない・geolocation が無い環境の案内。 使えるなら null。 */
export function geolocationUnsupportedMessage(): string | null {
  if (!window.isSecureContext) {
    return 'この画面は安全な接続 (https) で開かれていないため、位置情報を使えません。https の GLab から開き直してください。';
  }
  if (!('geolocation' in navigator)) return 'このブラウザは位置情報に対応していません。';
  return null;
}
