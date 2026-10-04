export default {
  /** C-11: 中継の応答は成否を問わず private, no-store で、200 か 4xx/5xx (中継失敗を 2xx/3xx に化けさせない)。 */
  post: (result: Response): boolean =>
    result.headers.get('cache-control') === 'private, no-store'
    && (result.status === 200 || (result.status >= 400 && result.status < 600)),
};
