/**
 * Runs a request against a list of models, preferring the first.
 *
 * Preview models on the free tier are sometimes slow or out of quota. Rather
 * than wait for a timeout before trying the next model, a "hedged" request
 * starts the next model in parallel if the current one hasn't answered after
 * `hedgeAfterMs`, or straight away if it fails. The first success wins and the
 * others are cancelled.
 */
export function firstSuccessful<T>(
  models: string[],
  run: (model: string, signal: AbortSignal) => Promise<T>,
  { hedgeAfterMs = 5_000, timeoutMs = 25_000 } = {},
): Promise<{ value: T; model: string }> {
  return new Promise((resolve, reject) => {
    const controllers: AbortController[] = [];
    let next = 0;
    let running = 0;
    let done = false;
    let lastError: unknown = new Error('No models to try');
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const launch = () => {
      clearTimeout(hedgeTimer);
      if (done || next >= models.length) return;

      const model = models[next++];
      const controller = new AbortController();
      controllers.push(controller);
      running++;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      hedgeTimer = setTimeout(launch, hedgeAfterMs);

      run(model, controller.signal)
        .then((value) => {
          if (done) return;
          done = true;
          clearTimeout(hedgeTimer);
          controllers.forEach((c) => c !== controller && c.abort());
          resolve({ value, model });
        })
        .catch((err) => {
          lastError = err;
          if (done) return;
          console.warn(`[gemini] ${model} failed, trying the next model`);
          launch();
        })
        .finally(() => {
          clearTimeout(timeout);
          running--;
          if (!done && running === 0 && next >= models.length) {
            done = true;
            clearTimeout(hedgeTimer);
            reject(lastError);
          }
        });
    };

    launch();
  });
}
