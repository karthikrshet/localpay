# README video

`docs/assets/localpay-demo.mp4` is a 23-second launch video for the README. Its frames are
drawn by [index.html](index.html), where every frame is a pure function of time
(`window.render(t)`). [scripts/render-video.ts](../../scripts/render-video.ts) captures
those frames with Playwright, then mixes in the music and sound effects with FFmpeg.

```bash
# FFmpeg must be on PATH (or set FFMPEG=/path/to/ffmpeg)
node --experimental-strip-types scripts/render-video.ts
```

The script writes `docs/assets/localpay-demo.mp4`, `localpay-demo.jpg` (the poster, which
is also the video's first frame) and `localpay-demo.gif` (a silent preview).

The checkout scene uses the real popup stylesheet from
`packages/checkout/src/styles.ts`, and all copy on screen comes from the README, the CLI
banner and the checkout scenarios.

## Storyboard

| Time | Scene | On screen |
| --- | --- | --- |
| 0.0–3.4 | Hook | "Testing Razorpay payments?" and three needs (test keys, ngrok, internet) are struck out on the beat |
| 3.4–7.6 | Reveal | `npx localpay` is typed, then the start-up banner prints: API, checkout.js, dashboard and the demo key |
| 7.6–11.0 | Checkout | The test checkout popup. A cursor clicks **UPI timeout** (shows `payment_timeout`), then **Pay successfully** |
| 11.0–15.0 | Webhooks | Signed deliveries to `http://127.0.0.1:3000/webhooks`, then fault injection: duplicate, out-of-order, delayed, unsigned |
| 15.0–19.0 | Time travel | `localpay time advance 30d` jumps the clock 30 days ahead, running refunds, renewals, expiries and settlements |
| 19.0–23.0 | Outro | The logo lands on a strong beat (20.02s), then the tagline, `npx localpay` and the disclaimer |

The music runs at 120 BPM, with beats at 0.02 + 0.5·n seconds. The strikes, webhook rows
and time-travel list follow the beat grid, the background glow breathes on each beat, and
the logo is beat-locked to the 20.02s strong cue.

## Credits

- Music: "Happy Beats / Business Moves Vol. 1" by [ende.app](https://ende.app/en),
  licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It is trimmed to
  the video's length in `audio/music.mp3`.
- Sound effects: [Kenney](https://kenney.nl) (CC0) and the
  [Keyboard Soundpack #1](https://opengameart.org/content/keyboard-soundpack-1-typing-and-single-keystrokes)
  by unicae_games (CC0), in `audio/sfx/`.
- The workflow follows [brag](https://github.com/latent-spaces/brag) (MIT), which bundles
  these assets.
