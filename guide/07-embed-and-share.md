# 7. Embed and share

## Player in a web page

```html
<script type="module" src="https://your-anivo/player/anivo-player.js"></script>
<anivo-player src="/videos/auth.anivo" controls loop></anivo-player>
```

Attributes: `src`, `autoplay`, `loop`, `controls`, `step` (the first step to show), `captions` (`bottom` or `top`). The player is about 64 KB (gzip). It loads only the fonts and icons that the scene uses.

## One HTML file

**Export › HTML player** (or `anivo html`) makes one file with the player, the scene, and its fonts and images. It plays with no network. Send it by email or put it on any web server.

## Share link

If your Anivo has a share server, click **File › Share link…**. Anyone with the link opens a copy of the scene. The server keeps only encrypted data; the key is the part of the link after `#`.
