type Listener = (progress: number, fileKey?: string) => void;
type CompleteListener = () => void;

const progressListeners = new Set<Listener>();
const completeListeners = new Set<CompleteListener>();

let lastProgress = 0;
let lastFile = "";
let isComplete = false;

export const loaderEvents = {
  emitProgress(progress: number, fileKey?: string) {
    lastProgress = progress;
    if (fileKey) lastFile = fileKey;
    progressListeners.forEach((l) => l(progress, fileKey));
  },
  emitComplete() {
    isComplete = true;
    completeListeners.forEach((l) => l());
  },
  reset() {
    lastProgress = 0;
    lastFile = "";
    isComplete = false;
  },
  onProgress(l: Listener) {
    progressListeners.add(l);
    // fire immediately with latest
    l(lastProgress, lastFile);
    return () => progressListeners.delete(l);
  },
  onComplete(l: CompleteListener) {
    completeListeners.add(l);
    if (isComplete) l();
    return () => completeListeners.delete(l);
  },
  get complete() {
    return isComplete;
  },
};
