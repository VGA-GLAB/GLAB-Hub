import QRCode from 'qrcode';

/** Generate locally: no contact identifiers are sent to a third-party QR service. */
export function discordContactMarkup(userId: string): string {
  if (!/^[0-9]{17,20}$/.test(userId)) return '';
  const url=`https://discord.com/users/${userId}`;
  const qr=QRCode.create(url,{errorCorrectionLevel:'M'});
  const size=qr.modules.size;
  const squares:string[]=[];
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    if(qr.modules.get(y,x)) squares.push(`M${x+4} ${y+4}h1v1h-1z`);
  }
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">Discordで連絡する</a>
    <svg role="img" aria-label="Discordプロフィールを開くQRコード" width="180" height="180" viewBox="0 0 ${size+8} ${size+8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${squares.join('')}" fill="black"/></svg>
    <p class="note">QRからプロフィールを開けます。DMの可否は相手の受信設定によります。</p>`;
}
