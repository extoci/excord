/** Browser-default scheduling, with full speed during capture and real-time connections. */
export class BackgroundPolicy {
  private realtime = false;
  private inCall = false;
  private allowed: boolean | undefined;

  constructor(
    private apply: (allowed: boolean) => void,
    private enabled = true,
  ) {
    this.update();
  }
  configure(enabled: boolean) {
    this.enabled = enabled;
    this.update();
  }
  activity(active: boolean) {
    this.realtime = active;
    this.update();
  }
  voiceCall(active: boolean) {
    this.inCall = active;
    this.update();
  }
  navigation() {
    this.realtime = false;
    this.inCall = false;
    this.update();
  }
  private update() {
    const allowed = this.enabled && !this.realtime && !this.inCall;
    if (allowed !== this.allowed) {
      this.allowed = allowed;
      this.apply(allowed);
    }
  }
}
