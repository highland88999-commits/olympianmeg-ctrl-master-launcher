// Pitch-shift worklet for the broadcast voice changer.
//
// Two-head Hann-windowed resampler: two read heads chase the live input,
// half a window apart, each fading in and out so the jumps stay hidden.
// It is a changer, not a studio effect — expect a little grain, especially
// on Deep and High. If this module fails to load, the studio falls back
// to the unshifted voice rather than failing the broadcast.
const RING = 16384;
const WINDOW = 2048;

class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.ring = new Float32Array(RING);
    this.writePos = 0;
    this.head1 = 0;
    this.head2 = 0;
    this.phase1 = 0;
    this.phase2 = WINDOW / 2;
    this.started = false;
  }

  _hann(phase) {
    return 0.5 * (1 - Math.cos((2 * Math.PI * phase) / WINDOW));
  }

  _at(index) {
    return this.ring[((index % RING) + RING) % RING];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0][0];
    const pitchValues = parameters.pitch;
    if (!output) return true;
    if (!input) {
      output.fill(0);
      return true;
    }
    for (let i = 0; i < output.length; i += 1) {
      this.ring[this.writePos] = input[i];
      this.writePos = (this.writePos + 1) % RING;
      if (!this.started) {
        this.head1 = this.writePos - WINDOW;
        this.head2 = this.writePos - WINDOW / 2;
        this.started = true;
      }
      const pitch = pitchValues.length > 1 ? pitchValues[i] : pitchValues[0];
      const w1 = this._hann(this.phase1);
      const w2 = this._hann(this.phase2);
      const denom = w1 + w2 + 1e-6;
      output[i] = (this._at(this.head1) * w1 + this._at(this.head2) * w2) / denom;
      this.head1 += pitch;
      this.head2 += pitch;
      this.phase1 += 1;
      this.phase2 += 1;
      if (this.phase1 >= WINDOW) {
        this.phase1 -= WINDOW;
        this.head1 = this.writePos - WINDOW;
      }
      if (this.phase2 >= WINDOW) {
        this.phase2 -= WINDOW;
        this.head2 = this.writePos - WINDOW / 2;
      }
    }
    return true;
  }
}

registerProcessor('pitch-shift', PitchShiftProcessor);
