export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = "https://dao-tam-audio.onrender.com" + url.pathname + url.search;

  const headers = new Headers(context.request.headers);
  headers.delete("host");

  return fetch(targetUrl, {
    method: context.request.method,
    headers: headers,
    body: context.request.method !== "GET" && context.request.method !== "HEAD" ? context.request.body : undefined,
  });
}