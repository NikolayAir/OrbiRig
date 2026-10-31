import { useEffect, useRef, useState } from "react";

// Each use has its own request and result. App keeps both uses mounted when
// switching panels, so navigation does not discard inputs or cancel a request.
export function useCancellableRequest<State>(initialState: State) {
  const [state, setState] = useState(initialState);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    const request = requestRef.current;
    requestRef.current = null;
    request?.abort();
  }, []);

  async function run(
    pendingState: State,
    execute: (signal: AbortSignal) => Promise<State | null>,
  ) {
    setState(pendingState);
    const request = new AbortController();
    const previous = requestRef.current;
    requestRef.current = request;
    previous?.abort();

    const result = await execute(request.signal);
    // Check after all response processing, including JSON parsing. A cancelled
    // request must not replace the result of a later submission.
    if (requestRef.current !== request) return;
    requestRef.current = null;
    if (result !== null) setState(result);
  }

  function cancel(cancelledState: State): boolean {
    const request = requestRef.current;
    if (request === null) return false;
    requestRef.current = null;
    request.abort();
    setState(cancelledState);
    return true;
  }

  return { state, setState, run, cancel };
}
