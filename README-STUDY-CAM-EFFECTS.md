# TRINITY OS Study Cam effects patch

Based on the repository's `main` branch at commit `0c8442a` (pulled on 2026-09-27).

## Included

- Browser Picture-in-Picture button in Study Room and Mini Cam. Turn it on while the camera is running, then switch to another app or tab. Keep the original Study Cam tab open; closing or navigating away from the source document can end its camera session.
- Camera effect picker in Study Room and Mini Cam: original, face-tracked paper bag, animated 2D VTuber avatar, animated flowing background with person segmentation, monochrome, and neon glitch.
- Effects are rendered into a canvas video track and the processed track is sent through LiveKit, so other room participants see the selected effect too.
- Face tracking models are included in `public/models`. The MediaPipe WebAssembly runtime is loaded from jsDelivr the first time a face or background effect is selected.

## Apply in a Codespace

1. Extract this archive into the TRINITY OS repository root and allow the files to overwrite matching paths.
2. Run `npm install`.
3. Run `npm run build`.
4. Start the existing development server or use the repository's normal deployment workflow.

The camera effects need a browser with `getUserMedia` and `canvas.captureStream` support. Picture-in-Picture is enabled only where the browser exposes its PiP API and must be started from the button while the page is active.
