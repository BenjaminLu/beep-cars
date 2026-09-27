// Camera + microphone. Frames are downscaled to 64x48 grayscale in memory and thrown away;
// nothing is recorded, stored or sent anywhere.

export const SAMPLE_W = 64;
export const SAMPLE_H = 48;

export class MediaInput {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.hasVideo = false;
    this.hasAudio = false;
    this.fresh = false;
    this.canvas = document.createElement('canvas');
    this.canvas.width = SAMPLE_W;
    this.canvas.height = SAMPLE_H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.gray = new Uint8Array(SAMPLE_W * SAMPLE_H);
    this.lastTime = -1;
    this.analyser = null;
    this.micBuf = null;
  }

  /**
   * Ask for the camera, then the microphone. Only the camera is awaited: the mic attaches whenever
   * it arrives (the parent may still be reading its permission prompt, or the device may be slow),
   * so a pending or refused mic never holds up the game. Never throws.
   */
  async start(audioCtx) {
    const md = navigator.mediaDevices;
    this.active = true;
    this.audioCtx = audioCtx;
    this.tracks = [];
    if (!md || !md.getUserMedia) return this.status();
    const video = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 30 } };
    const audio = { echoCancellation: true, noiseSuppression: false, autoGainControl: false };
    try {
      this.stream = await md.getUserMedia({ video });
      this.tracks.push(...this.stream.getTracks());
    } catch {
      this.stream = null;
    }
    if (!this.active) {
      this.stop();
      return this.status();
    }
    if (this.stream) {
      this.hasVideo = true;
      this.video.srcObject = this.stream;
      this.video.muted = true;
      try {
        await this.video.play();
      } catch {
        /* autoplay of a muted camera preview is allowed; ignore */
      }
      this.watchFrames();
    }
    md.getUserMedia({ audio }).then(
      (s) => {
        this.tracks.push(...s.getTracks());
        if (!this.active) {
          for (const t of s.getTracks()) t.stop();
          return;
        }
        this.micStream = s;
        this.hasAudio = true;
        this.attachMic(this.audioCtx);
      },
      () => {
        /* no mic: the game works without it */
      },
    );
    return this.status();
  }

  status() {
    return { video: this.hasVideo, audio: this.hasAudio };
  }

  watchFrames() {
    const v = this.video;
    if (typeof v.requestVideoFrameCallback === 'function') {
      const cb = () => {
        this.fresh = true;
        if (this.active) v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb);
    }
  }

  /** Connect the mic to an analyser in the game's AudioContext (never to the speakers). */
  attachMic(audioCtx) {
    if (!this.hasAudio || !audioCtx || this.analyser) return;
    const src = audioCtx.createMediaStreamSource(this.micStream);
    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.micBuf = new Float32Array(this.analyser.fftSize);
    src.connect(this.analyser);
    this.micSrc = src;
  }

  micLevel() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.micBuf);
    let s = 0;
    for (let i = 0; i < this.micBuf.length; i++) s += this.micBuf[i] * this.micBuf[i];
    return Math.sqrt(s / this.micBuf.length);
  }

  /** Returns a mirrored grayscale frame if the camera has produced a new one, else null. */
  sample() {
    const v = this.video;
    if (!this.hasVideo || v.readyState < 2) return null;
    const hasRvfc = typeof v.requestVideoFrameCallback === 'function';
    if (hasRvfc) {
      if (!this.fresh) return null;
      this.fresh = false;
    } else {
      if (v.currentTime === this.lastTime) return null;
      this.lastTime = v.currentTime;
    }
    const c = this.ctx;
    c.save();
    c.translate(SAMPLE_W, 0);
    c.scale(-1, 1); // mirror: "left" is the left of the screen as he sees himself
    c.drawImage(v, 0, 0, SAMPLE_W, SAMPLE_H);
    c.restore();
    const d = c.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    const g = this.gray;
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    return g;
  }

  /** Stop the camera and microphone for real (the green camera light goes off). */
  stop() {
    this.active = false;
    for (const t of this.tracks || []) t.stop();
    if (this.micSrc) this.micSrc.disconnect();
    this.micSrc = null;
    this.analyser = null;
    this.video.srcObject = null;
    this.hasVideo = false;
    this.hasAudio = false;
  }

  trackStates() {
    return (this.tracks || []).map((t) => ({ kind: t.kind, readyState: t.readyState }));
  }
}
