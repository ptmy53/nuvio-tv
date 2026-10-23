# Nuvio TV Cloudflare proxy

This Worker is used only when the browser cannot fetch a provider directly because of CORS. It forwards safe `GET`/`HEAD` requests and preserves byte-range/media headers for MP4/HLS playback.

Deploy from this directory with Wrangler:

```sh
npx wrangler login
npx wrangler deploy
```

The deployed URL is used in the app as both the plugin proxy template and the stream proxy template:

```text
https://YOUR-WORKER.workers.dev/?url=%s
```
